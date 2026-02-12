import { useState, useEffect, useCallback, useRef } from "react";
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
import { useBackgroundUpload } from "@/contexts/BackgroundUploadContext";
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
  deleteLocalRecording,
} from "@/lib/local-recording-storage";
import { logLocalStorageOperation } from "@/lib/local-recording-audit";
import { RecoveryDialog } from "@/components/scribe/RecoveryDialog";

// Утилита для retry транскрипции с экспоненциальной задержкой
const MAX_TRANSCRIPTION_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 45000]; // 5с, 15с, 45с

async function startTranscriptionWithRetry(
  recordingId: string,
  apiUrl: string,
  onAttempt?: (attempt: number, maxAttempts: number) => void
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_TRANSCRIPTION_RETRIES; attempt++) {
    try {
      onAttempt?.(attempt + 1, MAX_TRANSCRIPTION_RETRIES);
      await startTranscription(recordingId, apiUrl);
      return true;
    } catch (error) {
      console.warn(`[Transcription] Attempt ${attempt + 1}/${MAX_TRANSCRIPTION_RETRIES} failed:`, error);

      if (attempt < MAX_TRANSCRIPTION_RETRIES - 1) {
        // Ждём перед следующей попыткой
        const delay = RETRY_DELAYS[attempt];
        console.log(`[Transcription] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

const ScribePage = () => {
  const { user, profile, updateActivity } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Note: isProcessing and transcriptionStatus removed - RecordingCard now uses BackgroundUploadContext

  // Состояние для не загруженных записей
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [retryingUploadIds, setRetryingUploadIds] = useState<Set<string>>(new Set()); // Защита от двойного retry
  const [unuploadedRecordings, setUnuploadedRecordings] = useState<Array<{
    id: string;
    fileName: string;
    duration: number;
    createdAt: number;
    uploadError?: string;
  }>>([]);

  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

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

  // Connect BackgroundUploadContext to useTranscriptionRecovery
  // When a transcription starts via BackgroundUpload, add it to tracking
  const { setOnTranscriptionStarted } = useBackgroundUpload();
  const addTranscriptionRef = useRef(addTranscription);
  addTranscriptionRef.current = addTranscription;

  useEffect(() => {
    setOnTranscriptionStarted((recordingId, sessionId) => {
      console.log('[ScribePage] Background transcription started, adding to tracking:', recordingId, sessionId);
      addTranscriptionRef.current(recordingId, sessionId);
    });

    return () => {
      setOnTranscriptionStarted(null);
    };
  }, [setOnTranscriptionStarted]);

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

  // Обновление activity во время записи для предотвращения session timeout
  useEffect(() => {
    if (!isRecording) return;

    // Обновляем activity каждые 30 секунд во время записи
    const intervalId = setInterval(() => {
      updateActivity();
    }, 30000);

    // Также обновляем сразу при начале записи
    updateActivity();

    return () => {
      clearInterval(intervalId);
    };
  }, [isRecording, updateActivity]);

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

        const processedIds = new Set<string>();
        for (const recordingMeta of unuploaded) {
          // Skip checkpoints and hidden recordings — they are intermediate data
          if (recordingMeta.fileName.includes('checkpoint') || recordingMeta.fileName.includes('hidden')) {
            continue;
          }
          if (processedIds.has(recordingMeta.id)) continue;

          try {
            const recording = await getLocalRecording(recordingMeta.id);
            if (!recording || recording.uploaded) continue;

            // Try to upload
            await retryUploadRecording(recordingMeta.id, recording);
            processedIds.add(recordingMeta.id);
          } catch (error) {
            console.error(`[ScribePage] Failed to retry upload for ${recordingMeta.id}:`, error);
          }
        }

        // Clean up checkpoint/hidden entries after successful uploads
        if (processedIds.size > 0) {
          for (const recordingMeta of unuploaded) {
            if (recordingMeta.fileName.includes('checkpoint') || recordingMeta.fileName.includes('hidden')) {
              try {
                await deleteLocalRecording(recordingMeta.id);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
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

    // Защита от двойного вызова для одной записи
    if (retryingUploadIds.has(localId)) {
      console.log(`[ScribePage] Upload already in progress for ${localId}, skipping`);
      return;
    }
    setRetryingUploadIds(prev => new Set(prev).add(localId));

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
        title: `Сессия ${new Date().toLocaleString('ru-RU')}`, // Исправлено: используем текущую дату
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

      // Start transcription with retry
      const transcriptionStarted = await startTranscriptionWithRetry(
        newRecording.id,
        transcriptionApiUrl,
        (attempt, max) => console.log(`[ScribePage] Transcription attempt ${attempt}/${max} for recovered recording`)
      );

      if (transcriptionStarted) {
        // Используем хук для отслеживания
        addTranscription(newRecording.id, session.id);
        toast({
          title: "Запись восстановлена",
          description: `Запись "${recording.fileName}" успешно загружена и транскрипция запущена`,
        });
      } else {
        console.warn('[ScribePage] Transcription not started after all retries for recovered recording');
        toast({
          title: "Запись восстановлена",
          description: `Запись "${recording.fileName}" загружена, но транскрипция не запущена. Попробуйте позже.`,
          variant: "default",
        });
      }
    } catch (error) {
      console.error('[ScribePage] Retry upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      await markRecordingUploadFailed(localId, errorMessage);
      await logLocalStorageOperation('local_storage_upload_failed', null, {
        fileName: recording.fileName,
        error: errorMessage,
      });
      throw error;
    } finally {
      // Убираем из списка загружаемых
      setRetryingUploadIds(prev => {
        const next = new Set(prev);
        next.delete(localId);
        return next;
      });
    }
  };

  // Note: handleRecordingComplete removed - RecordingCard now uses BackgroundUploadContext
  // The upload logic is handled by BackgroundUploadProvider which persists across navigation

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

        {/* Recording card - uses background upload, navigation happens immediately */}
        <RecordingCard
          onGenerateNote={handleGenerateNote}
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
