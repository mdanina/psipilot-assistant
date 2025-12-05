# Changelog - Security Implementation

## [0.2.0] - 2024-12

### Добавлено - Критические функции безопасности

#### Multi-Factor Authentication (MFA)
- ✅ Таблица `mfa_factors` для хранения TOTP устройств
- ✅ Колонки `mfa_enabled`, `mfa_enabled_at`, `backup_codes` в `profiles`
- ✅ Методы `enableMFA()`, `verifyMFA()`, `disableMFA()` в AuthContext
- ✅ Интеграция с Supabase Auth MFA API
- ✅ RLS политики для `mfa_factors`

#### Session Timeout
- ✅ Автоматический logout через 15 минут неактивности
- ✅ Отслеживание активности пользователя (mouse, keyboard, touch)
- ✅ Компонент `SessionTimeoutWarning` с предупреждением за 2 минуты
- ✅ Метод `updateActivity()` для обновления timestamp активности

#### Field-Level Encryption
- ✅ Утилиты шифрования (`src/lib/encryption.ts`) с Web Crypto API
- ✅ AES-GCM 256-bit шифрование для PHI данных
- ✅ Обертка `supabase-encrypted.ts` для автоматического шифрования/дешифрования
- ✅ Колонки `*_encrypted` и `encryption_version` в БД
- ✅ Поддержка для: `ai_summary`, `ai_content`, `transcript`, `transcription_text`

#### READ Audit Logging
- ✅ Обертка `supabase-audited.ts` для логирования SELECT операций
- ✅ Функция `log_read_access()` в БД
- ✅ Автоматическое определение PHI полей
- ✅ Логирование метаданных (IP, user-agent, timestamp)

#### Проверка согласий в RLS
- ✅ Функция `has_active_consent()` для проверки активных согласий
- ✅ Функция `has_active_consents()` для множественных проверок
- ✅ Обновленные RLS политики для всех таблиц с PHI данными
- ✅ Требование согласия `data_processing` для доступа к данным пациентов
- ✅ Требование согласия `recording` для доступа к записям

### Изменено

#### `src/contexts/AuthContext.tsx`
- Добавлено состояние: `mfaEnabled`, `mfaVerified`, `lastActivity`, `sessionExpiresAt`
- Добавлены методы MFA и session management
- Реализован session timeout monitoring
- Реализовано отслеживание активности пользователя

#### `src/App.tsx`
- Добавлен компонент `<SessionTimeoutWarning />`

#### `supabase/migrations/005_mfa_and_security.sql`
- Новая миграция с всеми функциями безопасности

#### `env.example.txt`
- Добавлена переменная `VITE_ENCRYPTION_KEY`

### Документация

- ✅ `SECURITY_SETUP.md` - инструкции по настройке
- ✅ `SECURITY_IMPLEMENTATION.md` - полная документация реализации
- ✅ `CHANGELOG_SECURITY.md` - этот файл

### Технические детали

**Зависимости:**
- Используется нативный Web Crypto API (не требует дополнительных пакетов)
- Supabase Auth MFA API (встроен в @supabase/supabase-js)

**Миграции:**
- `005_mfa_and_security.sql` - идемпотентна, безопасна для повторного применения

**Обратная совместимость:**
- ✅ Все изменения обратно совместимы
- ✅ Существующий код продолжает работать
- ✅ Новые функции опциональны (можно использовать постепенно)

### Breaking Changes

Нет breaking changes. Все изменения обратно совместимы.

### Известные проблемы

1. MFA UI компоненты нужно создать отдельно (базовая функциональность готова)
2. Миграция существующих данных на шифрование требует отдельного скрипта
3. READ audit логирует только операции через `auditedSupabase`, не прямые SQL запросы

### Планы на будущее

- [ ] UI компоненты для настройки MFA
- [ ] Гранулярная система permissions (RBAC)
- [ ] Password policy enforcement
- [ ] Emergency access procedures
- [ ] SAML/OIDC интеграция
- [ ] Автоматическая ротация ключей шифрования
- [ ] Миграционный скрипт для шифрования существующих данных

---

## [0.1.0] - Предыдущая версия

### Базовые функции безопасности

- Row Level Security (RLS) политики
- Audit logging для INSERT/UPDATE/DELETE
- Consent records таблица
- GDPR compliance функции (export, delete)
- Multi-tenant изоляция данных

---

**Формат версий:** [MAJOR.MINOR.PATCH]  
**Дата:** ISO 8601 format (YYYY-MM-DD)

