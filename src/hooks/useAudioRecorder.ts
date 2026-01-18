import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  isStopped: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  error: string | null;
  wasPartialSave: boolean;
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  reset: () => void;
  getCurrentChunks: () => Blob[];
  getCurrentMimeType: () => string;
}

/**
 * Рассчитывает адаптивный timeout для остановки записи
 * на основе длительности записи и характеристик устройства
 */
function calculateStopTimeout(recordingTimeSeconds: number): number {
  const baseTimeout = 30000; // 30 сек базовый (консервативно)

  // Определяем "медленный" браузер/устройство
  const isSafariIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                      !(window as any).MSStream;
  const isOldDevice = navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency <= 2
    : false;

  let multiplier = 1;
  if (isSafariIOS) multiplier *= 1.5;
  if (isOldDevice) multiplier *= 1.5;

  // +10 сек за каждый час записи
  const extraPerHour = 10000 * multiplier;
  const hours = recordingTimeSeconds / 3600;

  const timeout = baseTimeout * multiplier + hours * extraPerHour;

  // Минимум 30 сек, максимум 2 минуты
  return Math.max(30000, Math.min(timeout, 120000));
}

/**
 * Hook for recording audio using MediaRecorder API
 * Supports pause/resume functionality and error handling
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasPartialSave, setWasPartialSave] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopResolvedRef = useRef<boolean>(false);
  const finalRecordingTimeRef = useRef<number>(0);
  const currentMimeTypeRef = useRef<string>('audio/webm');
  const isStartingRef = useRef<boolean>(false); // Защита от двойного вызова startRecording

  const reset = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setIsStopped(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setError(null);
    setWasPartialSave(false);
    chunksRef.current = [];
    pausedTimeRef.current = 0;
    finalRecordingTimeRef.current = 0;
    stopResolveRef.current = null;
    isStartingRef.current = false; // Разрешаем повторный вызов startRecording после reset
    // НЕ сбрасываем stopResolvedRef здесь!
    // Он сбрасывается только в stopRecording() перед началом остановки.
    // Если сбросить здесь, то onstop может перезаписать состояние после cancel.

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now() - pausedTimeRef.current;
    
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRecordingTime(elapsed);
    }, 100);
  }, [stopTimer]);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    mediaRecorderRef.current = null;
    stopTimer();
  }, [stopTimer]);

  const startRecording = useCallback(async () => {
    // Защита от двойного вызова во время ожидания getUserMedia
    if (isStartingRef.current) {
      console.log('[Recording] startRecording already in progress, ignoring');
      return;
    }
    isStartingRef.current = true;

    try {
      setError(null);

      // Очищаем любой pending timeout от предыдущего stopRecording
      // чтобы избежать конфликта с новой записью
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      // Resolve pending stopRecording promise с null, если есть
      // (если startRecording вызван во время stopRecording)
      if (stopResolveRef.current && !stopResolvedRef.current) {
        stopResolveRef.current(null);
        stopResolveRef.current = null;
      }

      stopResolvedRef.current = true; // Защита на случай позднего вызова onstop

      // Очищаем предыдущую запись если она существует (защита от двойного вызова)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Ignore errors
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Determine the best supported MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        // Fallback to default
        selectedMimeType = '';
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType || undefined,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      currentMimeTypeRef.current = selectedMimeType || 'audio/webm';

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        // Проверяем, не был ли уже выполнен resolve (например, по timeout)
        // Если да - не перезаписываем state, чтобы избежать рассинхронизации
        if (stopResolvedRef.current) {
          console.log('[Recording] onstop called after timeout resolve, skipping state update');
          // Только очистка, без изменения state
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          return;
        }

        let blob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          blob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          setAudioBlob(blob);
        }
        setIsStopped(true);
        cleanup();

        // Resolve the promise if stopRecording was called
        if (stopResolveRef.current) {
          stopResolveRef.current(blob);
          stopResolveRef.current = null;
        }
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        // Защита от позднего вызова onstop после ошибки
        stopResolvedRef.current = true;
        setError('Ошибка записи аудио');
        console.error('MediaRecorder error:', event);
        cleanup();
        reset();
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
      setIsStopped(false); // Сбрасываем флаг от предыдущей записи
      pausedTimeRef.current = 0;
      startTimer();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      
      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        setError('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ в настройках браузера.');
      } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('DevicesNotFoundError')) {
        setError('Микрофон не найден. Убедитесь, что микрофон подключен.');
      } else {
        setError(`Ошибка доступа к микрофону: ${errorMessage}`);
      }
      
      console.error('Error starting recording:', err);
      cleanup();
      reset();
    } finally {
      isStartingRef.current = false;
    }
  }, [startTimer, cleanup, reset]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      stopTimer();
      pausedTimeRef.current = recordingTime * 1000; // Save current time in milliseconds
    }
  }, [recordingTime, stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer();
    }
  }, [startTimer]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Save current recording time before stopping
      finalRecordingTimeRef.current = recordingTime;
      stopResolvedRef.current = false;
      setWasPartialSave(false);

      // Очищаем предыдущий timeout если есть (защита от двойного вызова)
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const timeoutMs = calculateStopTimeout(recordingTime);

        // Функция для безопасного resolve (только один раз)
        const safeResolve = (blob: Blob | null, isPartial: boolean) => {
          if (stopResolvedRef.current) return;
          stopResolvedRef.current = true;

          // Очистить timeout если ещё не сработал
          if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
          }

          if (isPartial) {
            setWasPartialSave(true);
            console.warn(
              '[Recording] Partial save due to timeout.',
              `Duration: ${recordingTime}s, Blob size: ${blob?.size || 0} bytes`
            );
          }

          resolve(blob);
        };

        // Timeout для защиты от зависания
        stopTimeoutRef.current = setTimeout(() => {
          console.error(
            `[Recording] Stop timeout after ${timeoutMs}ms.`,
            `Chunks available: ${chunksRef.current.length}`
          );

          // Собираем частичные данные из накопленных chunks
          let partialBlob: Blob | null = null;
          if (chunksRef.current.length > 0) {
            partialBlob = new Blob(chunksRef.current, {
              type: currentMimeTypeRef.current || 'audio/webm',
            });
            setAudioBlob(partialBlob);
          }

          setIsStopped(true);
          safeResolve(partialBlob, true);

          // Cleanup без повторного вызова stop() чтобы не вызвать ещё один onstop
          // Если onstop всё же вызовется позже, он проверит stopResolvedRef и пропустит обновление state
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          stopTimer();
        }, timeoutMs);

        // Обёртка для onstop handler
        stopResolveRef.current = (blob) => {
          safeResolve(blob, false);
        };

        mediaRecorderRef.current.stop();
      } else {
        resolve(null);
      }

      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
    });
  }, [stopTimer, recordingTime]);

  const cancelRecording = useCallback(() => {
    // Resolve pending stopRecording promise с null перед сбросом
    // (если cancelRecording вызван после stopRecording)
    if (stopResolveRef.current && !stopResolvedRef.current) {
      stopResolveRef.current(null);
    }

    // Сбрасываем stopResolveRef ПЕРЕД вызовом stop(),
    // чтобы onstop handler не вызвал resolve с данными при cancel
    stopResolveRef.current = null;
    stopResolvedRef.current = true; // Помечаем как resolved чтобы onstop пропустил обработку

    // Очищаем pending timeout
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    reset();
  }, [cleanup, reset]);

  const getCurrentChunks = useCallback((): Blob[] => {
    return [...chunksRef.current];
  }, []);

  const getCurrentMimeType = useCallback((): string => {
    return currentMimeTypeRef.current;
  }, []);

  // Cleanup on unmount - останавливаем запись и освобождаем ресурсы
  useEffect(() => {
    return () => {
      // Помечаем как resolved чтобы onstop не обновлял state после unmount
      stopResolvedRef.current = true;

      // Очищаем timeout
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      // Очищаем interval таймера
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Останавливаем MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Ignore errors when stopping on unmount
        }
      }

      // Освобождаем медиа-поток
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      mediaRecorderRef.current = null;
    };
  }, []);

  return {
    isRecording,
    isPaused,
    isStopped,
    recordingTime,
    audioBlob,
    error,
    wasPartialSave,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    reset,
    getCurrentChunks,
    getCurrentMimeType,
  };
}



