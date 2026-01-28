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

  const isSupported = checkSupport();

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
  }, [cleanup]);

  const startCapture = useCallback(async () => {
    if (status !== 'idle') {
      console.warn('[TabCapture] Already capturing or in invalid state:', status);
      return;
    }

    if (!isSupported) {
      setError('Ваш браузер не поддерживает захват звука вкладки');
      setStatus('error');
      return;
    }

    setStatus('selecting');
    setError(null);

    try {
      // Запрашиваем захват вкладки с аудио
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Обязательно для getDisplayMedia, но мы используем только аудио
        audio: {
          // Настройки для захвата звука вкладки
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
        // @ts-expect-error - Chrome-specific options not in TypeScript types
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude', // Исключаем текущую вкладку из выбора
        // НЕ используем systemAudio для вкладки - только для системного звука
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

      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => track.stop());

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

      // Проверяем состояние аудио трека
      const audioTrack = audioTracks[0];
      console.log('[TabCapture] Audio track info:', {
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState,
        settings: audioTrack.getSettings(),
        kind: audioTrack.kind,
        label: audioTrack.label,
      });

      const mediaRecorder = new MediaRecorder(audioOnlyStream, {
        mimeType: selectedMimeType || undefined,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          const totalSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
          console.log('[TabCapture] Data available:', event.data.size, 'bytes, total chunks:', chunksRef.current.length, 'total size:', totalSize, 'bytes');
        } else {
          console.warn('[TabCapture] Data available but size is 0 or null');
        }
      };

      mediaRecorder.onstop = () => {
        const totalChunksSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        console.log('[TabCapture] onstop called, chunks:', chunksRef.current.length, 'total size:', totalChunksSize, 'bytes');
        
        let blob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          blob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          console.log('[TabCapture] Created blob:', blob.size, 'bytes, type:', blob.type);
          
          // Предупреждение если blob слишком маленький
          if (blob.size < 10000) {
            console.warn('[TabCapture] WARNING: Blob is very small (', blob.size, 'bytes). This might indicate no audio was captured.');
          }
          
          setAudioBlob(blob);
        } else {
          console.warn('[TabCapture] No chunks available to create blob');
        }
        setStatus('stopped');
        cleanup();

        if (stopResolveRef.current) {
          console.log('[TabCapture] Resolving stop promise with blob:', blob?.size || 0, 'bytes');
          stopResolveRef.current(blob);
          stopResolveRef.current = null;
        } else {
          console.warn('[TabCapture] onstop called but no stopResolveRef');
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

        setError('Ошибка записи звука вкладки');
        setStatus('stopped');
        cleanup();

        if (stopResolveRef.current) {
          stopResolveRef.current(partialBlob);
          stopResolveRef.current = null;
        }
      };

      // Мониторим состояние аудио трека во время записи
      const checkAudioTrack = setInterval(() => {
        if (audioTrack.muted) {
          console.warn('[TabCapture] Audio track became muted during recording!');
        }
        if (!audioTrack.enabled) {
          console.warn('[TabCapture] Audio track became disabled during recording!');
        }
        if (audioTrack.readyState === 'ended') {
          console.warn('[TabCapture] Audio track ended during recording!');
          clearInterval(checkAudioTrack);
        }
      }, 1000);
      
      // Обрабатываем ситуацию когда пользователь остановил шаринг
      audioTrack.onended = () => {
        clearInterval(checkAudioTrack);
        console.log('[TabCapture] Audio track ended (user stopped sharing)');
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      // Запускаем запись с более частым сбором данных
      // timeslice: null означает сбор данных только при stop(), но это может быть слишком поздно
      // Используем меньший интервал для более надежного сбора данных
      mediaRecorder.start(100); // Chunk каждые 100мс для более надежного сбора
      startTimeRef.current = Date.now();
      setStatus('recording');
      console.log('[TabCapture] Recording started, mimeType:', selectedMimeType);

      // Запускаем таймер
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 1000);

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
    }
  }, [status, isSupported, cleanup]);

  const stopCapture = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (status !== 'recording') {
        console.warn('[TabCapture] stopCapture called but not recording, status:', status);
        resolve(null);
        return;
      }

      setStatus('stopping');
      stopResolveRef.current = resolve;

      // Запрашиваем последние данные перед остановкой
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.requestData();
        } catch (e) {
          console.warn('[TabCapture] Failed to request data:', e);
        }
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        // Запрашиваем финальные данные перед остановкой
        try {
          if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.requestData();
          }
        } catch (e) {
          console.warn('[TabCapture] Failed to request final data:', e);
        }
        
        mediaRecorderRef.current.stop();
        
        // Даем время для обработки onstop
        setTimeout(() => {
          if (stopResolveRef.current) {
            // Если onstop еще не сработал, создаем blob из имеющихся chunks
            let blob: Blob | null = null;
            if (chunksRef.current.length > 0) {
              blob = new Blob(chunksRef.current, { type: 'audio/webm' });
              console.log('[TabCapture] Created blob from chunks (timeout fallback):', blob.size, 'bytes');
            }
            stopResolveRef.current(blob);
            stopResolveRef.current = null;
          }
        }, 500);
      } else {
        console.warn('[TabCapture] MediaRecorder already inactive');
        // Если уже остановлен, создаем blob из имеющихся chunks
        let blob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          console.log('[TabCapture] Created blob from chunks:', blob.size, 'bytes');
        }
        setStatus('idle');
        resolve(blob);
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
      cleanup();
    };
  }, [cleanup]);

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
