import crypto from 'crypto';

/**
 * Сервис шифрования для PHI данных
 * Использует AES-GCM 256-bit шифрование (Node.js crypto)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag
const SALT_LENGTH = 64;

/**
 * Получить ключ шифрования из переменной окружения
 * Ключ должен быть base64-encoded 32-byte ключ (256 bits)
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set. Please set it in .env file.');
  }
  
  // Декодируем base64 ключ
  try {
    return Buffer.from(key, 'base64');
  } catch (error) {
    throw new Error('Invalid ENCRYPTION_KEY format. Key must be base64-encoded 32-byte key.');
  }
}

/**
 * Шифрует данные с использованием AES-GCM 256
 * Формат совместим с Web Crypto API (frontend)
 *
 * @param {string} plaintext - Открытый текст для шифрования
 * @returns {string} Base64-encoded зашифрованные данные (IV + ciphertext + tag)
 */
export function encrypt(plaintext) {
  if (!plaintext) {
    return '';
  }

  try {
    const key = getEncryptionKey();

    // Генерируем случайный IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Создаем cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Шифруем данные
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);

    // Получаем authentication tag
    const tag = cipher.getAuthTag();

    // Объединяем IV + ciphertext + tag
    // Формат совместим с Web Crypto API: IV (12 bytes) + ENCRYPTED + TAG (16 bytes)
    const combined = Buffer.concat([
      iv,
      encrypted,
      tag
    ]);

    // Debug logging
    console.log('[Encrypt] IV length:', iv.length);
    console.log('[Encrypt] Ciphertext length:', encrypted.length);
    console.log('[Encrypt] Tag length:', tag.length);
    console.log('[Encrypt] Total combined length:', combined.length);

    // Возвращаем base64-encoded результат
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Расшифровывает данные с использованием AES-GCM 256
 * Формат совместим с Web Crypto API (frontend)
 *
 * @param {string} encryptedData - Base64-encoded зашифрованные данные
 * @returns {string} Расшифрованный открытый текст
 */
export function decrypt(encryptedData) {
  if (!encryptedData) {
    return '';
  }

  try {
    const key = getEncryptionKey();

    // Декодируем base64
    const combined = Buffer.from(encryptedData, 'base64');

    // Извлекаем компоненты (формат Web Crypto API: IV + ciphertext + tag)
    const iv = combined.slice(0, IV_LENGTH);
    const tag = combined.slice(-TAG_LENGTH); // tag в конце
    const encrypted = combined.slice(IV_LENGTH, -TAG_LENGTH);

    // Создаем decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Расшифровываем данные
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Проверяет, настроено ли шифрование
 * 
 * @returns {boolean}
 */
export function isEncryptionConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch (error) {
    return false;
  }
}
