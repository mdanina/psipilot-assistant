import { useState, useEffect, useRef } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
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

    try {
      // Create session without patient (patient will be linked later)
      const session = await createSession({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: null, // Will be linked later on Sessions page
        title: `Сессия ${new Date().toLocaleString('ru-RU')}`,
      });

      currentSessionId = session.id;

      // Create recording record
      const recording = await createRecording({
        sessionId: session.id,
        userId: user.id,
        fileName: `recording-${Date.now()}.webm`,
      });

      // Determine MIME type from blob
      const mimeType = audioBlob.type || 'audio/webm';

      // Upload audio file
      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName: recording.file_name || `recording-${recording.id}.webm`,
        mimeType,
      });

      // Update recording with duration
      await updateRecording(recording.id, {
        duration_seconds: duration,
      });

      toast({
        title: "Успешно",
        description: "Сессия сохранена. Транскрипция запущена в фоне.",
      });

      // Start transcription
      try {
        await startTranscription(recording.id, transcriptionApiUrl);
        
        // Добавить в активные транскрипции для фонового отслеживания
        setActiveTranscriptions(prev => {
          const next = new Map(prev);
          next.set(recording.id, {
            recordingId: recording.id,
            sessionId: session.id,
            status: 'processing',
          });
          return next;
        });

        // Сбросить isProcessing - вернуть интерфейс записи пользователю
        setIsProcessing(false);
        setTranscriptionStatus('pending');
        
        // Polling теперь происходит автоматически в useEffect
        
      } catch (transcriptionError) {
        console.error('Error starting transcription:', transcriptionError);
        setTranscriptionStatus('failed');
        setIsProcessing(false); // Все равно сбросить, чтобы вернуть интерфейс
        toast({
          title: "Предупреждение",
          description: "Сессия сохранена, но транскрипция не запущена. Вы можете запустить её позже в разделе 'Сессии'.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Error saving recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

      // More detailed error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Failed to create recording')) {
        userFriendlyMessage = 'Не удалось создать сессию в базе данных. Проверьте подключение к Supabase.';
      } else if (errorMessage.includes('Failed to upload audio file')) {
        userFriendlyMessage = 'Не удалось загрузить аудио файл. Проверьте, что bucket "recordings" создан в Supabase Storage.';
      } else if (errorMessage.includes('row-level security')) {
        userFriendlyMessage = 'Ошибка прав доступа. Убедитесь, что вы авторизованы и имеете права на создание записей.';
      }

      toast({
        title: "Ошибка",
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
      <Header title="Запись аудио" icon={<FileText className="w-5 h-5" />} />
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
    </>
  );
};

export default ScribePage;
