/**
 * Encryption utilities for local audio recording storage
 * Uses Web Crypto API for client-side encryption
 * 
 * SECURITY: Key is stored in sessionStorage and automatically deleted on logout
 * Each recording uses a unique IV (Initialization Vector)
 */

const SESSION_KEY_STORAGE_KEY = 'recording_session_key';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits for GCM)

/**
 * Generate a new encryption key for the session
 * Key is stored in sessionStorage and will be deleted when tab closes
 */
export async function generateSessionKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  // Store key material in sessionStorage for persistence during session
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const keyArray = Array.from(new Uint8Array(exportedKey));
  sessionStorage.setItem(SESSION_KEY_STORAGE_KEY, JSON.stringify(keyArray));

  return key;
}

/**
 * Get the session encryption key
 * Generates a new key if one doesn't exist
 */
export async function getSessionKey(): Promise<CryptoKey> {
  // Try to get existing key from sessionStorage
  const storedKey = sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
  
  if (storedKey) {
    try {
      const keyArray = JSON.parse(storedKey) as number[];
      const keyBuffer = new Uint8Array(keyArray).buffer;
      const key = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        {
          name: ALGORITHM,
          length: KEY_LENGTH,
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      return key;
    } catch (error) {
      console.warn('Failed to import stored session key, generating new one:', error);
      // Fall through to generate new key
    }
  }

  // Generate new key if none exists or import failed
  return generateSessionKey();
}

/**
 * Clear the session encryption key
 * Should be called on logout
 */
export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY);
}

/**
 * Generate a random IV (Initialization Vector) for encryption
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encrypt a Blob using Web Crypto API
 * 
 * @param blob - The Blob to encrypt
 * @returns Object containing encrypted data as ArrayBuffer and IV
 */
export async function encryptBlob(blob: Blob): Promise<{ encryptedData: ArrayBuffer; iv: ArrayBuffer }> {
  const key = await getSessionKey();
  const iv = generateIV();
  
  // Convert Blob to ArrayBuffer
  const arrayBuffer = await blob.arrayBuffer();
  
  // Encrypt the data
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    arrayBuffer
  );

  return {
    encryptedData,
    iv: iv.buffer,
  };
}

/**
 * Decrypt an encrypted ArrayBuffer back to a Blob
 * 
 * @param encryptedData - The encrypted ArrayBuffer
 * @param iv - The Initialization Vector used for encryption
 * @param mimeType - The original MIME type of the Blob
 * @returns Decrypted Blob
 */
export async function decryptBlob(
  encryptedData: ArrayBuffer,
  iv: ArrayBuffer,
  mimeType: string
): Promise<Blob> {
  const key = await getSessionKey();
  const ivArray = new Uint8Array(iv);
  
  // Decrypt the data
  const decryptedData = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: ivArray,
    },
    key,
    encryptedData
  );

  // Convert back to Blob
  return new Blob([decryptedData], { type: mimeType });
}

/**
 * Check if Web Crypto API is available
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.getRandomValues !== 'undefined';
}

