/**
 * Сервис анонимизации PHI данных
 * Заменяет персональные данные на плейсхолдеры перед отправкой в OpenAI
 */

/**
 * Заменяет все вхождения строки в тексте с учётом границ слов.
 * Используем Unicode-aware regex вместо \b (который не работает с кириллицей).
 * Lookbehind/lookahead проверяют, что совпадение не внутри слова.
 */
function replaceAll(str, search, replace) {
  if (!search || search.length === 0) return str;
  // Экранируем спецсимволы regex
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Unicode-aware word boundary для кириллицы и латиницы:
  // (?<![а-яёА-ЯЁa-zA-Z]) — перед совпадением нет буквы
  // (?![а-яёА-ЯЁa-zA-Z]) — после совпадения нет буквы
  const wordBoundaryRegex = new RegExp(
    `(?<![а-яёА-ЯЁa-zA-Z])${escaped}(?![а-яёА-ЯЁa-zA-Z])`,
    'g'
  );
  return str.replace(wordBoundaryRegex, replace);
}

/**
 * Анонимизирует текст, заменяя PHI данные на плейсхолдеры
 * 
 * @param {string} text - Исходный текст
 * @param {Object} patient - Данные пациента
 * @param {string} patient.name - Имя пациента
 * @param {string} [patient.email] - Email пациента
 * @param {string} [patient.phone] - Телефон пациента
 * @param {string} [patient.address] - Адрес пациента
 * @param {string} [patient.date_of_birth] - Дата рождения
 * @returns {Object} { text: string, map: Record<string, string> }
 */
export function anonymize(text, patient = {}) {
  const map = {};
  let anonymized = text;
  let relativeCounter = 1;
  let dateCounter = 1;

  // 1. Заменяем известные данные пациента
  if (patient.name) {
    anonymized = replaceAll(anonymized, patient.name, '[PATIENT_NAME]');
    map['[PATIENT_NAME]'] = patient.name;

    // Также заменяем имя и фамилию по отдельности
    const nameParts = patient.name.split(' ').filter(part => part.length > 2);
    nameParts.forEach((part, i) => {
      anonymized = replaceAll(anonymized, part, `[PATIENT_NAME_PART_${i}]`);
      map[`[PATIENT_NAME_PART_${i}]`] = part;
    });
  }

  if (patient.phone) {
    anonymized = replaceAll(anonymized, patient.phone, '[PHONE]');
    map['[PHONE]'] = patient.phone;
  }

  if (patient.email) {
    anonymized = replaceAll(anonymized, patient.email, '[EMAIL]');
    map['[EMAIL]'] = patient.email;
  }

  if (patient.address) {
    anonymized = replaceAll(anonymized, patient.address, '[ADDRESS]');
    map['[ADDRESS]'] = patient.address;
  }

  if (patient.date_of_birth) {
    anonymized = replaceAll(anonymized, patient.date_of_birth, '[DOB]');
    map['[DOB]'] = patient.date_of_birth;
  }

  // 2. Regex паттерны для телефонов (российские форматы)
  const phoneRegex = /(\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g;
  anonymized = anonymized.replace(phoneRegex, (match) => {
    if (!map['[PHONE]']) {
      map['[PHONE]'] = match;
    }
    return '[PHONE]';
  });

  // 3. Regex для email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  anonymized = anonymized.replace(emailRegex, (match) => {
    if (!map['[EMAIL]']) {
      map['[EMAIL]'] = match;
    }
    return '[EMAIL]';
  });

  // 4. Regex для дат (дд.мм.гггг, дд/мм/гггг, дд-мм-гггг)
  const dateRegex = /\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}/g;
  anonymized = anonymized.replace(dateRegex, (match) => {
    const placeholder = `[DATE_${dateCounter}]`;
    if (!map[placeholder]) {
      map[placeholder] = match;
    }
    dateCounter++;
    return placeholder;
  });

  // 5. Возраст (X лет, X года, X год)
  const ageRegex = /(\d{1,3})\s*(лет|года|год)/gi;
  anonymized = anonymized.replace(ageRegex, (match, age) => {
    if (!map['[AGE]']) {
      map['[AGE]'] = age;
    }
    return '[AGE] лет';
  });

  // 6. Имена родственников (сестра Мария, брат Иван и т.д.)
  const relativeRegex = /(сестра|брат|мать|отец|мама|папа|бабушка|дедушка|дочь|сын)\s+([А-ЯЁ][а-яё]+)/gi;
  anonymized = anonymized.replace(relativeRegex, (match, relation, name) => {
    const placeholder = `[RELATIVE_${relativeCounter}]`;
    map[placeholder] = name;
    relativeCounter++;
    return `${relation} ${placeholder}`;
  });

  // 7. Места работы (работает в Сбербанк, работает в компании X)
  const employerRegex = /(работает\s+в|работает\s+на|работает\s+в\s+компании)\s+([А-ЯЁ][А-ЯЁа-яё\s]+)/gi;
  anonymized = anonymized.replace(employerRegex, (match, prefix, employer) => {
    const placeholder = '[EMPLOYER]';
    if (!map[placeholder]) {
      map[placeholder] = employer.trim();
    }
    return `${prefix} ${placeholder}`;
  });

  // 8. Врачи (д-р Иванов, доктор Петров)
  const doctorRegex = /(д-р|доктор|врач)\s+([А-ЯЁ][а-яё]+)/gi;
  anonymized = anonymized.replace(doctorRegex, (match, title, name) => {
    const placeholder = '[DOCTOR_1]';
    if (!map[placeholder]) {
      map[placeholder] = name;
    }
    return `${title} ${placeholder}`;
  });

  // 9. Города (в городе X, из города X) — только с явным указанием "город/городе"
  // Не используем простое "в X" — слишком много ложных срабатываний
  // ("в Понедельник", "в Январе", "в России", "в Институте" и т.д.)
  const cityRegex = /(в\s+городе|из\s+города|город)\s+([А-ЯЁ][а-яё-]+)/gi;
  anonymized = anonymized.replace(cityRegex, (match, prefix, city) => {
    const placeholder = '[CITY]';
    if (!map[placeholder]) {
      map[placeholder] = city;
    }
    return `${prefix} ${placeholder}`;
  });

  return { text: anonymized, map };
}

/**
 * Де-анонимизирует текст, заменяя плейсхолдеры обратно на реальные данные
 * 
 * @param {string} text - Анонимизированный текст
 * @param {Object} map - Маппинг плейсхолдеров на реальные значения
 * @returns {string} Де-анонимизированный текст
 */
export function deanonymize(text, map) {
  if (!map || typeof map !== 'object') {
    return text;
  }

  let result = text;

  // Сортируем ключи по длине (от длинных к коротким) для корректной замены
  // Это важно, чтобы "[PATIENT_NAME_PART_0]" заменялся раньше "[PATIENT_NAME]"
  const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);

  for (const placeholder of sortedKeys) {
    result = replaceAll(result, placeholder, map[placeholder]);
  }

  return result;
}






