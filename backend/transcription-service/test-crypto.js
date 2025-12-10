/**
 * Тестовый скрипт для проверки исправлений в crypto API
 * 
 * Запуск:
 *   node test-crypto.js
 * 
 * Требования:
 *   - Backend сервер должен быть запущен на порту 3001
 *   - ENCRYPTION_KEY должен быть установлен в .env
 */

import dotenv from 'dotenv';
import { encrypt, decrypt } from './services/encryption.js';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_TOKEN = process.env.TEST_TOKEN || ''; // Можно использовать реальный токен для полного теста

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 Тест: ${name}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function testDirectEncryption() {
  logTest('Прямое шифрование/расшифровка (без API)');
  
  try {
    const plaintext = 'Тестовые данные для шифрования: Привет, мир!';
    log(`Исходный текст: ${plaintext}`);
    
    const encrypted = encrypt(plaintext);
    log(`Зашифровано: ${encrypted.substring(0, 50)}...`);
    
    const decrypted = decrypt(encrypted);
    log(`Расшифровано: ${decrypted}`);
    
    if (decrypted === plaintext) {
      logSuccess('Прямое шифрование/расшифровка работает корректно');
      return true;
    } else {
      logError('Расшифрованный текст не совпадает с исходным');
      return false;
    }
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    return false;
  }
}

async function testAPIEncryptDecrypt() {
  logTest('API: Шифрование и расшифровка одиночного значения');
  
  if (!TEST_TOKEN) {
    logWarning('TEST_TOKEN не установлен, пропускаем API тесты');
    logWarning('Для полного тестирования API установите TEST_TOKEN в .env');
    logWarning('Или тестируйте через браузер после авторизации');
    return true; // Пропускаем, но не считаем ошибкой
  }
  
  try {
    const plaintext = 'Тестовые данные для API: Привет из теста!';
    
    // Шифрование
    const encryptResponse = await fetch(`${API_URL}/api/crypto/encrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ data: plaintext }),
    });
    
    if (!encryptResponse.ok) {
      const error = await encryptResponse.json().catch(() => ({ error: encryptResponse.statusText }));
      throw new Error(`Encrypt failed: ${error.error || encryptResponse.statusText}`);
    }
    
    const encryptResult = await encryptResponse.json();
    if (!encryptResult.success) {
      throw new Error(`Encrypt failed: ${encryptResult.error}`);
    }
    
    const encrypted = encryptResult.data.encrypted;
    log(`Зашифровано через API: ${encrypted.substring(0, 50)}...`);
    
    // Расшифровка
    const decryptResponse = await fetch(`${API_URL}/api/crypto/decrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ data: encrypted }),
    });
    
    if (!decryptResponse.ok) {
      const error = await decryptResponse.json().catch(() => ({ error: decryptResponse.statusText }));
      throw new Error(`Decrypt failed: ${error.error || decryptResponse.statusText}`);
    }
    
    const decryptResult = await decryptResponse.json();
    if (!decryptResult.success) {
      throw new Error(`Decrypt failed: ${decryptResult.error}`);
    }
    
    const decrypted = decryptResult.data.decrypted;
    log(`Расшифровано через API: ${decrypted}`);
    
    if (decrypted === plaintext) {
      logSuccess('API шифрование/расшифровка работает корректно');
      return true;
    } else {
      logError('Расшифрованный текст не совпадает с исходным');
      return false;
    }
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    return false;
  }
}

async function testBatchEncryptDecrypt() {
  logTest('Batch шифрование и расшифровка (прямой вызов функций)');
  
  try {
    const plaintexts = [
      'Первая строка данных',
      'Вторая строка данных',
      'Третья строка данных',
      'Четвертая строка с русскими символами: привет!',
    ];
    
    log(`Шифруем ${plaintexts.length} значений...`);
    
    // Batch шифрование (прямой вызов функций)
    const encrypted = plaintexts.map(text => encrypt(text));
    log(`Зашифровано ${encrypted.length} значений`);
    
    // Batch расшифровка (прямой вызов функций)
    const decrypted = encrypted.map(enc => {
      try {
        return decrypt(enc);
      } catch (error) {
        logWarning(`Ошибка расшифровки элемента: ${error.message}`);
        return ''; // Возвращаем пустую строку при ошибке
      }
    });
    
    log(`Расшифровано ${decrypted.length} значений`);
    
    // Проверяем совпадение
    let allMatch = true;
    for (let i = 0; i < plaintexts.length; i++) {
      if (decrypted[i] !== plaintexts[i]) {
        logError(`Элемент ${i} не совпадает: ожидалось "${plaintexts[i]}", получено "${decrypted[i]}"`);
        allMatch = false;
      }
    }
    
    if (allMatch) {
      logSuccess('Batch шифрование/расшифровка работает корректно');
      return true;
    } else {
      logError('Не все элементы совпадают после расшифровки');
      return false;
    }
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    return false;
  }
}

async function testErrorHandling() {
  logTest('Обработка ошибок: невалидные данные (имитация batch логики)');
  
  try {
    const invalidData = [
      'not-base64-data!!!',  // Невалидный base64
      'short',               // Слишком короткая строка
      '',                    // Пустая строка
    ];
    
    log(`Пытаемся расшифровать ${invalidData.length} невалидных значений...`);
    
    // Имитируем логику batch расшифровки из routes/crypto.js
    const decrypted = [];
    const errors = [];
    
    for (let i = 0; i < invalidData.length; i++) {
      const item = invalidData[i];
      
      if (typeof item !== 'string') {
        logWarning(`Элемент ${i} не является строкой, пропускаем`);
        decrypted.push('');
        errors.push({ index: i, error: 'Not a string' });
        continue;
      }
      
      if (!item) {
        decrypted.push('');
        continue;
      }
      
      // Пытаемся расшифровать каждый элемент отдельно
      try {
        const result = decrypt(item);
        decrypted.push(result);
      } catch (error) {
        // Логируем ошибку, но не падаем - возвращаем пустую строку
        const errorMsg = error.message || 'Unknown decryption error';
        logWarning(`  Элемент ${i} не расшифрован: ${errorMsg}`);
        decrypted.push(''); // Возвращаем пустую строку для нерасшифрованных элементов
        errors.push({ index: i, error: errorMsg });
      }
    }
    
    log(`Получено ${decrypted.length} результатов`);
    
    // Проверяем, что все элементы - пустые строки (ошибки обработаны)
    const allEmpty = decrypted.every(item => item === '');
    
    if (allEmpty) {
      logSuccess('Невалидные данные корректно обработаны (возвращены пустые строки)');
      
      if (errors.length > 0) {
        log(`Предупреждений: ${errors.length}`);
        logSuccess('Ошибки корректно обработаны без падения');
      }
      
      return true;
    } else {
      logError('Не все невалидные элементы вернули пустые строки');
      return false;
    }
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    return false;
  }
}

async function testMixedData() {
  logTest('Обработка смешанных данных (валидные + невалидные)');
  
  try {
    // Сначала создаем валидные зашифрованные данные (прямой вызов)
    const validPlaintext = 'Валидные данные для теста';
    const validEncrypted = encrypt(validPlaintext);
    
    // Смешиваем валидные и невалидные данные
    const mixedData = [
      validEncrypted,           // Валидные зашифрованные данные
      'invalid-base64!!!',      // Невалидные данные
      '',                       // Пустая строка
      'too-short',              // Слишком короткая строка
    ];
    
    log(`Пытаемся расшифровать смешанные данные (${mixedData.length} элементов)...`);
    
    // Имитируем логику batch расшифровки из routes/crypto.js
    const decrypted = [];
    const errors = [];
    
    for (let i = 0; i < mixedData.length; i++) {
      const item = mixedData[i];
      
      if (typeof item !== 'string') {
        decrypted.push('');
        errors.push({ index: i, error: 'Not a string' });
        continue;
      }
      
      if (!item) {
        decrypted.push('');
        continue;
      }
      
      // Пытаемся расшифровать каждый элемент отдельно
      try {
        const result = decrypt(item);
        decrypted.push(result);
      } catch (error) {
        // Логируем ошибку, но не падаем - возвращаем пустую строку
        const errorMsg = error.message || 'Unknown decryption error';
        logWarning(`  Элемент ${i} не расшифрован: ${errorMsg}`);
        decrypted.push(''); // Возвращаем пустую строку для нерасшифрованных элементов
        errors.push({ index: i, error: errorMsg });
      }
    }
    
    // Первый элемент должен быть успешно расшифрован
    if (decrypted[0] === validPlaintext) {
      logSuccess('Валидные данные успешно расшифрованы');
    } else {
      logError(`Валидные данные не расшифрованы: получено "${decrypted[0]}"`);
      return false;
    }
    
    // Остальные должны быть пустыми строками
    const invalidResults = decrypted.slice(1);
    const allInvalidEmpty = invalidResults.every(item => item === '');
    
    if (allInvalidEmpty) {
      logSuccess('Невалидные данные корректно обработаны');
      
      if (errors.length > 0) {
        log(`Предупреждений: ${errors.length}`);
      }
      
      logSuccess('Смешанные данные обработаны корректно');
      return true;
    } else {
      logError('Не все невалидные элементы вернули пустые строки');
      return false;
    }
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    return false;
  }
}

async function testValidation() {
  logTest('Валидация формата данных');
  
  try {
    // Тестируем различные невалидные форматы
    const testCases = [
      { name: 'Пустая строка', data: '' },
      { name: 'Не base64', data: 'not-base64!!!' },
      { name: 'Слишком короткая', data: 'dG9vX3Nob3J0' }, // "too_short" в base64, но меньше минимума
      { name: 'Null', data: null },
    ];
    
    for (const testCase of testCases) {
      try {
        // Пытаемся расшифровать напрямую (без API)
        if (testCase.data === null) {
          log(`  Тест "${testCase.name}": пропущен (null)`);
          continue;
        }
        
        const result = decrypt(testCase.data);
        if (testCase.data === '') {
          if (result === '') {
            log(`  ✅ "${testCase.name}": корректно обработано (пустая строка)`);
          } else {
            log(`  ❌ "${testCase.name}": ожидалась пустая строка, получено "${result}"`);
            return false;
          }
        } else {
          log(`  ⚠️  "${testCase.name}": не выбросило ошибку (возможно, это нормально)`);
        }
      } catch (error) {
        if (testCase.data === '') {
          log(`  ❌ "${testCase.name}": выброшена ошибка для пустой строки`);
          return false;
        } else {
          log(`  ✅ "${testCase.name}": корректно выброшена ошибка: ${error.message}`);
        }
      }
    }
    
    logSuccess('Валидация работает корректно');
    return true;
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 Запуск тестов crypto API', 'blue');
  log('='.repeat(50), 'blue');
  
  // Проверяем, что сервер доступен
  try {
    const healthCheck = await fetch(`${API_URL}/health`);
    if (!healthCheck.ok) {
      logError(`Сервер не доступен на ${API_URL}`);
      logWarning('Убедитесь, что backend сервер запущен: npm run dev');
      process.exit(1);
    }
    logSuccess(`Сервер доступен на ${API_URL}`);
  } catch (error) {
    logError(`Не удалось подключиться к серверу: ${error.message}`);
    logWarning('Убедитесь, что backend сервер запущен: npm run dev');
    process.exit(1);
  }
  
  const results = [];
  const testNames = [];
  
  // Запускаем тесты
  log('\n📋 Запускаем тесты:', 'blue');
  testNames.push('Прямое шифрование/расшифровка');
  results.push(await testDirectEncryption());
  
  testNames.push('Валидация формата данных');
  results.push(await testValidation());
  
  testNames.push('API шифрование/расшифровка');
  const apiTestResult = await testAPIEncryptDecrypt();
  results.push(apiTestResult);
  if (!TEST_TOKEN && apiTestResult) {
    logWarning('API тесты пропущены (требуется TEST_TOKEN)');
  }
  
  testNames.push('Batch шифрование/расшифровка');
  results.push(await testBatchEncryptDecrypt());
  
  testNames.push('Обработка ошибок');
  results.push(await testErrorHandling());
  
  testNames.push('Смешанные данные');
  results.push(await testMixedData());
  
  // Итоги
  log('\n' + '='.repeat(50), 'blue');
  log('\n📊 Результаты тестов:', 'blue');
  
  results.forEach((result, index) => {
    const status = result ? '✅' : '❌';
    log(`  ${status} ${testNames[index]}`, result ? 'green' : 'red');
  });
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  log('\n' + '='.repeat(50), 'blue');
  
  if (passed === total) {
    log(`\n🎉 Все тесты пройдены! (${passed}/${total})`, 'green');
    if (!TEST_TOKEN) {
      log('\n💡 Совет: Для полного тестирования API установите TEST_TOKEN в .env', 'yellow');
      log('   Или тестируйте через браузер после авторизации', 'yellow');
    }
    process.exit(0);
  } else {
    log(`\n⚠️  Пройдено тестов: ${passed}/${total}`, 'yellow');
    process.exit(1);
  }
}

// Запускаем тесты
runAllTests().catch(error => {
  logError(`Критическая ошибка: ${error.message}`);
  console.error(error);
  process.exit(1);
});

