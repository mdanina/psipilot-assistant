# Полный отчёт аудита безопасности PsiPilot Assistant

**Дата аудита:** 09 декабря 2025
**Версия проекта:** 0.1.0
**Аудитор:** Claude Security Audit
**Статус:** Требует внимания перед production

---

## Содержание

1. [Резюме](#резюме)
2. [Архитектура приложения](#архитектура-приложения)
3. [Критические уязвимости](#критические-уязвимости)
4. [Высокие уязвимости](#высокие-уязвимости)
5. [Средние уязвимости](#средние-уязвимости)
6. [Низкие уязвимости](#низкие-уязвимости)
7. [Соответствие стандартам](#соответствие-стандартам)
8. [Положительные аспекты](#положительные-аспекты)
9. [План исправлений](#план-исправлений)
10. [Рекомендации](#рекомендации)

---

## Резюме

### Общая оценка безопасности

| Категория | Оценка | Статус |
|-----------|--------|--------|
| **Аутентификация** | 7/10 | Требует улучшения |
| **Авторизация** | 5/10 | Критические проблемы |
| **Шифрование** | 6/10 | Архитектурные проблемы |
| **API Security** | 4/10 | Критические проблемы |
| **База данных** | 8/10 | Хорошо |
| **Compliance (HIPAA/GDPR)** | 7/10 | Частично соответствует |
| **Логирование** | 7/10 | Требует улучшения |
| **Инфраструктура** | 5/10 | Требует настройки |

### Сводка уязвимостей

| Критичность | Количество |
|-------------|------------|
| **CRITICAL** | 7 |
| **HIGH** | 14 |
| **MEDIUM** | 12 |
| **LOW** | 8 |
| **ИТОГО** | **41** |

### Общий вердикт

⚠️ **ПРИЛОЖЕНИЕ НЕ ГОТОВО К PRODUCTION** без исправления критических уязвимостей.

Основные риски:
1. Возможность доступа к данным чужой клиники
2. Ключ шифрования экспортируется в браузер
3. Отсутствие CORS и Rate Limiting
4. Утечка API ключей в документации

---

## Архитектура приложения

### Технологический стек

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 18 + TypeScript + Vite + TailwindCSS                 │
│  ├── Supabase Auth (JWT токены в localStorage)              │
│  ├── Field-level encryption (AES-GCM 256-bit)              │
│  └── React Query для state management                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND SERVICES                           │
│  Node.js + Express (transcription-service)                  │
│  ├── /api/transcribe - AssemblyAI интеграция               │
│  ├── /api/webhook - AssemblyAI callbacks                   │
│  └── /api/ai - OpenAI интеграция                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ PostgreSQL
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE                                │
│  ├── PostgreSQL (основная БД)                               │
│  │   ├── RLS политики (Row Level Security)                  │
│  │   ├── SECURITY DEFINER функции                           │
│  │   └── Audit triggers                                     │
│  ├── Auth (JWT, MFA)                                        │
│  └── Storage (документы, consent forms)                     │
└─────────────────────────────────────────────────────────────┘
```

### Поток данных

```
Пользователь → React App → Supabase/Backend → PostgreSQL
                  │
                  ├── PHI данные шифруются на клиенте (!)
                  ├── JWT токен хранится в localStorage
                  └── Audit logs записываются при доступе
```

---

## Критические уязвимости

### CRIT-001: Ключ шифрования экспортируется в браузер

**Файл:** `src/lib/encryption.ts:23`

**Проблема:**
```typescript
const key = import.meta.env.VITE_ENCRYPTION_KEY;
```

Переменные с префиксом `VITE_` автоматически включаются в клиентский JavaScript bundle. Это означает:
- Ключ шифрования виден в DevTools браузера
- Ключ виден в исходном коде на клиенте
- Любой может расшифровать все данные в БД

**Влияние:** Полная компрометация шифрования PHI данных

**Рекомендация:**
1. Перенести шифрование на backend
2. Использовать envelope encryption с публичным ключом на frontend
3. Никогда не передавать мастер-ключи в браузер

---

### CRIT-002: Отсутствие проверки clinic_id в AI routes

**Файл:** `backend/transcription-service/routes/ai.js:141-159`

**Проблема:**
```javascript
const { id: user_id, clinic_id } = req.user;
const { data: session } = await supabase
  .from('sessions')
  .select('*, patient:patients(*)')
  .eq('id', session_id)  // Проверяет только session_id!
  .single();
// ⚠️ НЕТ ПРОВЕРКИ: session.clinic_id === clinic_id
```

Пользователь клиники A может получить доступ к данным клиники B, просто подставив чужой `session_id`.

**Влияние:** Несанкционированный доступ к медицинским данным других клиник (нарушение HIPAA)

**Рекомендация:**
```javascript
if (!session || session.clinic_id !== clinic_id) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

---

### CRIT-003: CORS разрешает любой origin

**Файл:** `backend/transcription-service/server.js:16`

**Проблема:**
```javascript
app.use(cors());  // Разрешает ВСЕ источники!
```

Любой сайт в интернете может отправлять запросы к API от имени авторизованного пользователя.

**Влияние:** Возможность CSRF атак, утечка данных через сторонние сайты

**Рекомендация:**
```javascript
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
```

---

### CRIT-004: Отсутствие Rate Limiting

**Файл:** `backend/transcription-service/server.js`

**Проблема:** Нет ограничения количества запросов. Злоумышленник может:
- Перебирать ID сессий/пациентов
- Исчерпать лимиты OpenAI/AssemblyAI API
- Провести DDoS атаку

**Влияние:** Финансовые потери (API лимиты), DoS

**Рекомендация:**
```javascript
import rateLimit from 'express-rate-limit';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20
});

app.use('/api/', generalLimiter);
app.use('/api/ai/', aiLimiter);
```

---

### CRIT-005: Fallback к plaintext при отсутствии ключа

**Файл:** `src/lib/supabase-patients.ts:39-41`

**Проблема:**
```typescript
if (!isEncryptionConfigured()) {
  console.warn('Encryption not configured, storing PII in plaintext');
  return data; // Данные сохраняются БЕЗ ШИФРОВАНИЯ!
}
```

Если ключ не настроен, система тихо сохраняет PHI в открытом виде.

**Влияние:** Нарушение HIPAA, данные пациентов не защищены

**Рекомендация:**
```typescript
if (!isEncryptionConfigured()) {
  throw new Error('ENCRYPTION_KEY is required. Application cannot operate without encryption.');
}
```

---

### CRIT-006: Утечка API ключа AssemblyAI в документации

**Файлы:**
- `backend/transcription-service/README.md`
- `backend/transcription-service/SETUP.md`
- `backend/transcription-service/INSTALL_SUCCESS.md`

**Проблема:** Реальный API ключ виден в документации и закоммичен в git.

**Влияние:** Несанкционированный доступ к AssemblyAI API, финансовые потери

**Рекомендация:**
1. Немедленно ротировать ключ в консоли AssemblyAI
2. Удалить ключи из всех документов
3. Добавить pre-commit hook для проверки секретов (git-secrets)

---

### CRIT-007: Debug логирование криптографической информации

**Файл:** `src/lib/encryption.ts:172-180`

**Проблема:**
```typescript
console.log('[Decrypt] Total length:', combinedArray.length);
console.log('[Decrypt] Key length:', encryptionKey.length);  // !
console.log('[Decrypt] Encrypted data length (ciphertext+tag):', encrypted.length);
```

Логируется размер ключа и метаданные шифрования в консоль браузера.

**Влияние:** Информация для атаки, side-channel анализ

**Рекомендация:** Удалить все `console.log` из криптографических функций.

---

## Высокие уязвимости

### HIGH-001: JWT токен хранится в localStorage

**Файл:** `src/lib/supabase.ts:49-50`

```typescript
persistSession: true,  // Хранится в localStorage
autoRefreshToken: true,
```

**Проблема:** localStorage доступен через JavaScript, уязвим к XSS.

**Рекомендация:** Использовать httpOnly cookies или secure storage.

---

### HIGH-002: Использование admin client без проверок доступа

**Файл:** `backend/transcription-service/routes/ai.js:12-30`

**Проблема:** Admin client обходит RLS, но код не проверяет права доступа.

**Рекомендация:** Использовать обычный клиент с RLS или добавить явные проверки.

---

### HIGH-003: XSS через innerHTML в CaseSummaryBlock

**Файл:** `src/components/patients/CaseSummaryBlock.tsx:204`

```javascript
tempDiv.innerHTML = caseSummary;  // Без DOMPurify в handleCopy!
```

**Рекомендация:** Всегда использовать DOMPurify перед innerHTML.

---

### HIGH-004: Раскрытие деталей ошибок

**Файл:** `backend/transcription-service/server.js:57-62`

```javascript
res.status(500).json({
  error: 'Internal server error',
  message: err.message,  // Раскрывает детали!
});
```

**Рекомендация:** В production не возвращать `err.message`.

---

### HIGH-005: Отсутствие проверки доступа к clinical notes

**Файл:** `backend/transcription-service/routes/ai.js:440-489`

**Проблема:** GET `/api/ai/generate/:clinicalNoteId/status` не проверяет принадлежность записи.

---

### HIGH-006: SQL конструирование через конкатенацию строк

**Файл:** `backend/transcription-service/routes/ai.js:50, 87-88, 106`

```javascript
query = query.or(`clinic_id.eq.${clinic_id},is_system.eq.true`);
```

**Проблема:** Хотя Supabase параметризует, конкатенация строк - плохая практика.

---

### HIGH-007: Отсутствие валидации входных данных

**Файл:** `backend/transcription-service/routes/ai.js:140`

**Проблема:** `session_id`, `template_id` не валидируются как UUID.

**Рекомендация:** Использовать `zod` для валидации.

---

### HIGH-008: Webhook без проверки подписи

**Файл:** `backend/transcription-service/routes/webhook.js:32`

**Проблема:** AssemblyAI webhook принимает запросы без проверки подписи.

---

### HIGH-009: Логирование чувствительных ID

**Файл:** `src/lib/supabase-patients.ts:125, 150, 273`

```typescript
console.log('createPatient: Patient created with id:', patientId);
```

---

### HIGH-010: Profile может быть null при использовании

**Файл:** `src/contexts/AuthContext.tsx:316-325`

**Проблема:** Race condition при проверке `profile.role`.

---

### HIGH-011: Отсутствие Rate Limiting на брутфорс резервных кодов

**Файл:** `supabase/migrations/007_enhanced_security.sql:228`

---

### HIGH-012: Race Condition в create_clinic_for_onboarding

**Файл:** `supabase/migrations/010_fix_performance_and_stability.sql:37-42`

---

### HIGH-013: Отсутствие автоматической очистки expired sessions

**Файл:** `supabase/migrations/004_audit_and_compliance.sql:404`

**Проблема:** Функция `cleanup_expired_sessions()` не вызывается автоматически.

---

### HIGH-014: Отсутствие ENCRYPTION_KEY в backend .env.example

**Файл:** `backend/transcription-service/.env.example`

---

## Средние уязвимости

### MED-001: Session timeout только на frontend

**Файл:** `src/contexts/AuthContext.tsx:135-142`

Session timeout отслеживается только в браузере, можно обойти.

---

### MED-002: MFA не интегрирована в login flow

**Файл:** `src/pages/LoginPage.tsx`

MFA методы реализованы, но UI не требует ввода кода.

---

### MED-003: Отсутствие CSRF защиты

Backend не использует CSRF токены.

---

### MED-004: Отсутствие IP tracking для PHI доступа

Нет alerts при логине с нового IP/страны.

---

### MED-005: Конфликт RLS политик и consent checks

**Файл:** `supabase/migrations/005_mfa_and_security.sql:218`

Нет исключений для emergency access в некоторых политиках.

---

### MED-006: Шифрование только на уровне приложения

Нет database-level encryption (TDE).

---

### MED-007: Отсутствие ограничения размера audit logs

Таблица `audit_logs` может расти неограниченно.

---

### MED-008: Инвайты без двухфакторного подтверждения

**Файл:** `supabase/migrations/012_user_invitations.sql`

---

### MED-009: Отсутствие проверки лимитов OpenAI

Нет отслеживания usage per user/clinic.

---

### MED-010: Различные реализации шифрования

Frontend (Web Crypto) и Backend (Node crypto) - могут быть несовместимы.

---

### MED-011: Отсутствие HTTPS enforcement

**Файл:** `backend/transcription-service/server.js:66`

---

### MED-012: Отсутствие проверки дублирования webhook

Один webhook может быть обработан дважды.

---

## Низкие уязвимости

### LOW-001: Отсутствие password complexity требований на frontend

### LOW-002: Отсутствие forgot password flow

### LOW-003: Использование atob/btoa вместо TextEncoder

### LOW-004: Отсутствие заголовков безопасности (helmet)

### LOW-005: Отсутствие request logging

### LOW-006: Отсутствие IMMUTABLE маркеров для функций

### LOW-007: Storage политики слишком разрешительные

### LOW-008: Отсутствие детального логирования удалений

---

## Соответствие стандартам

### HIPAA Compliance

| Требование | Статус | Комментарий |
|------------|--------|-------------|
| Unique user identification | ✅ | Supabase Auth |
| MFA support | ⚠️ | Реализовано, но не enforced |
| Encryption at-rest | ⚠️ | Ключ в браузере! |
| Encryption in-transit | ✅ | TLS через Supabase |
| Audit logging | ✅ | audit_logs таблица |
| Access controls | ⚠️ | RLS есть, но clinic_id не проверяется в backend |
| Session timeout | ✅ | 15 минут |
| Emergency access | ✅ | Break-the-glass реализован |
| Minimum necessary | ⚠️ | Нет granular permissions |

**HIPAA Status:** ⚠️ **ЧАСТИЧНО СООТВЕТСТВУЕТ**

### GDPR Compliance

| Требование | Статус | Комментарий |
|------------|--------|-------------|
| Consent management | ✅ | consent_records таблица |
| Right to access | ✅ | export_patient_data() |
| Right to deletion | ✅ | permanently_delete_patient_data() |
| Data processing registry | ✅ | data_processing_registry |
| Data minimization | ⚠️ | Слишком много логирования ID |
| Encryption | ⚠️ | Проблемы с ключом |

**GDPR Status:** ⚠️ **ЧАСТИЧНО СООТВЕТСТВУЕТ**

### 152-ФЗ Compliance

| Требование | Статус |
|------------|--------|
| Согласие на обработку | ✅ |
| Локализация данных | ❓ Зависит от хостинга |
| Аудит доступа | ✅ |
| Шифрование | ⚠️ |

---

## Положительные аспекты

Проект содержит много правильно реализованных механизмов безопасности:

### Хорошо реализовано

1. **Row Level Security (RLS)** - Грамотно спроектированные политики изоляции по clinic_id
2. **Audit Logging** - Полное логирование операций с PHI
3. **Break-the-Glass** - Emergency access с обязательным логированием
4. **Consent Management** - Система согласий интегрирована в RLS
5. **Soft Delete** - Данные не удаляются физически
6. **MFA Infrastructure** - TOTP и backup codes реализованы
7. **Field-level Encryption** - Архитектура готова (но ключ неправильно хранится)
8. **IP Blocking** - Защита от brute force на уровне БД
9. **Session Management** - Timeout и tracking
10. **SECURITY DEFINER функции** - Правильное использование для обхода RLS

### Документация

Проект имеет отличную документацию безопасности:
- `SECURITY_IMPLEMENTATION.md` - Описание всех механизмов
- `SECURITY_SETUP.md` - Инструкции по настройке
- `CHANGELOG_SECURITY.md` - История изменений

---

## План исправлений

### Неделя 1 (CRITICAL)

| # | Задача | Приоритет | Оценка |
|---|--------|-----------|--------|
| 1 | Перенести шифрование на backend | CRITICAL | 8h |
| 2 | Добавить clinic_id проверки в AI routes | CRITICAL | 4h |
| 3 | Настроить CORS правильно | CRITICAL | 1h |
| 4 | Добавить Rate Limiting | CRITICAL | 2h |
| 5 | Удалить debug логи из encryption | CRITICAL | 1h |
| 6 | Ротировать утекшие API ключи | CRITICAL | 1h |
| 7 | Сделать шифрование обязательным | CRITICAL | 2h |

### Неделя 2 (HIGH)

| # | Задача | Приоритет | Оценка |
|---|--------|-----------|--------|
| 8 | Добавить валидацию входных данных (zod) | HIGH | 4h |
| 9 | Исправить XSS в CaseSummaryBlock | HIGH | 1h |
| 10 | Добавить проверку подписи webhook | HIGH | 2h |
| 11 | Улучшить обработку ошибок | HIGH | 2h |
| 12 | Настроить pg_cron для cleanup | HIGH | 2h |
| 13 | Удалить логирование ID | HIGH | 2h |
| 14 | Добавить ENCRYPTION_KEY в .env.example | HIGH | 0.5h |

### Неделя 3-4 (MEDIUM)

| # | Задача | Приоритет | Оценка |
|---|--------|-----------|--------|
| 15 | Интегрировать MFA в login flow | MEDIUM | 8h |
| 16 | Добавить CSRF защиту | MEDIUM | 4h |
| 17 | IP tracking для PHI доступа | MEDIUM | 4h |
| 18 | Ограничить размер audit logs | MEDIUM | 2h |
| 19 | Добавить OpenAI quota tracking | MEDIUM | 4h |
| 20 | Добавить helmet middleware | MEDIUM | 1h |

---

## Рекомендации

### Архитектурные рекомендации

1. **Перенести шифрование на backend**
   - Создать endpoint `/api/crypto/encrypt` и `/api/crypto/decrypt`
   - Использовать HSM или KMS для хранения ключей
   - Никогда не передавать мастер-ключи в браузер

2. **Использовать envelope encryption**
   - Master key в KMS (AWS KMS, HashiCorp Vault)
   - Data encryption keys для каждой записи
   - Ротация ключей без перешифрования данных

3. **Улучшить авторизацию**
   - Всегда проверять `clinic_id` на backend
   - Не доверять данным от клиента
   - Использовать authenticated client вместо admin client где возможно

### Операционные рекомендации

1. **Secrets Management**
   - Использовать AWS Secrets Manager / HashiCorp Vault
   - Никогда не хранить секреты в коде или документации
   - Настроить git-secrets hook

2. **Мониторинг**
   - Настроить alerts на подозрительную активность
   - Мониторить использование API лимитов
   - Регулярно проверять audit logs

3. **Процессы**
   - Security review при каждом PR
   - Регулярные penetration тесты
   - Обучение разработчиков по безопасности

### Compliance рекомендации

1. **Для HIPAA**
   - Получить BAA от Supabase (если cloud)
   - Провести официальный HIPAA аудит
   - Документировать все security controls

2. **Для GDPR**
   - Назначить DPO
   - Провести DPIA (Data Protection Impact Assessment)
   - Обновить Privacy Policy

3. **Для 152-ФЗ**
   - Убедиться в локализации данных на территории РФ
   - Уведомить Роскомнадзор об обработке ПДн
   - Получить согласия в требуемой форме

---

## Заключение

PsiPilot Assistant имеет **хорошую архитектурную основу** для безопасности медицинских данных, но содержит **критические уязвимости**, которые необходимо исправить перед production использованием.

**Главные риски:**
1. Ключ шифрования в браузере - компрометирует всё шифрование
2. Отсутствие проверки clinic_id - доступ к чужим данным
3. Открытый CORS - атаки со сторонних сайтов
4. Утечка API ключей - финансовые и репутационные риски

**Срок исправления критических уязвимостей:** 1-2 недели

После исправления критических уязвимостей, приложение может быть рассмотрено для limited production use с continued monitoring.

---

**Конец отчёта**

*Для вопросов по данному аудиту обращайтесь к команде безопасности.*
