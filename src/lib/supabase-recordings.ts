import { supabase } from './supabase';
import { decryptPHI } from './encryption';
import type { Database } from '@/types/database.types';

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingInsert = Database['public']['Tables']['recordings']['Insert'];
type RecordingUpdate = Database['public']['Tables']['recordings']['Update'];

// ============================================================================
// Upload configuration
// ============================================================================

/** Maximum file size in MB (500MB = ~5-6 hours of audio at 128kbps) */
export const MAX_FILE_SIZE_MB = 500;

/** Retry configuration for upload */
const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_INITIAL_BACKOFF_MS = 1000; // 1 second

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

  // Debug: verify auth state matches passed userId
  const { data: { session } } = await supabase.auth.getSession();
  const authUid = session?.user?.id;
  console.log('[createRecording] Auth UID:', authUid);
  console.log('[createRecording] Passed userId:', userId);
  console.log('[createRecording] Match:', authUid === userId);

  if (!authUid) {
    throw new Error('No authenticated session. Please re-login.');
  }

  if (authUid !== userId) {
    console.error('[createRecording] User ID mismatch! Auth:', authUid, 'Passed:', userId);
    // Use auth UID instead to prevent RLS error
    console.warn('[createRecording] Using auth.uid() instead of passed userId');
  }

  // Generate a temporary file path (will be updated after upload)
  const tempFileName = fileName || `recording-${Date.now()}.webm`;
  const tempFilePath = `recordings/temp/${Date.now()}-${tempFileName}`;

  const recordingData: RecordingInsert = {
    session_id: sessionId,
    user_id: authUid, // Always use auth UID to match RLS policy
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
 * Check if an error is retryable (network errors, timeouts, 5xx errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return true;
    }
    // Server errors (5xx)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }
  }
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate file size before upload
 * @throws Error if file is too large
 */
export function validateFileSize(blob: Blob, maxSizeMB: number = MAX_FILE_SIZE_MB): void {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (blob.size > maxSizeBytes) {
    const actualSizeMB = Math.round(blob.size / 1024 / 1024 * 10) / 10;
    throw new Error(
      `Файл слишком большой (${actualSizeMB} MB). Максимальный размер: ${maxSizeMB} MB. ` +
      `Попробуйте записать более короткую сессию.`
    );
  }
}

/**
 * Upload audio file to Supabase Storage with retry logic
 */
export async function uploadAudioFile(params: UploadAudioParams): Promise<string> {
  const { recordingId, audioBlob, fileName, mimeType } = params;

  // Validate file size before attempting upload
  validateFileSize(audioBlob);

  // Generate file path: recordings/{recordingId}/{fileName}
  const filePath = `recordings/${recordingId}/${fileName}`;

  let lastError: Error | null = null;

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    try {
      console.log(`[uploadAudioFile] Attempt ${attempt}/${UPLOAD_MAX_RETRIES} for ${filePath}`);

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('recordings')
        .upload(filePath, audioBlob, {
          contentType: mimeType,
          upsert: attempt > 1, // Allow upsert on retry (file might be partially uploaded)
        });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('No data returned from upload');
      }

      console.log(`[uploadAudioFile] Upload successful on attempt ${attempt}`);

      // Update recording with file path and size
      const fileSizeBytes = audioBlob.size;
      await updateRecording(recordingId, {
        file_path: filePath,
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType,
      });

      return filePath;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[uploadAudioFile] Attempt ${attempt} failed:`, lastError.message);

      // Check if we should retry
      if (attempt < UPLOAD_MAX_RETRIES && isRetryableError(error)) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = UPLOAD_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`[uploadAudioFile] Retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      } else if (attempt < UPLOAD_MAX_RETRIES && !isRetryableError(error)) {
        // Non-retryable error (e.g., auth error, file too large) - fail immediately
        console.error('[uploadAudioFile] Non-retryable error, failing immediately');
        break;
      }
    }
  }

  // All retries exhausted
  console.error(`[uploadAudioFile] Upload failed after ${UPLOAD_MAX_RETRIES} attempts`);
  throw new Error(`Не удалось загрузить аудио после ${UPLOAD_MAX_RETRIES} попыток: ${lastError?.message}`);
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

  // Backend already sets transcription_status to 'processing' and saves transcript_id
  // No need to update here - it would be redundant
}

/**
 * Get recording status and transcription (only for non-deleted recordings)
 */
export async function getRecordingStatus(
  recordingId: string,
  transcriptionApiUrl?: string,
  forceSync: boolean = false
): Promise<TranscriptionStatus> {
  let syncError: Error | null = null;
  
  // If forceSync is true and transcriptionApiUrl is provided, sync from AssemblyAI first
  if (forceSync && transcriptionApiUrl) {
    try {
      await syncTranscriptionStatus(recordingId, transcriptionApiUrl);
    } catch (error) {
      syncError = error instanceof Error ? error : new Error(String(error));
      console.warn('Failed to sync transcription status, falling back to DB:', syncError);
    }
  }

  const { data, error } = await supabase
    .from('recordings')
    .select('transcription_status, transcription_text, transcription_error, transcription_encrypted')
    .eq('id', recordingId)
    .is('deleted_at', null) // Only get non-deleted recordings
    .single();

  if (error) {
    console.error('Error getting recording status:', error);
    throw new Error(`Failed to get recording status: ${error.message}`);
  }

  if (!data) {
    throw new Error('Recording not found');
  }

  // Decrypt transcription_text if encrypted
  let transcriptionText = data.transcription_text;
  if (data.transcription_encrypted && transcriptionText) {
    try {
      transcriptionText = await decryptPHI(transcriptionText);
    } catch (decryptError) {
      console.error(`Failed to decrypt transcription for recording ${recordingId}:`, decryptError);
      transcriptionText = '[Ошибка расшифровки. Обновите страницу или войдите заново.]';
    }
  }

  const result: TranscriptionStatus = {
    status: data.transcription_status,
    transcriptionText,
    error: data.transcription_error || undefined,
  };

  // If sync failed and we have error info, attach it to the result
  // This allows the caller to check if sync failed and handle accordingly
  if (syncError) {
    // Store sync error in a way that can be checked by the caller
    (result as any).syncError = syncError;
  }

  return result;
}

/**
 * Sync transcription status from AssemblyAI API
 * Useful when webhook is not configured or transcription is stuck in processing
 */
export async function syncTranscriptionStatus(
  recordingId: string,
  transcriptionApiUrl: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('No active session found');
  }

  const response = await fetch(`${transcriptionApiUrl}/api/transcribe/${recordingId}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to sync transcription status: ${errorText}`);
  }
}

/**
 * Get recording by ID (only non-deleted recordings)
 */
export async function getRecording(recordingId: string): Promise<Recording> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', recordingId)
    .is('deleted_at', null) // Only get non-deleted recordings
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
 * Automatically decrypts transcription_text if encrypted
 */
export async function getSessionRecordings(sessionId: string): Promise<Recording[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('session_id', sessionId)
    .is('deleted_at', null) // Only get non-deleted recordings
    .order('created_at', { ascending: true }); // Старые записи сверху, новые снизу

  if (error) {
    console.error('Error getting session recordings:', error);
    throw new Error(`Failed to get session recordings: ${error.message}`);
  }

  if (!data) return [];

  // Decrypt transcription_text if encrypted
  const decryptedRecordings = await Promise.all(
    data.map(async (recording) => {
      if (recording.transcription_encrypted && recording.transcription_text) {
        try {
          const decryptedText = await decryptPHI(recording.transcription_text);
          return { ...recording, transcription_text: decryptedText };
        } catch (decryptError) {
          console.error(`Failed to decrypt transcription for recording ${recording.id}:`, decryptError);
          return {
            ...recording,
            transcription_text: '[Ошибка расшифровки. Обновите страницу или войдите заново.]',
          };
        }
      }
      return recording;
    })
  );

  return decryptedRecordings;
}

/**
 * Soft delete recording (mark as deleted, but keep in database)
 * Recording will be hidden from user but preserved for audit/history
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  // Soft delete: mark as deleted instead of physically removing
  const { error } = await supabase
    .from('recordings')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', recordingId);

  if (error) {
    console.error('Error soft deleting recording:', error);
    throw new Error(`Failed to delete recording: ${error.message}`);
  }

  // Note: Audio file is NOT deleted from storage to preserve data
  // File can be cleaned up later by an admin job if needed
}

