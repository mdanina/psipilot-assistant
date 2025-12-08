/**
 * Helper для унифицированной работы с транскриптами
 * Обеспечивает единый подход к расшифровке во всех endpoints
 */

import { decrypt } from './encryption.js';

/**
 * Расшифровывает транскрипт записи, используя явный флаг или fallback на эвристику
 *
 * @param {Object} recording - Объект записи из БД
 * @param {string} recording.id - ID записи
 * @param {string} recording.transcription_text - Текст транскрипта
 * @param {boolean} [recording.transcription_encrypted] - Явный флаг шифрования
 * @param {string} [recording.file_name] - Имя файла для логирования
 * @returns {string} Расшифрованный текст или исходный текст
 */
export function decryptTranscript(recording) {
  if (!recording?.transcription_text) {
    return '';
  }

  const { id, transcription_text, transcription_encrypted, file_name } = recording;
  const logPrefix = `[TranscriptHelper] Recording ${id}${file_name ? ` (${file_name})` : ''}`;

  // Если явно указано, что зашифровано - расшифровываем
  if (transcription_encrypted === true) {
    try {
      const decrypted = decrypt(transcription_text);
      console.log(`${logPrefix}: Decrypted using explicit flag, length: ${decrypted.length}`);
      return decrypted;
    } catch (err) {
      console.error(`${logPrefix}: Failed to decrypt (flag=true):`, err.message);
      return '';
    }
  }

  // Если явно указано, что НЕ зашифровано - возвращаем как есть
  if (transcription_encrypted === false) {
    console.log(`${logPrefix}: Using plaintext (flag=false), length: ${transcription_text.length}`);
    return transcription_text;
  }

  // Fallback: эвристика для старых записей без флага (transcription_encrypted IS NULL)
  // Это нужно для обратной совместимости с данными до миграции 027
  const isLikelyEncrypted = isEncryptedHeuristic(transcription_text);

  if (isLikelyEncrypted) {
    try {
      const decrypted = decrypt(transcription_text);
      console.log(`${logPrefix}: Decrypted using heuristic, length: ${decrypted.length}`);
      return decrypted;
    } catch (err) {
      // Эвристика дала false positive - используем как plaintext
      console.warn(`${logPrefix}: Heuristic false positive, using as plaintext:`, err.message);
      return transcription_text;
    }
  }

  // Не зашифровано по эвристике
  console.log(`${logPrefix}: Using plaintext (heuristic), length: ${transcription_text.length}`);
  return transcription_text;
}

/**
 * Эвристика для определения, зашифрован ли текст
 * Используется только для старых записей без явного флага
 *
 * @param {string} text - Текст для проверки
 * @returns {boolean}
 */
function isEncryptedHeuristic(text) {
  if (!text || text.length < 50) {
    return false;
  }

  // Зашифрованные данные в base64:
  // - Длиннее 100 символов
  // - Содержат только base64 символы
  // - Не содержат типичных для транскриптов символов (двоеточие, перенос строки)
  return (
    text.length > 100 &&
    /^[A-Za-z0-9+/=]+$/.test(text) &&
    !text.includes(':') &&
    !text.includes('\n')
  );
}

/**
 * Извлекает и расшифровывает транскрипты из массива записей
 *
 * @param {Array} recordings - Массив записей из БД
 * @returns {string} Объединённый текст всех транскриптов
 */
export function extractTranscriptsFromRecordings(recordings) {
  if (!recordings || recordings.length === 0) {
    return '';
  }

  const transcripts = recordings
    .map(recording => decryptTranscript(recording))
    .filter(Boolean);

  if (transcripts.length === 0) {
    console.warn('[TranscriptHelper] No valid transcripts after processing');
    return '';
  }

  const combined = transcripts.join('\n\n');
  console.log(`[TranscriptHelper] Combined ${transcripts.length} transcripts, total length: ${combined.length}`);

  return combined;
}
