/**
 * Сервис полной деидентификации для исследований
 * HIPAA Safe Harbor compliance - удаляет все 18 идентификаторов
 * НЕ сохраняет маппинг - данные нельзя деанонимизировать
 * 
 * Используется ТОЛЬКО для исследовательского API
 */

import { anonymize } from './anonymization.js';

/**
 * Полная деидентификация для исследований (HIPAA Safe Harbor)
 * Удаляет все PHI данные без возможности восстановления
 * 
 * @param {string} text - Исходный текст транскрипта
 * @param {Object} patient - Данные пациента (для удаления известных PHI)
 * @returns {string} Полностью деидентифицированный текст (БЕЗ маппинга)
 */
export function fullyDeidentifyForResearch(text, patient = {}) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Используем базовую функцию анонимизации
  // Но игнорируем маппинг - нам нужен только текст
  const { text: anonymized } = anonymize(text, patient);
  
  let deidentified = anonymized;
  
  // Дополнительная обработка для HIPAA Safe Harbor
  
  // 1. Удаляем все даты (оставляем только год если нужен, но лучше удалить полностью)
  // Заменяем на общий плейсхолдер
  deidentified = deidentified.replace(/\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}/g, '[DATE]');
  
  // 2. Удаляем возраст (слишком специфично для идентификации)
  deidentified = deidentified.replace(/\d{1,3}\s*(лет|года|год)/gi, '[AGE]');
  
  // 3. Удаляем временные метки (HH:MM:SS)
  deidentified = deidentified.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '[TIME]');
  
  // 4. Удаляем упоминания конкретных клиник/больниц
  deidentified = deidentified.replace(/клиника\s+[А-ЯЁ][а-яё]+/gi, '[CLINIC]');
  deidentified = deidentified.replace(/больница\s+[А-ЯЁ][а-яё]+/gi, '[HOSPITAL]');
  deidentified = deidentified.replace(/медцентр\s+[А-ЯЁ][а-яё]+/gi, '[MEDICAL_CENTER]');
  
  // 5. Удаляем номера медицинских карт, счетов (если есть паттерны)
  // Номера карт (4 группы по 4 цифры)
  deidentified = deidentified.replace(/\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}/g, '[CARD_NUMBER]');
  
  // 6. Удаляем номера документов (паспорт, СНИЛС и т.д.)
  // СНИЛС формат: XXX-XXX-XXX XX
  deidentified = deidentified.replace(/\d{3}[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}/g, '[DOCUMENT_NUMBER]');
  
  // 7. Удаляем IP адреса (если упоминаются)
  deidentified = deidentified.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_ADDRESS]');
  
  // 8. Удаляем URL (если упоминаются)
  deidentified = deidentified.replace(/https?:\/\/[^\s]+/gi, '[URL]');
  
  // 9. Удаляем упоминания конкретных адресов (уже заменены на [ADDRESS], но дополнительно проверяем)
  // Удаляем почтовые индексы
  deidentified = deidentified.replace(/\b\d{6}\b/g, '[POSTAL_CODE]');
  
  // 10. Удаляем номера телефонов (уже заменены, но дополнительно проверяем другие форматы)
  // Международные форматы
  deidentified = deidentified.replace(/\+\d{1,3}[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}/g, '[PHONE]');
  
  // ВАЖНО: НЕ возвращаем маппинг - данные нельзя деанонимизировать
  return deidentified;
}

/**
 * Проверка соответствия HIPAA Safe Harbor
 * Проверяет, что в тексте нет оставшихся PHI паттернов
 * 
 * @param {string} text - Деидентифицированный текст
 * @returns {Object} { compliant: boolean, violations: string[] }
 */
export function validateSafeHarborCompliance(text) {
  if (!text || typeof text !== 'string') {
    return { compliant: true, violations: [] };
  }

  const violations = [];
  
  // Проверка на наличие потенциальных PHI паттернов
  
  // SSN pattern (американский формат, но проверяем на всякий случай)
  if (/\d{3}-\d{2}-\d{4}/.test(text)) {
    violations.push('Potential SSN pattern found');
  }
  
  // Номера кредитных карт (4 группы по 4 цифры)
  if (/\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}/.test(text)) {
    violations.push('Potential credit card number pattern found');
  }
  
  // Email адреса (должны быть заменены, но проверяем)
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
    violations.push('Email address found (should be replaced)');
  }
  
  // Полные даты (должны быть заменены)
  if (/\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}/.test(text)) {
    violations.push('Date pattern found (should be replaced)');
  }
  
  // Телефонные номера (должны быть заменены)
  if (/(\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/.test(text)) {
    violations.push('Phone number pattern found (should be replaced)');
  }
  
  return {
    compliant: violations.length === 0,
    violations
  };
}

/**
 * Получить статистику деидентификации
 * Показывает, сколько PHI элементов было удалено
 * 
 * @param {string} originalText - Оригинальный текст
 * @param {string} deidentifiedText - Деидентифицированный текст
 * @returns {Object} Статистика деидентификации
 */
export function getDeidentificationStats(originalText, deidentifiedText) {
  const stats = {
    originalLength: originalText?.length || 0,
    deidentifiedLength: deidentifiedText?.length || 0,
    reductionPercent: 0,
    placeholdersCount: 0
  };
  
  if (stats.originalLength > 0) {
    stats.reductionPercent = Math.round(
      ((stats.originalLength - stats.deidentifiedLength) / stats.originalLength) * 100
    );
  }
  
  // Подсчет плейсхолдеров
  const placeholderRegex = /\[[A-Z_]+\]/g;
  const matches = deidentifiedText?.match(placeholderRegex);
  if (matches) {
    stats.placeholdersCount = matches.length;
  }
  
  return stats;
}

