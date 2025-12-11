/**
 * Field-level encryption utilities for PHI data
 *
 * SECURITY: Шифрование выполняется на backend сервере.
 * Ключ шифрования НИКОГДА не передается в браузер.
 */

import { supabase } from './supabase';

// URL backend сервиса
const CRYPTO_API_URL = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

// Кэш статуса шифрования
let encryptionStatusCache: boolean | null = null;
let encryptionStatusCacheTime = 0;
const CACHE_TTL = 60000; // 1 минута

/**
 * Получить токен авторизации для запросов к backend
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Проверить статус шифрования на сервере
 */
export async function isEncryptionConfigured(): Promise<boolean> {
  // Используем кэш
  if (encryptionStatusCache !== null && Date.now() - encryptionStatusCacheTime < CACHE_TTL) {
    return encryptionStatusCache;
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      return false;
    }

    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    encryptionStatusCache = result.data?.configured || false;
    encryptionStatusCacheTime = Date.now();
    return encryptionStatusCache;
  } catch (error) {
    console.error('Failed to check encryption status:', error);
    return false;
  }
}

/**
 * Шифрование PHI данных через backend API
 */
export async function encryptPHI(plaintext: string): Promise<string> {
  if (!plaintext) {
    return '';
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/encrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ data: plaintext }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Encryption failed');
    }

    const result = await response.json();
    return result.data.encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt PHI data');
  }
}

/**
 * Расшифровка PHI данных через backend API
 */
export async function decryptPHI(encryptedData: string): Promise<string> {
  if (!encryptedData) {
    return '';
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ data: encryptedData }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Decryption failed');
    }

    const result = await response.json();
    return result.data.decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt PHI data');
  }
}

/**
 * Batch шифрование массива данных
 */
export async function encryptPHIBatch(items: string[]): Promise<string[]> {
  if (!items || items.length === 0) {
    return [];
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/encrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ data: items }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Batch encryption failed');
    }

    const result = await response.json();
    return result.data.encrypted;
  } catch (error) {
    console.error('Batch encryption error:', error);
    throw new Error('Failed to encrypt PHI data batch');
  }
}

/**
 * Batch расшифровка массива данных
 */
export async function decryptPHIBatch(items: string[]): Promise<string[]> {
  if (!items || items.length === 0) {
    return [];
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ data: items }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Batch decryption failed');
    }

    const result = await response.json();
    return result.data.decrypted;
  } catch (error) {
    console.error('Batch decryption error:', error);
    throw new Error('Failed to decrypt PHI data batch');
  }
}

/**
 * Generate a new encryption key (for setup/rotation)
 * Returns base64 encoded 32-byte key
 *
 * WARNING: Only use this for key generation, not in production code
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (let i = 0; i < key.byteLength; i++) {
    binary += String.fromCharCode(key[i]);
  }
  return btoa(binary);
}
