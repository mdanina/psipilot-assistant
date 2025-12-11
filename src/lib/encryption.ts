/**
 * Field-level encryption utilities for PHI data
 *
 * SECURITY: Шифрование выполняется на backend сервере.
 * Ключ шифрования НИКОГДА не передается в браузер.
 *
 * Этот модуль является клиентом для backend crypto API.
 */

import { supabase } from './supabase';

// URL backend сервиса
const CRYPTO_API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

// Кэш статуса шифрования
let encryptionStatusCache: boolean | null = null;
let encryptionStatusCacheTime = 0;
const CACHE_TTL = 60000; // 1 минута

/**
 * Получить заголовки для аутентификации
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/**
 * Encrypt PHI data using backend service
 *
 * @param plaintext - Plain text data to encrypt
 * @returns Base64 encoded encrypted data
 */
export async function encryptPHI(plaintext: string): Promise<string> {
  if (!plaintext) {
    return '';
  }

  try {
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/encrypt`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ data: plaintext }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Encryption failed');
    }

    return result.data.encrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Encryption error:', message);
    throw new Error('Failed to encrypt PHI data');
  }
}

/**
 * Decrypt PHI data using backend service
 *
 * @param encryptedData - Base64 encoded encrypted data
 * @returns Decrypted plain text
 */
export async function decryptPHI(encryptedData: string): Promise<string> {
  if (!encryptedData) {
    return '';
  }

  try {
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ data: encryptedData }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Decryption failed');
    }

    return result.data.decrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Decryption error:', message);
    throw new Error('Failed to decrypt PHI data');
  }
}

/**
 * Batch encrypt multiple values
 * More efficient than calling encryptPHI multiple times
 *
 * @param values - Array of plain text values to encrypt
 * @returns Array of encrypted values
 */
export async function encryptPHIBatch(values: string[]): Promise<string[]> {
  if (!values || values.length === 0) {
    return [];
  }

  try {
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/encrypt`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ data: values }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Batch encryption failed');
    }

    return result.data.encrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Batch encryption error:', message);
    throw new Error('Failed to encrypt PHI data batch');
  }
}

/**
 * Batch decrypt multiple values
 * More efficient than calling decryptPHI multiple times
 *
 * @param values - Array of encrypted values to decrypt
 * @returns Array of decrypted values
 */
export async function decryptPHIBatch(values: string[]): Promise<string[]> {
  if (!values || values.length === 0) {
    return [];
  }

  try {
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ data: values }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Batch decryption failed');
    }

    return result.data.decrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Batch decryption error:', message);
    throw new Error('Failed to decrypt PHI data batch');
  }
}

/**
 * Check if encryption is properly configured on the backend
 * Results are cached for 1 minute to reduce API calls
 */
export async function isEncryptionConfiguredAsync(): Promise<boolean> {
  // Проверяем кэш
  const now = Date.now();
  if (encryptionStatusCache !== null && (now - encryptionStatusCacheTime) < CACHE_TTL) {
    return encryptionStatusCache;
  }

  try {
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/status`, {
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      encryptionStatusCache = false;
      encryptionStatusCacheTime = now;
      return false;
    }

    const result = await response.json();
    encryptionStatusCache = result.success && result.data?.configured === true;
    encryptionStatusCacheTime = now;
    return encryptionStatusCache;
  } catch {
    encryptionStatusCache = false;
    encryptionStatusCacheTime = now;
    return false;
  }
}

/**
 * Check if encryption is properly configured
 * Returns cached value or true by default (assumes backend is configured)
 *
 * This is a synchronous version for backward compatibility.
 * For accurate check, use isEncryptionConfiguredAsync()
 */
export function isEncryptionConfigured(): boolean {
  // Возвращаем кэшированное значение или true по умолчанию
  // Шифрование теперь на backend, так что предполагаем что настроено
  return encryptionStatusCache ?? true;
}

/**
 * Clear the encryption status cache
 * Call this if you need to force a fresh check
 */
export function clearEncryptionStatusCache(): void {
  encryptionStatusCache = null;
  encryptionStatusCacheTime = 0;
}
