import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNavigationBlocker } from "@/hooks/useNavigationBlocker";
import { RecordingCard } from "@/components/scribe/RecordingCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { createSession } from "@/lib/supabase-sessions";
import {
  createRecording,
  uploadAudioFile,
  startTranscription,
  updateRecording,
} from "@/lib/supabase-recordings";
import { useToast } from "@/hooks/use-toast";
import { useTranscriptionRecovery } from "@/hooks/useTranscriptionRecovery";
import {
  saveRecordingLocally,
  markRecordingUploaded,
  markRecordingUploadFailed,
  getUnuploadedRecordings,
  getLocalRecording,
} from "@/lib/local-recording-storage";
import { logLocalStorageOperation } from "@/lib/local-recording-audit";
import { RecoveryDialog } from "@/components/scribe/RecoveryDialog";

const ScribePage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');

  // Состояние для не загруженных записей
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [unuploadedRecordings, setUnuploadedRecordings] = useState<Array<{
    id: string;
    fileName: string;
    duration: number;
    createdAt: number;
    uploadError?: string;
  }>>([]);

  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

  // Используем хук для recovery и отслеживания транскрипций
  // Без sessionId - отслеживает все транскрипции пользователя
  const {
    processingTranscriptions,
    isAnyProcessing,
    addTranscription,
  } = useTranscriptionRecovery({
    onComplete: async (recordingId, sessionId) => {
      console.log(`[ScribePage] Transcription completed: ${recordingId} in session ${sessionId}`);
      // Navigate to sessions page with sessionId parameter to open the session tab
      // The session should appear in the list after cache invalidation
      navigate(`/sessions?sessionId=${sessionId}`);
    },
  });

  // Состояние для отслеживания записи (для блокировки навигации)
  const [isRecording, setIsRecording] = useState(false);

  // Блокировка навигации во время записи
  const blocker = useNavigationBlocker(
    (currentPath, nextPath) =>
      isRecording && currentPath !== nextPath
  );

  // Callback для отслеживания состояния записи
  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
  }, []);

  // Проверка не загруженных записей при загрузке страницы
  useEffect(() => {
    const checkUnuploadedRecordings = async () => {
      try {
        const unuploaded = await getUnuploadedRecordings();
        if (unuploaded.length > 0) {
          setUnuploadedRecordings(unuploaded);
          setShowRecoveryDialog(true);
        }
      } catch (error) {
        console.error('Error checking unuploaded recordings:', error);
      }
    };

    if (user && profile) {
      checkUnuploadedRecordings();
    }
  }, [user, profile]);

  // Автоматическая повторная загрузка при восстановлении соединения
  useEffect(() => {
    const handleOnline = async () => {
      if (!user || !profile || !profile.clinic_id) return;

      try {
        const unuploaded = await getUnuploadedRecordings();
        if (unuploaded.length === 0) return;

        console.log('[ScribePage] Connection restored, attempting to upload', unuploaded.length, 'recordings');

        for (const recordingMeta of unuploaded) {
          try {
            const recording = await getLocalRecording(recordingMeta.id);
            if (!recording || recording.uploaded) continue;

            // Try to upload
            await retryUploadRecording(recordingMeta.id, recording);
          } catch (error) {
            console.error(`[ScribePage] Failed to retry upload for ${recordingMeta.id}:`, error);
          }
        }

        // Refresh unuploaded list
        const updated = await getUnuploadedRecordings();
        setUnuploadedRecordings(updated);
      } catch (error) {
        console.error('[ScribePage] Error in automatic retry:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [user, profile]);

  // Функция для повторной загрузки записи
  const retryUploadRecording = async (localId: string, recording: {
    blob: Blob;
    fileName: string;
    duration: number;
    mimeType: string;
    recordingId?: string;
    sessionId?: string;
  }) => {
    if (!user || !profile || !profile.clinic_id) return;

    try {
      // If we have existing recordingId, check if it already exists
      if (recording.recordingId) {
        // Recording already exists in DB, just mark as uploaded
        await markRecordingUploaded(localId, recording.recordingId, recording.sessionId || '');
        await logLocalStorageOperation('local_storage_upload_success', recording.recordingId, {
          fileName: recording.fileName,
          duration: recording.duration,
        });
        return;
      }

      // Create new session
      const session = await createSession({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: null,
        title: `Сессия ${new Date(recording.duration * 1000).toLocaleString('ru-RU')}`,
      });

      // Create recording record
      const newRecording = await createRecording({
        sessionId: session.id,
        userId: user.id,
        fileName: recording.fileName,
      });

      // Upload audio file
      await uploadAudioFile({
        recordingId: newRecording.id,
        audioBlob: recording.blob,
        fileName: newRecording.file_name || recording.fileName,
        mimeType: recording.mimeType,
      });

      // Update recording with duration
      await updateRecording(newRecording.id, {
        duration_seconds: recording.duration,
      });

      // Mark as uploaded
      await markRecordingUploaded(localId, newRecording.id, session.id);
      await logLocalStorageOperation('local_storage_upload_success', newRecording.id, {
        fileName: recording.fileName,
        duration: recording.duration,
      });

      // Start transcription
      try {
        await startTranscription(newRecording.id, transcriptionApiUrl);
        // Используем хук для отслеживания
        addTranscription(newRecording.id, session.id);
      } catch (transcriptionError) {
        console.warn('Transcription not started for retried recording:', transcriptionError);
      }

      toast({
        title: "Запись восстановлена",
        description: `Запись "${recording.fileName}" успешно загружена`,
      });
    } catch (error) {
      console.error('[ScribePage] Retry upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      await markRecordingUploadFailed(localId, errorMessage);
      await logLocalStorageOperation('local_storage_upload_failed', null, {
        fileName: recording.fileName,
        error: errorMessage,
      });
      throw error;
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob, duration: number) => {
    if (!user || !profile || !profile.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация и привязка к клинике",
        variant: "destructive",
      });
      throw new Error("Unauthorized");
    }

    setIsProcessing(true);
    setTranscriptionStatus('pending');

    let localRecordingId: string | null = null;
    const fileName = `recording-${Date.now()}.webm`;

    try {
      // 1. СНАЧАЛА сохраняем локально (независимо от интернета)
      const mimeType = audioBlob.type || 'audio/webm';

      try {
        localRecordingId = await saveRecordingLocally(
          audioBlob,
          fileName,
          duration,
          mimeType
        );
        console.log('[ScribePage] Recording saved locally:', localRecordingId);
        await logLocalStorageOperation('local_storage_save', null, {
          fileName,
          duration,
        });
      } catch (localError) {
        console.warn('[ScribePage] Failed to save locally (non-critical):', localError);
        // Продолжаем даже если локальное сохранение не удалось
      }

      // 2. Теперь пытаемся загрузить в Supabase
      const session = await createSession({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: null, // Will be linked later on Sessions page
        title: `Сессия ${new Date().toLocaleString('ru-RU')}`,
      });

      const recording = await createRecording({
        sessionId: session.id,
        userId: user.id,
        fileName,
      });

      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName: recording.file_name || fileName,
        mimeType: audioBlob.type || 'audio/webm',
      });

      await updateRecording(recording.id, {
        duration_seconds: duration,
      });

      // 3. Если загрузка успешна, помечаем локальную запись как загруженную
      if (localRecordingId) {
        try {
          await markRecordingUploaded(localRecordingId, recording.id, session.id);
          await logLocalStorageOperation('local_storage_upload_success', recording.id, {
            fileName,
            duration,
            sessionId: session.id,
          });
        } catch (markError) {
          console.warn('[ScribePage] Failed to mark as uploaded:', markError);
        }
      }

      toast({
        title: "Успешно",
        description: "Сессия сохранена. Транскрипция запущена в фоне.",
      });

      // Start transcription
      try {
        await startTranscription(recording.id, transcriptionApiUrl);

        // Используем хук для отслеживания транскрипции
        addTranscription(recording.id, session.id);

        setIsProcessing(false);
        setTranscriptionStatus('pending');

      } catch (transcriptionError) {
        console.error('Error starting transcription:', transcriptionError);
        setTranscriptionStatus('failed');
        setIsProcessing(false);
        toast({
          title: "Предупреждение",
          description: "Сессия сохранена, но транскрипция не запущена. Вы можете запустить её позже в разделе 'Сессии'.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Error saving recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

      // 4. Если загрузка не удалась, помечаем локальную запись как не загруженную
      if (localRecordingId) {
        try {
          await markRecordingUploadFailed(localRecordingId, errorMessage);
          await logLocalStorageOperation('local_storage_upload_failed', null, {
            fileName,
            error: errorMessage,
          });
          console.log('[ScribePage] Recording saved locally but upload failed:', localRecordingId);

          // Refresh unuploaded list
          const unuploaded = await getUnuploadedRecordings();
          setUnuploadedRecordings(unuploaded);
          if (unuploaded.length > 0) {
            setShowRecoveryDialog(true);
          }
        } catch (markError) {
          console.warn('[ScribePage] Failed to mark upload error:', markError);
        }
      }

      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Failed to create recording')) {
        userFriendlyMessage = 'Не удалось создать сессию в базе данных. Запись сохранена локально и будет загружена автоматически при восстановлении соединения.';
      } else if (errorMessage.includes('Failed to upload audio file')) {
        userFriendlyMessage = 'Не удалось загрузить аудио файл. Запись сохранена локально и будет загружена автоматически при восстановлении соединения.';
      } else if (errorMessage.includes('row-level security')) {
        userFriendlyMessage = 'Ошибка прав доступа. Запись сохранена локально.';
      } else {
        userFriendlyMessage = `Ошибка: ${errorMessage}. Запись сохранена локально.`;
      }

      toast({
        title: "Ошибка загрузки",
        description: userFriendlyMessage,
        variant: "destructive",
      });

      setIsProcessing(false);
      setTranscriptionStatus('pending');
      throw error;
    }
  };

  const handleGenerateNote = () => {
    // Navigate to sessions page where user can create a note
    // Use blocker.navigate to respect navigation blocking
    blocker.navigate('/sessions');
  };

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-6 sm:py-12 overflow-auto">
        {/* Hero section */}
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2 sm:mb-3">
            Анализируйте свои сессии с помощью ИИ
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl px-2">
            Преобразуйте ваши записи и заметки в глубокие инсайты и видимый прогресс
          </p>
        </div>

        {/* Индикаторы активных транскрипций */}
        {isAnyProcessing && (
          <div className="mb-4 w-full max-w-lg">
            <div className="bg-card rounded-lg border border-border p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  Транскрипция в процессе ({processingTranscriptions.size})
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => blocker.navigate('/sessions')}
                  className="h-7 text-xs"
                >
                  Перейти к сессиям
                </Button>
              </div>
              <div className="space-y-1.5">
                {Array.from(processingTranscriptions.values()).map(({ recordingId, status, fileName }) => (
                  <div key={recordingId} className="flex items-center gap-2 text-xs">
                    {status === 'processing' ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        <span className="text-muted-foreground">
                          {fileName ? `Обработка: ${fileName}` : 'Обработка записи...'}
                        </span>
                      </>
                    ) : status === 'failed' ? (
                      <>
                        <div className="w-3 h-3 rounded-full bg-destructive" />
                        <span className="text-destructive">
                          {fileName ? `Ошибка: ${fileName}` : 'Ошибка транскрипции'}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-3 h-3 rounded-full bg-success" />
                        <span className="text-success">
                          {fileName ? `Завершено: ${fileName}` : 'Завершено'}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recording card */}
        <RecordingCard
          onRecordingComplete={handleRecordingComplete}
          onGenerateNote={handleGenerateNote}
          isProcessing={isProcessing}
          transcriptionStatus={transcriptionStatus}
          onRecordingStateChange={handleRecordingStateChange}
        />
      </div>

      {/* Recovery Dialog */}
      <RecoveryDialog
        open={showRecoveryDialog}
        onOpenChange={setShowRecoveryDialog}
        recordings={unuploadedRecordings}
        onRetryUpload={async (localId: string) => {
          try {
            const recording = await getLocalRecording(localId);
            if (!recording) {
              toast({
                title: "Ошибка",
                description: "Запись не найдена",
                variant: "destructive",
              });
              return;
            }
            await retryUploadRecording(localId, recording);
            // Refresh list
            const updated = await getUnuploadedRecordings();
            setUnuploadedRecordings(updated);
            if (updated.length === 0) {
              setShowRecoveryDialog(false);
            }
          } catch (error) {
            console.error('Error retrying upload:', error);
            toast({
              title: "Ошибка",
              description: "Не удалось загрузить запись",
              variant: "destructive",
            });
          }
        }}
        onRefresh={async () => {
          const updated = await getUnuploadedRecordings();
          setUnuploadedRecordings(updated);
          if (updated.length === 0) {
            setShowRecoveryDialog(false);
          }
        }}
      />

      {/* Navigation Blocker Dialog */}
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Запись в процессе</AlertDialogTitle>
            <AlertDialogDescription>
              Идёт запись аудио. Если вы покинете страницу, запись будет потеряна.
              Вы уверены, что хотите уйти?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Остаться
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blocker.proceed?.()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Покинуть страницу
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ScribePage;
