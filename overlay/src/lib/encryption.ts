/**
 * Field-level encryption utilities for PHI data
 * Uses backend crypto API for decryption
 */

import { supabase } from './supabase';

// URL backend сервиса
const CRYPTO_API_URL = import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

/**
 * Получить заголовки для аутентификации
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  // Получаем текущую сессию
  const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
  let session = currentSession;
  
  if (sessionError) {
    console.error('Error getting session:', sessionError);
    throw new Error('Session error: ' + sessionError.message);
  }
  
  // Если сессии нет, пытаемся обновить
  if (!session) {
    console.warn('No session found, attempting to refresh...');
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError || !refreshedSession) {
      console.error('Failed to refresh session:', refreshError);
      throw new Error('Not authenticated: Please log in again');
    }
    
    session = refreshedSession;
  }
  
  if (!session?.access_token) {
    throw new Error('Not authenticated: No access token');
  }
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/**
 * Расшифровать PHI данные через backend API
 */
export async function decryptPHI(encryptedData: string): Promise<string> {
  if (!encryptedData) {
    return '';
  }

  if (!CRYPTO_API_URL) {
    console.warn('CRYPTO_API_URL not configured, cannot decrypt');
    return encryptedData;
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: encryptedData }),
    });

    if (!response.ok) {
      // Обработка 401 - токен истек, пытаемся обновить
      if (response.status === 401) {
        console.warn('Token expired, attempting to refresh...');
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshedSession?.access_token) {
          throw new Error('Unauthorized: Please log in again');
        }
        
        // Повторяем запрос с новым токеном
        const newHeaders = await getAuthHeaders();
        const retryResponse = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
          method: 'POST',
          headers: newHeaders,
          body: JSON.stringify({ data: encryptedData }),
        });
        
        if (!retryResponse.ok) {
          const errorText = await retryResponse.text();
          throw new Error(`Decryption failed: ${retryResponse.status} ${errorText}`);
        }
        
        const result = await retryResponse.json();
        return result.data?.decrypted || encryptedData;
      }
      
      const errorText = await response.text();
      throw new Error(`Decryption failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result.data?.decrypted || encryptedData;
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}

/**
 * Batch расшифровка нескольких значений
 */
export async function decryptPHIBatch(values: string[]): Promise<string[]> {
  if (values.length === 0) {
    return [];
  }

  if (!CRYPTO_API_URL) {
    console.warn('CRYPTO_API_URL not configured, cannot decrypt');
    return values;
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: values }),
    });

    if (!response.ok) {
      // Обработка 401 - токен истек, пытаемся обновить
      if (response.status === 401) {
        console.warn('Token expired, attempting to refresh...');
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshedSession?.access_token) {
          throw new Error('Unauthorized: Please log in again');
        }
        
        // Повторяем запрос с новым токеном
        const newHeaders = await getAuthHeaders();
        const retryResponse = await fetch(`${CRYPTO_API_URL}/api/crypto/decrypt`, {
          method: 'POST',
          headers: newHeaders,
          body: JSON.stringify({ data: values }),
        });
        
        if (!retryResponse.ok) {
          const errorText = await retryResponse.text();
          throw new Error(`Batch decryption failed: ${retryResponse.status} ${errorText}`);
        }
        
        const result = await retryResponse.json();
        const decrypted = result.data?.decrypted;
        
        if (!Array.isArray(decrypted)) {
          throw new Error('Backend returned invalid decrypted data format');
        }
        
        return decrypted;
      }
      
      const errorText = await response.text();
      throw new Error(`Batch decryption failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    const decrypted = result.data?.decrypted;
    
    if (!Array.isArray(decrypted)) {
      throw new Error('Backend returned invalid decrypted data format');
    }

    return decrypted;
  } catch (error) {
    console.error('Batch decryption error:', error);
    throw error;
  }
}
