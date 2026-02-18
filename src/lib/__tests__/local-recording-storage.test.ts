import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveRecordingLocally,
  getLocalRecording,
  markRecordingUploaded,
  markRecordingUploadFailed,
  getUnuploadedRecordings,
  deleteLocalRecording,
  clearAllLocalRecordings,
  downloadLocalRecording,
  getStorageUsage,
  isIndexedDBAvailable,
} from '../local-recording-storage';

// Polyfill Blob.arrayBuffer for jsdom
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// ============================================================================
// Fake IndexedDB (in-memory)
// ============================================================================

class FakeObjectStore {
  private data = new Map<string, unknown>();
  private _indexes: Record<string, string> = {};

  put(value: Record<string, unknown>) {
    const key = value.id as string;
    this.data.set(key, structuredClone(value));
    return fakeRequest(undefined);
  }

  get(key: string) {
    return fakeRequest(this.data.get(key) ?? null);
  }

  delete(key: string) {
    this.data.delete(key);
    return fakeRequest(undefined);
  }

  clear() {
    this.data.clear();
    return fakeRequest(undefined);
  }

  getAll() {
    return fakeRequest(Array.from(this.data.values()));
  }

  index(name: string): FakeIndex {
    return new FakeIndex(this.data, this._indexes[name] || name);
  }

  createIndex(name: string, keyPath: string, _options?: { unique: boolean }) {
    this._indexes[name] = keyPath;
  }
}

class FakeIndex {
  constructor(
    private data: Map<string, unknown>,
    private keyPath: string
  ) {}

  openCursor(range?: IDBKeyRange) {
    const entries = Array.from(this.data.entries())
      .map(([, value]) => value as Record<string, unknown>)
      .filter(record => {
        if (!range) return true;
        const val = record[this.keyPath] as number;
        // upperBound check
        if ((range as unknown as { upper: number }).upper !== undefined) {
          return val <= (range as unknown as { upper: number }).upper;
        }
        return true;
      });

    let index = 0;

    const cursorRequest = {
      result: null as unknown,
      onsuccess: null as ((event: unknown) => void) | null,
      onerror: null as ((event: unknown) => void) | null,
    };

    // Advance through entries
    function advance() {
      if (index < entries.length) {
        const entry = entries[index];
        index++;
        cursorRequest.result = {
          value: entry,
          delete: () => {
            // Remove from data
          },
          continue: () => {
            advance();
          },
        };
      } else {
        cursorRequest.result = null;
      }
      cursorRequest.onsuccess?.({ target: cursorRequest });
    }

    setTimeout(() => advance(), 0);

    return cursorRequest;
  }
}

function fakeRequest(result: unknown) {
  const req = {
    result,
    error: null,
    onsuccess: null as ((event: unknown) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
  };

  setTimeout(() => {
    req.onsuccess?.({ target: req });
  }, 0);

  return req;
}

// Shared object store across all "connections"
let sharedStore: FakeObjectStore;

class FakeTransaction {
  constructor(private _storeNames: string[], public mode: string) {}

  objectStore(_name: string): FakeObjectStore {
    return sharedStore;
  }
}

class FakeDB {
  objectStoreNames = {
    contains: (_name: string) => !!sharedStore,
  };

  closed = false;

  transaction(storeNames: string[], mode = 'readonly'): FakeTransaction {
    return new FakeTransaction(storeNames, mode);
  }

  createObjectStore(_name: string, _options: { keyPath: string }): FakeObjectStore {
    sharedStore = new FakeObjectStore();
    return sharedStore;
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });

  sharedStore = new FakeObjectStore();

  // Mock indexedDB
  const fakeIndexedDB = {
    open: (_name: string, _version?: number) => {
      const db = new FakeDB();
      const request = {
        result: db,
        error: null,
        onsuccess: null as ((event: unknown) => void) | null,
        onerror: null as ((event: unknown) => void) | null,
        onupgradeneeded: null as ((event: unknown) => void) | null,
      };

      setTimeout(() => {
        // Trigger upgrade if store doesn't exist
        if (!sharedStore || (sharedStore as FakeObjectStore & { data?: unknown }) === undefined) {
          request.onupgradeneeded?.({
            target: request,
          });
        }
        request.onsuccess?.({ target: request });
      }, 0);

      return request;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeIndexedDB,
    writable: true,
    configurable: true,
  });

  // Mock navigator.storage.estimate
  Object.defineProperty(navigator, 'storage', {
    value: {
      estimate: vi.fn().mockResolvedValue({
        usage: 0,
        quota: 1024 * 1024 * 1024, // 1GB
      }),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Mock decryptBlob for legacy tests
vi.mock('../recording-encryption', () => ({
  decryptBlob: vi.fn().mockImplementation(
    (_encrypted: ArrayBuffer, _iv: ArrayBuffer, mimeType: string) =>
      Promise.resolve(new Blob(['decrypted-data'], { type: mimeType }))
  ),
}));

// ============================================================================
// Tests
// ============================================================================

describe('local-recording-storage', () => {
  // ------------------------------------------------------------------
  // isIndexedDBAvailable
  // ------------------------------------------------------------------
  describe('isIndexedDBAvailable', () => {
    it('should return true when IndexedDB is available', async () => {
      const result = await isIndexedDBAvailable();
      expect(result).toBe(true);
    });

    it('should return false when indexedDB is undefined', async () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const result = await isIndexedDBAvailable();
      expect(result).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // saveRecordingLocally
  // ------------------------------------------------------------------
  describe('saveRecordingLocally', () => {
    it('should save recording and return ID', async () => {
      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60, 'audio/webm');

      expect(id).toMatch(/^local-/);
      expect(typeof id).toBe('string');
    });

    it('should save with session ID', async () => {
      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60, 'audio/webm', 'session-123');

      const recording = await getLocalRecording(id);
      expect(recording).not.toBeNull();
      expect(recording!.sessionId).toBe('session-123');
    });

    it('should throw when storage quota is insufficient', async () => {
      vi.mocked(navigator.storage.estimate).mockResolvedValueOnce({
        usage: 990 * 1024 * 1024,
        quota: 1000 * 1024 * 1024, // Only 10MB free
      });

      const blob = new Blob(['data'], { type: 'audio/webm' });
      await expect(
        saveRecordingLocally(blob, 'test.webm', 60)
      ).rejects.toThrow(/Недостаточно места/);
    });
  });

  // ------------------------------------------------------------------
  // getLocalRecording
  // ------------------------------------------------------------------
  describe('getLocalRecording', () => {
    it('should retrieve saved recording', async () => {
      const blob = new Blob(['test-audio'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 120, 'audio/webm');

      const recording = await getLocalRecording(id);

      expect(recording).not.toBeNull();
      expect(recording!.fileName).toBe('test.webm');
      expect(recording!.duration).toBe(120);
      expect(recording!.mimeType).toBe('audio/webm');
      expect(recording!.uploaded).toBe(false);
      expect(recording!.blob).toBeInstanceOf(Blob);
    });

    it('should return null for non-existent recording', async () => {
      const recording = await getLocalRecording('non-existent-id');
      expect(recording).toBeNull();
    });

    it('should return null and delete expired recording', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      // Advance time past TTL (48 hours)
      vi.advanceTimersByTime(49 * 60 * 60 * 1000);

      const recording = await getLocalRecording(id);
      expect(recording).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // markRecordingUploaded
  // ------------------------------------------------------------------
  describe('markRecordingUploaded', () => {
    it('should mark recording as uploaded', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      await markRecordingUploaded(id, 'rec-server-123', 'session-456');

      const recording = await getLocalRecording(id);
      expect(recording).not.toBeNull();
      expect(recording!.uploaded).toBe(true);
      expect(recording!.recordingId).toBe('rec-server-123');
      expect(recording!.sessionId).toBe('session-456');
    });

    it('should throw for non-existent recording', async () => {
      await expect(
        markRecordingUploaded('non-existent', 'rec-1', 'sess-1')
      ).rejects.toThrow(/not found/);
    });

    it('should clear upload error when marking as uploaded', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      await markRecordingUploadFailed(id, 'Network error');
      await markRecordingUploaded(id, 'rec-1', 'sess-1');

      const recording = await getLocalRecording(id);
      expect(recording!.uploadError).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // markRecordingUploadFailed
  // ------------------------------------------------------------------
  describe('markRecordingUploadFailed', () => {
    it('should set upload error', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      await markRecordingUploadFailed(id, 'Server error 500');

      const recording = await getLocalRecording(id);
      expect(recording!.uploadError).toBe('Server error 500');
    });

    it('should throw for non-existent recording', async () => {
      await expect(
        markRecordingUploadFailed('non-existent', 'error')
      ).rejects.toThrow(/not found/);
    });
  });

  // ------------------------------------------------------------------
  // getUnuploadedRecordings
  // ------------------------------------------------------------------
  describe('getUnuploadedRecordings', () => {
    it('should return only unuploaded recordings', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id1 = await saveRecordingLocally(blob, 'file1.webm', 60);
      const id2 = await saveRecordingLocally(blob, 'file2.webm', 120);

      await markRecordingUploaded(id1, 'rec-1', 'sess-1');

      const unuploaded = await getUnuploadedRecordings();

      expect(unuploaded).toHaveLength(1);
      expect(unuploaded[0].id).toBe(id2);
      expect(unuploaded[0].fileName).toBe('file2.webm');
      expect(unuploaded[0].duration).toBe(120);
    });

    it('should not return expired recordings', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      await saveRecordingLocally(blob, 'file1.webm', 60);

      // Advance past TTL
      vi.advanceTimersByTime(49 * 60 * 60 * 1000);

      const unuploaded = await getUnuploadedRecordings();
      expect(unuploaded).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // deleteLocalRecording
  // ------------------------------------------------------------------
  describe('deleteLocalRecording', () => {
    it('should delete recording', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      await deleteLocalRecording(id);

      const recording = await getLocalRecording(id);
      expect(recording).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // clearAllLocalRecordings
  // ------------------------------------------------------------------
  describe('clearAllLocalRecordings', () => {
    it('should clear all recordings', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      await saveRecordingLocally(blob, 'file1.webm', 60);
      await saveRecordingLocally(blob, 'file2.webm', 120);

      await clearAllLocalRecordings();

      const usage = await getStorageUsage();
      expect(usage.count).toBe(0);
      expect(usage.totalSize).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // downloadLocalRecording (URL.createObjectURL leak fix)
  // ------------------------------------------------------------------
  describe('downloadLocalRecording', () => {
    it('should create and revoke object URL in try/finally', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      const createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      // Mock DOM
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      } as unknown as HTMLAnchorElement;
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
      vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor);
      vi.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor);

      await downloadLocalRecording(id);

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url');
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should still revoke URL even when click throws', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      const id = await saveRecordingLocally(blob, 'test.webm', 60);

      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn().mockImplementation(() => { throw new Error('click failed'); }),
      } as unknown as HTMLAnchorElement;
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
      vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor);

      await expect(downloadLocalRecording(id)).rejects.toThrow('click failed');

      // URL should STILL be revoked (bug fix verification)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url');
    });

    it('should throw for non-existent recording', async () => {
      await expect(downloadLocalRecording('non-existent')).rejects.toThrow(/not found/);
    });
  });

  // ------------------------------------------------------------------
  // getStorageUsage
  // ------------------------------------------------------------------
  describe('getStorageUsage', () => {
    it('should return count and total size', async () => {
      const blob1 = new Blob(['short'], { type: 'audio/webm' });
      const blob2 = new Blob(['a-bit-longer-data'], { type: 'audio/webm' });
      await saveRecordingLocally(blob1, 'f1.webm', 30);
      await saveRecordingLocally(blob2, 'f2.webm', 60);

      const usage = await getStorageUsage();

      expect(usage.count).toBe(2);
      expect(usage.totalSize).toBeGreaterThan(0);
    });

    it('should exclude expired recordings from count', async () => {
      const blob = new Blob(['data'], { type: 'audio/webm' });
      await saveRecordingLocally(blob, 'f1.webm', 30);

      vi.advanceTimersByTime(49 * 60 * 60 * 1000);

      const usage = await getStorageUsage();
      expect(usage.count).toBe(0);
    });
  });
});
