import { useState, useRef, useCallback } from 'react';

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  isStopped: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  error: string | null;
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const finalRecordingTimeRef = useRef<number>(0);
  const currentMimeTypeRef = useRef<string>('audio/webm');

  const reset = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setIsStopped(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setError(null);
    chunksRef.current = [];
    pausedTimeRef.current = 0;
    finalRecordingTimeRef.current = 0;
    stopResolveRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
    try {
      setError(null);
      
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
        setError('Ошибка записи аудио');
        console.error('MediaRecorder error:', event);
        cleanup();
        reset();
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
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

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        // Store resolve function for the onstop handler
        stopResolveRef.current = resolve;
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

  return {
    isRecording,
    isPaused,
    isStopped,
    recordingTime,
    audioBlob,
    error,
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



