import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Статусы захвата системного аудио
 */
export type SystemAudioStatus =
  | 'idle'      // Готов к захвату
  | 'selecting' // Пользователь выбирает источник
  | 'recording' // Идёт запись
  | 'stopping'  // Останавливаем запись
  | 'stopped'   // Запись завершена
  | 'error';    // Ошибка

export interface UseSystemAudioCaptureReturn {
  status: SystemAudioStatus;
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
 * Hook для захвата системного аудио (весь звук системы)
 * Использует Screen Capture API с выбором экрана/окна
 */
export function useSystemAudioCapture(): UseSystemAudioCaptureReturn {
  const [status, setStatus] = useState<SystemAudioStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const isSupported = checkSupport();

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
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
      console.warn('[SystemAudio] Already capturing or in invalid state:', status);
      return;
    }

    if (!isSupported) {
      setError('Ваш браузер не поддерживает захват системного звука');
      setStatus('error');
      return;
    }

    setStatus('selecting');
    setError(null);

    try {
      // Запрашиваем захват экрана/окна с системным звуком
      // Для системного звука нужно выбрать "Экран" или "Окно", а не "Вкладку"
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Обязательно для getDisplayMedia
        audio: {
          // Настройки для захвата системного звука
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // @ts-expect-error - Chrome-specific option
          systemAudio: 'include', // Включаем системный звук
        } as MediaTrackConstraints,
        // @ts-expect-error - Chrome-specific options
        preferCurrentTab: false, // Не предпочитать текущую вкладку
        // Не исключаем текущую вкладку - пользователь может выбрать экран/окно
      });

      // Проверяем что есть аудио трек
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Пользователь не выбрал "Поделиться звуком системы" или браузер не поддерживает
        stream.getTracks().forEach(track => track.stop());
        setError('Не удалось захватить системный звук. В диалоге выберите "Экран" или "Окно" и включите "Поделиться звуком системы".');
        setStatus('error');
        return;
      }

      // Останавливаем видео — MediaRecorder с videoBitsPerSecond:0 + stream с видео даёт NotSupportedError.
      // Используем только аудио.
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

      // Проверяем, что аудио трек действительно активен
      const audioTrack = audioTracks[0];
      const trackSettings = audioTrack.getSettings();
      const trackConstraints = audioTrack.getConstraints();
      
      console.log('[SystemAudio] Audio track info:', {
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState,
        settings: trackSettings,
        constraints: trackConstraints,
        kind: audioTrack.kind,
        label: audioTrack.label,
      });

      // Проверяем, что трек не заглушен
      if (audioTrack.muted) {
        console.warn('[SystemAudio] WARNING: Audio track is muted!');
      }
      if (!audioTrack.enabled) {
        console.warn('[SystemAudio] WARNING: Audio track is disabled!');
      }

      const mediaRecorder = new MediaRecorder(audioOnlyStream, {
        mimeType: selectedMimeType || undefined,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          const totalSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
          console.log('[SystemAudio] Data available:', event.data.size, 'bytes, total chunks:', chunksRef.current.length, 'total size:', totalSize, 'bytes');
        } else {
          console.warn('[SystemAudio] Data available but size is 0 or null');
        }
      };

      mediaRecorder.onstop = () => {
        const totalChunksSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        console.log('[SystemAudio] onstop called, chunks:', chunksRef.current.length, 'total size:', totalChunksSize, 'bytes');
        
        let blob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          blob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          console.log('[SystemAudio] Created blob:', blob.size, 'bytes, type:', blob.type);
          
          // Предупреждение если blob слишком маленький
          if (blob.size < 10000) {
            console.warn('[SystemAudio] WARNING: Blob is very small (', blob.size, 'bytes). This might indicate no audio was captured.');
          }
          
          setAudioBlob(blob);
        } else {
          console.warn('[SystemAudio] No chunks available to create blob');
        }
        setStatus('stopped');
        cleanup();

        if (stopResolveRef.current) {
          console.log('[SystemAudio] Resolving stop promise with blob:', blob?.size || 0, 'bytes');
          stopResolveRef.current(blob);
          stopResolveRef.current = null;
        } else {
          console.warn('[SystemAudio] onstop called but no stopResolveRef');
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('SystemAudio MediaRecorder error:', event);

        // Пытаемся сохранить что есть
        let partialBlob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          partialBlob = new Blob(chunksRef.current, {
            type: selectedMimeType || 'audio/webm',
          });
          setAudioBlob(partialBlob);
        }

        setError('Ошибка записи системного звука');
        setStatus('stopped');
        cleanup();

        if (stopResolveRef.current) {
          stopResolveRef.current(partialBlob);
          stopResolveRef.current = null;
        }
      };


      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      setStatus('recording');
      console.log('[SystemAudio] Recording started, mimeType:', selectedMimeType);

      checkIntervalRef.current = setInterval(() => {
        if (audioTrack.muted) console.warn('[SystemAudio] Audio track muted during recording');
        if (!audioTrack.enabled) console.warn('[SystemAudio] Audio track disabled during recording');
        if (audioTrack.readyState === 'ended' && checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
      }, 1000);

      audioTrack.onended = () => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        console.log('[SystemAudio] Audio track ended (user stopped sharing)');
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      // Запускаем таймер
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 1000);

    } catch (err) {
      console.error('SystemAudio error:', err);

      let errorMessage = 'Не удалось начать захват системного звука';

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Доступ к захвату экрана отклонён';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'Не найдено устройство для захвата';
        } else if (err.name === 'NotSupportedError') {
          errorMessage = 'Не удалось запустить запись. Убедитесь, что в диалоге включено «Поделиться звуком системы».';
        } else {
          errorMessage = err.message || errorMessage;
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
        console.warn('[SystemAudio] stopCapture called but not recording, status:', status);
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
          console.warn('[SystemAudio] Failed to request data:', e);
        }
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        // Запрашиваем финальные данные перед остановкой
        try {
          if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.requestData();
          }
        } catch (e) {
          console.warn('[SystemAudio] Failed to request final data:', e);
        }
        
        mediaRecorderRef.current.stop();
        
        // Даем время для обработки onstop
        setTimeout(() => {
          if (stopResolveRef.current) {
            // Если onstop еще не сработал, создаем blob из имеющихся chunks
            let blob: Blob | null = null;
            if (chunksRef.current.length > 0) {
              blob = new Blob(chunksRef.current, { type: 'audio/webm' });
              console.log('[SystemAudio] Created blob from chunks (timeout fallback):', blob.size, 'bytes');
            }
            stopResolveRef.current(blob);
            stopResolveRef.current = null;
          }
        }, 500);
      } else {
        console.warn('[SystemAudio] MediaRecorder already inactive');
        // Если уже остановлен, создаем blob из имеющихся chunks
        let blob: Blob | null = null;
        if (chunksRef.current.length > 0) {
          blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          console.log('[SystemAudio] Created blob from chunks:', blob.size, 'bytes');
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
