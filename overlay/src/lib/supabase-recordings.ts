/**
 * Recording management for overlay
 * Simplified version of main app's recording functions
 */

import { supabase } from './supabase';

const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

export interface CreateRecordingParams {
  sessionId: string;
  userId: string;
  fileName?: string;
}

export interface UploadAudioParams {
  recordingId: string;
  audioBlob: Blob;
  fileName: string;
  mimeType: string;
}

/**
 * Create a new recording record in the database
 */
export async function createRecording(params: CreateRecordingParams): Promise<{ id: string }> {
  const { sessionId, userId, fileName } = params;

  const { data: { session } } = await supabase.auth.getSession();
  const authUid = session?.user?.id;

  if (!authUid) {
    throw new Error('No authenticated session');
  }

  const tempFileName = fileName || `recording-${Date.now()}.webm`;
  const tempFilePath = `recordings/${Date.now()}-${tempFileName}`;

  const { data, error } = await supabase
    .from('recordings')
    .insert({
      session_id: sessionId,
      user_id: authUid,
      file_path: tempFilePath,
      file_name: tempFileName,
      transcription_status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating recording:', error);
    throw new Error(`Failed to create recording: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create recording: No data returned');
  }

  return data;
}

/**
 * Upload audio file to Supabase Storage
 */
export async function uploadAudioFile(params: UploadAudioParams): Promise<string> {
  const { recordingId, audioBlob, fileName, mimeType } = params;

  const filePath = `recordings/${recordingId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(filePath, audioBlob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error('Error uploading audio:', uploadError);
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // Update recording with final file path
  const { error: updateError } = await supabase
    .from('recordings')
    .update({
      file_path: filePath,
      file_name: fileName,
      file_size_bytes: audioBlob.size,
      mime_type: mimeType,
      duration_seconds: null, // TODO: calculate duration
    })
    .eq('id', recordingId);

  if (updateError) {
    console.error('Error updating recording:', updateError);
    throw new Error(`Failed to update recording: ${updateError.message}`);
  }

  return filePath;
}

/**
 * Start transcription for a recording
 */
export async function startTranscription(recordingId: string): Promise<void> {
  if (!transcriptionApiUrl) {
    throw new Error('Transcription API URL not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('No active session found');
  }

  const response = await fetch(`${transcriptionApiUrl}/api/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      recordingId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start transcription: ${errorText}`);
  }
}
