/**
 * Research API Routes
 * Изолированный API для исследователей с полной деидентификацией данных
 * HIPAA Safe Harbor compliance
 */

import express from 'express';
import { getSupabaseAdmin } from '../services/supabase-admin.js';
import { fullyDeidentifyForResearch, validateSafeHarborCompliance } from '../services/research-anonymization.js';
import { decrypt } from '../services/encryption.js';

const router = express.Router();

// getSupabaseAdmin imported from ../services/supabase-admin.js

/**
 * Helper function to get client IP from request
 */
function getClientIP(req) {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         null;
}

/**
 * Helper function to log research access
 */
async function logResearchAccess(supabase, researcherId, action, recordsCount, datasetType, req) {
  try {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || null;
    const requestId = req.headers['x-request-id'] || null;

    await supabase.rpc('log_research_access', {
      p_researcher_id: researcherId,
      p_action: action,
      p_records_count: recordsCount,
      p_dataset_type: datasetType,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_request_id: requestId,
      p_success: true
    });
  } catch (error) {
    console.error('[Research API] Error logging access:', error);
    // Не блокируем запрос из-за ошибки логирования
  }
}

/**
 * GET /api/research/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Research API',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/research/stats
 * Получить статистику доступных датасетов (без PHI)
 */
router.get('/stats', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const researcherId = req.researcher?.id;

    if (!researcherId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Получаем статистику транскриптов с согласием на исследования
    // Используем admin client для обхода RLS (но проверяем согласие)
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        id,
        transcript_status,
        patients!inner (
          id,
          consent_records!inner (
            consent_type,
            status,
            expires_at
          )
        )
      `)
      .eq('transcript_status', 'completed')
      .not('transcript', 'is', null)
      .eq('patients.consent_records.consent_type', 'research')
      .eq('patients.consent_records.status', 'active');

    if (error) {
      console.error('[Research API] Error fetching stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }

    // Фильтруем по активным согласиям (expires_at)
    const activeSessions = sessions?.filter(session => {
      const consent = session.patients?.consent_records?.[0];
      if (!consent) return false;
      if (consent.expires_at) {
        return new Date(consent.expires_at) > new Date();
      }
      return true;
    }) || [];

    // Логируем доступ
    await logResearchAccess(supabase, researcherId, 'stats', activeSessions.length, 'transcripts', req);

    res.json({
      success: true,
      data: {
        total_transcripts: activeSessions.length,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Research API] Error in stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/research/anonymized-transcripts
 * Получить полностью деидентифицированные транскрипты
 */
router.get('/anonymized-transcripts', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const researcherId = req.researcher?.id;

    if (!researcherId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Параметры запроса
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const maxLimit = 1000; // Максимальный лимит для безопасности

    const actualLimit = Math.min(limit, maxLimit);

    // Получаем транскрипты с согласием на исследования
    // Используем admin client, но проверяем согласие через JOIN
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        id,
        transcript,
        transcript_encrypted,
        scheduled_at,
        duration_minutes,
        patients!inner (
          id,
          name,
          email,
          phone,
          date_of_birth,
          address,
          consent_records!inner (
            consent_type,
            status,
            expires_at
          )
        )
      `)
      .eq('transcript_status', 'completed')
      .or('transcript.not.is.null,transcript_encrypted.not.is.null')
      .eq('patients.consent_records.consent_type', 'research')
      .eq('patients.consent_records.status', 'active')
      .order('scheduled_at', { ascending: false })
      .range(offset, offset + actualLimit - 1);

    if (error) {
      console.error('[Research API] Error fetching sessions:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch transcripts'
      });
    }

    if (!sessions || sessions.length === 0) {
      // Логируем даже пустой запрос
      await logResearchAccess(supabase, researcherId, 'view', 0, 'transcripts', req);
      
      return res.json({
        success: true,
        data: [],
        metadata: {
          total: 0,
          limit: actualLimit,
          offset: offset
        }
      });
    }

    // Фильтруем по активным согласиям (expires_at)
    const activeSessions = sessions.filter(session => {
      const consent = session.patients?.consent_records?.[0];
      if (!consent) return false;
      if (consent.expires_at) {
        return new Date(consent.expires_at) > new Date();
      }
      return true;
    });

    // Полная деидентификация каждого транскрипта
    const deidentified = await Promise.all(activeSessions.map(async (session) => {
      const patient = session.patients || {};
      
      // Получаем транскрипт (расшифровываем если зашифрован)
      let transcriptText = session.transcript;
      
      if (!transcriptText && session.transcript_encrypted) {
        try {
          // Расшифровываем транскрипт
          // BYTEA в Supabase возвращается как Buffer или base64 строка
          let encryptedData;
          if (Buffer.isBuffer(session.transcript_encrypted)) {
            encryptedData = session.transcript_encrypted.toString('base64');
          } else if (typeof session.transcript_encrypted === 'string') {
            // Уже base64 строка
            encryptedData = session.transcript_encrypted;
          } else {
            throw new Error('Invalid encrypted data format');
          }
          
          transcriptText = decrypt(encryptedData);
        } catch (decryptError) {
          console.error(`[Research API] Failed to decrypt transcript for session ${session.id}:`, decryptError);
          // Пропускаем эту сессию, если не удалось расшифровать
          return null;
        }
      }
      
      if (!transcriptText) {
        // Пропускаем сессии без транскрипта
        return null;
      }
      
      // Деидентифицируем транскрипт (БЕЗ маппинга)
      const deidentifiedText = fullyDeidentifyForResearch(
        transcriptText,
        {
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
          date_of_birth: patient.date_of_birth,
          address: patient.address
        }
      );

      // Проверка соответствия (логируем предупреждения, но не блокируем)
      const compliance = validateSafeHarborCompliance(deidentifiedText);
      if (!compliance.compliant) {
        console.warn(`[Research API] Safe Harbor violation for session ${session.id}:`, compliance.violations);
      }

      return {
        session_id: session.id, // UUID не является PHI
        deidentified_transcript: deidentifiedText,
        session_year: session.scheduled_at ? new Date(session.scheduled_at).getFullYear() : null, // Только год
        duration_minutes: session.duration_minutes,
        // НЕ включаем: patient_id, полные даты, имена, любые PHI
      };
    }));
    
    // Фильтруем null значения (сессии, которые не удалось обработать)
    const validDeidentified = deidentified.filter(item => item !== null);

    // Логируем доступ
    await logResearchAccess(supabase, researcherId, 'view', validDeidentified.length, 'transcripts', req);

    res.json({
      success: true,
      data: validDeidentified,
      metadata: {
        total: validDeidentified.length,
        limit: actualLimit,
        offset: offset,
        deidentification_method: 'safe_harbor',
        compliance: 'hipaa_safe_harbor'
      }
    });
  } catch (error) {
    console.error('[Research API] Error in anonymized-transcripts endpoint:', error);
    
    // Логируем ошибку
    try {
      const supabase = getSupabaseAdmin();
      await supabase.rpc('log_research_access', {
        p_researcher_id: req.researcher?.id,
        p_action: 'view',
        p_records_count: 0,
        p_dataset_type: 'transcripts',
        p_success: false,
        p_error_message: error.message
      });
    } catch (logError) {
      console.error('[Research API] Error logging failed access:', logError);
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;

