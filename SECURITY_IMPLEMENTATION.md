# Документация по реализации функций безопасности

## Обзор

Этот документ описывает все критические функции безопасности, реализованные для соответствия требованиям HIPAA, GDPR и 152-ФЗ.

**Дата реализации:** Декабрь 2024  
**Версия:** 0.2.0

---

## Реализованные функции

### 1. Multi-Factor Authentication (MFA)

#### Описание
Двухфакторная аутентификация для повышения безопасности доступа к медицинским данным.

#### Реализация

**База данных:**
- **Миграция:** `supabase/migrations/005_mfa_and_security.sql`
- **Таблица:** `mfa_factors` - хранит TOTP устройства пользователей
- **Колонки в `profiles`:**
  - `mfa_enabled` (BOOLEAN) - включена ли MFA
  - `mfa_enabled_at` (TIMESTAMPTZ) - когда была включена
  - `backup_codes` (TEXT[]) - резервные коды (зашифрованы)

**Код:**
- **Файл:** `src/contexts/AuthContext.tsx`
- **Методы:**
  - `enableMFA()` - начать настройку MFA, возвращает QR код
  - `verifyMFA(code: string)` - верифицировать код и активировать MFA
  - `disableMFA()` - отключить MFA для пользователя

**Использование:**
```typescript
const { enableMFA, verifyMFA, disableMFA, mfaEnabled } = useAuth();

// Начать настройку
const { data, error } = await enableMFA();
// data содержит qrCode и secret

// Верифицировать
await verifyMFA('123456');

// Отключить
await disableMFA();
```

**RLS политики:**
- Пользователи могут управлять только своими MFA факторами
- Все операции логируются в `audit_logs`

---

### 2. Session Timeout с Auto-Logout

#### Описание
Автоматическое завершение сессии после периода неактивности для предотвращения несанкционированного доступа.

#### Реализация

**Настройки:**
- **Таймаут:** 15 минут неактивности (настраивается в `AuthContext.tsx`)
- **Предупреждение:** за 2 минуты до таймаута

**Код:**
- **Файл:** `src/contexts/AuthContext.tsx`
- **Метод:** `updateActivity()` - обновляет timestamp последней активности
- **Компонент:** `src/components/auth/SessionTimeoutWarning.tsx`

**Отслеживаемые события:**
- `mousedown`, `mousemove`, `keypress`, `scroll`, `touchstart`

**Поведение:**
1. При неактивности 13 минут - показывается предупреждение
2. При неактивности 15 минут - автоматический logout
3. Пользователь может продлить сессию кнопкой "Продолжить работу"

**Настройка:**
```typescript
// В src/contexts/AuthContext.tsx
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 минут
const SESSION_WARNING_TIME = 2 * 60 * 1000; // 2 минуты
```

---

### 3. Field-Level Encryption для PHI данных

#### Описание
Шифрование чувствительных медицинских данных на уровне приложения перед сохранением в БД.

#### Реализация

**Алгоритм:** AES-GCM с 256-bit ключом  
**Стандарт:** Web Crypto API (нативный браузерный API)

**Файлы:**
- `src/lib/encryption.ts` - утилиты шифрования
- `src/lib/supabase-encrypted.ts` - обертка для автоматического шифрования/дешифрования

**Зашифрованные поля:**
- `clinical_notes.ai_summary` → `ai_summary_encrypted`
- `sections.ai_content` → `ai_content_encrypted`
- `sessions.transcript` → `transcript_encrypted`
- `recordings.transcription_text` → `transcription_text_encrypted`

**База данных:**
- Колонки типа `BYTEA` для хранения зашифрованных данных
- Колонка `encryption_version` для отслеживания версии алгоритма

**Настройка:**
1. Сгенерировать ключ: `openssl rand -base64 32`
2. Добавить в `.env.local`: `VITE_ENCRYPTION_KEY=ваш-ключ`

**Использование:**
```typescript
import { encryptedSupabase } from '@/lib/supabase-encrypted';

// Автоматически шифруется при записи
await encryptedSupabase
  .from('clinical_notes')
  .insert({ ai_summary: 'Чувствительные данные' });

// Автоматически расшифровывается при чтении
const { data } = await encryptedSupabase
  .from('clinical_notes')
  .select('*');
```

**Безопасность:**
- Ключ хранится в переменных окружения (не в коде)
- Используется authenticated encryption (AES-GCM)
- Каждый шифр использует уникальный IV (Initialization Vector)
- Ключ никогда не логируется

---

### 4. READ Audit Logging

#### Описание
Логирование всех операций чтения (SELECT) для соответствия требованиям HIPAA о полном аудите доступа к PHI.

#### Реализация

**База данных:**
- **Функция:** `log_read_access()` в миграции `005_mfa_and_security.sql`
- **Таблица:** `audit_logs` (уже существовала в миграции 004)

**Код:**
- **Файл:** `src/lib/supabase-audited.ts`
- **Экспорт:** `auditedSupabase` - клиент с автоматическим логированием

**Логируемая информация:**
- Кто: `user_id`, `user_email`, `user_role`, `clinic_id`
- Что: `resource_type`, `resource_id`, `resource_name`
- Какие PHI поля: `phi_fields[]`
- Когда: `created_at`
- Метаданные: `ip_address`, `user_agent`

**Автоматическое определение PHI полей:**
```typescript
const PHI_FIELDS_BY_TABLE = {
  patients: ['name', 'email', 'phone', 'date_of_birth', 'address', 'notes'],
  clinical_notes: ['ai_summary', 'title'],
  sections: ['ai_content', 'content'],
  sessions: ['transcript', 'notes'],
  recordings: ['transcription_text'],
  documents: ['file_name', 'title', 'description'],
};
```

**Использование:**
```typescript
import { auditedSupabase } from '@/lib/supabase-audited';

// Все SELECT операции автоматически логируются
const { data } = await auditedSupabase
  .from('patients')
  .select('*');
// Запись создается в audit_logs с action='read'
```

**Просмотр логов:**
```sql
SELECT * FROM audit_logs 
WHERE action = 'read' 
ORDER BY created_at DESC 
LIMIT 100;
```

---

### 5. Проверка активных согласий в RLS

#### Описание
Автоматическая проверка наличия активного согласия пациента перед доступом к его данным.

#### Реализация

**База данных:**
- **Функция:** `has_active_consent(patient_id, consent_type)` в миграции `005_mfa_and_security.sql`
- **Функция:** `has_active_consents(patient_id, consent_types[])` для множественных проверок

**RLS политики обновлены для:**
- `patients` - требует согласие `data_processing`
- `sessions` - требует согласие `data_processing`
- `clinical_notes` - требует согласие `data_processing`
- `recordings` - требует согласие `recording`

**Пример политики:**
```sql
CREATE POLICY "Users can view clinic patients with consent"
    ON patients FOR SELECT
    USING (
        clinic_id = get_user_clinic_id()
        AND deleted_at IS NULL
        AND has_active_consent(id, 'data_processing')
    );
```

**Типы согласий:**
- `data_processing` - обработка персональных данных
- `recording` - запись сессий
- `ai_analysis` - анализ с помощью AI
- `data_sharing` - передача данных третьим лицам
- `marketing` - маркетинговые коммуникации

**Создание согласия:**
```sql
INSERT INTO consent_records (
    patient_id,
    consent_type,
    consent_purpose,
    legal_basis,
    status,
    consent_method,
    collected_by
) VALUES (
    'patient-uuid',
    'data_processing',
    'Обработка медицинских данных для ведения клинических записей',
    'consent',
    'active',
    'electronic',
    'user-uuid'
);
```

---

## Миграции базы данных

### Миграция 005: MFA and Enhanced Security

**Файл:** `supabase/migrations/005_mfa_and_security.sql`

**Содержимое:**
1. Таблица `mfa_factors` для хранения MFA устройств
2. Колонки MFA в таблице `profiles`
3. Колонки для зашифрованных данных (`*_encrypted`, `encryption_version`)
4. Функции проверки согласий (`has_active_consent`, `has_active_consents`)
5. Функция логирования READ операций (`log_read_access`)
6. Обновленные RLS политики с проверкой согласий
7. RLS политики для `mfa_factors`

**Применение:**
```sql
-- В Supabase SQL Editor выполните:
-- supabase/migrations/005_mfa_and_security.sql
```

**Важно:** Миграция идемпотентна - безопасна для повторного применения.

---

## Новые файлы

### Frontend

1. **`src/lib/encryption.ts`**
   - Функции `encryptPHI()` и `decryptPHI()`
   - Использует Web Crypto API
   - Поддержка AES-GCM 256-bit

2. **`src/lib/supabase-encrypted.ts`**
   - Обертка над Supabase клиентом
   - Автоматическое шифрование при INSERT/UPDATE
   - Автоматическое дешифрование при SELECT

3. **`src/lib/supabase-audited.ts`**
   - Обертка над Supabase клиентом
   - Автоматическое логирование всех SELECT операций
   - Определение PHI полей

4. **`src/components/auth/SessionTimeoutWarning.tsx`**
   - Компонент предупреждения о таймауте сессии
   - Модальное окно с обратным отсчетом

### Backend (SQL)

5. **`supabase/migrations/005_mfa_and_security.sql`**
   - Все изменения в базе данных для безопасности

### Документация

6. **`SECURITY_SETUP.md`**
   - Инструкции по настройке безопасности

7. **`SECURITY_IMPLEMENTATION.md`** (этот файл)
   - Полная документация по реализации

---

## Измененные файлы

### 1. `src/contexts/AuthContext.tsx`

**Добавлено:**
- Состояние: `mfaEnabled`, `mfaVerified`, `lastActivity`, `sessionExpiresAt`
- Методы: `enableMFA()`, `verifyMFA()`, `disableMFA()`, `updateActivity()`
- Логика session timeout с автоматическим logout
- Отслеживание активности пользователя

**Изменено:**
- `fetchProfile()` - теперь получает `mfa_enabled` из профиля
- `signOut()` - обновлен для сброса всех состояний безопасности

### 2. `src/App.tsx`

**Добавлено:**
- Импорт `SessionTimeoutWarning`
- Компонент `<SessionTimeoutWarning />` в дерево компонентов

### 3. `env.example.txt`

**Добавлено:**
- `VITE_ENCRYPTION_KEY` - переменная для ключа шифрования
- Комментарии о безопасности

---

## Переменные окружения

### Новые переменные

```env
# Encryption Key for PHI Data (Field-level encryption)
# Генерируется командой: openssl rand -base64 32
VITE_ENCRYPTION_KEY=your-base64-encryption-key-here
```

### Существующие переменные

```env
VITE_SUPABASE_URL=https://your-domain.com
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Соответствие стандартам

### HIPAA (Health Insurance Portability and Accountability Act)

| Требование | Статус | Реализация |
|------------|--------|------------|
| Unique user identification | ✅ | Supabase Auth + profiles |
| MFA | ✅ | `enableMFA()`, `verifyMFA()` |
| Encryption at-rest | ✅ | Field-level encryption (AES-GCM) |
| Encryption in-transit | ✅ | TLS (Supabase) |
| Audit logging | ✅ | `audit_logs` + READ logging |
| Access controls | ✅ | RLS policies |
| Session timeout | ✅ | 15 минут auto-logout |
| Password policy | ⚠️ | Настраивается в Supabase Dashboard |

### GDPR (General Data Protection Regulation)

| Требование | Статус | Реализация |
|------------|--------|------------|
| Consent management | ✅ | `consent_records` таблица |
| Right to access | ✅ | `export_patient_data()` функция |
| Right to deletion | ✅ | `permanently_delete_patient_data()` функция |
| Data processing registry | ✅ | `data_processing_registry` таблица |
| Audit trail | ✅ | `audit_logs` таблица |

### 152-ФЗ (Российский закон о персональных данных)

| Требование | Статус | Реализация |
|------------|--------|------------|
| Согласие на обработку | ✅ | `consent_records` с проверкой в RLS |
| Локализация данных | ⚠️ | Зависит от хостинга Supabase |
| Аудит доступа | ✅ | `audit_logs` + READ logging |
| Шифрование | ✅ | Field-level encryption |

---

## Тестирование

### Проверка MFA

1. Войти в систему
2. Вызвать `enableMFA()` через консоль или UI
3. Отсканировать QR код в приложении-аутентификаторе
4. Верифицировать код через `verifyMFA()`
5. Проверить, что `mfaEnabled = true` в профиле

### Проверка Session Timeout

1. Войти в систему
2. Не выполнять действий 13 минут
3. Должно появиться предупреждение
4. Не выполнять действий еще 2 минуты
5. Должен произойти автоматический logout

### Проверка шифрования

```typescript
import { encryptPHI, decryptPHI } from '@/lib/encryption';

const plaintext = 'Test PHI data';
const encrypted = await encryptPHI(plaintext);
const decrypted = await decryptPHI(encrypted);
console.log(decrypted === plaintext); // должно быть true
```

### Проверка READ audit logging

1. Выполнить SELECT запрос через `auditedSupabase`
2. Проверить таблицу `audit_logs`:
```sql
SELECT * FROM audit_logs 
WHERE action = 'read' 
ORDER BY created_at DESC 
LIMIT 1;
```

### Проверка согласий

1. Создать пациента без согласия
2. Попробовать получить доступ - должно быть запрещено
3. Создать активное согласие `data_processing`
4. Попробовать получить доступ - должно быть разрешено

---

## Известные ограничения

1. **MFA UI компоненты** - базовые методы реализованы, но UI для настройки MFA нужно создать отдельно
2. **Шифрование ключей** - ключ хранится в `.env.local`, для production рекомендуется использовать секретный менеджер
3. **Миграция существующих данных** - существующие незашифрованные данные нужно зашифровать отдельным скриптом
4. **READ audit через прямой SQL** - логируются только операции через `auditedSupabase`, прямые SQL запросы не логируются

---

## Рекомендации для production

1. **Ключ шифрования:**
   - Использовать AWS Secrets Manager, HashiCorp Vault или аналоги
   - Регулярно ротировать ключи (раз в год)
   - Разные ключи для dev/staging/production

2. **MFA:**
   - Обязательная MFA для всех администраторов
   - Рекомендуемая MFA для всех пользователей

3. **Аудит:**
   - Регулярно проверять `audit_logs` на подозрительную активность
   - Настроить алерты на множественные неудачные попытки доступа

4. **Согласия:**
   - Регулярно проверять истекшие согласия
   - Автоматически уведомлять о необходимости обновления согласий

5. **Session timeout:**
   - Настроить в соответствии с политикой организации
   - Учитывать длительность типичной сессии работы

---

## Поддержка и обновления

При обновлении функций безопасности:
1. Обновить эту документацию
2. Обновить `CHANGELOG.md` (если есть)
3. Уведомить команду о breaking changes
4. Обновить тесты

---

## Контакты и ресурсы

- **Документация Supabase:** https://supabase.com/docs
- **HIPAA Compliance:** https://www.hhs.gov/hipaa
- **GDPR:** https://gdpr-info.eu
- **Web Crypto API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

---

**Версия документа:** 1.0  
**Последнее обновление:** Декабрь 2024

