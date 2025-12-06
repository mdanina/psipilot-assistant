import express from 'express';
import { AssemblyAI } from 'assemblyai';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize AssemblyAI client
const assemblyai = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY,
});

// Helper function to get Supabase client (lazy initialization)
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required. Please set it in .env file.');
  }
  
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required. Please set it in .env file.');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Verify Supabase JWT token
 */
async function verifyAuthToken(token) {
  try {
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
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
    const supabase = getSupabaseClient();

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

    // Start transcription with AssemblyAI
    // Note: AssemblyAI API may have changed - check latest documentation
    const transcript = await assemblyai.transcripts.transcribe({
      audio: signedUrlData.signedUrl,
      language_code: 'ru', // Russian language for medical documentation
      speaker_labels: true, // Identify different speakers (diarization)
      auto_chapters: false,
      auto_highlights: false,
      sentiment_analysis: false,
      entity_detection: false,
    });

    // Update recording with transcription status
    const updateData = {
      transcription_status: 'processing',
    };

    // If transcription is already complete (synchronous), update immediately
    if (transcript.status === 'completed') {
      updateData.transcription_status = 'completed';

      // Format transcript with speaker labels if available
      let formattedText = transcript.text;
      if (transcript.utterances && transcript.utterances.length > 0) {
        // Map speaker labels to readable names (Doctor/Patient)
        const speakerMap = {};
        let speakerIndex = 0;
        const speakerNames = ['Врач', 'Пациент', 'Участник 3', 'Участник 4'];

        formattedText = transcript.utterances.map(utterance => {
          if (!speakerMap[utterance.speaker]) {
            speakerMap[utterance.speaker] = speakerNames[speakerIndex] || `Участник ${speakerIndex + 1}`;
            speakerIndex++;
          }
          return `${speakerMap[utterance.speaker]}: ${utterance.text}`;
        }).join('\n');
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
        const supabase = getSupabaseClient();
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
 * GET /api/transcribe/:recordingId/status
 * Get transcription status
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

    // Get Supabase client
    const supabase = getSupabaseClient();
    
    // Get recording from database
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('transcription_status, transcription_text, transcription_error')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json({
      status: recording.transcription_status,
      transcriptionText: recording.transcription_text,
      error: recording.transcription_error,
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

