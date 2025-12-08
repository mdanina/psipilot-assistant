/**
 * API клиент для работы с AI-анализом сессий
 * Подключается к backend transcription-service для AI endpoints
 */

import { supabase } from './supabase';
import { decryptPHI } from './encryption';
import type {
  NoteBlockTemplate,
  ClinicalNoteTemplate,
  GeneratedClinicalNote,
  GenerationProgress,
  GenerateRequest,
  RegenerateSectionRequest,
  CaseSummary,
} from '@/types/ai.types';

// URL backend сервиса для AI endpoints
// По умолчанию используем тот же сервер, что и для транскрипции
const AI_API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

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
  const { error } = await supabase
    .from('clinical_note_templates')
    .update({ block_template_ids: blockTemplateIds })
    .eq('id', templateId);
  
  if (error) {
    throw new Error(error.message);
  }
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
      // Если расшифровка не удалась (например, нет ключа), используем как есть
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (!errorMsg.includes('Encryption key is not configured')) {
        console.warn('Failed to decrypt regenerated section content:', err);
      }
      // Оставляем ai_content как есть - возможно, он уже расшифрован
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
  patientId: string
): Promise<CaseSummary> {
  const response = await fetch(`${AI_API_URL}/api/ai/case-summary`, {
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
        }
      }
      // Расшифровываем content, если он зашифрован
      if (section.content) {
        try {
          const isLikelyEncrypted = section.content.length > 50 && 
                                   /^[A-Za-z0-9+/=]+$/.test(section.content) &&
                                   !section.content.includes('\n');
          if (isLikelyEncrypted) {
            section.content = await decryptPHI(section.content);
          }
        } catch (err) {
          console.warn('Failed to decrypt section content:', err);
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

  // Расшифровываем ai_content и content в секциях
  if (data) {
    for (const note of data) {
      if (note.sections) {
        for (const section of note.sections) {
          // Расшифровываем ai_content
          if (section.ai_content) {
            try {
              section.ai_content = await decryptPHI(section.ai_content);
            } catch (err) {
              // Если расшифровка не удалась (например, нет ключа), используем как есть
              const errorMsg = err instanceof Error ? err.message : String(err);
              if (!errorMsg.includes('Encryption key is not configured')) {
                console.warn('Failed to decrypt section ai_content:', err);
              }
              // Оставляем ai_content как есть - возможно, он уже расшифрован
            }
          }
          // Расшифровываем content, если он зашифрован
          if (section.content) {
            try {
              const isLikelyEncrypted = section.content.length > 50 && 
                                       /^[A-Za-z0-9+/=]+$/.test(section.content) &&
                                       !section.content.includes('\n');
              if (isLikelyEncrypted) {
                section.content = await decryptPHI(section.content);
              }
            } catch (err) {
              console.warn('Failed to decrypt section content:', err);
            }
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
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Расшифровываем ai_content и content в секциях
  if (data) {
    for (const note of data) {
      if (note.sections) {
        for (const section of note.sections) {
          // Расшифровываем ai_content
          if (section.ai_content) {
            try {
              section.ai_content = await decryptPHI(section.ai_content);
            } catch (err) {
              // Если расшифровка не удалась (например, нет ключа), используем как есть
              const errorMsg = err instanceof Error ? err.message : String(err);
              if (!errorMsg.includes('Encryption key is not configured')) {
                console.warn('Failed to decrypt section ai_content:', err);
              }
              // Оставляем ai_content как есть - возможно, он уже расшифрован
            }
          }
          // Расшифровываем content, если он зашифрован
          if (section.content) {
            try {
              const isLikelyEncrypted = section.content.length > 50 && 
                                       /^[A-Za-z0-9+/=]+$/.test(section.content) &&
                                       !section.content.includes('\n');
              if (isLikelyEncrypted) {
                section.content = await decryptPHI(section.content);
              }
            } catch (err) {
              console.warn('Failed to decrypt section content:', err);
            }
          }
        }
      }
    }
  }

  return (data || []) as GeneratedClinicalNote[];
}
