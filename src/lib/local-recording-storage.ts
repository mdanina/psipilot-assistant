/**
 * Local recording storage using IndexedDB
 * Automatically saves recordings locally for offline access and recovery
 *
 * NOTE: Recordings are stored WITHOUT encryption locally.
 * This is intentional - local storage is considered secure (user's device).
 * Server-side encryption is applied when uploading to Supabase.
 *
 * This approach follows industry practice (e.g., Zoom local recordings)
 * and avoids the problem of losing encryption keys when browser closes.
 */

interface StoredRecording {
  id: string;
  blob: ArrayBuffer; // Raw audio data (not encrypted)
  fileName: string;
  duration: number;
  mimeType: string;
  createdAt: number;
  expiresAt: number; // createdAt + TTL
  uploaded: boolean;
  recordingId?: string; // Supabase recording ID if uploaded
  sessionId?: string; // Supabase session ID if uploaded
  uploadError?: string;
  // Legacy fields for backward compatibility with existing encrypted recordings
  encryptedBlob?: ArrayBuffer;
  iv?: ArrayBuffer;
  isEncrypted?: boolean;
}

const DB_NAME = 'psipilot-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';
const TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Initialize IndexedDB database
 * Database is created automatically on first access
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Check if IndexedDB is available
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[LocalStorage] IndexedDB open error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      console.log('[LocalStorage] IndexedDB opened successfully');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      console.log('[LocalStorage] IndexedDB upgrade needed, creating database');
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
        objectStore.createIndex('uploaded', 'uploaded', { unique: false });
        objectStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        console.log('[LocalStorage] Object store and indexes created');
      }
    };
  });
}

/**
 * Check if IndexedDB is available and can be used
 */
export async function isIndexedDBAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }
  
  try {
    // Try to open database to check availability
    await openDB();
    return true;
  } catch (error) {
    console.warn('[LocalStorage] IndexedDB not available:', error);
    return false;
  }
}

/**
 * Clean up expired recordings
 */
async function cleanupExpiredRecordings(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('expiresAt');
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(now));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Error cleaning up expired recordings:', error);
    // Don't throw - cleanup failure shouldn't break the app
  }
}

/**
 * Check IndexedDB quota and available space
 */
async function checkStorageQuota(): Promise<{ available: boolean; reason?: string }> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const availableSpace = quota - used;
      
      // Минимум 50MB должно быть свободно
      const minRequired = 50 * 1024 * 1024; // 50MB
      
      if (availableSpace < minRequired) {
        return {
          available: false,
          reason: `Недостаточно места в хранилище. Свободно: ${Math.round(availableSpace / 1024 / 1024)}MB, требуется: ${Math.round(minRequired / 1024 / 1024)}MB`,
        };
      }
      
      return { available: true };
    } catch (error) {
      console.warn('[LocalStorage] Failed to check quota:', error);
      // Продолжаем, если не можем проверить
      return { available: true };
    }
  }
  
  // Если API недоступен, продолжаем
  return { available: true };
}

/**
 * Save recording to IndexedDB (unencrypted - local storage is trusted)
 */
export async function saveRecordingLocally(
  blob: Blob,
  fileName: string,
  duration: number,
  mimeType: string = 'audio/webm',
  sessionId?: string
): Promise<string> {
  // Проверяем квоту перед сохранением
  const quotaCheck = await checkStorageQuota();
  if (!quotaCheck.available) {
    throw new Error(quotaCheck.reason || 'Недостаточно места в хранилище');
  }

  // Clean up expired recordings first
  await cleanupExpiredRecordings();

  const db = await openDB();
  const id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Store blob as ArrayBuffer (no encryption)
  const arrayBuffer = await blob.arrayBuffer();

  const recording: StoredRecording = {
    id,
    blob: arrayBuffer,
    fileName,
    duration,
    mimeType,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    uploaded: false,
    sessionId,
    isEncrypted: false,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(recording);

    request.onsuccess = () => {
      console.log('[LocalStorage] Recording saved locally:', id);
      resolve(id);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get recording from IndexedDB
 * Handles both new unencrypted recordings and legacy encrypted ones
 */
export async function getLocalRecording(id: string): Promise<{
  blob: Blob;
  fileName: string;
  duration: number;
  mimeType: string;
  createdAt: number;
  uploaded: boolean;
  recordingId?: string;
  sessionId?: string;
  uploadError?: string;
} | null> {
  const db = await openDB();

  const recording = await new Promise<StoredRecording | null>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (!recording) {
    return null;
  }

  // Check if expired
  if (Date.now() > recording.expiresAt) {
    // Delete expired recording
    await deleteLocalRecording(id);
    return null;
  }

  let blob: Blob;

  // Handle legacy encrypted recordings (backward compatibility)
  if (recording.encryptedBlob && recording.iv) {
    try {
      // Dynamically import decryption only when needed for legacy data
      const { decryptBlob } = await import('./recording-encryption');
      blob = await decryptBlob(recording.encryptedBlob, recording.iv, recording.mimeType);
      console.log('[LocalStorage] Decrypted legacy encrypted recording:', id);
    } catch (error) {
      console.error('[LocalStorage] Failed to decrypt legacy recording:', id, error);
      // Cannot recover - encryption key might be lost
      return null;
    }
  } else if (recording.blob) {
    // New unencrypted format
    blob = new Blob([recording.blob], { type: recording.mimeType });
  } else {
    console.error('[LocalStorage] Recording has no blob data:', id);
    return null;
  }

  return {
    blob,
    fileName: recording.fileName,
    duration: recording.duration,
    mimeType: recording.mimeType,
    createdAt: recording.createdAt,
    uploaded: recording.uploaded,
    recordingId: recording.recordingId,
    sessionId: recording.sessionId,
    uploadError: recording.uploadError,
  };
}

/**
 * Mark recording as uploaded
 */
export async function markRecordingUploaded(
  localId: string,
  recordingId: string,
  sessionId: string
): Promise<void> {
  const db = await openDB();
  
  const recording = await new Promise<StoredRecording | null>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(localId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (!recording) {
    throw new Error('Recording not found in local storage');
  }

  recording.uploaded = true;
  recording.recordingId = recordingId;
  recording.sessionId = sessionId;
  delete recording.uploadError;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(recording);

    request.onsuccess = () => {
      console.log('[LocalStorage] Recording marked as uploaded:', localId);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mark recording upload as failed
 */
export async function markRecordingUploadFailed(
  localId: string,
  error: string
): Promise<void> {
  const db = await openDB();
  
  const recording = await new Promise<StoredRecording | null>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(localId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (!recording) {
    throw new Error('Recording not found in local storage');
  }

  recording.uploadError = error;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(recording);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all unuploaded recordings (metadata only, without decryption)
 */
export async function getUnuploadedRecordings(): Promise<Array<{
  id: string;
  fileName: string;
  duration: number;
  createdAt: number;
  uploadError?: string;
}>> {
  const db = await openDB();
  
  // Clean up expired recordings first
  await cleanupExpiredRecordings();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('uploaded');
    
    // Open cursor on the entire index and filter manually
    // Some browsers don't support openCursor with boolean values directly
    const request = index.openCursor();

    const recordings: StoredRecording[] = [];
    const now = Date.now();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const recording = cursor.value as StoredRecording;
        // Filter for unuploaded and non-expired recordings
        if (recording.uploaded === false && recording.expiresAt > now) {
          recordings.push(recording);
        }
        cursor.continue();
      } else {
        // All records processed
        const validRecordings = recordings.map(r => ({
          id: r.id,
          fileName: r.fileName,
          duration: r.duration,
          createdAt: r.createdAt,
          uploadError: r.uploadError,
        }));
        resolve(validRecordings);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete recording from local storage
 */
export async function deleteLocalRecording(id: string): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('[LocalStorage] Recording deleted:', id);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all local recordings (used on logout)
 */
export async function clearAllLocalRecordings(): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.log('[LocalStorage] All recordings cleared');
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Download recording as file (for user to save manually)
 */
export async function downloadLocalRecording(id: string): Promise<void> {
  const recording = await getLocalRecording(id);
  if (!recording) {
    throw new Error('Recording not found');
  }

  const url = URL.createObjectURL(recording.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = recording.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get storage usage (approximate)
 */
export async function getStorageUsage(): Promise<{ count: number; totalSize: number }> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const recordings = (request.result || []) as StoredRecording[];
      const now = Date.now();
      // Only count non-expired recordings
      const validRecordings = recordings.filter(r => r.expiresAt > now);
      const totalSize = validRecordings.reduce((sum, r) => {
        // Handle both new (blob) and legacy (encryptedBlob) formats
        const blobData = r.blob || r.encryptedBlob;
        return sum + (blobData?.byteLength || 0);
      }, 0);
      resolve({
        count: validRecordings.length,
        totalSize,
      });
    };
    request.onerror = () => reject(request.error);
  });
}

