/**
 * Field-level encryption utilities for PHI data
 * Uses Web Crypto API with AES-GCM 256-bit encryption
 * 
 * Security requirements:
 * - Encryption key must be stored securely (environment variable)
 * - Never log encryption keys
 * - Use authenticated encryption (AES-GCM)
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Get encryption key from environment variable
 * Key should be base64 encoded 32-byte key (256 bits)
 */
// Кэш для проверки, чтобы не логировать предупреждение постоянно
let hasWarnedAboutMissingKey = false;

function getEncryptionKey(): string {
  const key = import.meta.env.VITE_ENCRYPTION_KEY;
  
  if (!key) {
    // Логируем предупреждение только один раз, чтобы не засорять консоль
    if (!hasWarnedAboutMissingKey) {
      hasWarnedAboutMissingKey = true;
      console.warn(
        'VITE_ENCRYPTION_KEY environment variable is not set. ' +
        'Encryption features will not work. ' +
        'Generate a key using: openssl rand -base64 32\n' +
        'After adding the key to .env.local, RESTART the dev server!'
      );
    }
    // Return empty string - will fail gracefully when encryption is attempted
    return '';
  }
  
  // Сбрасываем флаг, если ключ найден
  if (hasWarnedAboutMissingKey && key) {
    hasWarnedAboutMissingKey = false;
  }
  
  return key;
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Import encryption key from base64 string
 */
async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(keyBase64);
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random IV (Initialization Vector)
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encrypt PHI data
 *
 * Output format matches backend (Node.js): IV (12) + TAG (16) + CIPHERTEXT
 * This ensures compatibility between frontend and backend encryption.
 *
 * @param plaintext - Plain text data to encrypt
 * @returns Base64 encoded encrypted data (IV + TAG + CIPHERTEXT)
 */
export async function encryptPHI(plaintext: string): Promise<string> {
  if (!plaintext) {
    return '';
  }

  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) {
    throw new Error('Encryption key is not configured. Please set VITE_ENCRYPTION_KEY in .env.local');
  }

  try {
    const key = await importKey(encryptionKey);
    const iv = generateIV();
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Web Crypto returns: ciphertext + tag (tag at the end)
    const encryptedWithTag = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: 128, // 128-bit authentication tag = 16 bytes
      },
      key,
      data
    );

    const encryptedArray = new Uint8Array(encryptedWithTag);

    // Web Crypto format: CIPHERTEXT (variable) + TAG (16 bytes at the end)
    // Backend format: IV (12) + TAG (16) + CIPHERTEXT
    // We need to reorder to match backend

    const ciphertext = encryptedArray.slice(0, encryptedArray.length - 16);
    const tag = encryptedArray.slice(encryptedArray.length - 16);

    // Combine: IV + TAG + CIPHERTEXT (backend format)
    const combined = new Uint8Array(IV_LENGTH + 16 + ciphertext.length);
    combined.set(iv, 0);
    combined.set(tag, IV_LENGTH);
    combined.set(ciphertext, IV_LENGTH + 16);

    // Convert to base64 for storage
    return arrayBufferToBase64(combined.buffer);
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt PHI data');
  }
}

/**
 * Decrypt PHI data
 *
 * Supports two formats:
 * 1. Backend format (Node.js): IV (12) + TAG (16) + CIPHERTEXT
 * 2. Frontend format (Web Crypto): IV (12) + CIPHERTEXT+TAG
 *
 * @param encryptedData - Base64 encoded encrypted data with IV
 * @returns Decrypted plain text
 */
const TAG_LENGTH = 16; // 128-bit authentication tag

export async function decryptPHI(encryptedData: string): Promise<string> {
  if (!encryptedData) {
    return '';
  }

  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) {
    throw new Error('Encryption key is not configured. Please set VITE_ENCRYPTION_KEY in .env.local');
  }

  try {
    const key = await importKey(encryptionKey);
    const combined = base64ToArrayBuffer(encryptedData);
    const combinedArray = new Uint8Array(combined);

    // Backend format: IV (12) + TAG (16) + CIPHERTEXT
    // Web Crypto expects: IV + CIPHERTEXT+TAG (tag at the end)
    // We need to reorder: move TAG from position 12-28 to the end

    const iv = combinedArray.slice(0, IV_LENGTH);
    const tag = combinedArray.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combinedArray.slice(IV_LENGTH + TAG_LENGTH);

    // Web Crypto API expects ciphertext with tag appended at the end
    const ciphertextWithTag = new Uint8Array(ciphertext.length + TAG_LENGTH);
    ciphertextWithTag.set(ciphertext, 0);
    ciphertextWithTag.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: 128,
      },
      key,
      ciphertextWithTag
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt PHI data');
  }
}

/**
 * Check if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    const key = getEncryptionKey();
    return !!key && key.length > 0;
  } catch {
    return false;
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
  return arrayBufferToBase64(key.buffer);
}

