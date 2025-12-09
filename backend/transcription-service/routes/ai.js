import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { generateBlockContent, generateCaseSummaryContent, generatePatientCaseSummaryContent } from '../services/openai.js';
import { anonymize, deanonymize } from '../services/anonymization.js';
import { encrypt, decrypt } from '../services/encryption.js';
import { extractTranscriptsFromRecordings } from '../services/transcriptHelper.js';

const router = express.Router();

// Helper function to get Supabase admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required. Please set it in .env file.');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Please set it in .env file.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * GET /api/ai/block-templates
 * Получение списка доступных блоков
 */
router.get('/block-templates', async (req, res) => {
  try {
    const { clinic_id } = req.user;
    const supabase = getSupabaseAdmin();

    // Получаем системные блоки и блоки клиники
    let query = supabase
      .from('note_block_templates')
      .select('*')
      .eq('is_active', true);

    // Если есть clinic_id, получаем блоки клиники и системные
    // Если нет, получаем только системные
    if (clinic_id) {
      query = query.or(`clinic_id.eq.${clinic_id},is_system.eq.true`);
    } else {
      query = query.eq('is_system', true);
    }

    const { data, error } = await query.order('position');

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching block templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai/note-templates
 * Получение списка шаблонов наборов блоков
 */
router.get('/note-templates', async (req, res) => {
  try {
    const { id: user_id, clinic_id } = req.user;
    const supabase = getSupabaseAdmin();

    // Получаем шаблоны:
    // 1. Системные (is_system = true)
    // 2. Шаблоны клиники (clinic_id = user's clinic AND user_id IS NULL)
    // 3. Личные шаблоны пользователя (user_id = current user)
    let templatesQuery = supabase
      .from('clinical_note_templates')
      .select('*')
      .eq('is_active', true);

    if (clinic_id) {
      // Системные ИЛИ шаблоны клиники ИЛИ личные шаблоны пользователя
      // Используем фильтры через .or() с правильным синтаксисом
      templatesQuery = templatesQuery.or(
        `is_system.eq.true,and(clinic_id.eq.${clinic_id},user_id.is.null),user_id.eq.${user_id}`
      );
    } else {
      // Только системные, если нет clinic_id
      templatesQuery = templatesQuery.eq('is_system', true);
    }

    const { data: templates, error } = await templatesQuery;

    if (error) throw error;

    // Получаем все доступные блоки
    let blocksQuery = supabase
      .from('note_block_templates')
      .select('*')
      .eq('is_active', true);

    if (clinic_id) {
      blocksQuery = blocksQuery.or(`clinic_id.eq.${clinic_id},is_system.eq.true`);
    } else {
      blocksQuery = blocksQuery.eq('is_system', true);
    }

    const { data: blocks } = await blocksQuery;

    // Заполняем блоки для каждого шаблона
    const templatesWithBlocks = templates.map(template => ({
      ...template,
      blocks: template.block_template_ids
        .map(id => blocks.find(b => b.id === id))
        .filter(Boolean)
        .sort((a, b) => {
          // Сортируем по порядку в block_template_ids
          const indexA = template.block_template_ids.indexOf(a.id);
          const indexB = template.block_template_ids.indexOf(b.id);
          return indexA - indexB;
        }),
    }));

    res.json({ success: true, data: templatesWithBlocks });
  } catch (error) {
    console.error('Error fetching note templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/generate
 * Запуск генерации клинической заметки
 */
router.post('/generate', async (req, res) => {
  try {
    const { session_id, template_id, source_type } = req.body;
    const { id: user_id, clinic_id } = req.user;
    const supabase = getSupabaseAdmin();

    // 1. Получаем сессию с данными пациента
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, patient:patients(*)')
      .eq('id', session_id)
      .single();

    if (sessionError) throw sessionError;

    // Проверяем привязку к пациенту
    if (!session.patient_id) {
      return res.status(400).json({
        success: false,
        error: 'Сессия должна быть привязана к пациенту для генерации заметок',
      });
    }

    // 2. Получаем шаблон
    const { data: template, error: templateError } = await supabase
      .from('clinical_note_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError) throw templateError;

    // 3. Собираем исходный текст
    let sourceText = '';

    if (source_type === 'transcript' || source_type === 'combined') {
      console.log(`[AI Generate] Fetching recordings for session ${session_id}`);
      const { data: recordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('id, transcription_text, transcription_encrypted, transcription_status, file_name')
        .eq('session_id', session_id)
        .eq('transcription_status', 'completed');

      if (recordingsError) {
        console.error('[AI Generate] Error fetching recordings:', recordingsError);
        throw recordingsError;
      }

      console.log(`[AI Generate] Found ${recordings?.length || 0} completed recordings`);

      if (recordings?.length) {
        // Используем унифицированный helper для расшифровки транскриптов
        const transcriptText = extractTranscriptsFromRecordings(recordings);
        if (transcriptText) {
          sourceText += transcriptText;
          console.log(`[AI Generate] Combined transcript length: ${sourceText.length} characters`);
        } else {
          console.warn('[AI Generate] No valid transcripts after processing');
        }
      } else {
        console.warn(`[AI Generate] No completed recordings found for session ${session_id}`);
      }
    }

    if (source_type === 'notes' || source_type === 'combined') {
      console.log(`[AI Generate] Fetching session notes for session ${session_id}`);
      const { data: notes, error: notesError } = await supabase
        .from('session_notes')
        .select('id, content')
        .eq('session_id', session_id);

      if (notesError) {
        console.error('[AI Generate] Error fetching notes:', notesError);
      } else {
        console.log(`[AI Generate] Found ${notes?.length || 0} session notes`);
      }

      if (notes?.length) {
        const notesText = notes.map(n => n.content).filter(Boolean).join('\n\n');
        if (notesText) {
          sourceText += (sourceText ? '\n\n' : '') + notesText;
          console.log(`[AI Generate] Added notes, total source length: ${sourceText.length} characters`);
        }
      }
    }

    console.log(`[AI Generate] Final source text length: ${sourceText.length} characters`);
    
    if (!sourceText.trim()) {
      console.error('[AI Generate] No source data available for analysis');
      return res.status(400).json({
        success: false,
        error: 'Нет данных для анализа. Добавьте транскрипт или заметки.',
      });
    }

    // 4. Анонимизируем
    const { text: anonymizedText, map: anonymizationMap } = anonymize(
      sourceText,
      session.patient || {}
    );

    // 5. Создаём clinical_note
    const sourceHash = crypto.createHash('sha256').update(sourceText).digest('hex');

    console.log('[AI Generate] Creating clinical note with user_id:', user_id);

    const { data: clinicalNote, error: noteError } = await supabase
      .from('clinical_notes')
      .insert({
        session_id,
        patient_id: session.patient_id,
        user_id,
        template_id,
        title: template.name,
        note_type: 'initial_assessment',
        generation_status: 'generating',
        source_hash: sourceHash,
        status: 'draft',
      })
      .select()
      .single();

    if (noteError) {
      console.error('[AI Generate] Error creating clinical note:', noteError);
      throw noteError;
    }

    console.log('[AI Generate] Clinical note created:', {
      id: clinicalNote.id,
      user_id: clinicalNote.user_id,
      status: clinicalNote.status
    });

    // 6. Получаем блоки шаблона
    const { data: blockTemplates } = await supabase
      .from('note_block_templates')
      .select('*')
      .in('id', template.block_template_ids);

    // Сортируем по порядку в шаблоне
    const orderedBlocks = template.block_template_ids
      .map(id => blockTemplates.find(b => b.id === id))
      .filter(Boolean);

    // 7. Создаём sections
    const sectionsToInsert = orderedBlocks.map((block, index) => ({
      clinical_note_id: clinicalNote.id,
      block_template_id: block.id,
      name: block.name,
      slug: block.slug,
      position: index,
      generation_status: 'pending',
      anonymization_map_encrypted: encrypt(JSON.stringify(anonymizationMap)),
    }));

    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .insert(sectionsToInsert)
      .select();

    if (sectionsError) throw sectionsError;

    // 8. Запускаем параллельную генерацию (в фоне, не блокируем ответ)
    generateSectionsInBackground(
      clinicalNote.id,
      sections,
      orderedBlocks,
      anonymizedText,
      anonymizationMap,
      user_id
    ).catch(err => {
      console.error('Background generation error:', err);
    });

    // 9. Логируем
    await supabase.from('audit_logs').insert({
      user_id,
      action: 'ai_generation_started',
      resource_type: 'clinical_note',
      resource_id: clinicalNote.id,
      details: {
        session_id,
        template_id,
        source_type,
        sections_count: sections.length,
      },
    });

    res.json({
      success: true,
      data: {
        clinical_note_id: clinicalNote.id,
        status: 'generating',
        sections_count: sections.length,
      },
    });
  } catch (error) {
    console.error('Error starting generation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Фоновая генерация секций
 */
async function generateSectionsInBackground(
  clinicalNoteId,
  sections,
  blockTemplates,
  anonymizedText,
  anonymizationMap,
  userId
) {
  const supabase = getSupabaseAdmin();

  try {
    // Параллельная генерация всех секций
    const results = await Promise.allSettled(
      sections.map(async (section, index) => {
        const block = blockTemplates[index];

        try {
          // Обновляем статус на "generating"
          await supabase
            .from('sections')
            .update({ generation_status: 'generating' })
            .eq('id', section.id);

          // Генерируем контент
          const aiContent = await generateBlockContent(
            block.system_prompt,
            anonymizedText
          );

          // Де-анонимизируем
          const deanonymizedContent = deanonymize(aiContent, anonymizationMap);

          // Шифруем и сохраняем
          const encryptedContent = encrypt(deanonymizedContent);

          await supabase
            .from('sections')
            .update({
              ai_content: encryptedContent,
              ai_generated_at: new Date().toISOString(),
              generation_status: 'completed',
            })
            .eq('id', section.id);

          return { section_id: section.id, status: 'completed' };
        } catch (error) {
          console.error(`Error generating section ${section.id}:`, error);
          await supabase
            .from('sections')
            .update({
              generation_status: 'failed',
              generation_error: error.message,
            })
            .eq('id', section.id);

          return { section_id: section.id, status: 'failed', error: error.message };
        }
      })
    );

    // Проверяем результаты
    const failedCount = results.filter(
      r => r.status === 'rejected' || r.value?.status === 'failed'
    ).length;

    const finalStatus = failedCount === sections.length ? 'failed' : 'completed';

    // Обновляем статус clinical_note
    await supabase
      .from('clinical_notes')
      .update({ generation_status: finalStatus })
      .eq('id', clinicalNoteId);

    // Логируем завершение
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'ai_generation_completed',
      resource_type: 'clinical_note',
      resource_id: clinicalNoteId,
      details: {
        status: finalStatus,
        completed: sections.length - failedCount,
        failed: failedCount,
      },
    });
  } catch (error) {
    console.error('Background generation error:', error);

    await supabase
      .from('clinical_notes')
      .update({ generation_status: 'failed' })
      .eq('id', clinicalNoteId);
  }
}

/**
 * GET /api/ai/generate/:clinicalNoteId/status
 * Получение статуса генерации
 */
router.get('/generate/:clinicalNoteId/status', async (req, res) => {
  try {
    const { clinicalNoteId } = req.params;
    const supabase = getSupabaseAdmin();

    const { data: clinicalNote, error } = await supabase
      .from('clinical_notes')
      .select(`
        id,
        generation_status,
        sections (
          id,
          name,
          generation_status
        )
      `)
      .eq('id', clinicalNoteId)
      .single();

    if (error) throw error;

    const sections = clinicalNote.sections || [];
    const completed = sections.filter(s => s.generation_status === 'completed').length;
    const failed = sections.filter(s => s.generation_status === 'failed').length;

    res.json({
      success: true,
      data: {
        clinical_note_id: clinicalNote.id,
        status: clinicalNote.generation_status,
        progress: {
          total: sections.length,
          completed,
          failed,
        },
        sections: sections.map(s => ({
          id: s.id,
          name: s.name,
          status: s.generation_status,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching generation status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/regenerate-section/:sectionId
 * Перегенерация одного блока
 */
router.post('/regenerate-section/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { custom_prompt } = req.body;
    const { id: user_id } = req.user;
    const supabase = getSupabaseAdmin();

    // Получаем секцию с блоком и заметкой
    const { data: section, error } = await supabase
      .from('sections')
      .select(`
        *,
        block_template:note_block_templates (*),
        clinical_note:clinical_notes (
          *,
          session:sessions (
            *,
            patient:patients (*)
          )
        )
      `)
      .eq('id', sectionId)
      .single();

    if (error) throw error;

    // Получаем исходный текст - используем унифицированный helper
    const { data: recordings } = await supabase
      .from('recordings')
      .select('id, transcription_text, transcription_encrypted, file_name')
      .eq('session_id', section.clinical_note.session_id)
      .eq('transcription_status', 'completed');

    const sourceText = extractTranscriptsFromRecordings(recordings || []);

    if (!sourceText) {
      return res.status(400).json({
        success: false,
        error: 'Нет транскрипта для перегенерации',
      });
    }

    // Анонимизируем
    const { text: anonymizedText, map: anonymizationMap } = anonymize(
      sourceText,
      section.clinical_note.session.patient || {}
    );

    // Обновляем статус
    await supabase
      .from('sections')
      .update({ generation_status: 'generating' })
      .eq('id', sectionId);

    // Генерируем
    const prompt = custom_prompt || section.block_template.system_prompt;
    const aiContent = await generateBlockContent(prompt, anonymizedText);

    // Де-анонимизируем и шифруем
    const deanonymizedContent = deanonymize(aiContent, anonymizationMap);
    const encryptedContent = encrypt(deanonymizedContent);

    // Сохраняем
    await supabase
      .from('sections')
      .update({
        ai_content: encryptedContent,
        ai_generated_at: new Date().toISOString(),
        generation_status: 'completed',
        generation_error: null,
        anonymization_map_encrypted: encrypt(JSON.stringify(anonymizationMap)),
      })
      .eq('id', sectionId);

    // Логируем
    await supabase.from('audit_logs').insert({
      user_id,
      action: 'ai_section_regenerated',
      resource_type: 'section',
      resource_id: sectionId,
      details: { custom_prompt: !!custom_prompt },
    });

    res.json({
      success: true,
      data: {
        section_id: sectionId,
        status: 'completed',
        ai_content: deanonymizedContent, // Возвращаем расшифрованный
      },
    });
  } catch (error) {
    console.error('Error regenerating section:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/case-summary
 * Генерация сводки по сессии
 */
router.post('/case-summary', async (req, res) => {
  try {
    const { session_id } = req.body;
    const { id: user_id } = req.user;
    const supabase = getSupabaseAdmin();

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id обязателен',
      });
    }

    // Получаем сессию с данными пациента
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        *,
        patient:patients(*)
      `)
      .eq('id', session_id)
      .single();

    if (sessionError) throw sessionError;
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Сессия не найдена',
      });
    }

    const patient = session.patient;
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Пациент не найден для данной сессии',
      });
    }

    // Получаем все клинические заметки ЭТОЙ СЕССИИ
    const { data: clinicalNotes, error: notesError } = await supabase
      .from('clinical_notes')
      .select('*, sections (*)')
      .eq('session_id', session_id)
      .in('generation_status', ['completed'])
      .in('status', ['finalized', 'completed'])
      .order('created_at', { ascending: true });

    if (notesError) throw notesError;

    if (!clinicalNotes?.length) {
      return res.status(400).json({
        success: false,
        error: 'Нет завершённых клинических заметок для генерации сводки',
      });
    }

    // Собираем текст из всех заметок сессии
    let combinedText = '';
    for (const note of clinicalNotes) {
      combinedText += `\n\n=== Заметка от ${note.created_at} ===\n`;
      for (const section of note.sections || []) {
        if (section.ai_content) {
          try {
            const decryptedContent = decrypt(section.ai_content);
            combinedText += `\n### ${section.name}\n`;
            combinedText += decryptedContent;
          } catch (err) {
            console.error('Error decrypting section content:', err);
          }
        }
      }
    }

    if (!combinedText.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Нет доступного контента для генерации сводки',
      });
    }

    // Анонимизируем
    const { text: anonymizedText, map: anonymizationMap } = anonymize(
      combinedText,
      patient
    );

    // Генерируем сводку
    const aiSummary = await generateCaseSummaryContent(anonymizedText);

    // Де-анонимизируем
    const deanonymizedSummary = deanonymize(aiSummary, anonymizationMap);

    // Шифруем и сохраняем в сессию
    const encryptedSummary = encrypt(deanonymizedSummary);

    await supabase
      .from('sessions')
      .update({
        case_summary_encrypted: encryptedSummary,
        case_summary_generated_at: new Date().toISOString(),
      })
      .eq('id', session_id);

    // Логируем
    await supabase.from('audit_logs').insert({
      user_id,
      action: 'ai_case_summary_generated',
      resource_type: 'session',
      resource_id: session_id,
      details: { 
        based_on_notes_count: clinicalNotes.length,
        patient_id: patient.id 
      },
    });

    res.json({
      success: true,
      data: {
        session_id,
        patient_id: patient.id,
        case_summary: deanonymizedSummary,
        generated_at: new Date().toISOString(),
        based_on_notes_count: clinicalNotes.length,
      },
    });
  } catch (error) {
    console.error('Error generating case summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/patient-case-summary
 * Генерация структурированной HTML сводки по случаю пациента
 * На основе всех клинических заметок и транскриптов всех сессий
 */
router.post('/patient-case-summary', async (req, res) => {
  try {
    const { patient_id } = req.body;
    const { id: user_id } = req.user;
    const supabase = getSupabaseAdmin();

    if (!patient_id) {
      return res.status(400).json({
        success: false,
        error: 'patient_id обязателен',
      });
    }

    // Получаем пациента
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patient_id)
      .single();

    if (patientError) throw patientError;
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Пациент не найден',
      });
    }

    // Получаем все сессии пациента для статистики
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, created_at')
      .eq('patient_id', patient_id)
      .order('created_at', { ascending: true });

    if (sessionsError) throw sessionsError;

    const sessionsCount = sessions?.length || 0;
    const firstSessionDate = sessions?.[0]?.created_at
      ? new Date(sessions[0].created_at).toLocaleDateString('ru-RU')
      : null;
    const lastSessionDate = sessions?.[sessions.length - 1]?.created_at
      ? new Date(sessions[sessions.length - 1].created_at).toLocaleDateString('ru-RU')
      : null;

    // Получаем все клинические заметки пациента (из всех сессий)
    const { data: clinicalNotes, error: notesError } = await supabase
      .from('clinical_notes')
      .select('*, sections (*)')
      .eq('patient_id', patient_id)
      .in('generation_status', ['completed'])
      .in('status', ['finalized', 'completed'])
      .order('created_at', { ascending: true });

    if (notesError) throw notesError;

    // Собираем текст из всех клинических заметок
    let clinicalNotesText = '';
    for (const note of clinicalNotes || []) {
      clinicalNotesText += `\n\n=== Заметка от ${note.created_at} ===\n`;
      for (const section of note.sections || []) {
        if (section.ai_content) {
          try {
            const decryptedContent = decrypt(section.ai_content);
            clinicalNotesText += `\n### ${section.name}\n`;
            clinicalNotesText += decryptedContent;
          } catch (err) {
            console.error('Error decrypting section content:', err);
          }
        }
      }
    }

    // Получаем все транскрипты из всех сессий пациента
    let transcriptsText = '';
    if (sessionsCount > 0) {
      const sessionIds = sessions.map(s => s.id);
      const { data: recordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('id, transcription_text, transcription_encrypted, transcription_status, file_name, session_id')
        .in('session_id', sessionIds)
        .eq('transcription_status', 'completed');

      if (recordingsError) {
        console.error('[Patient Case Summary] Error fetching recordings:', recordingsError);
      } else if (recordings?.length) {
        // Используем helper для расшифровки транскриптов
        transcriptsText = extractTranscriptsFromRecordings(recordings) || '';
      }
    }

    if (!clinicalNotesText.trim() && !transcriptsText.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Нет доступного контента для генерации сводки. Необходимы клинические заметки или транскрипты сессий.',
      });
    }

    // Анонимизируем
    const combinedText = clinicalNotesText + (transcriptsText ? '\n\n' + transcriptsText : '');
    const { text: anonymizedText, map: anonymizationMap } = anonymize(
      combinedText,
      patient
    );

    // Разделяем анонимизированный текст обратно
    const anonymizedNotes = anonymizedText.split('\n\nТранскрипты сессий:\n\n');
    const anonymizedClinicalNotes = anonymizedNotes[0] || anonymizedText;
    const anonymizedTranscripts = anonymizedNotes[1] || '';

    // Генерируем HTML сводку
    const aiSummary = await generatePatientCaseSummaryContent(
      anonymizedClinicalNotes,
      anonymizedTranscripts,
      sessionsCount,
      firstSessionDate,
      lastSessionDate
    );

    // Де-анонимизируем
    const deanonymizedSummary = deanonymize(aiSummary, anonymizationMap);

    // Шифруем и сохраняем в пациента
    const encryptedSummary = encrypt(deanonymizedSummary);

    await supabase
      .from('patients')
      .update({
        case_summary_encrypted: encryptedSummary,
        case_summary_generated_at: new Date().toISOString(),
      })
      .eq('id', patient_id);

    // Логируем
    await supabase.from('audit_logs').insert({
      user_id,
      action: 'ai_patient_case_summary_generated',
      resource_type: 'patient',
      resource_id: patient_id,
      details: {
        based_on_notes_count: clinicalNotes?.length || 0,
        based_on_sessions_count: sessionsCount,
      },
    });

    res.json({
      success: true,
      data: {
        patient_id,
        case_summary: deanonymizedSummary,
        generated_at: new Date().toISOString(),
        based_on_notes_count: clinicalNotes?.length || 0,
        based_on_sessions_count: sessionsCount,
      },
    });
  } catch (error) {
    console.error('Error generating patient case summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as aiRoute };

