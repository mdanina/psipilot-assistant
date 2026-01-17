import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { webhookAuth, getWebhookMetrics } from '../middleware/webhook-auth.js';
import { encrypt, isEncryptionConfigured } from '../services/encryption.js';
import { getUserRoleFromRecording, formatTranscriptWithSpeakers } from '../services/transcript-formatting.js';

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
 * GET /api/webhook/metrics
 * Endpoint для мониторинга статистики webhook верификации
 * Доступен только в development или с правильным API ключом
 */
router.get('/webhook/metrics', (req, res) => {
  // Простая проверка доступа через API ключ или dev mode
  const apiKey = req.headers['x-api-key'];
  const isDev = process.env.NODE_ENV === 'development';
  const validApiKey = process.env.ADMIN_API_KEY;

  if (!isDev && (!validApiKey || apiKey !== validApiKey)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(getWebhookMetrics());
});

/**
 * POST /api/webhook/assemblyai
 * Webhook endpoint for AssemblyAI transcription completion
 * This endpoint receives notifications when transcription is complete
 *
 * SECURITY: Использует webhookAuth middleware для верификации подписи
 * Режим настраивается через WEBHOOK_VERIFICATION_MODE env variable:
 * - shadow (default): только логирование
 * - warn: логирование + warning
 * - soft: отклонение с 200
 * - strict: отклонение с 401
 */
router.post('/webhook/assemblyai', webhookAuth, async (req, res) => {
  try {
    const { transcript_id, status, text, utterances, error } = req.body;

    if (!transcript_id) {
      console.error('Webhook received without transcript_id');
      return res.status(400).json({ error: 'Missing transcript_id' });
    }

    console.log('AssemblyAI webhook received:', {
      transcript_id,
      status,
      hasText: !!text,
      hasUtterances: !!utterances,
      error,
    });

    const supabase = getSupabaseAdmin();

    // Find recording by transcript_id
    const { data: recording, error: findError } = await supabase
      .from('recordings')
      .select('*')
      .eq('transcript_id', transcript_id)
      .single();

    if (findError || !recording) {
      console.error('Recording not found for transcript_id:', transcript_id, findError);
      // Return 200 to prevent AssemblyAI from retrying
      return res.status(200).json({ 
        success: false, 
        error: 'Recording not found',
        transcript_id 
      });
    }

    console.log('Found recording:', recording.id, 'for transcript_id:', transcript_id);

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed' && text) {
      // Format transcript with speaker labels if available
      let formattedText = text;
      if (utterances && utterances.length > 0) {
        // Get user role from recording
        const userRole = await getUserRoleFromRecording(recording, supabase);
        formattedText = formatTranscriptWithSpeakers(utterances, userRole);
      }

      updateData.transcription_status = 'completed';
      updateData.transcribed_at = new Date().toISOString();

      // SECURITY: Encrypt transcript before saving to database
      if (isEncryptionConfigured()) {
        try {
          updateData.transcription_text = encrypt(formattedText);
          updateData.transcription_encrypted = true;
          console.log('Updating recording with encrypted transcription:', recording.id);
        } catch (encryptError) {
          // FALLBACK: If encryption fails, save plaintext but log error
          console.error('Encryption failed, saving plaintext:', encryptError.message);
          updateData.transcription_text = formattedText;
          updateData.transcription_encrypted = false;
        }
      } else {
        // Encryption not configured - save plaintext with warning in production
        if (process.env.NODE_ENV === 'production') {
          console.warn('[SECURITY WARNING] ENCRYPTION_KEY not configured in production! Transcript saved as plaintext.');
        }
        updateData.transcription_text = formattedText;
        updateData.transcription_encrypted = false;
      }
    } else if (status === 'error') {
      updateData.transcription_status = 'failed';
      updateData.transcription_error = error || 'Transcription failed';
      
      console.log('Updating recording with error status:', recording.id, error);
    } else if (status === 'processing') {
      updateData.transcription_status = 'processing';
      
      console.log('Recording still processing:', recording.id);
    }

    // Update recording in database
    const { error: updateError } = await supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recording.id);

    if (updateError) {
      console.error('Error updating recording:', updateError);
      return res.status(500).json({ 
        error: 'Failed to update recording',
        message: updateError.message 
      });
    }

    console.log('Recording updated successfully:', recording.id, 'Status:', status);
    res.json({ 
      success: true, 
      recordingId: recording.id,
      status 
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
});

export { router as webhookRoute };
