import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioRecorder } from '../useAudioRecorder';

// ============================================================================
// Mock MediaRecorder
// ============================================================================

type MediaRecorderState = 'inactive' | 'recording' | 'paused';

class MockMediaRecorder {
  state: MediaRecorderState = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  private _mimeType: string;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this._mimeType = options?.mimeType || 'audio/webm';
  }

  start(_timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    if (this.state === 'inactive') throw new Error('Already inactive');
    this.state = 'inactive';
    // Simulate async onstop
    setTimeout(() => this.onstop?.(), 0);
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  requestData() {
    // noop
  }

  static isTypeSupported(_mimeType: string): boolean {
    return true;
  }
}

// ============================================================================
// Mock MediaStream
// ============================================================================

function createMockStream(): MediaStream {
  const audioTrack = {
    kind: 'audio',
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };

  return {
    getTracks: () => [audioTrack],
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
}

// ============================================================================
// Setup
// ============================================================================

let mockStream: MediaStream;
let lastMediaRecorder: MockMediaRecorder;

beforeEach(() => {
  vi.useFakeTimers();

  mockStream = createMockStream();

  // Mock getUserMedia
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
    writable: true,
    configurable: true,
  });

  // Mock MediaRecorder
  const OrigMock = MockMediaRecorder;
  (globalThis as Record<string, unknown>).MediaRecorder = class extends OrigMock {
    constructor(stream: MediaStream, options?: { mimeType?: string }) {
      super(stream, options);
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastMediaRecorder = this;
    }
  };
  (globalThis as Record<string, unknown>).MediaRecorder.isTypeSupported = MockMediaRecorder.isTypeSupported;

  // Mock navigator properties
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    value: 4,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe('useAudioRecorder', () => {
  // ------------------------------------------------------------------
  // Initial state
  // ------------------------------------------------------------------
  describe('initial state', () => {
    it('should start in idle state', () => {
      const { result } = renderHook(() => useAudioRecorder());

      expect(result.current.status).toBe('idle');
      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isStopped).toBe(false);
      expect(result.current.audioBlob).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.recordingTime).toBe(0);
      expect(result.current.wasPartialSave).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Start recording
  // ------------------------------------------------------------------
  describe('startRecording', () => {
    it('should transition to recording state', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.status).toBe('recording');
      expect(result.current.isRecording).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    });

    it('should handle permission denied error', async () => {
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
        new Error('NotAllowedError: Permission denied')
      );

      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Доступ к микрофону запрещен');
    });

    it('should handle microphone not found error', async () => {
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
        new Error('NotFoundError: DevicesNotFoundError')
      );

      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Микрофон не найден');
    });

    it('should prevent double start calls', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Start twice simultaneously
      await act(async () => {
        const p1 = result.current.startRecording();
        const p2 = result.current.startRecording();
        await Promise.all([p1, p2]);
      });

      // getUserMedia should be called only once
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------------
  // Pause / Resume
  // ------------------------------------------------------------------
  describe('pauseRecording / resumeRecording', () => {
    it('should pause and resume recording', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      act(() => {
        result.current.pauseRecording();
      });

      expect(result.current.status).toBe('paused');
      expect(result.current.isPaused).toBe(true);
      expect(result.current.isRecording).toBe(true); // isRecording includes paused

      act(() => {
        result.current.resumeRecording();
      });

      expect(result.current.status).toBe('recording');
      expect(result.current.isPaused).toBe(false);
    });

    it('should not pause when not recording', () => {
      const { result } = renderHook(() => useAudioRecorder());

      act(() => {
        result.current.pauseRecording();
      });

      expect(result.current.status).toBe('idle');
    });
  });

  // ------------------------------------------------------------------
  // Stop recording
  // ------------------------------------------------------------------
  describe('stopRecording', () => {
    it('should resolve with blob when chunks exist', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      // Simulate data available
      act(() => {
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['audio-data'], { type: 'audio/webm' }),
        });
      });

      let blob: Blob | null = null;
      await act(async () => {
        // Override stop to call onstop synchronously within the act
        const origStop = lastMediaRecorder.stop.bind(lastMediaRecorder);
        lastMediaRecorder.stop = function () {
          origStop.call(this);
          // Fire onstop synchronously (not via setTimeout)
          this.onstop?.();
        };

        blob = await result.current.stopRecording();
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(result.current.status).toBe('stopped');
      expect(result.current.isStopped).toBe(true);
    });

    it('should resolve with null when no chunks', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      let blob: Blob | null = null;
      await act(async () => {
        const origStop = lastMediaRecorder.stop.bind(lastMediaRecorder);
        lastMediaRecorder.stop = function () {
          origStop.call(this);
          this.onstop?.();
        };

        blob = await result.current.stopRecording();
      });

      expect(blob).toBeNull();
      expect(result.current.status).toBe('stopped');
    });

    it('should resolve null when not recording', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      let blob: Blob | null = null;
      await act(async () => {
        blob = await result.current.stopRecording();
      });

      expect(blob).toBeNull();
    });

    it('should prevent double stop calls', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      let blob1: Blob | null = null;
      let blob2: Blob | null = null;

      await act(async () => {
        const origStop = lastMediaRecorder.stop.bind(lastMediaRecorder);
        lastMediaRecorder.stop = function () {
          origStop.call(this);
          this.onstop?.();
        };

        const p1 = result.current.stopRecording();
        const p2 = result.current.stopRecording();
        [blob1, blob2] = await Promise.all([p1, p2]);
      });

      // Second call should return null immediately
      expect(blob2).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Error handling — CRITICAL BUG FIX TEST
  // ------------------------------------------------------------------
  describe('onerror handler during stopRecording', () => {
    it('should resolve stop promise with partial blob when MediaRecorder errors during stop', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      // Add some audio data
      act(() => {
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['chunk-1'], { type: 'audio/webm' }),
        });
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['chunk-2'], { type: 'audio/webm' }),
        });
      });

      let blob: Blob | null = null;

      await act(async () => {
        // Override stop to trigger onerror instead of onstop
        lastMediaRecorder.stop = function () {
          this.state = 'inactive';
          // Simulate error during stop
          this.onerror?.({ type: 'error' });
        };

        blob = await result.current.stopRecording();
      });

      // The promise MUST resolve with partial data (this was the bug)
      expect(blob).toBeInstanceOf(Blob);
      expect(blob!.size).toBeGreaterThan(0);
      expect(result.current.status).toBe('stopped');
      expect(result.current.error).toContain('Запись прервана');
    });

    it('should resolve stop promise with null when error occurs with no chunks', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      let blob: Blob | null = null;

      await act(async () => {
        lastMediaRecorder.stop = function () {
          this.state = 'inactive';
          this.onerror?.({ type: 'error' });
        };

        blob = await result.current.stopRecording();
      });

      expect(blob).toBeNull();
      expect(result.current.status).toBe('stopped');
    });
  });

  // ------------------------------------------------------------------
  // Timeout handling
  // ------------------------------------------------------------------
  describe('stop timeout', () => {
    it('should resolve with partial blob when onstop takes too long', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      // Add data
      act(() => {
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['timeout-chunk'], { type: 'audio/webm' }),
        });
      });

      let stopPromise: Promise<Blob | null>;

      await act(async () => {
        // Override stop to NEVER call onstop (simulate hang)
        lastMediaRecorder.stop = function () {
          this.state = 'inactive';
          // Don't call onstop — simulates a hang
        };

        stopPromise = result.current.stopRecording();
      });

      // Fast-forward past the timeout (max 120s)
      await act(async () => {
        vi.advanceTimersByTime(130000);
      });

      const blob = await stopPromise!;

      expect(blob).toBeInstanceOf(Blob);
      expect(result.current.status).toBe('stopped');
      expect(result.current.wasPartialSave).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Cancel recording
  // ------------------------------------------------------------------
  describe('cancelRecording', () => {
    it('should reset to idle and resolve pending stop promise with null', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      act(() => {
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['data'], { type: 'audio/webm' }),
        });
      });

      act(() => {
        result.current.cancelRecording();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.audioBlob).toBeNull();
      expect(result.current.recordingTime).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------
  describe('reset', () => {
    it('should reset all state to initial values', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.recordingTime).toBe(0);
      expect(result.current.audioBlob).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.wasPartialSave).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // getCurrentChunks / getCurrentMimeType
  // ------------------------------------------------------------------
  describe('getCurrentChunks / getCurrentMimeType', () => {
    it('should return current chunks as a copy', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      act(() => {
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['c1'], { type: 'audio/webm' }),
        });
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['c2'], { type: 'audio/webm' }),
        });
      });

      const chunks = result.current.getCurrentChunks();
      expect(chunks).toHaveLength(2);

      // Verify it's a copy
      chunks.push(new Blob(['extra']));
      expect(result.current.getCurrentChunks()).toHaveLength(2);
    });

    it('should return current mime type', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      const mimeType = result.current.getCurrentMimeType();
      expect(typeof mimeType).toBe('string');
      expect(mimeType.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // Audio track ended
  // ------------------------------------------------------------------
  describe('audio track ended unexpectedly', () => {
    it('should stop recording when audio track ends', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      // Add some data
      act(() => {
        lastMediaRecorder.ondataavailable?.({
          data: new Blob(['data'], { type: 'audio/webm' }),
        });
      });

      // Simulate audio track ending
      const track = mockStream.getAudioTracks()[0];

      await act(async () => {
        // Override stop to fire onstop synchronously
        const origStop = lastMediaRecorder.stop.bind(lastMediaRecorder);
        lastMediaRecorder.stop = function () {
          origStop.call(this);
          this.onstop?.();
        };

        (track as unknown as { onended: (() => void) | null }).onended?.();
      });

      expect(result.current.error).toContain('Микрофон был отключён');
    });
  });

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  describe('cleanup on unmount', () => {
    it('should stop stream tracks on unmount', async () => {
      const { result, unmount } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      const tracks = mockStream.getTracks();

      unmount();

      tracks.forEach(track => {
        expect(track.stop).toHaveBeenCalled();
      });
    });
  });
});
