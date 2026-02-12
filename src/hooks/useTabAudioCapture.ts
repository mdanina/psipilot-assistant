import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Статусы захвата аудио вкладки
 */
export type TabCaptureStatus =
  | 'idle'      // Готов к захвату
  | 'selecting' // Пользователь выбирает вкладку
  | 'recording' // Идёт запись
  | 'stopping'  // Останавливаем запись
  | 'stopped'   // Запись завершена
  | 'error';    // Ошибка

export interface UseTabAudioCaptureReturn {
  status: TabCaptureStatus;
  recordingTime: number;
  audioBlob: Blob | null;
  error: string | null;
  isSupported: boolean;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<Blob | null>;
  cancelCapture: () => void;
  reset: () => void;
}

/**
 * Проверяет поддержку захвата системного аудио
 */
function checkSupport(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

/**
 * Hook для захвата аудио из вкладки браузера
 * Использует Screen Capture API (getDisplayMedia)
 */
export function useTabAudioCapture(): UseTabAudioCaptureReturn {
  const [status, setStatus] = useState<TabCaptureStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const stopResolvedRef = useRef<boolean>(false);
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);

  const isSupportedRef = useRef<boolean>(checkSupport());
  const isSupported = isSupportedRef.current;

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setStatus('idle');
    setRecordingTime(0);
    setAudioBlob(null);
    setError(null);
    chunksRef.current = [];
    stopResolveRef.current = null;
    isStartingRef.current = false;
    isStoppingRef.current = false;
  }, [cleanup]);

  const startCapture = useCallback(async () => {
    // Защита от двойного вызова через ref (closure-safe, не зависит от батчинга React)
    if (isStartingRef.current) {
      console.log('[TabCapture] startCapture already in progress, ignoring');
      return;
    }
    isStartingRef.current = true;

    if (!isSupported) {
      setError('Ваш браузер не поддерживает захват звука вкладки');
      setStatus('error');
      isStartingRef.current = false;
      return;
    }

    setStatus('selecting');
    setError(null);

    try {
      // Запрашиваем захват экрана/вкладки с аудио
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Обязательно для getDisplayMedia, но мы используем только аудио
        audio: {
          // Настройки для захвата системного звука
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
        // @ts-expect-error - Chrome-specific options not in TypeScript types
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude', // Исключаем текущую вкладку из выбора
        systemAudio: 'include',
      });

      // Проверяем что есть аудио трек
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Пользователь не выбрал "Поделиться звуком" или браузер не поддерживает
        stream.getTracks().forEach(track => track.stop());
        setError('Не удалось захватить звук. Убедитесь что выбрали "Поделиться звуком вкладки" в диалоге.');
        setStatus('error');
        return;
      }

      // Останавливаем видео трек - нам нужен только звук
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => track.stop());

      // Создаём новый поток только с аудио
      const audioOnlyStream = new MediaStream(audioTracks);
      streamRef.current = audioOnlyStream;

      // Определяем поддерживаемый MIME тип
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      // Создаём MediaRecorder
      const mediaRecorder = new MediaRecorder(audioOnlyStream, {
        mimeType: selectedMimeType || undefined,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('[TabCapture] Chunk received:', event.data.size, 'bytes, total chunks:', chunksRef.current.length);
        }
      };

      mediaRecorder.onstop = () => {
        // Проверяем, не был ли уже выполнен resolve (например, по timeout)
        if (stopResolvedRef.current) {
          console.log('[TabCapture] onstop called after timeout resolve, skipping state update');
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          return;
        }

        let blob: Blob | null = null;
        console.log('[TabCapture] Recording stopped, chunks:', chunksRef.current.length);
        if (chunksRef.current.length > 0) {
          blob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          console.log('[TabCapture] Final blob size:', blob.size, 'bytes (', Math.round(blob.size / 1024), 'KB)');
          setAudioBlob(blob);
        } else {
          console.warn('[TabCapture] No chunks recorded - audio may not have been captured');
        }
        setStatus('stopped');
        cleanup();

        if (stopResolveRef.current) {
          stopResolveRef.current(blob);
          stopResolveRef.current = null;
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('TabCapture MediaRecorder error:', event);

        // Пытаемся сохранить что есть
        let partialBlob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          partialBlob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          setAudioBlob(partialBlob);
        }

        // Защита от позднего вызова onstop после ошибки
        stopResolvedRef.current = true;
        isStoppingRef.current = false;
        setError('Ошибка записи звука вкладки');
        setStatus('stopped');
        cleanup();

        if (stopResolveRef.current) {
          stopResolveRef.current(partialBlob);
          stopResolveRef.current = null;
        }
      };

      // Обрабатываем ситуацию когда пользователь остановил шаринг
      audioTracks[0].onended = () => {
        console.log('[TabCapture] Audio track ended (user stopped sharing)');
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      // Запускаем запись
      mediaRecorder.start(1000); // Chunk каждую секунду
      startTimeRef.current = Date.now();
      setStatus('recording');

      // Запускаем таймер
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 100);

    } catch (err) {
      console.error('TabCapture error:', err);

      let errorMessage = 'Не удалось начать захват звука';

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Доступ к захвату экрана отклонён';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'Не найдено устройство для захвата';
        } else if (err.name === 'NotSupportedError') {
          errorMessage = 'Захват звука не поддерживается в этом браузере';
        }
      }

      setError(errorMessage);
      setStatus('error');
      cleanup();
    } finally {
      isStartingRef.current = false;
    }
  }, [isSupported, cleanup]);

  const stopCapture = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Защита от двойного вызова через ref (closure-safe)
      if (isStoppingRef.current) {
        console.log('[TabCapture] stopCapture already in progress, ignoring');
        resolve(null);
        return;
      }

      if (status !== 'recording') {
        resolve(null);
        return;
      }

      isStoppingRef.current = true;
      setStatus('stopping');
      stopResolvedRef.current = false;

      // Очищаем предыдущий timeout если есть
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        // Функция для безопасного resolve (только один раз)
        const safeResolve = (blob: Blob | null) => {
          if (stopResolvedRef.current) return;
          stopResolvedRef.current = true;
          isStoppingRef.current = false;

          if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
          }

          resolve(blob);
        };

        // Timeout protection — 30 секунд. Без этого Promise может зависнуть навсегда
        // если onstop не вызовется (проблема с getDisplayMedia в некоторых браузерах)
        stopTimeoutRef.current = setTimeout(() => {
          console.error('[TabCapture] Stop timeout after 30s. Chunks:', chunksRef.current.length);

          let partialBlob: Blob | null = null;
          if (chunksRef.current.length > 0) {
            partialBlob = new Blob(chunksRef.current, {
              type: mediaRecorderRef.current?.mimeType || 'audio/webm',
            });
            setAudioBlob(partialBlob);
          }

          setStatus('stopped');
          safeResolve(partialBlob);

          // Cleanup без повторного вызова stop()
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }, 30000);

        stopResolveRef.current = (blob) => {
          safeResolve(blob);
        };

        mediaRecorderRef.current.stop();
      } else {
        setStatus('idle');
        isStoppingRef.current = false;
        resolve(null);
      }
    });
  }, [status]);

  const cancelCapture = useCallback(() => {
    cleanup();
    reset();
  }, [cleanup, reset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Помечаем как resolved чтобы onstop не обновлял state после unmount
      stopResolvedRef.current = true;

      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  return {
    status,
    recordingTime,
    audioBlob,
    error,
    isSupported,
    startCapture,
    stopCapture,
    cancelCapture,
    reset,
  };
}
