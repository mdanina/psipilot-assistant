/**
 * BackgroundUploadContext - handles recording uploads in the background
 *
 * This context persists across navigation, so uploads continue even when
 * the user navigates to a different page.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { createSession } from '@/lib/supabase-sessions';
import {
  createRecording,
  uploadAudioFile,
  updateRecording,
  startTranscription,
  validateFileSize,
  MAX_FILE_SIZE_MB,
} from '@/lib/supabase-recordings';
import {
  saveRecordingLocally,
  markRecordingUploaded,
  markRecordingUploadFailed,
  deleteLocalRecording,
} from '@/lib/local-recording-storage';

const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

export interface PendingUpload {
  id: string;
  blob: Blob;
  duration: number;
  sessionId?: string; // If already has a session (SessionsPage)
  patientId?: string; // For creating new session (ScribePage)
  clinicId: string;
  userId: string;
  status: 'queued' | 'uploading' | 'transcribing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  localRecordingId?: string;
  createdAt: number;
}

interface BackgroundUploadContextType {
  /** Queue a recording for background upload */
  queueUpload: (params: {
    blob: Blob;
    duration: number;
    sessionId?: string;
    patientId?: string;
  }) => Promise<string>;
  /** Get all pending uploads */
  pendingUploads: Map<string, PendingUpload>;
  /** Check if any uploads are in progress */
  hasActiveUploads: boolean;
  /** Cancel a pending upload */
  cancelUpload: (uploadId: string) => void;
}

const BackgroundUploadContext = createContext<BackgroundUploadContextType | null>(null);

export function BackgroundUploadProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pendingUploads, setPendingUploads] = useState<Map<string, PendingUpload>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());

  const updateUpload = useCallback((id: string, updates: Partial<PendingUpload>) => {
    setPendingUploads(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, ...updates });
      }
      return next;
    });
  }, []);

  const removeUpload = useCallback((id: string) => {
    setPendingUploads(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    processingRef.current.delete(id);
  }, []);

  const processUpload = useCallback(async (upload: PendingUpload) => {
    if (processingRef.current.has(upload.id)) {
      return; // Already processing
    }
    processingRef.current.add(upload.id);

    const { id, blob, duration, sessionId, patientId, clinicId, userId } = upload;
    let localRecordingId = upload.localRecordingId;
    const fileName = `recording-${Date.now()}.webm`;
    const mimeType = blob.type || 'audio/webm';

    try {
      // 1. Save locally first (if not already saved)
      if (!localRecordingId) {
        try {
          localRecordingId = await saveRecordingLocally(
            blob,
            fileName,
            duration,
            mimeType,
            sessionId
          );
          updateUpload(id, { localRecordingId, status: 'uploading' });
          console.log('[BackgroundUpload] Saved locally:', localRecordingId);
        } catch (localError) {
          console.warn('[BackgroundUpload] Local save failed (non-critical):', localError);
        }
      }

      updateUpload(id, { status: 'uploading', progress: 10 });

      // 2. Create session if needed (ScribePage flow)
      let targetSessionId = sessionId;
      if (!targetSessionId && patientId) {
        const session = await createSession({
          userId,
          clinicId,
          patientId,
          title: `Сессия ${new Date().toLocaleString('ru-RU')}`,
        });
        targetSessionId = session.id;
        updateUpload(id, { sessionId: targetSessionId, progress: 20 });
      } else if (!targetSessionId) {
        // ScribePage without patient - create session without patient
        const session = await createSession({
          userId,
          clinicId,
          patientId: null,
          title: `Сессия ${new Date().toLocaleString('ru-RU')}`,
        });
        targetSessionId = session.id;
        updateUpload(id, { sessionId: targetSessionId, progress: 20 });
      }

      // 3. Create recording record
      const recording = await createRecording({
        sessionId: targetSessionId!,
        userId,
        fileName,
      });
      updateUpload(id, { progress: 40 });

      // 4. Upload audio file
      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob: blob,
        fileName: recording.file_name || fileName,
        mimeType,
      });
      updateUpload(id, { progress: 70 });

      // 5. Update recording with duration
      await updateRecording(recording.id, {
        duration_seconds: duration,
      });

      // 6. Mark local recording as uploaded
      if (localRecordingId) {
        try {
          await markRecordingUploaded(localRecordingId, recording.id, targetSessionId!);
        } catch (markError) {
          console.warn('[BackgroundUpload] Failed to mark as uploaded:', markError);
        }
      }

      updateUpload(id, { status: 'transcribing', progress: 80 });

      // 7. Start transcription
      try {
        await startTranscription(recording.id, transcriptionApiUrl);
        updateUpload(id, { progress: 100, status: 'completed' });

        toast({
          title: "Загрузка завершена",
          description: "Запись загружена, транскрипция запущена",
        });
      } catch (transcriptionError) {
        console.error('[BackgroundUpload] Transcription start failed:', transcriptionError);
        updateUpload(id, { progress: 100, status: 'completed' });

        toast({
          title: "Запись загружена",
          description: "Транскрипцию можно запустить позже в разделе Сессии",
          variant: "default",
        });
      }

      // 8. Invalidate caches
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
      if (patientId) {
        await queryClient.refetchQueries({
          queryKey: ['patients', patientId, 'activities']
        });
      }

      // Remove from queue after short delay (to show completion)
      setTimeout(() => {
        removeUpload(id);
      }, 2000);

    } catch (error) {
      console.error('[BackgroundUpload] Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

      // Mark local recording as failed
      if (localRecordingId) {
        try {
          await markRecordingUploadFailed(localRecordingId, errorMessage);
        } catch (markError) {
          console.warn('[BackgroundUpload] Failed to mark error:', markError);
        }
      }

      updateUpload(id, {
        status: 'failed',
        error: errorMessage
      });

      // User-friendly error messages
      let userFriendlyDescription = "Запись сохранена локально и будет загружена позже";
      if (errorMessage.includes('exceeded') && errorMessage.includes('maximum allowed size')) {
        userFriendlyDescription = `Файл слишком большой. Лимит: ${MAX_FILE_SIZE_MB} МБ`;
      } else if (errorMessage.includes('Файл слишком большой')) {
        userFriendlyDescription = errorMessage;
      }

      toast({
        title: "Ошибка загрузки",
        description: userFriendlyDescription,
        variant: "destructive",
      });

      processingRef.current.delete(id);
    }
  }, [toast, queryClient, updateUpload, removeUpload]);

  const queueUpload = useCallback(async (params: {
    blob: Blob;
    duration: number;
    sessionId?: string;
    patientId?: string;
  }): Promise<string> => {
    if (!user || !profile?.clinic_id) {
      throw new Error('Необходима авторизация');
    }

    // Validate file size BEFORE queuing
    try {
      validateFileSize(params.blob);
    } catch (sizeError) {
      const fileSizeMB = Math.round(params.blob.size / 1024 / 1024 * 10) / 10;
      toast({
        title: "Файл слишком большой",
        description: `Размер записи ${fileSizeMB} МБ превышает лимит ${MAX_FILE_SIZE_MB} МБ. Попробуйте записать более короткую сессию.`,
        variant: "destructive",
      });
      throw new Error(`Файл слишком большой: ${fileSizeMB} МБ`);
    }

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const upload: PendingUpload = {
      id: uploadId,
      blob: params.blob,
      duration: params.duration,
      sessionId: params.sessionId,
      patientId: params.patientId,
      clinicId: profile.clinic_id,
      userId: user.id,
      status: 'queued',
      createdAt: Date.now(),
    };

    setPendingUploads(prev => {
      const next = new Map(prev);
      next.set(uploadId, upload);
      return next;
    });

    toast({
      title: "Загрузка в фоне",
      description: "Вы можете продолжить работу. Запись загружается в фоновом режиме.",
    });

    // Start processing immediately (but async)
    setTimeout(() => processUpload(upload), 0);

    return uploadId;
  }, [user, profile, toast, processUpload]);

  const cancelUpload = useCallback((uploadId: string) => {
    const upload = pendingUploads.get(uploadId);
    if (upload && upload.status === 'queued') {
      // Can only cancel if not started yet
      if (upload.localRecordingId) {
        deleteLocalRecording(upload.localRecordingId).catch(console.error);
      }
      removeUpload(uploadId);
      toast({
        title: "Загрузка отменена",
        description: "Запись удалена",
      });
    }
  }, [pendingUploads, removeUpload, toast]);

  const hasActiveUploads = Array.from(pendingUploads.values()).some(
    u => u.status === 'queued' || u.status === 'uploading' || u.status === 'transcribing'
  );

  return (
    <BackgroundUploadContext.Provider value={{
      queueUpload,
      pendingUploads,
      hasActiveUploads,
      cancelUpload,
    }}>
      {children}
    </BackgroundUploadContext.Provider>
  );
}

export function useBackgroundUpload() {
  const context = useContext(BackgroundUploadContext);
  if (!context) {
    throw new Error('useBackgroundUpload must be used within BackgroundUploadProvider');
  }
  return context;
}
