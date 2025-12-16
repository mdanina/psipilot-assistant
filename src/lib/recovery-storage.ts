/**
 * IndexedDB хранилище для восстановления незавершённых загрузок
 *
 * Позволяет сохранять аудиозаписи локально перед отправкой на сервер,
 * чтобы не потерять данные при закрытии страницы или ошибках сети.
 */

const DB_NAME = 'psipilot_recovery';
const DB_VERSION = 1;
const STORE_NAME = 'pending_uploads';
const MAX_AGE_HOURS = 24;

export interface PendingUpload {
  id: string;
  blob: Blob;
  metadata: {
    sessionId?: string;
    patientId?: string;
    duration: number;
    fileName?: string;
    createdAt: number;
  };
}

class RecoveryStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Инициализация базы данных
   */
  async init(): Promise<void> {
    // Предотвращаем множественные инициализации
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.db) {
      return Promise.resolve();
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          console.error('[RecoveryStorage] Failed to open database:', request.error);
          this.initPromise = null;
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;

          // Обработка закрытия соединения
          this.db.onclose = () => {
            console.warn('[RecoveryStorage] Database connection closed');
            this.db = null;
            this.initPromise = null;
          };

          this.db.onerror = (event) => {
            console.error('[RecoveryStorage] Database error:', event);
          };

          console.log('[RecoveryStorage] Database initialized');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('createdAt', 'metadata.createdAt', { unique: false });
            console.log('[RecoveryStorage] Object store created');
          }
        };
      } catch (error) {
        console.error('[RecoveryStorage] Initialization error:', error);
        this.initPromise = null;
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * Проверка доступности IndexedDB
   */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  /**
   * Сохранение записи для восстановления
   */
  async save(upload: PendingUpload): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('[RecoveryStorage] IndexedDB not available');
      return;
    }

    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const request = store.put(upload);

        request.onsuccess = () => {
          console.log('[RecoveryStorage] Saved upload:', upload.id);
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.error('[RecoveryStorage] Save error:', tx.error);
          reject(tx.error);
        };
      } catch (error) {
        console.error('[RecoveryStorage] Save exception:', error);
        reject(error);
      }
    });
  }

  /**
   * Получение всех pending uploads (не старше MAX_AGE_HOURS)
   */
  async getAll(): Promise<PendingUpload[]> {
    if (!this.isAvailable()) {
      return [];
    }

    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const now = Date.now();
          const maxAge = MAX_AGE_HOURS * 60 * 60 * 1000;

          // Фильтруем устаревшие записи
          const valid = (request.result as PendingUpload[]).filter(
            upload => now - upload.metadata.createdAt < maxAge
          );

          console.log('[RecoveryStorage] Retrieved', valid.length, 'valid uploads');
          resolve(valid);
        };

        request.onerror = () => {
          console.error('[RecoveryStorage] GetAll error:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('[RecoveryStorage] GetAll exception:', error);
        resolve([]);
      }
    });
  }

  /**
   * Получение одной записи по ID
   */
  async get(id: string): Promise<PendingUpload | null> {
    if (!this.isAvailable()) {
      return null;
    }

    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
          const upload = request.result as PendingUpload | undefined;

          if (upload) {
            const now = Date.now();
            const maxAge = MAX_AGE_HOURS * 60 * 60 * 1000;

            // Проверяем срок годности
            if (now - upload.metadata.createdAt >= maxAge) {
              resolve(null);
              return;
            }
          }

          resolve(upload || null);
        };

        request.onerror = () => {
          console.error('[RecoveryStorage] Get error:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('[RecoveryStorage] Get exception:', error);
        resolve(null);
      }
    });
  }

  /**
   * Удаление записи по ID (после успешной загрузки)
   */
  async remove(id: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);

        tx.oncomplete = () => {
          console.log('[RecoveryStorage] Removed upload:', id);
          resolve();
        };

        tx.onerror = () => {
          console.error('[RecoveryStorage] Remove error:', tx.error);
          reject(tx.error);
        };
      } catch (error) {
        console.error('[RecoveryStorage] Remove exception:', error);
        reject(error);
      }
    });
  }

  /**
   * Очистка устаревших записей
   */
  async cleanup(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    await this.init();

    const all = await this.getAll();
    const now = Date.now();
    const maxAge = MAX_AGE_HOURS * 60 * 60 * 1000;
    let removed = 0;

    // getAll уже фильтрует, но нам нужно удалить устаревшие
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(0);
        return;
      }

      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor) {
            const upload = cursor.value as PendingUpload;

            if (now - upload.metadata.createdAt >= maxAge) {
              cursor.delete();
              removed++;
              console.log('[RecoveryStorage] Cleaned up expired upload:', upload.id);
            }

            cursor.continue();
          }
        };

        tx.oncomplete = () => {
          console.log('[RecoveryStorage] Cleanup complete, removed:', removed);
          resolve(removed);
        };

        tx.onerror = () => {
          console.error('[RecoveryStorage] Cleanup error:', tx.error);
          reject(tx.error);
        };
      } catch (error) {
        console.error('[RecoveryStorage] Cleanup exception:', error);
        resolve(removed);
      }
    });
  }

  /**
   * Получение количества pending uploads
   */
  async count(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    await this.init();

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(0);
        return;
      }

      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          resolve(0);
        };
      } catch {
        resolve(0);
      }
    });
  }
}

// Singleton экспорт
export const recoveryStorage = new RecoveryStorage();

/**
 * Генерация уникального ID для upload
 */
export function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
