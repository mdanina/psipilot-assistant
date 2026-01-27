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
    }
  }, [status, isSupported, cleanup]);

  const stopCapture = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (status !== 'recording') {
        resolve(null);
        return;
      }

      setStatus('stopping');
      stopResolveRef.current = resolve;

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        setStatus('idle');
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
