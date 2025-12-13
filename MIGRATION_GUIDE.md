# Руководство по миграции на новые функции безопасности

Это руководство поможет вам применить новые функции безопасности к существующему проекту.

## Предварительные требования

- ✅ Supabase база данных настроена и работает
- ✅ Миграции 001-004 применены
- ✅ Доступ к Supabase SQL Editor
- ✅ Доступ к файловой системе проекта

## Шаг 1: Применение миграции 005

### В Supabase SQL Editor

1. Откройте Supabase Dashboard
2. Перейдите в **SQL Editor**
3. Откройте файл `supabase/migrations/005_mfa_and_security.sql`
4. Скопируйте весь содержимое
5. Вставьте в SQL Editor
6. Нажмите **Run**

**Проверка:**
```sql
-- Проверьте, что таблица создана
SELECT * FROM mfa_factors LIMIT 1;

-- Проверьте, что функции созданы
SELECT proname FROM pg_proc WHERE proname = 'has_active_consent';
SELECT proname FROM pg_proc WHERE proname = 'log_read_access';

-- Проверьте, что колонки добавлены
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name LIKE 'mfa%';
```

## Шаг 2: Настройка ключа шифрования

### Генерация ключа

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**Windows (PowerShell):**
```powershell
$randomBytes = New-Object byte[] 32
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($randomBytes)
[Convert]::ToBase64String($randomBytes)
```

**Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Добавление в .env.local

1. Откройте файл `.env.local` в корне проекта
2. Добавьте строку:
   ```env
   VITE_ENCRYPTION_KEY=ваш-сгенерированный-ключ
   ```
3. Сохраните файл

**ВАЖНО:** 
- Не коммитьте `.env.local` в git
- Используйте разные ключи для dev/staging/production
- Храните ключ в секретном менеджере для production

## Шаг 3: Обновление кода

### Проверка изменений

Все изменения уже внесены в код:
- ✅ `src/contexts/AuthContext.tsx` - обновлен
- ✅ `src/App.tsx` - обновлен
- ✅ Новые файлы созданы

### Перезапуск dev сервера

```bash
# Остановите текущий сервер (Ctrl+C)
# Запустите снова
npm run dev
```

## Шаг 4: Проверка работы

### Тест MFA

```typescript
// В консоли браузера (F12)
const { enableMFA } = useAuth();
const result = await enableMFA();
console.log(result); // Должен вернуть qrCode и secret
```

### Тест Session Timeout

1. Войдите в систему
2. Не выполняйте действий 13 минут
3. Должно появиться предупреждение
4. Не выполняйте действий еще 2 минуты
5. Должен произойти автоматический logout

### Тест шифрования

```typescript
import { encryptPHI, decryptPHI } from '@/lib/encryption';

const test = await encryptPHI('test');
const decrypted = await decryptPHI(test);
console.log(decrypted === 'test'); // true
```

### Тест READ audit

1. Выполните запрос через `auditedSupabase`
2. Проверьте `audit_logs`:
```sql
SELECT * FROM audit_logs 
WHERE action = 'read' 
ORDER BY created_at DESC 
LIMIT 5;
```

### Тест согласий

1. Создайте пациента без согласия
2. Попробуйте получить доступ - должно быть запрещено
3. Создайте согласие:
```sql
INSERT INTO consent_records (
    patient_id, consent_type, consent_purpose, 
    legal_basis, status, consent_method, collected_by
) VALUES (
    'patient-uuid', 'data_processing', 
    'Обработка данных', 'consent', 'active', 
    'electronic', 'user-uuid'
);
```
4. Попробуйте получить доступ - должно быть разрешено

## Шаг 5: Миграция существующих данных (опционально)

Если у вас есть существующие незашифрованные PHI данные, их нужно зашифровать.

### Создание скрипта миграции

Создайте файл `scripts/migrate-encrypt-existing-data.ts`:

```typescript
// Пример скрипта для миграции данных
// ВАЖНО: Запускать только после тестирования на копии БД!

import { supabase } from '../src/lib/supabase';
import { encryptPHI } from '../src/lib/encryption';

async function migrateData() {
  // 1. Получить все незашифрованные данные
  const { data: notes } = await supabase
    .from('clinical_notes')
    .select('id, ai_summary')
    .not('ai_summary', 'is', null)
    .is('ai_summary_encrypted', null);

  // 2. Зашифровать и обновить
  for (const note of notes || []) {
    if (note.ai_summary) {
      const encrypted = await encryptPHI(note.ai_summary);
      await supabase
        .from('clinical_notes')
        .update({ ai_summary_encrypted: encrypted })
        .eq('id', note.id);
    }
  }
}
```

**ВАЖНО:** 
- Сначала протестируйте на копии БД
- Сделайте бэкап перед миграцией
- Миграция может занять время для больших объемов данных

## Откат изменений (если нужно)

### Откат миграции 005

```sql
-- Удалить функции
DROP FUNCTION IF EXISTS log_read_access;
DROP FUNCTION IF EXISTS has_active_consent;
DROP FUNCTION IF EXISTS has_active_consents;
DROP FUNCTION IF EXISTS update_session_activity;

-- Удалить таблицу
DROP TABLE IF EXISTS mfa_factors;

-- Удалить колонки (осторожно - потеря данных!)
-- ALTER TABLE profiles DROP COLUMN IF EXISTS mfa_enabled;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS mfa_enabled_at;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS backup_codes;

-- Восстановить старые RLS политики из миграции 002
-- (скопировать из backup или пересоздать)
```

### Откат кода

```bash
# Откатить изменения в git
git checkout HEAD -- src/contexts/AuthContext.tsx
git checkout HEAD -- src/App.tsx

# Удалить новые файлы
rm src/lib/encryption.ts
rm src/lib/supabase-encrypted.ts
rm src/lib/supabase-audited.ts
rm src/components/auth/SessionTimeoutWarning.tsx
```

## Решение проблем

### Проблема: Ошибка при применении миграции

**Решение:**
- Проверьте, что миграции 001-004 применены
- Убедитесь, что таблица `user_sessions` существует (из миграции 004)
- Проверьте логи ошибок в Supabase Dashboard

### Проблема: Ключ шифрования не работает

**Решение:**
- Убедитесь, что ключ добавлен в `.env.local` (не `.env`)
- Перезапустите dev сервер после добавления ключа
- Проверьте формат ключа (должен быть base64, 44 символа)

### Проблема: Session timeout не работает

**Решение:**
- Проверьте консоль браузера на ошибки
- Убедитесь, что `SessionTimeoutWarning` добавлен в `App.tsx`
- Проверьте, что события активности отслеживаются (откройте DevTools → Event Listeners)

### Проблема: READ audit не логирует

**Решение:**
- Убедитесь, что используете `auditedSupabase`, а не обычный `supabase`
- Проверьте, что функция `log_read_access()` создана в БД
- Проверьте права доступа пользователя к функции

### Проблема: Согласия не проверяются

**Решение:**
- Убедитесь, что миграция 005 применена
- Проверьте, что функция `has_active_consent()` существует
- Проверьте, что RLS политики обновлены (старые политики могли остаться)

## Поддержка

При возникновении проблем:
1. Проверьте консоль браузера (F12)
2. Проверьте логи Supabase Dashboard
3. Проверьте документацию в `SECURITY_IMPLEMENTATION.md`
4. Убедитесь, что все миграции применены в правильном порядке

---

**Версия:** 1.0  
**Дата:** Декабрь 2024








