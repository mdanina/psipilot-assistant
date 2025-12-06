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

// Cache for imported CryptoKey to avoid repeated imports
let cachedKey: CryptoKey | null = null;
let cachedKeyBase64: string | null = null;

/**
 * Get encryption key from environment variable
 * Key should be base64 encoded 32-byte key (256 bits)
 */
function getEncryptionKey(): string {
  const key = import.meta.env.VITE_ENCRYPTION_KEY;
  
  if (!key) {
    // Don't throw error immediately - allow app to load
    // Error will be thrown when encryption is actually attempted
    console.warn(
      'VITE_ENCRYPTION_KEY environment variable is not set. ' +
      'Encryption features will not work. ' +
      'Generate a key using: openssl rand -base64 32'
    );
    // Return empty string - will fail gracefully when encryption is attempted
    return '';
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
 * Import encryption key from base64 string with caching
 */
async function importKey(keyBase64: string): Promise<CryptoKey> {
  // Return cached key if it matches the current key
  if (cachedKey && cachedKeyBase64 === keyBase64) {
    return cachedKey;
  }

  const keyData = base64ToArrayBuffer(keyBase64);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );

  // Cache the imported key
  cachedKey = key;
  cachedKeyBase64 = keyBase64;

  return key;
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
 * @param plaintext - Plain text data to encrypt
 * @returns Base64 encoded encrypted data with IV prepended
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

    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: 128, // 128-bit authentication tag
      },
      key,
      data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

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
 * @param encryptedData - Base64 encoded encrypted data with IV
 * @returns Decrypted plain text
 */
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

    // Extract IV and encrypted data
    const iv = combinedArray.slice(0, IV_LENGTH);
    const encrypted = combinedArray.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: 128,
      },
      key,
      encrypted
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

