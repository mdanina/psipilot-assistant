import express from 'express';
import { createClient } from '@supabase/supabase-js';

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
 * POST /api/webhook/assemblyai
 * Webhook endpoint for AssemblyAI transcription completion
 * This endpoint receives notifications when transcription is complete
 */
router.post('/webhook/assemblyai', async (req, res) => {
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
        // Map speaker labels to readable names (Doctor/Patient)
        const speakerMap = {};
        let speakerIndex = 0;
        const speakerNames = ['Врач', 'Пациент', 'Участник 3', 'Участник 4'];

        formattedText = utterances.map(utterance => {
          if (!speakerMap[utterance.speaker]) {
            speakerMap[utterance.speaker] = speakerNames[speakerIndex] || `Участник ${speakerIndex + 1}`;
            speakerIndex++;
          }
          return `${speakerMap[utterance.speaker]}: ${utterance.text}`;
        }).join('\n');
      }

      updateData.transcription_status = 'completed';
      updateData.transcription_text = formattedText;
      updateData.transcribed_at = new Date().toISOString();
      
      console.log('Updating recording with completed transcription:', recording.id);
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
