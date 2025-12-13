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

    // Возвращаем base64-encoded результат
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Проверяет, является ли строка валидным base64
 */
function isValidBase64(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }
  
  // Проверяем базовый формат base64
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) {
    return false;
  }
  
  // Проверяем минимальную длину (IV + минимальный ciphertext + tag)
  // Минимум: 12 (IV) + 1 (минимум ciphertext) + 16 (tag) = 29 байт
  // В base64 это примерно 39 символов
  try {
    const decoded = Buffer.from(str, 'base64');
    const minLength = IV_LENGTH + 1 + TAG_LENGTH; // 29 байт минимум
    return decoded.length >= minLength;
  } catch {
    return false;
  }
}

/**
 * Расшифровывает данные с использованием AES-GCM 256
 * Формат совместим с Web Crypto API (frontend)
 *
 * @param {string} encryptedData - Base64-encoded зашифрованные данные
 * @returns {string} Расшифрованный открытый текст
 * @throws {Error} Если данные не могут быть расшифрованы
 */
export function decrypt(encryptedData) {
  if (!encryptedData) {
    return '';
  }

  // Валидация формата перед попыткой расшифровки
  if (!isValidBase64(encryptedData)) {
    throw new Error('Invalid encrypted data format: not a valid base64 string or too short');
  }

  try {
    const key = getEncryptionKey();

    // Декодируем base64
    let combined;
    try {
      combined = Buffer.from(encryptedData, 'base64');
    } catch (error) {
      throw new Error('Invalid base64 encoding');
    }

    // Проверяем минимальную длину данных
    const minLength = IV_LENGTH + TAG_LENGTH; // Минимум IV + tag
    if (combined.length < minLength) {
      throw new Error(`Invalid encrypted data: too short (minimum ${minLength} bytes, got ${combined.length})`);
    }

    // Извлекаем компоненты (формат Web Crypto API: IV + ciphertext + tag)
    const iv = combined.slice(0, IV_LENGTH);
    const tag = combined.slice(-TAG_LENGTH); // tag в конце
    const encrypted = combined.slice(IV_LENGTH, -TAG_LENGTH);

    // Проверяем, что есть данные для расшифровки
    if (encrypted.length === 0) {
      throw new Error('Invalid encrypted data: no ciphertext found');
    }

    // Создаем decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Расшифровываем данные
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // Если это уже наша ошибка валидации, пробрасываем дальше
    if (error.message && (
      error.message.includes('Invalid encrypted data') ||
      error.message.includes('Invalid base64') ||
      error.message.includes('too short')
    )) {
      throw error;
    }
    
    // Для ошибок расшифровки (неправильный ключ, поврежденные данные и т.д.)
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data: data may be corrupted, encrypted with different key, or already decrypted');
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




