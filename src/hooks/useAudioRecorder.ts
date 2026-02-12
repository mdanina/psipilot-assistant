import { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================================
// Типы состояния рекордера (Discriminated Union)
// ============================================================================

/**
 * Все возможные статусы рекордера.
 * Использование единого статуса вместо множества boolean флагов
 * предотвращает невозможные комбинации состояний.
 */
export type RecorderStatus =
  | 'idle'      // Начальное состояние, готов к записи
  | 'starting'  // Запрашиваем доступ к микрофону
  | 'recording' // Активная запись
  | 'paused'    // Запись на паузе
  | 'stopping'  // Останавливаем запись, ждём финализации
  | 'stopped'   // Запись завершена, есть audioBlob
  | 'error';    // Произошла ошибка

export interface UseAudioRecorderReturn {
  /** Текущий статус рекордера */
  status: RecorderStatus;

  // Вычисляемые поля для обратной совместимости
  /** @deprecated Используйте status === 'recording' || status === 'paused' */
  isRecording: boolean;
  /** @deprecated Используйте status === 'paused' */
  isPaused: boolean;
  /** @deprecated Используйте status === 'stopped' */
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
                      !('MSStream' in window);
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
  // Единый статус вместо множества boolean флагов
  const [status, setStatus] = useState<RecorderStatus>('idle');
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
  const currentMimeTypeRef = useRef<string>('audio/webm');
  const recordingTimeRef = useRef<number>(0); // Ref для использования в callbacks без пересоздания
  const isStartingRef = useRef<boolean>(false); // Ref для защиты от двойного startRecording (closure-safe)
  const isStoppingRef = useRef<boolean>(false); // Ref для защиты от двойного stopRecording (closure-safe)

  // Вычисляемые значения для обратной совместимости
  const isRecording = status === 'recording' || status === 'paused';
  const isPaused = status === 'paused';
  const isStopped = status === 'stopped';

  const reset = useCallback(() => {
    setStatus('idle');
    setRecordingTime(0);
    setAudioBlob(null);
    setError(null);
    setWasPartialSave(false);
    chunksRef.current = [];
    pausedTimeRef.current = 0;
    recordingTimeRef.current = 0;
    stopResolveRef.current = null;
    isStartingRef.current = false; // Разрешаем новый startRecording после reset
    isStoppingRef.current = false; // Разрешаем новый stopRecording после reset
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
      recordingTimeRef.current = elapsed; // Обновляем ref для callbacks
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
    // Защита от двойного вызова через ref (closure-safe, не зависит от батчинга React)
    if (isStartingRef.current) {
      console.log('[Recording] startRecording already in progress, ignoring');
      return;
    }
    isStartingRef.current = true;

    setStatus('starting');

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
        setStatus('stopped');
        cleanup();

        // Resolve the promise if stopRecording was called
        if (stopResolveRef.current) {
          stopResolveRef.current(blob);
          stopResolveRef.current = null;
        }
      };

      // Handle errors - try to save partial recording instead of losing data
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);

        // Try to save what we have recorded so far
        let partialBlob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          partialBlob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          setAudioBlob(partialBlob);
          setWasPartialSave(true);
          console.log('[Recording] Saved partial recording on error:', partialBlob.size, 'bytes');
        }

        // Защита от позднего вызова onstop после ошибки
        stopResolvedRef.current = true;
        isStoppingRef.current = false;
        setError('Запись прервана. Часть данных могла быть сохранена.');
        setStatus('stopped'); // Use 'stopped' instead of 'error' if we have data

        // Resolve pending stopRecording promise with partial data
        if (stopResolveRef.current) {
          stopResolveRef.current(partialBlob);
          stopResolveRef.current = null;
        }

        cleanup();
      };

      // Handle audio track ending (e.g., when another app takes the microphone)
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.onended = () => {
          console.warn('[Recording] Audio track ended unexpectedly (microphone lost)');

          // Only handle if we're still recording
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            // Try to stop gracefully and save data
            try {
              mediaRecorderRef.current.stop();
            } catch (e) {
              // If stop fails, manually save what we have
              if (chunksRef.current.length > 0) {
                const partialBlob = new Blob(chunksRef.current, {
                  type: selectedMimeType || 'audio/webm',
                });
                setAudioBlob(partialBlob);
                setWasPartialSave(true);
                setStatus('stopped');
                console.log('[Recording] Saved partial recording on track end:', partialBlob.size, 'bytes');
              }
            }
            setError('Микрофон был отключён. Запись сохранена.');
          }
        };
      }

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setStatus('recording');
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

      setStatus('error');
      console.error('Error starting recording:', err);
      cleanup();
    } finally {
      isStartingRef.current = false;
    }
  }, [startTimer, cleanup]); // status not needed — isStartingRef guards against invalid states

  const pauseRecording = useCallback(() => {
    if (status === 'recording' && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setStatus('paused');
      stopTimer();
      pausedTimeRef.current = recordingTimeRef.current * 1000; // Save current time in milliseconds
    }
  }, [status, stopTimer]);

  const resumeRecording = useCallback(() => {
    if (status === 'paused' && mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setStatus('recording');
      startTimer();
    }
  }, [status, startTimer]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Защита от двойного вызова через ref (closure-safe)
      if (isStoppingRef.current) {
        console.log('[Recording] stopRecording already in progress, ignoring');
        resolve(null);
        return;
      }

      // Защита от вызова в неподходящем состоянии
      if (status !== 'recording' && status !== 'paused') {
        resolve(null);
        return;
      }

      isStoppingRef.current = true;
      setStatus('stopping');

      // Используем ref для получения актуального времени без пересоздания callback
      const currentRecordingTime = recordingTimeRef.current;

      stopResolvedRef.current = false;
      setWasPartialSave(false);

      // Очищаем предыдущий timeout если есть (защита от двойного вызова)
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const timeoutMs = calculateStopTimeout(currentRecordingTime);

        // Функция для безопасного resolve (только один раз)
        const safeResolve = (blob: Blob | null, isPartial: boolean) => {
          if (stopResolvedRef.current) return;
          stopResolvedRef.current = true;
          isStoppingRef.current = false; // Разрешаем следующий вызов stopRecording

          // Очистить timeout если ещё не сработал
          if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
          }

          if (isPartial) {
            setWasPartialSave(true);
            console.warn(
              '[Recording] Partial save due to timeout.',
              `Duration: ${currentRecordingTime}s, Blob size: ${blob?.size || 0} bytes`
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

          setStatus('stopped');
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
        // MediaRecorder недоступен или уже остановлен - это edge case
        // Сбрасываем в idle т.к. нечего останавливать
        setStatus('idle');
        isStoppingRef.current = false;
        resolve(null);
      }

      stopTimer();
    });
  }, [status, stopTimer]);

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
    isStoppingRef.current = false; // Разрешаем следующий stopRecording

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

  // Handle Page Lifecycle API - save recording before browser freezes the tab
  // This is critical for scenarios where user switches to another tab/app
  useEffect(() => {
    const handleFreeze = () => {
      console.warn('[Recording] Page is being frozen by browser');
      // Try to request data from MediaRecorder before freeze
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          // This will trigger ondataavailable with current data
          mediaRecorderRef.current.requestData();
          console.log('[Recording] Requested data before freeze, chunks:', chunksRef.current.length);
        } catch (e) {
          console.error('[Recording] Failed to request data on freeze:', e);
        }
      }
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      // persisted=true means page might be restored from bfcache
      // persisted=false means page is definitely being unloaded
      if (!event.persisted && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.warn('[Recording] Page is being unloaded');
        try {
          mediaRecorderRef.current.requestData();
        } catch (e) {
          // Ignore
        }
      }
    };

    // @ts-expect-error - freeze event exists but not in TypeScript types
    document.addEventListener('freeze', handleFreeze);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      // @ts-expect-error - freeze event exists but not in TypeScript types
      document.removeEventListener('freeze', handleFreeze);
      window.removeEventListener('pagehide', handlePageHide);
    };
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
    status,
    // Обратная совместимость (deprecated)
    isRecording,
    isPaused,
    isStopped,
    // Остальные поля
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



