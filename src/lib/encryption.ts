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
const CRYPTO_API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

// Кэш статуса шифрования
let encryptionStatusCache: boolean | null = null;
let encryptionStatusCacheTime = 0;
const CACHE_TTL = 60000; // 1 минута

/**
 * Получить заголовки для аутентификации
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Error getting Supabase session:', sessionError);
      throw new Error(`Session error: ${sessionError.message}`);
    }
    
    if (!session?.access_token) {
      const errorMessage = 'Not authenticated: No valid session token. Please log in again.';
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    };
  } catch (error) {
    // Re-throw with more context if it's already an Error
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to get authentication headers');
  }
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
      // Handle 401 Unauthorized specifically
      if (response.status === 401) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = error.error || 'Unauthorized: Invalid or expired authentication token';
        console.error('Encryption authentication error:', errorMessage);
        throw new Error(`Unauthorized: ${errorMessage}. Please log in again.`);
      }
      
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
    
    // If it's already a detailed error message, re-throw it
    if (error instanceof Error && (message.includes('Unauthorized') || message.includes('Not authenticated') || message.includes('Session error'))) {
      throw error;
    }
    
    throw new Error(`Failed to encrypt PHI data: ${message}`);
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
      // Handle 401 Unauthorized specifically
      if (response.status === 401) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = error.error || 'Unauthorized: Invalid or expired authentication token';
        console.error('Decryption authentication error:', errorMessage);
        throw new Error(`Unauthorized: ${errorMessage}. Please log in again.`);
      }
      
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
    
    // If it's already a detailed error message, re-throw it
    if (error instanceof Error && (message.includes('Unauthorized') || message.includes('Not authenticated') || message.includes('Session error'))) {
      throw error;
    }
    
    throw new Error(`Failed to decrypt PHI data: ${message}`);
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
      // Handle 401 Unauthorized specifically
      if (response.status === 401) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = error.error || 'Unauthorized: Invalid or expired authentication token';
        console.error('Batch encryption authentication error:', errorMessage);
        throw new Error(`Unauthorized: ${errorMessage}. Please log in again.`);
      }
      
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
    
    // If it's already a detailed error message, re-throw it
    if (error instanceof Error && (message.includes('Unauthorized') || message.includes('Not authenticated') || message.includes('Session error'))) {
      throw error;
    }
    
    throw new Error(`Failed to encrypt PHI data batch: ${message}`);
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
    console.log('[decryptPHIBatch] Decrypting batch:', { count: values.length, firstValueLength: values[0]?.length || 0 });
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ data: values }),
    });

    if (!response.ok) {
      // Handle 401 Unauthorized specifically
      if (response.status === 401) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = error.error || 'Unauthorized: Invalid or expired authentication token';
        console.error('Batch decryption authentication error:', errorMessage);
        throw new Error(`Unauthorized: ${errorMessage}. Please log in again.`);
      }
      
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      console.error('[decryptPHIBatch] Backend returned error:', result.error);
      throw new Error(result.error || 'Batch decryption failed');
    }

    const decrypted = result.data?.decrypted;
    console.log('[decryptPHIBatch] Backend response:', { 
      success: result.success,
      hasData: !!result.data,
      hasDecrypted: !!decrypted,
      decryptedType: typeof decrypted,
      isArray: Array.isArray(decrypted),
      decryptedCount: Array.isArray(decrypted) ? decrypted.length : 'not array',
      firstDecryptedLength: Array.isArray(decrypted) && decrypted[0] !== undefined ? (decrypted[0]?.length || 0) : 'N/A',
      firstDecryptedValue: Array.isArray(decrypted) && decrypted[0] !== undefined ? `"${String(decrypted[0]).substring(0, 50)}..."` : 'N/A',
      fullResult: result
    });

    if (!Array.isArray(decrypted)) {
      console.error('[decryptPHIBatch] Backend did not return an array:', decrypted);
      throw new Error('Backend returned invalid decrypted data format');
    }

    return decrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Batch decryption error:', message);
    
    // If it's already a detailed error message, re-throw it
    if (error instanceof Error && (message.includes('Unauthorized') || message.includes('Not authenticated') || message.includes('Session error'))) {
      throw error;
    }
    
    throw new Error(`Failed to decrypt PHI data batch: ${message}`);
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
