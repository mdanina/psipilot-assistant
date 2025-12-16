import express from 'express';
import { AssemblyAI } from 'assemblyai';
import { createClient } from '@supabase/supabase-js';

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

// Helper function to get Supabase admin client (for DB operations)
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
 * Get user role from recording
 * @param {Object} recording - Recording object with user_id
 * @param {Object} supabase - Supabase admin client
 * @returns {Promise<string>} User role in Russian ('Врач', 'Администратор', 'Ассистент')
 */
async function getUserRoleFromRecording(recording, supabase) {
  try {
    if (!recording?.user_id) {
      console.warn('Recording has no user_id, defaulting to "Врач"');
      return 'Врач';
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', recording.user_id)
      .single();

    if (error || !profile) {
      console.warn('Failed to fetch user profile:', error?.message, 'Defaulting to "Врач"');
      return 'Врач';
    }

    // Map role to Russian name
    const roleMap = {
      'doctor': 'Врач',
      'admin': 'Администратор',
      'assistant': 'Ассистент'
    };

    return roleMap[profile.role] || 'Врач';
  } catch (error) {
    console.error('Error getting user role:', error);
    return 'Врач'; // Default fallback
  }
}

/**
 * Format transcript with speaker labels using user role
 * @param {Array} utterances - Array of utterance objects from AssemblyAI
 * @param {string} userRole - Role of the first user (in Russian)
 * @returns {string} Formatted transcript text
 */
function formatTranscriptWithSpeakers(utterances, userRole = 'Врач') {
  if (!utterances || utterances.length === 0) {
    return '';
  }

  const speakerMap = {};
  let speakerIndex = 0;
  // First speaker gets the user's role, second is always "Пациент", others are "Участник N"
  const speakerNames = [userRole, 'Пациент', 'Участник 3', 'Участник 4'];

  return utterances.map(utterance => {
    if (!speakerMap[utterance.speaker]) {
      speakerMap[utterance.speaker] = speakerNames[speakerIndex] || `Участник ${speakerIndex + 1}`;
      speakerIndex++;
    }
    return `${speakerMap[utterance.speaker]}: ${utterance.text}`;
  }).join('\n');
}

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

    if (transcript.status === 'completed' && transcript.text) {
      // Format transcript with speaker labels if available
      let formattedText = transcript.text;
      if (transcript.utterances && transcript.utterances.length > 0) {
        // Get user role from recording
        const userRole = await getUserRoleFromRecording(recording, supabase);
        formattedText = formatTranscriptWithSpeakers(transcript.utterances, userRole);
      }

      updateData.transcription_status = 'completed';
      updateData.transcription_text = formattedText;
      updateData.transcribed_at = new Date().toISOString();
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
      console.error('Error updating recording during sync:', updateError);
      return null;
    }

    return { ...recording, ...updateData, assemblyaiStatus: transcript.status };
  } catch (error) {
    console.error('Error syncing transcription status:', error);
    return null;
  }
}

/**
 * Verify Supabase JWT token and get user
 */
async function verifyAuthToken(token) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return null;
    }

    // Create client with the user's token for verification
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      console.error('Token verification failed:', error?.message);
      return null;
    }
    return user;
  } catch (err) {
    console.error('Error verifying token:', err);
    return null;
  }
}

/**
 * POST /api/transcribe
 * Start transcription for a recording
 */
router.post('/transcribe', async (req, res) => {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.substring(7);
    const user = await verifyAuthToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
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

    // Verify user has access to this recording
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id, clinic_id')
      .eq('id', recording.session_id)
      .single();

    if (!session || session.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    // Get signed URL for audio file from Supabase Storage
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('recordings')
      .createSignedUrl(recording.file_path, 3600); // 1 hour expiry

    if (urlError || !signedUrlData) {
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

      // Format transcript with speaker labels if available
      let formattedText = transcript.text;
      if (transcript.utterances && transcript.utterances.length > 0) {
        // Get user role from recording
        const userRole = await getUserRoleFromRecording(recording, supabase);
        formattedText = formatTranscriptWithSpeakers(transcript.utterances, userRole);
      }

      updateData.transcription_text = formattedText;
      updateData.transcribed_at = new Date().toISOString();
    } else if (transcript.status === 'error') {
      updateData.transcription_status = 'failed';
      updateData.transcription_error = transcript.error || 'Transcription failed';
    }

    await supabase
      .from('recordings')
      .update(updateData)
      .eq('id', recordingId);

    // Return transcription ID for polling or webhook
    res.json({
      success: true,
      recordingId,
      transcriptId: transcript.id,
      status: transcript.status,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    
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
        console.error('Error updating recording status:', updateError);
      }
    }

    res.status(500).json({
      error: 'Transcription failed',
      message: error.message,
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
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.substring(7);
    const user = await verifyAuthToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
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

    // Verify user has access
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('id', recording.session_id)
      .single();

    if (!session || session.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
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
        error: 'Failed to sync transcription status from AssemblyAI' 
      });
    }

    res.json({
      success: true,
      status: syncedRecording.assemblyaiStatus,
      transcriptionStatus: syncedRecording.transcription_status,
      hasText: !!syncedRecording.transcription_text,
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      error: 'Failed to sync transcription status',
      message: error.message,
    });
  }
});

/**
 * GET /api/transcribe/:recordingId/status
 * Get transcription status (with optional auto-sync)
 */
router.get('/transcribe/:recordingId/status', async (req, res) => {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.substring(7);
    const user = await verifyAuthToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
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

    // SECURITY: Verify user has access to this recording
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('id', recording.session_id)
      .single();

    if (!session || session.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
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
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
    });
  }
});

export { router as transcribeRoute };

