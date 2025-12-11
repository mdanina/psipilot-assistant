# Тестирование локального хранения аудиозаписей

## Подготовка

1. Убедитесь, что приложение запущено:
   ```bash
   npm run dev
   ```

2. Войдите в систему с тестовым аккаунтом

3. Откройте DevTools (F12) → вкладка **Application** → **IndexedDB** → проверьте наличие базы `psipilot-recordings`

## Сценарии тестирования

### 1. Базовое сохранение и загрузка

**Цель:** Проверить, что запись сохраняется локально и успешно загружается в Supabase

**Шаги:**
1. Перейдите на страницу записи (`/`)
2. Нажмите "Включить запись"
3. Запишите короткий аудио (10-20 секунд)
4. Нажмите "Остановить"
5. Нажмите "Транскрибировать"

**Ожидаемый результат:**
- В консоли должно появиться: `[ScribePage] Recording saved locally: local-...`
- В DevTools → Application → IndexedDB → `psipilot-recordings` → `recordings` должна появиться запись
- Запись должна успешно загрузиться в Supabase
- В консоли должно появиться: `[LocalStorage] Recording marked as uploaded`

**Проверка в IndexedDB:**
- Откройте DevTools → Application → IndexedDB → `psipilot-recordings` → `recordings`
- Должна быть запись с полями:
  - `id`: `local-{timestamp}-{random}`
  - `encryptedBlob`: ArrayBuffer (зашифрованные данные)
  - `uploaded`: `true`
  - `recordingId`: UUID из Supabase
  - `expiresAt`: timestamp (через 48 часов)

### 2. Ошибка загрузки (симуляция)

**Цель:** Проверить, что при ошибке загрузки запись остается локально

**Шаги:**
1. Откройте DevTools → Network
2. Включите режим "Offline" или заблокируйте домен Supabase
3. Запишите аудио (10-20 секунд)
4. Нажмите "Транскрибировать"

**Ожидаемый результат:**
- В консоли: `[ScribePage] Recording saved locally: local-...`
- Появится toast с сообщением об ошибке загрузки
- В IndexedDB запись должна быть с `uploaded: false`
- Должен автоматически открыться диалог восстановления (`RecoveryDialog`)

**Проверка:**
- DevTools → Application → IndexedDB → `recordings`
- Запись должна иметь:
  - `uploaded`: `false`
  - `uploadError`: текст ошибки

### 3. Автоматическая повторная загрузка

**Цель:** Проверить автоматическую загрузку при восстановлении соединения

**Шаги:**
1. Создайте не загруженную запись (сценарий 2)
2. В DevTools → Network включите "Offline"
3. Подождите несколько секунд
4. Выключите "Offline" (восстановите соединение)

**Ожидаемый результат:**
- В консоли должно появиться: `[ScribePage] Connection restored, attempting to upload X recordings`
- Запись должна автоматически загрузиться
- Появится toast: "Запись восстановлена"
- В IndexedDB запись должна быть помечена как `uploaded: true`
- Диалог восстановления должен закрыться или обновиться

### 4. Диалог восстановления

**Цель:** Проверить UI для управления не загруженными записями

**Шаги:**
1. Создайте несколько не загруженных записей (сценарий 2)
2. Диалог должен открыться автоматически
3. Проверьте функциональность кнопок:
   - **Скачать** — должен скачать файл локально
   - **Загрузить** — должен попытаться загрузить в Supabase
   - **X** — должен удалить запись из IndexedDB

**Ожидаемый результат:**
- Диалог показывает все не загруженные записи
- Кнопки работают корректно
- После удаления/загрузки список обновляется

### 5. Очистка при logout

**Цель:** Проверить, что все локальные записи удаляются при выходе

**Шаги:**
1. Создайте несколько локальных записей (загруженных и не загруженных)
2. Проверьте в IndexedDB, что записи есть
3. Выйдите из системы (logout)

**Ожидаемый результат:**
- В консоли: `[AuthContext] Local recordings and session key cleared on logout`
- В IndexedDB база `psipilot-recordings` должна быть пустой
- В sessionStorage не должно быть ключа `recording_session_key`

**Проверка:**
- DevTools → Application → IndexedDB → `psipilot-recordings` → `recordings` → должно быть пусто
- DevTools → Application → Session Storage → не должно быть `recording_session_key`

### 6. TTL (автоматическое удаление истекших записей)

**Цель:** Проверить автоматическое удаление записей старше 48 часов

**Шаги:**
1. Откройте DevTools → Application → IndexedDB → `psipilot-recordings` → `recordings`
2. Найдите запись и измените `expiresAt` на прошедшую дату (например, вчера)
3. Сохраните новую запись или перезагрузите страницу

**Ожидаемый результат:**
- Истекшая запись должна быть автоматически удалена
- В консоли может появиться: `[LocalStorage] Recording deleted: local-...`

**Примечание:** TTL проверяется при каждом сохранении новой записи через функцию `cleanupExpiredRecordings()`

### 7. Шифрование

**Цель:** Проверить, что данные действительно зашифрованы

**Шаги:**
1. Сохраните запись локально
2. Откройте DevTools → Application → IndexedDB → `psipilot-recordings` → `recordings`
3. Найдите запись и посмотрите поле `encryptedBlob`

**Ожидаемый результат:**
- `encryptedBlob` должен быть ArrayBuffer с зашифрованными данными
- Данные не должны быть читаемыми (не должны начинаться с типичных аудио заголовков)
- Должно быть поле `iv` (Initialization Vector) для расшифровки

### 8. Аудит операций

**Цель:** Проверить логирование операций в audit_logs

**Шаги:**
1. Выполните несколько операций (сохранение, загрузка, удаление)
2. Проверьте таблицу `audit_logs` в Supabase

**Ожидаемый результат:**
- В `audit_logs` должны быть записи с:
  - `action`: `create`, `read`, `update`, `delete`
  - `action_category`: `recording`
  - `resource_type`: `recording`
  - `phi_accessed`: `true`
  - `phi_fields`: `['audio_recording']`

**Проверка в Supabase:**
```sql
SELECT * FROM audit_logs 
WHERE action_category = 'recording' 
ORDER BY created_at DESC 
LIMIT 10;
```

### 9. Восстановление после перезагрузки страницы

**Цель:** Проверить, что не загруженные записи сохраняются после перезагрузки

**Шаги:**
1. Создайте не загруженную запись (сценарий 2)
2. Перезагрузите страницу (F5)
3. Проверьте, что диалог восстановления открылся автоматически

**Ожидаемый результат:**
- После перезагрузки диалог должен автоматически открыться
- Все не загруженные записи должны отображаться
- Записи должны быть доступны для скачивания/загрузки

### 10. Проверка ключа сессии

**Цель:** Проверить, что ключ шифрования правильно управляется

**Шаги:**
1. Войдите в систему
2. Проверьте sessionStorage: должно быть `recording_session_key`
3. Выйдите из системы
4. Проверьте sessionStorage: ключ должен быть удален

**Ожидаемый результат:**
- Ключ создается при первом использовании
- Ключ удаляется при logout
- Ключ удаляется при закрытии вкладки (sessionStorage очищается)

**Проверка:**
- DevTools → Application → Session Storage → `recording_session_key` (должен быть массив чисел)

## Проверка в консоли браузера

Откройте консоль (F12) и проверьте логи:

```
[ScribePage] Recording saved locally: local-1234567890-abc123
[LocalStorage] Recording marked as uploaded: local-1234567890-abc123
[AuthContext] Local recordings and session key cleared on logout
```

## Проверка в IndexedDB

1. Откройте DevTools (F12)
2. Вкладка **Application**
3. Слева: **Storage** → **IndexedDB** → **psipilot-recordings** → **recordings**
4. Должны быть записи с полями:
   - `id`
   - `encryptedBlob` (ArrayBuffer)
   - `fileName`
   - `duration`
   - `createdAt`
   - `expiresAt`
   - `uploaded` (boolean)
   - `iv` (ArrayBuffer)

## Проверка в Supabase

### Проверка записей в БД:
```sql
SELECT id, file_name, duration_seconds, created_at 
FROM recordings 
ORDER BY created_at DESC 
LIMIT 10;
```

### Проверка audit_logs:
```sql
SELECT 
  action,
  action_category,
  resource_type,
  phi_accessed,
  phi_fields,
  success,
  created_at
FROM audit_logs 
WHERE action_category = 'recording'
ORDER BY created_at DESC 
LIMIT 20;
```

## Типичные проблемы и решения

### Проблема: "Web Crypto API is not available"
**Решение:** Убедитесь, что используете HTTPS или localhost (Web Crypto API не работает на HTTP)

### Проблема: Записи не сохраняются
**Решение:** 
- Проверьте консоль на ошибки
- Убедитесь, что IndexedDB доступен (не в приватном режиме)
- Проверьте квоту браузера (DevTools → Application → Storage)

### Проблема: Записи не расшифровываются
**Решение:**
- Убедитесь, что ключ сессии существует в sessionStorage
- Проверьте, что не было logout между сохранением и чтением

### Проблема: Диалог восстановления не открывается
**Решение:**
- Проверьте, что есть не загруженные записи: `getUnuploadedRecordings()`
- Проверьте консоль на ошибки
- Убедитесь, что пользователь авторизован

## Автоматическое тестирование (опционально)

Можно создать тестовый скрипт для проверки основных функций:

```typescript
// test-local-storage.ts
import { saveRecordingLocally, getLocalRecording, clearAllLocalRecordings } from './local-recording-storage';
import { encryptBlob, decryptBlob } from './recording-encryption';

async function testLocalStorage() {
  // 1. Создать тестовый Blob
  const testBlob = new Blob(['test audio data'], { type: 'audio/webm' });
  
  // 2. Сохранить локально
  const id = await saveRecordingLocally(testBlob, 'test.webm', 10);
  console.log('Saved:', id);
  
  // 3. Получить обратно
  const recording = await getLocalRecording(id);
  console.log('Retrieved:', recording?.fileName);
  
  // 4. Очистить
  await clearAllLocalRecordings();
  console.log('Cleared');
}
```

## Чеклист тестирования

- [ ] Базовое сохранение и загрузка работает
- [ ] Ошибка загрузки сохраняет запись локально
- [ ] Автоматическая повторная загрузка при восстановлении соединения
- [ ] Диалог восстановления отображается и работает
- [ ] Очистка при logout удаляет все записи
- [ ] TTL удаляет истекшие записи
- [ ] Данные зашифрованы в IndexedDB
- [ ] Операции логируются в audit_logs
- [ ] Записи сохраняются после перезагрузки страницы
- [ ] Ключ сессии правильно управляется

