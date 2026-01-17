# Диагностика проблемы "Нет данных для анализа"

## Проблема
При попытке генерации клинической заметки появляется ошибка "Нет данных для анализа", хотя транскрипт виден на фронтенде.

## Цепочка передачи данных

### 1. Фронтенд → Бэкенд
**Файл:** `src/pages/SessionsPage.tsx`
- При нажатии "Создать резюме" вызывается `generateClinicalNote()`
- Передаются: `session_id`, `template_id`, `source_type: 'combined'`

**Файл:** `src/lib/supabase-ai.ts`
- Функция `generateClinicalNote()` отправляет POST запрос на `/api/ai/generate`
- Используется токен авторизации из Supabase session

### 2. Бэкенд: Получение транскрипта
**Файл:** `backend/transcription-service/routes/ai.js` (строки 164-210)

**Шаги:**
1. Запрос записей из таблицы `recordings`:
   ```javascript
   .eq('session_id', session_id)
   .eq('transcription_status', 'completed')
   .select('id, transcription_text, transcription_status, file_name')
   ```

2. Расшифровка транскрипта:
   - Проверяется, зашифрован ли транскрипт (эвристика по формату)
   - Если зашифрован → расшифровка через `decrypt()`
   - Если не зашифрован → используется как есть

3. Объединение транскриптов:
   - Все транскрипты объединяются через `\n\n`

4. Добавление заметок (если `source_type === 'combined'`):
   - Запрос из таблицы `session_notes`
   - Объединение с транскриптом

5. Проверка наличия данных:
   ```javascript
   if (!sourceText.trim()) {
     return res.status(400).json({
       error: 'Нет данных для анализа. Добавьте транскрипт или заметки.'
     });
   }
   ```

### 3. Анонимизация
**Файл:** `backend/transcription-service/services/anonymization.js`
- Функция `anonymize()` заменяет PHI данные на плейсхолдеры
- Создается карта анонимизации для последующего восстановления

### 4. Генерация через OpenAI
**Файл:** `backend/transcription-service/services/openai.js`
- Для каждого блока шаблона вызывается `generateBlockContent()`
- Используется `system_prompt` из блока и анонимизированный транскрипт

### 5. Де-анонимизация и сохранение
- Результат де-анонимизируется через `deanonymize()`
- Шифруется через `encrypt()` и сохраняется в `sections.ai_content`

## Возможные причины проблемы

### 1. Транскрипт не найден в базе данных
**Проверка:**
```sql
SELECT id, file_name, transcription_status, 
       LENGTH(transcription_text) as text_length,
       transcription_text IS NULL as is_null
FROM recordings 
WHERE session_id = 'YOUR_SESSION_ID';
```

**Решение:**
- Убедитесь, что `transcription_status = 'completed'`
- Проверьте, что `transcription_text` не NULL и не пустой

### 2. Транскрипт зашифрован, но расшифровка не работает
**Проверка:**
- Проверьте переменную окружения `ENCRYPTION_KEY` в `.env`
- Убедитесь, что ключ тот же, что использовался при шифровании

**Логи:**
- В консоли бэкенда должны быть сообщения:
  - `[AI Generate] Found X completed recordings`
  - `[AI Generate] Successfully decrypted transcript...` или
  - `[AI Generate] Using transcription_text as plaintext...`

### 3. Транскрипт в неправильном формате
**Проверка:**
- Транскрипт должен быть строкой
- Если зашифрован, должен быть валидный base64

### 4. Проблема с правами доступа
**Проверка:**
- Убедитесь, что `SUPABASE_SERVICE_ROLE_KEY` настроен правильно
- Проверьте, что пользователь авторизован (токен валиден)

## Диагностические шаги

### Шаг 1: Проверка логов бэкенда
При запуске генерации проверьте консоль бэкенда на наличие:
```
[AI Generate] Fetching recordings for session ...
[AI Generate] Found X completed recordings
[AI Generate] Final source text length: X characters
```

### Шаг 2: Проверка базы данных
```sql
-- Проверка записей для сессии
SELECT 
  r.id,
  r.file_name,
  r.transcription_status,
  CASE 
    WHEN r.transcription_text IS NULL THEN 'NULL'
    WHEN r.transcription_text = '' THEN 'EMPTY'
    WHEN LENGTH(r.transcription_text) < 100 THEN 'SHORT'
    ELSE 'OK'
  END as text_status,
  LENGTH(r.transcription_text) as text_length
FROM recordings r
WHERE r.session_id = 'YOUR_SESSION_ID'
ORDER BY r.created_at DESC;
```

### Шаг 3: Проверка переменных окружения
```bash
# В backend/transcription-service/.env
ENCRYPTION_KEY=... # Должен быть base64-encoded 32-byte ключ
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Шаг 4: Тестовая генерация
Добавьте временный endpoint для тестирования:
```javascript
router.get('/test-transcript/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const supabase = getSupabaseAdmin();
  
  const { data: recordings } = await supabase
    .from('recordings')
    .select('*')
    .eq('session_id', sessionId)
    .eq('transcription_status', 'completed');
  
  res.json({
    count: recordings?.length || 0,
    recordings: recordings?.map(r => ({
      id: r.id,
      file_name: r.file_name,
      has_text: !!r.transcription_text,
      text_length: r.transcription_text?.length || 0,
      text_preview: r.transcription_text?.substring(0, 100) || 'N/A'
    }))
  });
});
```

## Исправления, внесенные в код

1. **Улучшенное логирование** (строки 165-210):
   - Добавлены подробные логи на каждом этапе
   - Логирование количества найденных записей
   - Логирование успешной/неуспешной расшифровки

2. **Улучшенная обработка расшифровки** (строки 179-210):
   - Проверка, зашифрован ли транскрипт (эвристика)
   - Fallback на использование как plaintext, если расшифровка не удалась
   - Обработка случаев, когда транскрипт не зашифрован

3. **Проверка ошибок**:
   - Добавлена проверка ошибок при запросе записей
   - Более информативные сообщения об ошибках

## Следующие шаги

1. Перезапустите бэкенд сервис
2. Попробуйте снова запустить генерацию
3. Проверьте логи в консоли бэкенда
4. Если проблема сохраняется, проверьте базу данных по SQL запросам выше






