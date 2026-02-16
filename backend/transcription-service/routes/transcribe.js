import express from 'express';
import { AssemblyAI } from 'assemblyai';
import { getSupabaseAdmin } from '../services/supabase-admin.js';
import { encrypt, isEncryptionConfigured } from '../services/encryption.js';
import { getUserRoleFromRecording, formatTranscriptWithSpeakers } from '../services/transcript-formatting.js';

const router = express.Router();

// Lazy initialization of AssemblyAI client
let assemblyaiClient = null;

function getAssemblyAI() {
  if (!assemblyaiClient) {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      throw new Error('ASSEMBLYAI_API_KEY is required. Please set it in .env file.');
    }
    assemblyaiClient = new AssemblyAI({ apiKey });
  }
  return assemblyaiClient;
}

// getSupabaseAdmin imported from ../services/supabase-admin.js

/**
 * Sync transcription status from AssemblyAI API
 */
async function syncTranscriptionStatus(recording) {
  if (!recording.transcript_id) {
    return null;
  }

  try {
    const assemblyai = getAssemblyAI();
    const transcript = await assemblyai.transcripts.get(recording.transcript_id);

    if (!transcript) {
      return null;
    }

    const supabase = getSupabaseAdmin();
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (transcript.status === 'completed') {
      // Check if we have actual text content
      if (transcript.text && transcript.text.trim()) {
        // Format transcript with speaker labels if available
        let formattedText = transcript.text;
        if (transcript.utterances && transcript.utterances.length > 0) {
          // Get user role from recording
          const userRole = await getUserRoleFromRecording(recording, supabase);
          formattedText = formatTranscriptWithSpeakers(transcript.utterances, userRole);
        }

        updateData.transcription_status = 'completed';
        updateData.transcribed_at = new Date().toISOString();

        // SECURITY: Encrypt transcript before saving — NEVER store PHI in plaintext
        if (!isEncryptionConfigured()) {
          const errMsg = 'SECURITY: ENCRYPTION_KEY not configured. Refusing to store PHI in plaintext.';
          console.error(`[syncTranscriptionStatus] ${errMsg}`);
          updateData.transcription_status = 'error';
          updateData.transcription_error = errMsg;
        } else {
          try {
            updateData.transcription_text = encrypt(formattedText);
            updateData.transcription_encrypted = true;
          } catch (encryptError) {
            console.error('[syncTranscriptionStatus] Encryption failed:', encryptError.message);
            updateData.transcription_status = 'error';
            updateData.transcription_error = 'Encryption failed - transcript not stored for security';
          }
        }
      } else {
        // AssemblyAI returned completed but no text - likely silent/empty audio
        updateData.transcription_status = 'completed';
        updateData.transcribed_at = new Date().toISOString();
        updateData.transcription_text = null;
        updateData.transcription_error = 'Не удалось распознать речь в записи. Возможно, аудио было пустым или содержало только тишину.';
        console.warn('[syncTranscriptionStatus] Completed but no text for recording:', recording.id);
      }
    } else if (transcript.status === 'error') {
      updateData.transcription_status = 'failed';
      updateData.transcription_error = transcript.error || 'Transcription failed';
    } else if (transcript.status === 'processing' || transcript.status === 'queued') {
      updateData.transcription_status = 'processing';
    }

    const { error: updateError } = await supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recording.id);

    if (updateError) {
      console.error('Error updating recording during sync:', updateError.message);
      return null;
    }

    return { ...recording, ...updateData, assemblyaiStatus: transcript.status };
  } catch (error) {
    console.error('Error syncing transcription status:', error.message || error);
    return null;
  }
}

/**
 * Verify user has access to a session (owner only)
 * @param {string} userId - User ID from JWT token
 * @param {string} sessionId - Session ID to check access for
 * @param {Object} supabase - Supabase admin client
 * @returns {Promise<{authorized: boolean, error?: string, session?: Object}>}
 */
async function verifySessionAccess(userId, sessionId, supabase) {
  try {
    // Get session with user_id
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('user_id, clinic_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return { authorized: false, error: 'Session not found' };
    }

    // Check access: owner only
    if (session.user_id !== userId) {
      console.warn('[verifySessionAccess] Access denied: user', userId, 'is not owner');
      return { authorized: false, error: 'Access denied' };
    }

    return { authorized: true, session };
  } catch (error) {
    console.error('[verifySessionAccess] Error:', error.message || error);
    return { authorized: false, error: 'Internal error checking access' };
  }
}

/**
 * POST /api/transcribe
 * Start transcription for a recording
 */
router.post('/transcribe', async (req, res) => {
  try {
    // Authentication is handled by verifyAuthToken middleware in server.js
    // req.user is set by the middleware with { id, email, clinic_id }
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication' });
    }

    const { recordingId } = req.body;
    if (!recordingId) {
      return res.status(400).json({ error: 'Missing recordingId' });
    }

    // Get Supabase client
    const supabase = getSupabaseAdmin();

    // Get recording from database
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // SECURITY: Verify user has access to this recording (owner only)
    const accessCheck = await verifySessionAccess(user.id, recording.session_id, supabase);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: `Forbidden: ${accessCheck.error}` });
    }

    // Validate that audio file was actually uploaded (not still a temp placeholder)
    if (!recording.file_path || recording.file_path.startsWith('recordings/temp/')) {
      return res.status(400).json({
        error: 'Audio file has not been uploaded yet. The recording upload may have been interrupted.',
      });
    }

    // Get signed URL for audio file from Supabase Storage
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('recordings')
      .createSignedUrl(recording.file_path, 3600); // 1 hour expiry

    if (urlError || !signedUrlData) {
      console.error('[transcribe] Failed to create signed URL:', urlError, 'file_path:', recording.file_path);
      return res.status(500).json({ error: 'Failed to generate signed URL for audio file' });
    }

    // Get webhook URL for async transcription
    const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SUPABASE_URL?.replace(/\/$/, '') || 'http://localhost:3001'}/api/webhook/assemblyai`;

    // Webhook authentication settings
    // AssemblyAI will send this header with the specified value when calling webhook
    const webhookAuthHeaderName = process.env.WEBHOOK_AUTH_HEADER_NAME;
    const webhookAuthHeaderValue = process.env.WEBHOOK_AUTH_HEADER_VALUE;

    // Build transcription config
    const transcriptionConfig = {
      audio: signedUrlData.signedUrl,
      language_code: 'ru', // Russian language for medical documentation
      speaker_labels: true, // Identify different speakers (diarization)
      speech_model: 'universal', // Faster transcription model
      auto_chapters: false,
      auto_highlights: false,
      sentiment_analysis: false,
      entity_detection: false,
      webhook_url: webhookUrl, // Webhook URL for async transcription completion
    };

    // Add webhook authentication if configured
    if (webhookAuthHeaderName && webhookAuthHeaderValue) {
      transcriptionConfig.webhook_auth_header_name = webhookAuthHeaderName;
      transcriptionConfig.webhook_auth_header_value = webhookAuthHeaderValue;
    }

    // Start transcription with AssemblyAI
    const assemblyai = getAssemblyAI();
    const transcript = await assemblyai.transcripts.transcribe(transcriptionConfig);

    // Update recording with transcription status and transcript_id
    const updateData = {
      transcription_status: 'processing',
      transcript_id: transcript.id, // Save transcript_id for webhook processing
    };

    // If transcription is already complete (synchronous), update immediately
    if (transcript.status === 'completed') {
      updateData.transcription_status = 'completed';
      updateData.transcribed_at = new Date().toISOString();

      // Check if we have actual text content
      if (transcript.text && transcript.text.trim()) {
        // Format transcript with speaker labels if available
        let formattedText = transcript.text;
        if (transcript.utterances && transcript.utterances.length > 0) {
          // Get user role from recording
          const userRole = await getUserRoleFromRecording(recording, supabase);
          formattedText = formatTranscriptWithSpeakers(transcript.utterances, userRole);
        }

        // SECURITY: Encrypt transcript before saving — NEVER store PHI in plaintext
        if (!isEncryptionConfigured()) {
          const errMsg = 'SECURITY: ENCRYPTION_KEY not configured. Refusing to store PHI in plaintext.';
          console.error(`[POST /transcribe] ${errMsg}`);
          updateData.transcription_status = 'error';
          updateData.transcription_error = errMsg;
        } else {
          try {
            updateData.transcription_text = encrypt(formattedText);
            updateData.transcription_encrypted = true;
          } catch (encryptError) {
            console.error('[POST /transcribe] Encryption failed:', encryptError.message);
            updateData.transcription_status = 'error';
            updateData.transcription_error = 'Encryption failed - transcript not stored for security';
          }
        }
      } else {
        // AssemblyAI returned completed but no text - likely silent/empty audio
        updateData.transcription_text = null;
        updateData.transcription_error = 'Не удалось распознать речь в записи. Возможно, аудио было пустым или содержало только тишину.';
        console.warn('[POST /transcribe] Completed but no text for recording:', recordingId);
      }
    } else if (transcript.status === 'error') {
      updateData.transcription_status = 'failed';
      updateData.transcription_error = transcript.error || 'Transcription failed';
    }

    const { error: updateError } = await supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recordingId);

    if (updateError) {
      console.error('Error saving transcript_id to database:', updateError);
      throw new Error(`Failed to save transcription status: ${updateError.message}`);
    }

    // Return success (transcript_id stored in DB, not exposed to client)
    res.json({
      success: true,
      recordingId,
      status: 'processing',
    });
  } catch (error) {
    console.error('Transcription error:', error.message || error);

    // Update recording status to failed
    if (req.body.recordingId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase
          .from('recordings')
          .update({
            transcription_status: 'failed',
            transcription_error: error.message || 'Transcription error',
          })
          .eq('id', req.body.recordingId);
      } catch (updateError) {
        console.error('Error updating recording status:', updateError.message || updateError);
      }
    }

    res.status(500).json({
      error: 'Transcription failed',
    });
  }
});

/**
 * POST /api/transcribe/:recordingId/sync
 * Sync transcription status from AssemblyAI API
 * Useful when webhook is not configured or failed
 */
router.post('/transcribe/:recordingId/sync', async (req, res) => {
  try {
    // Authentication is handled by verifyAuthToken middleware in server.js
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication' });
    }

    const { recordingId } = req.params;
    const supabase = getSupabaseAdmin();

    // Get recording with transcript_id
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // SECURITY: Verify user has access (owner only)
    const accessCheck = await verifySessionAccess(user.id, recording.session_id, supabase);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: `Forbidden: ${accessCheck.error}` });
    }

    // Check if transcript_id exists
    if (!recording.transcript_id) {
      return res.status(400).json({ 
        error: 'No transcript_id found. Transcription may not have started yet.' 
      });
    }

    // Sync status from AssemblyAI
    const syncedRecording = await syncTranscriptionStatus(recording);

    if (!syncedRecording) {
      return res.status(500).json({
        error: 'Failed to sync transcription status'
      });
    }

    res.json({
      success: true,
      status: syncedRecording.transcription_status,
      hasText: !!syncedRecording.transcription_text,
    });
  } catch (error) {
    console.error('Sync error:', error.message || error);
    res.status(500).json({
      error: 'Failed to sync transcription status',
    });
  }
});

/**
 * GET /api/transcribe/:recordingId/status
 * Get transcription status (with optional auto-sync)
 */
router.get('/transcribe/:recordingId/status', async (req, res) => {
  try {
    // Authentication is handled by verifyAuthToken middleware in server.js
    // req.user is set by the middleware with { id, email, clinic_id }
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication' });
    }

    const { recordingId } = req.params;
    const { sync } = req.query; // Optional: ?sync=true to force sync

    // Get Supabase client
    const supabase = getSupabaseAdmin();

    // Get recording from database (need transcript_id and created_at for sync check)
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('id, transcription_status, transcription_text, transcription_error, transcript_id, created_at, updated_at, session_id')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // SECURITY: Verify user has access to this recording (owner only)
    const accessCheck = await verifySessionAccess(user.id, recording.session_id, supabase);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: `Forbidden: ${accessCheck.error}` });
    }

    // Auto-sync if status is processing and enough time has passed, or if sync=true
    const shouldSync = sync === 'true' || (
      recording.transcription_status === 'processing' &&
      recording.transcript_id &&
      recording.created_at
    );

    if (shouldSync) {
      const createdAt = new Date(recording.created_at);
      const now = new Date();
      const secondsSinceCreated = (now - createdAt) / 1000;

      // Sync if forced or if more than 30 seconds have passed
      if (sync === 'true' || secondsSinceCreated > 30) {
        console.log(`Auto-syncing transcription status for recording ${recordingId}`);
        const syncedRecording = await syncTranscriptionStatus(recording);
        if (syncedRecording) {
          return res.json({
            status: syncedRecording.transcription_status,
            transcriptionText: syncedRecording.transcription_text,
            error: syncedRecording.transcription_error,
            synced: true,
          });
        }
      }
    }

    res.json({
      status: recording.transcription_status,
      transcriptionText: recording.transcription_text,
      error: recording.transcription_error,
      synced: false,
    });
  } catch (error) {
    console.error('Status check error:', error.message || error);
    res.status(500).json({
      error: 'Failed to get status',
    });
  }
});

export { router as transcribeRoute };

