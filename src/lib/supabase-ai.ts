/**
 * API клиент для работы с AI-анализом сессий
 * Подключается к backend transcription-service для AI endpoints
 */

import { supabase } from './supabase';
import { decryptPHI, decryptPHIBatch } from './encryption';
import type {
  NoteBlockTemplate,
  ClinicalNoteTemplate,
  GeneratedClinicalNote,
  GenerationProgress,
  GenerateRequest,
  RegenerateSectionRequest,
  CaseSummary,
  GeneratedSection,
} from '@/types/ai.types';

type DecryptableSection = GeneratedSection & {
  ai_content_encrypted?: string | null;
  content_encrypted?: string | null;
};

type DecryptableClinicalNote = GeneratedClinicalNote & {
  sections?: DecryptableSection[];
};

// URL backend сервиса для AI endpoints
// По умолчанию используем тот же сервер, что и для транскрипции
const AI_API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

/**
 * Получить заголовки для аутентификации
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/**
 * Обработка ошибок API
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Unknown error');
  }
  return data.data;
}

// ============================================================================
// Блоки и шаблоны
// ============================================================================

/**
 * Получить список доступных блоков шаблонов
 */
export async function getBlockTemplates(): Promise<NoteBlockTemplate[]> {
  const response = await fetch(`${AI_API_URL}/api/ai/block-templates`, {
    headers: await getAuthHeaders(),
  });
  return handleResponse<NoteBlockTemplate[]>(response);
}

/**
 * Получить список шаблонов клинических заметок
 */
export async function getNoteTemplates(): Promise<ClinicalNoteTemplate[]> {
  const response = await fetch(`${AI_API_URL}/api/ai/note-templates`, {
    headers: await getAuthHeaders(),
  });
  return handleResponse<ClinicalNoteTemplate[]>(response);
}

/**
 * Обновить порядок блоков в шаблоне клинической заметки
 */
export async function updateNoteTemplateBlockOrder(
  templateId: string,
  blockTemplateIds: string[]
): Promise<void> {
  // Получаем текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Необходима авторизация');
  }

  // Получаем шаблон с информацией о владельце
  const { data: template, error: fetchError } = await supabase
    .from('clinical_note_templates')
    .select('is_system, user_id, clinic_id')
    .eq('id', templateId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!template) {
    throw new Error('Шаблон не найден');
  }

  // Проверка прав: системные шаблоны нельзя редактировать
  if (template.is_system) {
    throw new Error('Системные шаблоны нельзя редактировать');
  }

  // Проверка прав: для шаблонов клиники нужны права админа
  if (template.user_id === null && template.clinic_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'admin' || profile?.clinic_id !== template.clinic_id) {
      throw new Error('Только администраторы могут редактировать шаблоны клиники');
    }
  }

  // Проверка прав: для личных шаблонов - только владелец
  if (template.user_id !== null && template.user_id !== user.id) {
    throw new Error('Вы можете редактировать только свои личные шаблоны');
  }

  const { error } = await supabase
    .from('clinical_note_templates')
    .update({ block_template_ids: blockTemplateIds })
    .eq('id', templateId);
  
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Добавить блок в шаблон клинической заметки
 */
export async function addBlockToTemplate(
  templateId: string,
  blockTemplateId: string
): Promise<void> {
  // Получаем текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Необходима авторизация');
  }

  // Получаем шаблон с информацией о владельце
  const { data: template, error: fetchError } = await supabase
    .from('clinical_note_templates')
    .select('block_template_ids, is_system, user_id, clinic_id')
    .eq('id', templateId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!template) {
    throw new Error('Шаблон не найден');
  }

  // Проверка прав: системные шаблоны нельзя редактировать
  if (template.is_system) {
    throw new Error('Системные шаблоны нельзя редактировать');
  }

  // Проверка прав: для шаблонов клиники нужны права админа
  if (template.user_id === null && template.clinic_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'admin' || profile?.clinic_id !== template.clinic_id) {
      throw new Error('Только администраторы могут редактировать шаблоны клиники');
    }
  }

  // Проверка прав: для личных шаблонов - только владелец
  if (template.user_id !== null && template.user_id !== user.id) {
    throw new Error('Вы можете редактировать только свои личные шаблоны');
  }

  // Проверяем, что блока еще нет в шаблоне
  if (template.block_template_ids.includes(blockTemplateId)) {
    throw new Error('Блок уже добавлен в шаблон');
  }

  // Добавляем блок в конец списка
  const newBlockIds = [...template.block_template_ids, blockTemplateId];

  const { error } = await supabase
    .from('clinical_note_templates')
    .update({ block_template_ids: newBlockIds })
    .eq('id', templateId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Удалить блок из шаблона клинической заметки
 */
export async function removeBlockFromTemplate(
  templateId: string,
  blockTemplateId: string
): Promise<void> {
  // Получаем текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Необходима авторизация');
  }

  // Получаем шаблон с информацией о владельце
  const { data: template, error: fetchError } = await supabase
    .from('clinical_note_templates')
    .select('block_template_ids, is_system, user_id, clinic_id')
    .eq('id', templateId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!template) {
    throw new Error('Шаблон не найден');
  }

  // Проверка прав: системные шаблоны нельзя редактировать
  if (template.is_system) {
    throw new Error('Системные шаблоны нельзя редактировать');
  }

  // Проверка прав: для шаблонов клиники нужны права админа
  if (template.user_id === null && template.clinic_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'admin' || profile?.clinic_id !== template.clinic_id) {
      throw new Error('Только администраторы могут редактировать шаблоны клиники');
    }
  }

  // Проверка прав: для личных шаблонов - только владелец
  if (template.user_id !== null && template.user_id !== user.id) {
    throw new Error('Вы можете редактировать только свои личные шаблоны');
  }

  // Удаляем блок из списка
  const newBlockIds = template.block_template_ids.filter(
    (id: string) => id !== blockTemplateId
  );

  const { error } = await supabase
    .from('clinical_note_templates')
    .update({ block_template_ids: newBlockIds })
    .eq('id', templateId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Создать новый шаблон клинической заметки
 */
export async function createNoteTemplate(
  name: string,
  nameEn: string | null,
  description: string | null,
  blockTemplateIds: string[],
  isDefault: boolean = false,
  isClinicTemplate: boolean = false
): Promise<ClinicalNoteTemplate> {
  // Получаем clinic_id и роль текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Необходима авторизация');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single();

  const clinicId = profile?.clinic_id || null;
  const isAdmin = profile?.role === 'admin';

  // Проверка прав: только админы могут создавать шаблоны клиники
  if (isClinicTemplate && !isAdmin) {
    throw new Error('Только администраторы могут создавать шаблоны клиники');
  }

  // Определяем user_id: для шаблонов клиники - NULL, для личных - ID пользователя
  const userId = isClinicTemplate ? null : user.id;

  // Если устанавливаем как шаблон по умолчанию, снимаем флаг с других шаблонов
  if (isDefault) {
    if (isClinicTemplate && clinicId) {
      // Для шаблонов клиники - снимаем флаг с других шаблонов клиники
      await supabase
        .from('clinical_note_templates')
        .update({ is_default: false })
        .eq('clinic_id', clinicId)
        .is('user_id', null)
        .eq('is_default', true);
    } else if (!isClinicTemplate) {
      // Для личных шаблонов - снимаем флаг с других личных шаблонов пользователя
      await supabase
        .from('clinical_note_templates')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true);
    }
  }

  const { data, error } = await supabase
    .from('clinical_note_templates')
    .insert({
      clinic_id: clinicId,
      user_id: userId,
      name,
      name_en: nameEn,
      description,
      block_template_ids: blockTemplateIds,
      is_default: isDefault,
      is_system: false,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ClinicalNoteTemplate;
}

// ============================================================================
// Генерация клинических заметок
// ============================================================================

/**
 * Запустить генерацию клинической заметки
 */
export async function generateClinicalNote(
  request: GenerateRequest
): Promise<{ clinical_note_id: string; status: string; sections_count: number }> {
  const response = await fetch(`${AI_API_URL}/api/ai/generate`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(request),
  });
  return handleResponse(response);
}

/**
 * Получить статус генерации клинической заметки
 */
export async function getGenerationStatus(
  clinicalNoteId: string
): Promise<GenerationProgress> {
  const response = await fetch(
    `${AI_API_URL}/api/ai/generate/${clinicalNoteId}/status`,
    { headers: await getAuthHeaders() }
  );
  return handleResponse<GenerationProgress>(response);
}

/**
 * Перегенерировать секцию
 */
export async function regenerateSection(
  sectionId: string,
  request?: RegenerateSectionRequest
): Promise<{ section_id: string; status: string; ai_content: string }> {
  const response = await fetch(
    `${AI_API_URL}/api/ai/regenerate-section/${sectionId}`,
    {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(request || {}),
    }
  );
  const result = await handleResponse<{ section_id: string; status: string; ai_content: string }>(response);
  
  // Расшифровываем ai_content, если он зашифрован
  if (result.ai_content) {
    try {
      result.ai_content = await decryptPHI(result.ai_content);
    } catch (err) {
      console.warn('Failed to decrypt regenerated section content:', err);
      result.ai_content = '[Ошибка расшифровки. Обновите страницу или войдите заново.]';
    }
  }
  
  return result;
}

// ============================================================================
// Case Summary (Сводка по случаю)
// ============================================================================

/**
 * Сгенерировать сводку по случаю пациента
 */
export async function generateCaseSummary(
  sessionId: string
): Promise<CaseSummary> {
  const response = await fetch(`${AI_API_URL}/api/ai/case-summary`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ session_id: sessionId }),
  });
  return handleResponse<CaseSummary>(response);
}

/**
 * Генерация структурированной HTML сводки по случаю пациента
 * На основе всех клинических заметок и транскриптов всех сессий
 */
export async function generatePatientCaseSummary(
  patientId: string
): Promise<CaseSummary> {
  const response = await fetch(`${AI_API_URL}/api/ai/patient-case-summary`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ patient_id: patientId }),
  });
  return handleResponse<CaseSummary>(response);
}

// ============================================================================
// Работа с клиническими заметками через Supabase
// ============================================================================

/**
 * Получить клиническую заметку с секциями
 * Автоматически расшифровывает зашифрованный контент
 */
export async function getClinicalNote(
  clinicalNoteId: string
): Promise<GeneratedClinicalNote> {
  const { data, error } = await supabase
    .from('clinical_notes')
    .select(`
      *,
      sections (
        *,
        block_template:note_block_templates (*)
      ),
      template:clinical_note_templates (*)
    `)
    .eq('id', clinicalNoteId)
    .is('deleted_at', null)  // Filter out soft-deleted notes
    .single();

  if (error) throw error;

  // Расшифровываем ai_content и content в секциях
  if (data.sections) {
    for (const section of data.sections) {
      // Расшифровываем ai_content
      if (section.ai_content) {
        try {
          section.ai_content = await decryptPHI(section.ai_content);
        } catch (err) {
          console.warn('Failed to decrypt section ai_content:', err);
          // If decryption failed, replace with error message instead of showing base64 gibberish
          section.ai_content = '[Ошибка расшифровки. Обновите страницу или войдите заново.]';
        }
      }
      // Расшифровываем content, если он зашифрован
      if (section.content) {
        const isLikelyEncrypted = section.content.length > 50 &&
                                 /^[A-Za-z0-9+/=]+$/.test(section.content) &&
                                 !section.content.includes('\n');
        if (isLikelyEncrypted) {
          try {
            section.content = await decryptPHI(section.content);
          } catch (err) {
            console.warn('Failed to decrypt section content:', err);
            section.content = '[Ошибка расшифровки. Обновите страницу или войдите заново.]';
          }
        }
      }
    }
  }

  return data as GeneratedClinicalNote;
}

/**
 * Обновить контент секции (ручное редактирование)
 * Контент будет зашифрован автоматически при сохранении через Supabase
 */
export async function updateSectionContent(
  sectionId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('sections')
    .update({ 
      content, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', sectionId);

  if (error) throw error;
}

/**
 * Обновить позиции секций (для drag-and-drop)
 */
export async function updateSectionsOrder(
  sectionPositions: Array<{ id: string; position: number }>
): Promise<void> {
  // Обновляем позиции всех секций одним запросом
  const updates = sectionPositions.map(({ id, position }) =>
    supabase
      .from('sections')
      .update({ position, updated_at: new Date().toISOString() })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter(r => r.error);
  
  if (errors.length > 0) {
    throw new Error(`Failed to update ${errors.length} section positions`);
  }
}

/**
 * Финализировать клиническую заметку
 */
export async function finalizeClinicalNote(
  clinicalNoteId: string
): Promise<void> {
  // Проверяем текущего пользователя для логирования
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('[finalizeClinicalNote] Auth error:', authError);
    throw new Error('Необходима авторизация для сохранения заметки');
  }

  console.log('[finalizeClinicalNote] Current user:', user.id, user.email);

  // Сначала проверяем заметку для диагностики
  const { data: noteBefore, error: fetchError } = await supabase
    .from('clinical_notes')
    .select('id, status, user_id, session_id')
    .eq('id', clinicalNoteId)
    .single();

  if (fetchError) {
    console.error('[finalizeClinicalNote] Error fetching note:', fetchError);
    if (fetchError.code === 'PGRST116') {
      throw new Error('Заметка не найдена или у вас нет доступа к этой заметке');
    }
    throw new Error(`Не удалось найти клиническую заметку: ${fetchError.message}`);
  }

  if (!noteBefore) {
    throw new Error('Клиническая заметка не найдена');
  }

  console.log('[finalizeClinicalNote] Note before update:', {
    id: noteBefore.id,
    status: noteBefore.status,
    note_user_id: noteBefore.user_id,
    current_user_id: user.id,
    match: noteBefore.user_id === user.id
  });

  if (noteBefore.status === 'finalized' || noteBefore.status === 'signed') {
    throw new Error('Заметка уже финализирована');
  }

  // Пытаемся обновить статус
  // RLS политика проверит права доступа (user_id = auth.uid() AND status NOT IN ('finalized', 'signed'))
  // Убираем проверку .eq('status', noteBefore.status), так как она может блокировать обновление
  const { error, data } = await supabase
    .from('clinical_notes')
    .update({ 
      status: 'finalized', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', clinicalNoteId)
    .neq('status', 'finalized') // Не обновляем, если уже финализирована
    .neq('status', 'signed') // И не подписана
    .select('id, status, user_id');

  if (error) {
    console.error('[finalizeClinicalNote] Error updating:', error);
    console.error('[finalizeClinicalNote] Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    
    // Более детальное сообщение об ошибке
    if (error.code === '42501') {
      // RLS политика заблокировала обновление
      // Это означает, что либо user_id не совпадает, либо статус уже 'finalized'/'signed'
      throw new Error(`Недостаточно прав для сохранения. Проверьте, что вы являетесь владельцем заметки (заметка: ${noteBefore.user_id}, вы: ${user.id})`);
    } else if (error.code === 'PGRST116') {
      throw new Error('Заметка не найдена или недоступна. Возможно, статус заметки изменился.');
    } else {
      throw new Error(`Ошибка сохранения: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  if (!data || data.length === 0) {
    // Заметка не была обновлена - возможно, статус изменился между проверкой и обновлением
    throw new Error('Не удалось обновить заметку. Возможно, статус заметки изменился. Обновите страницу и попробуйте снова.');
  }

  console.log('[finalizeClinicalNote] Successfully finalized:', data[0]);
}

/**
 * Получить клинические заметки для сессии
 */
export async function getClinicalNotesForSession(
  sessionId: string
): Promise<GeneratedClinicalNote[]> {
  // Проверяем текущего пользователя для логирования
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('clinical_notes')
    .select(`
      *,
      sections (
        *,
        block_template:note_block_templates (*)
      ),
      template:clinical_note_templates (*)
    `)
    .eq('session_id', sessionId)
    .is('deleted_at', null)  // Filter out soft-deleted notes
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Логируем для диагностики
  if (data && data.length > 0 && user) {
    console.log('[getClinicalNotesForSession] Notes loaded:', {
      count: data.length,
      current_user: user.id,
      notes: data.map(n => ({
        id: n.id,
        user_id: n.user_id,
        status: n.status,
        match: n.user_id === user.id
      }))
    });
  }

  // Расшифровываем ai_content и content в секциях используя batch расшифровку
  if (data) {
    const decryptableNotes = data as DecryptableClinicalNote[];
    for (const note of decryptableNotes) {
      if (note.sections) {
        // Собираем все зашифрованные значения для batch расшифровки
        const encryptedValues: Array<{ section: DecryptableSection; field: 'ai_content' | 'content'; value: string }> = [];
        
        for (const section of note.sections) {
          // Приоритет: сначала проверяем _encrypted поля (новый формат)
          // Если их нет, проверяем обычные поля (старый формат или уже расшифрованные данные)
          
          // Проверяем ai_content_encrypted (новый формат)
          if (section.ai_content_encrypted && typeof section.ai_content_encrypted === 'string') {
            encryptedValues.push({ section, field: 'ai_content', value: section.ai_content_encrypted });
          }
          // Если нет _encrypted поля, но есть ai_content, проверяем эвристикой (старый формат)
          else if (section.ai_content && typeof section.ai_content === 'string') {
            // Улучшенная проверка: base64 строка достаточной длины
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(section.ai_content);
            const minLength = 40; // Минимальная длина для зашифрованных данных
            const hasUnicodeChars = /[а-яА-ЯёЁ\u0400-\u04FF]/.test(section.ai_content);
            
            // Если это base64 без unicode и достаточной длины - вероятно зашифровано
            if (isBase64 && !hasUnicodeChars && section.ai_content.length >= minLength) {
              encryptedValues.push({ section, field: 'ai_content', value: section.ai_content });
            }
          }
          
          // Проверяем content_encrypted (новый формат)
          if (section.content_encrypted && typeof section.content_encrypted === 'string') {
            encryptedValues.push({ section, field: 'content', value: section.content_encrypted });
          }
          // Если нет _encrypted поля, но есть content, проверяем эвристикой (старый формат)
          else if (section.content && typeof section.content === 'string') {
            // Улучшенная проверка: base64 строка достаточной длины
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(section.content);
            const minLength = 40; // Минимальная длина для зашифрованных данных
            const hasUnicodeChars = /[а-яА-ЯёЁ\u0400-\u04FF]/.test(section.content);
            
            // Если это base64 без unicode и достаточной длины - вероятно зашифровано
            if (isBase64 && !hasUnicodeChars && section.content.length >= minLength) {
              encryptedValues.push({ section, field: 'content', value: section.content });
            }
          }
        }
        
        // Выполняем batch расшифровку
        if (encryptedValues.length > 0) {
          try {
            console.log(`[getClinicalNotesForSession] Batch decrypting ${encryptedValues.length} values`);
            const valuesToDecrypt = encryptedValues.map(v => v.value);
            const decryptedValues = await decryptPHIBatch(valuesToDecrypt);
            
            // Применяем расшифрованные значения
            encryptedValues.forEach((item, index) => {
              const decryptedValue = decryptedValues[index];
              // Применяем только если расшифровка успешна (не пустая строка)
              if (decryptedValue) {
                item.section[item.field] = decryptedValue;
              }
              // Если расшифровка вернула пустую строку, оставляем исходное значение
            });
            
            console.log(`[getClinicalNotesForSession] Successfully batch decrypted ${decryptedValues.length} values`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn('[getClinicalNotesForSession] Batch decryption failed:', {
              error: errorMsg,
              count: encryptedValues.length,
            });
            // Show error message instead of leaving base64 gibberish in the UI
            encryptedValues.forEach((item) => {
              item.section[item.field] = '[Ошибка расшифровки. Обновите страницу или войдите заново.]';
            });
          }
        }
      }
    }
  }

  return (data || []) as GeneratedClinicalNote[];
}

/**
 * Получить клинические заметки для пациента
 */
export async function getClinicalNotesForPatient(
  patientId: string
): Promise<GeneratedClinicalNote[]> {
  const { data, error } = await supabase
    .from('clinical_notes')
    .select(`
      *,
      sections (
        *,
        block_template:note_block_templates (*)
      ),
      template:clinical_note_templates (*),
      session:sessions (
        id,
        title,
        created_at
      )
    `)
    .eq('patient_id', patientId)
    .is('deleted_at', null)  // Filter out soft-deleted notes
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Расшифровываем ai_content и content в секциях используя batch расшифровку
  if (data) {
    // Собираем все зашифрованные значения для batch расшифровки
    const encryptedValues: Array<{ section: DecryptableSection; field: 'ai_content' | 'content'; value: string }> = [];
    
    const decryptableNotes = data as DecryptableClinicalNote[];
    for (const note of decryptableNotes) {
      if (note.sections) {
        for (const section of note.sections) {
          // Приоритет: сначала проверяем _encrypted поля (новый формат)
          // Если их нет, проверяем обычные поля (старый формат или уже расшифрованные данные)
          
          // Проверяем ai_content_encrypted (новый формат)
          if (section.ai_content_encrypted && typeof section.ai_content_encrypted === 'string') {
            encryptedValues.push({ section, field: 'ai_content', value: section.ai_content_encrypted });
          }
          // Если нет _encrypted поля, но есть ai_content, проверяем эвристикой (старый формат)
          else if (section.ai_content && typeof section.ai_content === 'string') {
            // Улучшенная проверка: base64 строка достаточной длины
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(section.ai_content);
            const minLength = 40; // Минимальная длина для зашифрованных данных
            const hasUnicodeChars = /[а-яА-ЯёЁ\u0400-\u04FF]/.test(section.ai_content);
            
            // Если это base64 без unicode и достаточной длины - вероятно зашифровано
            if (isBase64 && !hasUnicodeChars && section.ai_content.length >= minLength) {
              encryptedValues.push({ section, field: 'ai_content', value: section.ai_content });
            }
          }
          
          // Проверяем content_encrypted (новый формат)
          if (section.content_encrypted && typeof section.content_encrypted === 'string') {
            encryptedValues.push({ section, field: 'content', value: section.content_encrypted });
          }
          // Если нет _encrypted поля, но есть content, проверяем эвристикой (старый формат)
          else if (section.content && typeof section.content === 'string') {
            // Улучшенная проверка: base64 строка достаточной длины
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(section.content);
            const minLength = 40; // Минимальная длина для зашифрованных данных
            const hasUnicodeChars = /[а-яА-ЯёЁ\u0400-\u04FF]/.test(section.content);
            
            // Если это base64 без unicode и достаточной длины - вероятно зашифровано
            if (isBase64 && !hasUnicodeChars && section.content.length >= minLength) {
              encryptedValues.push({ section, field: 'content', value: section.content });
            }
          }
        }
      }
    }
    
    // Выполняем batch расшифровку
    if (encryptedValues.length > 0) {
      try {
        console.log(`[getClinicalNotesForPatient] Batch decrypting ${encryptedValues.length} values`);
        const valuesToDecrypt = encryptedValues.map(v => v.value);
        const decryptedValues = await decryptPHIBatch(valuesToDecrypt);
        
        // Применяем расшифрованные значения
        encryptedValues.forEach((item, index) => {
          const decryptedValue = decryptedValues[index];
          // Применяем только если расшифровка успешна (не пустая строка)
          if (decryptedValue) {
            item.section[item.field] = decryptedValue;
          }
          // Если расшифровка вернула пустую строку, оставляем исходное значение
        });
        
        console.log(`[getClinicalNotesForPatient] Successfully batch decrypted ${decryptedValues.length} values`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn('[getClinicalNotesForPatient] Batch decryption failed:', {
          error: errorMsg,
          count: encryptedValues.length,
        });
        // Show error message instead of leaving base64 gibberish in the UI
        encryptedValues.forEach((item) => {
          item.section[item.field] = '[Ошибка расшифровки. Обновите страницу или войдите заново.]';
        });
      }
    }
  }

  return (data || []) as GeneratedClinicalNote[];
}

/**
 * Soft delete a clinical note (set deleted_at timestamp)
 * The note remains in the database for audit purposes but won't appear in queries
 */
export async function softDeleteClinicalNote(
  clinicalNoteId: string
): Promise<void> {
  const { error } = await supabase
    .from('clinical_notes')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', clinicalNoteId);

  if (error) {
    console.error('Error soft deleting clinical note:', error);
    throw new Error(`Не удалось удалить клиническую заметку: ${error.message}`);
  }
}
