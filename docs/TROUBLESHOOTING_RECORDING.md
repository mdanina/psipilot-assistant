# Решение проблем с записью аудио

## Ошибка "Не удалось сохранить запись"

Эта ошибка может возникать по нескольким причинам:

### 1. Bucket `recordings` не существует

**Проблема:** Supabase Storage bucket `recordings` не создан.

**Решение:**

Выполните в Supabase SQL Editor:

```sql
-- Создать bucket для записей
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('recordings', 'recordings', false, 524288000, ARRAY['audio/webm', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg'])
ON CONFLICT (id) DO NOTHING;
```

Или через Supabase Dashboard:
1. Откройте **Storage** в боковом меню
2. Нажмите **New bucket**
3. Имя: `recordings`
4. Public: **OFF** (приватный)
5. File size limit: 500 MB
6. Allowed MIME types: `audio/webm, audio/mp3, audio/wav, audio/ogg, audio/mpeg`

### 2. Проблемы с правами доступа к Storage

**Проблема:** RLS политики не настроены для bucket `recordings`.

**Решение:**

Убедитесь, что выполнена миграция `004_audit_and_compliance.sql`, которая создает политики для Storage.

Или создайте политики вручную:

```sql
-- Политика для загрузки записей
CREATE POLICY "Users can upload recordings to their clinic"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
);

-- Политика для просмотра записей
CREATE POLICY "Users can view recordings from their clinic"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM recordings r
        JOIN sessions s ON r.session_id = s.id
        WHERE r.file_path = storage.objects.name
        AND s.clinic_id = get_user_clinic_id()
    )
);
```

### 3. Проблема с созданием сессии

**Проблема:** Сессия не создается из-за отсутствия `clinic_id` в профиле пользователя.

**Решение:**

1. Убедитесь, что пользователь привязан к клинике
2. Проверьте, что профиль загружен: откройте консоль браузера (F12) и проверьте наличие `profile.clinic_id`
3. Если `clinic_id` отсутствует, привяжите пользователя к клинике через страницу Администрирования

### 4. Ошибка при создании записи в БД

**Проблема:** Запись не создается в таблице `recordings`.

**Проверка:**

1. Откройте консоль браузера (F12)
2. Найдите ошибку в консоли
3. Проверьте, что таблица `recordings` существует:
   ```sql
   SELECT * FROM recordings LIMIT 1;
   ```

**Решение:**

Убедитесь, что выполнена миграция `001_initial_schema.sql`, которая создает таблицу `recordings`.

### 5. Ошибка при загрузке файла

**Проблема:** Файл не загружается в Supabase Storage.

**Возможные причины:**

- Файл слишком большой (лимит 500 MB)
- Неправильный MIME type
- Проблемы с правами доступа

**Решение:**

1. Проверьте размер файла в консоли браузера
2. Убедитесь, что bucket `recordings` существует и настроен правильно
3. Проверьте RLS политики для Storage

### 6. Проверка через консоль браузера

Откройте консоль браузера (F12) и проверьте:

1. **Ошибки при создании сессии:**
   ```
   Error creating session: ...
   ```

2. **Ошибки при создании записи:**
   ```
   Error creating recording: ...
   ```

3. **Ошибки при загрузке файла:**
   ```
   Error uploading audio file: ...
   ```

4. **Ошибки сети:**
   - Проверьте, что Supabase URL правильный
   - Проверьте, что нет проблем с CORS

### 7. Диагностика

Создайте тестовую запись через консоль браузера:

```javascript
// В консоли браузера (F12)
const testRecording = async () => {
  try {
    // Проверка подключения к Supabase
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Session:', session);
    
    // Проверка профиля
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    console.log('Profile:', profile);
    
    // Проверка bucket
    const { data: buckets } = await supabase.storage.listBuckets();
    console.log('Buckets:', buckets);
    
    // Проверка таблицы recordings
    const { data: recordings } = await supabase
      .from('recordings')
      .select('*')
      .limit(1);
    console.log('Recordings table exists:', !!recordings);
  } catch (error) {
    console.error('Test error:', error);
  }
};

testRecording();
```

## Частые ошибки и решения

### "Failed to create recording: No data returned"

**Причина:** Проблема с RLS политиками или отсутствие прав на INSERT.

**Решение:** Проверьте, что пользователь аутентифицирован и имеет права на создание записей.

### "Failed to upload audio file: new row violates row-level security policy"

**Причина:** RLS политика для Storage блокирует загрузку.

**Решение:** Убедитесь, что политика "Users can upload recordings to their clinic" создана и активна.

### "Bucket 'recordings' not found"

**Причина:** Bucket не создан.

**Решение:** Создайте bucket через SQL или Dashboard (см. выше).

## Проверка готовности системы

Перед использованием записи убедитесь:

- [ ] Bucket `recordings` создан
- [ ] RLS политики для Storage настроены
- [ ] Таблица `recordings` существует
- [ ] Пользователь привязан к клинике (`profile.clinic_id` не null)
- [ ] Миграция 013 применена (для поддержки сессий без пациента)

## Получение помощи

Если проблема не решена:

1. Откройте консоль браузера (F12)
2. Скопируйте полный текст ошибки
3. Проверьте Network tab для ошибок HTTP запросов
4. Проверьте логи Supabase Dashboard







