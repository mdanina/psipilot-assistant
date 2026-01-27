/**
 * Simplified audio recorder hook for overlay
 */

import { useState, useRef, useCallback } from 'react';

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'stopped' | 'error';

export interface UseAudioRecorderReturn {
  status: RecorderStatus;
  recordingTime: number;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  reset: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const reset = useCallback(() => {
    setStatus('idle');
    setRecordingTime(0);
    setAudioBlob(null);
    setError(null);
    chunksRef.current = [];

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setStatus('starting');
      setError(null);
      chunksRef.current = [];

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Find supported mime type
      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'];
      let mimeType = 'audio/webm';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setStatus('stopped');
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred');
        setStatus('error');
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setStatus('recording');
      startTimeRef.current = Date.now();

      // Start timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      setStatus('error');
      console.error('Error starting recording:', err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (status !== 'recording' && status !== 'starting') {
      return null;
    }

    try {
      setStatus('stopping');

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // Stop stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Wait for blob to be created (handled in onstop)
      // Return the blob from chunks
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      return blob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMessage);
      setStatus('error');
      return null;
    }
  }, [status]);

  return {
    status,
    recordingTime,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
