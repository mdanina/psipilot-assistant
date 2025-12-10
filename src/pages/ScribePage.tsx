import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RecordingCard } from "@/components/scribe/RecordingCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { createSession } from "@/lib/supabase-sessions";
import {
  createRecording,
  uploadAudioFile,
  startTranscription,
  getRecordingStatus,
  updateRecording,
  syncTranscriptionStatus
} from "@/lib/supabase-recordings";
import { useToast } from "@/hooks/use-toast";
import {
  saveRecordingLocally,
  markRecordingUploaded,
  markRecordingUploadFailed,
  getUnuploadedRecordings,
  getLocalRecording,
} from "@/lib/local-recording-storage";
import { logLocalStorageOperation } from "@/lib/local-recording-audit";
import { RecoveryDialog } from "@/components/scribe/RecoveryDialog";

interface ActiveTranscription {
  recordingId: string;
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
}

const ScribePage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  
  // Состояние для активных транскрипций
  const [activeTranscriptions, setActiveTranscriptions] = useState<Map<string, ActiveTranscription>>(new Map());
  
  // Состояние для не загруженных записей
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [unuploadedRecordings, setUnuploadedRecordings] = useState<Array<{
    id: string;
    fileName: string;
    duration: number;
    createdAt: number;
    uploadError?: string;
  }>>([]);
  
  // Refs для хранения интервалов polling
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingAttemptsRef = useRef<Map<string, number>>(new Map());

  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

  // Фоновый polling для активных транскрипций
  useEffect(() => {
    const MAX_ATTEMPTS = 120; // 4 минуты

    const startPollingTranscription = (recordingId: string, sessionId: string) => {
      // Очистить существующий интервал, если есть
      const existingInterval = pollingIntervalsRef.current.get(recordingId);
      if (existingInterval) {
        clearTimeout(existingInterval);
      }

      // Инициализировать счетчик попыток, если еще нет
      if (!pollingAttemptsRef.current.has(recordingId)) {
        pollingAttemptsRef.current.set(recordingId, 0);
      }

      const checkStatus = async () => {
        try {
          const attempts = pollingAttemptsRef.current.get(recordingId) || 0;
          
          if (attempts >= MAX_ATTEMPTS) {
            console.warn(`Max polling attempts reached for recording ${recordingId}`);
            pollingIntervalsRef.current.delete(recordingId);
            pollingAttemptsRef.current.delete(recordingId);
            setActiveTranscriptions(prev => {
              const next = new Map(prev);
              next.delete(recordingId);
              return next;
            });
            return;
          }

          pollingAttemptsRef.current.set(recordingId, attempts + 1);

          // Sync from AssemblyAI if processing for more than 15 attempts (30 seconds)
          const shouldSync = attempts > 15;
          const status = await getRecordingStatus(recordingId, transcriptionApiUrl, shouldSync);

          if (status.status === 'completed') {
            toast({
              title: "Транскрипция завершена",
              description: "Транскрипция успешно завершена",
            });
            
            // Удалить из активных транскрипций
            setActiveTranscriptions(prev => {
              const next = new Map(prev);
              next.delete(recordingId);
              return next;
            });
            pollingIntervalsRef.current.delete(recordingId);
            pollingAttemptsRef.current.delete(recordingId);
          } else if (status.status === 'failed') {
            toast({
              title: "Ошибка транскрипции",
              description: status.error || "Не удалось выполнить транскрипцию",
              variant: "destructive",
            });
            
            setActiveTranscriptions(prev => {
              const next = new Map(prev);
              const transcription = next.get(recordingId);
              if (transcription) {
                next.set(recordingId, { ...transcription, status: 'failed' });
              }
              return next;
            });
            pollingIntervalsRef.current.delete(recordingId);
            pollingAttemptsRef.current.delete(recordingId);
          } else {
            // Обновить статус
            setActiveTranscriptions(prev => {
              const next = new Map(prev);
              next.set(recordingId, {
                recordingId,
                sessionId,
                status: status.status as 'processing' | 'completed' | 'failed',
              });
              return next;
            });

            // Если все еще processing, попробовать sync через некоторое время
            if (status.status === 'processing' && attempts > 30 && attempts % 10 === 0) {
              try {
                await syncTranscriptionStatus(recordingId, transcriptionApiUrl);
                const syncedStatus = await getRecordingStatus(recordingId);
                if (syncedStatus.status === 'completed' || syncedStatus.status === 'failed') {
                  if (syncedStatus.status === 'completed') {
                    toast({
                      title: "Транскрипция завершена",
                      description: "Транскрипция успешно завершена",
                    });
                  } else {
                    toast({
                      title: "Ошибка транскрипции",
                      description: syncedStatus.error || "Не удалось выполнить транскрипцию",
                      variant: "destructive",
                    });
                  }
                  setActiveTranscriptions(prev => {
                    const next = new Map(prev);
                    next.delete(recordingId);
                    return next;
                  });
                  pollingIntervalsRef.current.delete(recordingId);
                  pollingAttemptsRef.current.delete(recordingId);
                  return;
                }
              } catch (syncError) {
                console.warn('Sync failed, continuing polling:', syncError);
              }
            }

            // Продолжить polling
            const interval = setTimeout(checkStatus, 2000);
            pollingIntervalsRef.current.set(recordingId, interval);
          }
        } catch (error) {
          console.error('Error checking transcription status:', error);
          // Повторить через 5 секунд при ошибке
          const interval = setTimeout(checkStatus, 5000);
          pollingIntervalsRef.current.set(recordingId, interval);
        }
      };

      // Начать polling через 2 секунды
      const interval = setTimeout(checkStatus, 2000);
      pollingIntervalsRef.current.set(recordingId, interval);
    };

    // Запустить polling для всех активных транскрипций, которые еще не опрашиваются
    activeTranscriptions.forEach(({ recordingId, sessionId }) => {
      if (!pollingIntervalsRef.current.has(recordingId)) {
        startPollingTranscription(recordingId, sessionId);
      }
    });
  }, [activeTranscriptions, transcriptionApiUrl, toast]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      pollingIntervalsRef.current.forEach(interval => clearTimeout(interval));
      pollingIntervalsRef.current.clear();
      pollingAttemptsRef.current.clear();
    };
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
        setActiveTranscriptions(prev => {
          const next = new Map(prev);
          next.set(newRecording.id, {
            recordingId: newRecording.id,
            sessionId: session.id,
            status: 'processing',
          });
          return next;
        });
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

    let currentSessionId: string | null = null;
    let localRecordingId: string | null = null;

    try {
      // 1. СНАЧАЛА сохраняем локально (независимо от интернета)
      const fileName = `recording-${Date.now()}.webm`;
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

      currentSessionId = session.id;

      const recording = await createRecording({
        sessionId: session.id,
        userId: user.id,
        fileName,
      });

      const uploadResult = await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName: recording.file_name || fileName,
        mimeType,
      });

      await updateRecording(recording.id, {
        duration_seconds: duration,
      });

      // 3. Если загрузка успешна, помечаем локальную запись как загруженную
      // (sessionId уже будет сохранен в markRecordingUploaded)
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
        
        setActiveTranscriptions(prev => {
          const next = new Map(prev);
          next.set(recording.id, {
            recordingId: recording.id,
            sessionId: session.id,
            status: 'processing',
          });
          return next;
        });

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
    navigate('/sessions');
  };

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        {/* Hero section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-primary mb-3">
            Анализируйте свои сессии с помощью ИИ
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Преобразуйте ваши записи и заметки в глубокие инсайты и видимый прогресс
          </p>
        </div>

        {/* Индикаторы активных транскрипций */}
        {activeTranscriptions.size > 0 && (
          <div className="mb-4 w-full max-w-lg">
            <div className="bg-card rounded-lg border border-border p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  Транскрипция в процессе ({activeTranscriptions.size})
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/sessions')}
                  className="h-7 text-xs"
                >
                  Перейти к сессиям
                </Button>
              </div>
              <div className="space-y-1.5">
                {Array.from(activeTranscriptions.values()).map(({ recordingId, status }) => (
                  <div key={recordingId} className="flex items-center gap-2 text-xs">
                    {status === 'processing' ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        <span className="text-muted-foreground">Обработка записи...</span>
                      </>
                    ) : status === 'failed' ? (
                      <>
                        <div className="w-3 h-3 rounded-full bg-destructive" />
                        <span className="text-destructive">Ошибка транскрипции</span>
                      </>
                    ) : (
                      <>
                        <div className="w-3 h-3 rounded-full bg-success" />
                        <span className="text-success">Завершено</span>
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
    </>
  );
};

export default ScribePage;
