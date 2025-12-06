import { supabase } from './supabase';
import type { Database } from '@/types/database.types';

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingInsert = Database['public']['Tables']['recordings']['Insert'];
type RecordingUpdate = Database['public']['Tables']['recordings']['Update'];

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

export interface TranscriptionStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionText?: string | null;
  error?: string | null;
}

/**
 * Create a new recording record in the database
 */
export async function createRecording(params: CreateRecordingParams): Promise<Recording> {
  const { sessionId, userId, fileName } = params;

  // Generate a temporary file path (will be updated after upload)
  const tempFileName = fileName || `recording-${Date.now()}.webm`;
  const tempFilePath = `recordings/temp/${Date.now()}-${tempFileName}`;

  const recordingData: RecordingInsert = {
    session_id: sessionId,
    user_id: userId,
    file_path: tempFilePath, // Temporary path, will be updated after upload
    file_name: tempFileName,
    transcription_status: 'pending',
  };

  const { data, error } = await supabase
    .from('recordings')
    .insert(recordingData)
    .select()
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

  // Generate file path: recordings/{recordingId}/{fileName}
  const filePath = `recordings/${recordingId}/${fileName}`;

  // Upload file to Supabase Storage
  const { data, error } = await supabase.storage
    .from('recordings')
    .upload(filePath, audioBlob, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.error('Error uploading audio file:', error);
    throw new Error(`Failed to upload audio file: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to upload audio file: No data returned');
  }

  // Update recording with file path and size
  const fileSizeBytes = audioBlob.size;
  await updateRecording(recordingId, {
    file_path: filePath,
    file_size_bytes: fileSizeBytes,
    mime_type: mimeType,
  });

  return filePath;
}

/**
 * Update recording record
 */
export async function updateRecording(
  recordingId: string,
  updates: RecordingUpdate
): Promise<Recording> {
  const { data, error } = await supabase
    .from('recordings')
    .update(updates)
    .eq('id', recordingId)
    .select()
    .single();

  if (error) {
    console.error('Error updating recording:', error);
    throw new Error(`Failed to update recording: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to update recording: No data returned');
  }

  return data;
}

/**
 * Start transcription process via backend API
 */
export async function startTranscription(
  recordingId: string,
  transcriptionApiUrl: string
): Promise<void> {
  // Get current session to get JWT token
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

  // Update recording status to processing
  await updateRecording(recordingId, {
    transcription_status: 'processing',
  });
}

/**
 * Get recording status and transcription
 */
export async function getRecordingStatus(recordingId: string): Promise<TranscriptionStatus> {
  const { data, error } = await supabase
    .from('recordings')
    .select('transcription_status, transcription_text, transcription_error')
    .eq('id', recordingId)
    .single();

  if (error) {
    console.error('Error getting recording status:', error);
    throw new Error(`Failed to get recording status: ${error.message}`);
  }

  if (!data) {
    throw new Error('Recording not found');
  }

  return {
    status: data.transcription_status,
    transcriptionText: data.transcription_text,
    error: data.transcription_error || undefined,
  };
}

/**
 * Get recording by ID
 */
export async function getRecording(recordingId: string): Promise<Recording> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', recordingId)
    .single();

  if (error) {
    console.error('Error getting recording:', error);
    throw new Error(`Failed to get recording: ${error.message}`);
  }

  if (!data) {
    throw new Error('Recording not found');
  }

  return data;
}

/**
 * Get all recordings for a session
 */
export async function getSessionRecordings(sessionId: string): Promise<Recording[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting session recordings:', error);
    throw new Error(`Failed to get session recordings: ${error.message}`);
  }

  return data || [];
}

/**
 * Poll recording status until transcription is complete or failed
 */
export async function pollTranscriptionStatus(
  recordingId: string,
  onStatusUpdate?: (status: TranscriptionStatus) => void,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<TranscriptionStatus> {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        attempts++;
        const status = await getRecordingStatus(recordingId);

        if (onStatusUpdate) {
          onStatusUpdate(status);
        }

        if (status.status === 'completed' || status.status === 'failed') {
          resolve(status);
          return;
        }

        if (attempts >= maxAttempts) {
          reject(new Error('Transcription timeout: Maximum polling attempts reached'));
          return;
        }

        setTimeout(poll, intervalMs);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Delete recording and its audio file
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  // Get recording to get file path
  const recording = await getRecording(recordingId);

  // Delete file from storage
  if (recording.file_path) {
    const { error: storageError } = await supabase.storage
      .from('recordings')
      .remove([recording.file_path]);

    if (storageError) {
      console.error('Error deleting audio file:', storageError);
      // Continue with database deletion even if storage deletion fails
    }
  }

  // Delete recording record
  const { error } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId);

  if (error) {
    console.error('Error deleting recording:', error);
    throw new Error(`Failed to delete recording: ${error.message}`);
  }
}

