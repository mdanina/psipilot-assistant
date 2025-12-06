# Индекс документации PsiPilot Assistant

Навигация по всей документации проекта.

## 📚 Основная документация

### Быстрый старт
- **[README.md](../README.md)** - Основная документация проекта, установка, настройка
- **[QUICKSTART.md](../QUICKSTART.md)** - Быстрый старт за 6 шагов
- **[SETUP.md](../SETUP.md)** - Подробное руководство по развертыванию

### Развертывание
- **[DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md)** - Чеклист для проверки готовности к запуску
- **[REMOTE_SUPABASE_SETUP.md](../REMOTE_SUPABASE_SETUP.md)** - Настройка для удаленного self-hosted Supabase
- **[FIND_SUPABASE_URL.md](../FIND_SUPABASE_URL.md)** - Как найти URL для self-hosted Supabase

## 🔒 Безопасность

### Основная документация
- **[SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md)** - Полная документация по реализации функций безопасности
- **[SECURITY_SETUP.md](../SECURITY_SETUP.md)** - Инструкции по настройке безопасности
- **[CHANGELOG_SECURITY.md](../CHANGELOG_SECURITY.md)** - История изменений функций безопасности
- **[MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md)** - Руководство по миграции на новые функции безопасности
- **[docs/SECURITY_SUMMARY.md](SECURITY_SUMMARY.md)** - Краткое резюме функций безопасности

### Функции безопасности

#### 1. Multi-Factor Authentication (MFA)
- **Документация:** [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md#1-multi-factor-authentication-mfa)
- **Миграция:** `supabase/migrations/005_mfa_and_security.sql`
- **Код:** `src/contexts/AuthContext.tsx` (методы `enableMFA`, `verifyMFA`, `disableMFA`)

#### 2. Session Timeout
- **Документация:** [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md#2-session-timeout-с-auto-logout)
- **Код:** `src/contexts/AuthContext.tsx`, `src/components/auth/SessionTimeoutWarning.tsx`
- **Настройка:** 15 минут неактивности (настраивается в коде)

#### 3. Field-Level Encryption
- **Документация:** [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md#3-field-level-encryption-для-phi-данных)
- **Код:** `src/lib/encryption.ts`, `src/lib/supabase-encrypted.ts`
- **Настройка:** [SECURITY_SETUP.md](../SECURITY_SETUP.md#-настройка-шифрования-field-level-encryption)

#### 4. READ Audit Logging
- **Документация:** [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md#4-read-audit-logging)
- **Код:** `src/lib/supabase-audited.ts`
- **БД:** Функция `log_read_access()` в миграции 005

#### 5. Проверка согласий
- **Документация:** [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md#5-проверка-активных-согласий-в-rls)
- **БД:** Функции `has_active_consent()`, `has_active_consents()` в миграции 005
- **RLS:** Обновленные политики в миграции 005

## 🗄️ База данных

### Миграции
- **[supabase/README.md](../supabase/README.md)** - Общая информация о миграциях
- **001_initial_schema.sql** - Базовая схема БД
- **002_row_level_security.sql** - RLS политики
- **003_seed_section_templates.sql** - Шаблоны секций
- **004_audit_and_compliance.sql** - Аудит и соответствие требованиям
- **005_mfa_and_security.sql** - MFA и расширенные функции безопасности
- **013_make_sessions_patient_nullable.sql** - Поддержка сессий без пациента
  - **[docs/MIGRATION_013.md](MIGRATION_013.md)** - Документация миграции 013

### Структура БД
- **Таблицы:** clinics, profiles, patients, sessions, clinical_notes, sections, recordings, documents
- **Безопасность:** audit_logs, consent_records, mfa_factors, user_sessions
- **Типы:** См. `src/types/database.types.ts`

### Функционал записи и транскрипции
- **[docs/AUDIO_RECORDING_TRANSCRIPTION.md](AUDIO_RECORDING_TRANSCRIPTION.md)** - Полная документация функционала записи аудио и транскрипции
- **[docs/MIGRATION_013.md](MIGRATION_013.md)** - Документация миграции для поддержки сессий без пациента
- **Backend сервис:** `backend/transcription-service/` - Сервис транскрипции через AssemblyAI

## 💻 Разработка

### Структура проекта
```
src/
├── components/     # React компоненты
│   ├── ui/         # shadcn/ui components (50+ компонентов)
│   ├── layout/     # Header, Sidebar, MainLayout
│   ├── auth/       # ProtectedRoute, SessionTimeoutWarning
│   └── scribe/     # RecordingCard - компонент записи аудио
├── pages/          # Страницы приложения
├── contexts/       # AuthContext (MFA, session management)
├── hooks/          # Custom React hooks
│   └── useAudioRecorder.ts   # Хук для записи аудио
├── lib/            # Утилиты
│   ├── supabase.ts           # Базовый Supabase клиент
│   ├── supabase-encrypted.ts # Клиент с шифрованием
│   ├── supabase-audited.ts   # Клиент с аудитом
│   ├── supabase-recordings.ts # Работа с записями аудио
│   ├── supabase-sessions.ts  # Работа с сессиями
│   └── encryption.ts         # Утилиты шифрования
└── types/          # TypeScript типы
```

### Переменные окружения
- **Файл:** `.env.local` (не коммитится в git)
- **Пример:** `env.example.txt`
- **Переменные:**
  - `VITE_SUPABASE_URL` - URL вашего Supabase
  - `VITE_SUPABASE_ANON_KEY` - Anon ключ Supabase
  - `VITE_ENCRYPTION_KEY` - Ключ шифрования (base64, 32 байта)
  - `VITE_TRANSCRIPTION_API_URL` - URL backend сервиса транскрипции (по умолчанию http://localhost:3001)
- **Backend сервис:** `.env` в `backend/transcription-service/`
  - `ASSEMBLYAI_API_KEY` - API ключ AssemblyAI
  - `SUPABASE_URL` - URL Supabase
  - `SUPABASE_SERVICE_ROLE_KEY` - Service role ключ Supabase

## 🔧 Утилиты и скрипты

### Скрипты npm
- `npm run dev` - Запуск dev сервера
- `npm run build` - Сборка для production
- `npm run check:connection` - Проверка подключения к Supabase
- `npm run check:app` - Диагностика проблем с приложением
- `npm run check:updates` - Проверка обновлений из Git
- `npm run lint` - Проверка кода

### Скрипты в проекте
- `scripts/check-connection.js` - Проверка подключения к БД
- `scripts/check-app-issues.js` - Диагностика проблем с приложением
- `scripts/check-git-updates.js` - Проверка обновлений из Git
- `scripts/generate-encryption-key.js` - Генерация ключа шифрования

## 📖 По темам

### Настройка проекта
1. [QUICKSTART.md](../QUICKSTART.md) - Быстрый старт
2. [SETUP.md](../SETUP.md) - Подробная настройка
3. [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md) - Чеклист

### Безопасность
1. [SECURITY_SETUP.md](../SECURITY_SETUP.md) - Настройка безопасности
2. [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md) - Полная документация
3. [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) - Миграция на новые функции

### База данных
1. [supabase/README.md](../supabase/README.md) - Общая информация
2. Миграции в `supabase/migrations/`
3. Типы в `src/types/database.types.ts`
4. [docs/MIGRATION_013.md](MIGRATION_013.md) - Документация миграции 013

### Запись и транскрипция
1. [docs/AUDIO_RECORDING_TRANSCRIPTION.md](AUDIO_RECORDING_TRANSCRIPTION.md) - Полная документация
2. [backend/transcription-service/README.md](../backend/transcription-service/README.md) - Backend сервис
3. [backend/transcription-service/SETUP.md](../backend/transcription-service/SETUP.md) - Настройка сервиса

### Troubleshooting
1. [TROUBLESHOOTING_LOADING.md](../TROUBLESHOOTING_LOADING.md) - Решение проблем с загрузкой приложения
2. [TROUBLESHOOTING_LOGIN.md](TROUBLESHOOTING_LOGIN.md) - Решение проблем с входом в систему
3. [USER_PROFILE_CREATION.md](USER_PROFILE_CREATION.md) - Создание профилей пользователей
4. [FIND_SUPABASE_URL.md](../FIND_SUPABASE_URL.md) - Поиск URL Supabase
5. [REMOTE_SUPABASE_SETUP.md](../REMOTE_SUPABASE_SETUP.md) - Настройка удаленного Supabase
6. [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md#решение-проблем) - Решение проблем с миграциями
5. [docs/BUGFIXES.md](BUGFIXES.md) - История исправлений ошибок

## 🎯 Быстрые ссылки

### Для новых разработчиков
- Начните с [QUICKSTART.md](../QUICKSTART.md)
- Затем [SETUP.md](../SETUP.md)
- Проверьте [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md)

### Для администраторов
- [SECURITY_SETUP.md](../SECURITY_SETUP.md) - Настройка безопасности
- [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) - Применение миграций
- [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md) - Полная документация

### Для разработчиков
- [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md) - API и использование
- `src/lib/encryption.ts` - Документация в коде
- `src/lib/supabase-audited.ts` - Документация в коде
- `src/contexts/AuthContext.tsx` - Документация в коде

## 📝 Стандарты соответствия

### HIPAA
- ✅ MFA
- ✅ Шифрование at-rest
- ✅ Audit logging (включая READ)
- ✅ Session timeout
- ✅ Access controls (RLS)

### GDPR
- ✅ Consent management
- ✅ Right to access
- ✅ Right to deletion
- ✅ Data processing registry
- ✅ Audit trail

### 152-ФЗ
- ✅ Согласие на обработку
- ✅ Аудит доступа
- ✅ Шифрование

Подробнее: [SECURITY_IMPLEMENTATION.md](../SECURITY_IMPLEMENTATION.md#соответствие-стандартам)

## 🔄 Версионирование

- **Текущая версия:** 0.2.1
- **Changelog безопасности:** [CHANGELOG_SECURITY.md](../CHANGELOG_SECURITY.md)
- **Основной changelog:** См. git history

## 📞 Поддержка

При возникновении проблем:
1. Проверьте соответствующую документацию выше
2. Проверьте консоль браузера (F12)
3. Проверьте логи Supabase Dashboard
4. См. раздел "Решение проблем" в [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md)

---

**Последнее обновление:** Декабрь 2024


