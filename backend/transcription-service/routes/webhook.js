import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

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
 * POST /api/webhook/assemblyai
 * Webhook endpoint for AssemblyAI transcription completion
 */
router.post('/webhook/assemblyai', async (req, res) => {
  try {
    const { transcript_id, status, text, error } = req.body;

    if (!transcript_id) {
      return res.status(400).json({ error: 'Missing transcript_id' });
    }

    // Find recording by transcript_id (we need to store this mapping)
    // For now, we'll need to add a transcript_id column to recordings table
    // Or store the mapping in a separate table
    
    // This is a simplified version - in production, you'd want to:
    // 1. Store transcript_id when starting transcription
    // 2. Look up recording by transcript_id
    // 3. Update recording with transcription result

    // For now, we'll accept the webhook and log it
    console.log('AssemblyAI webhook received:', {
      transcript_id,
      status,
      hasText: !!text,
      error,
    });

    // TODO: Implement proper recording lookup and update
    // This requires storing transcript_id in the recordings table

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
});

export { router as webhookRoute };

