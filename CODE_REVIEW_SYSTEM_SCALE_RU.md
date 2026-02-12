# Системный и масштабный код-ревью (2026-02-12)

## 1) Методика и охват

Проведен многослойный ревью по направлениям:
- **Качество кода и соответствие стандартам** (eslint).
- **Надежность и регрессии** (vitest).
- **Сборка и эксплуатационные сигналы** (vite build).
- **Точечный архитектурно-безопасностный анализ** backend middleware и API gateway (`transcription-service`).

## 2) Ключевые выводы (Executive Summary)

1. **Quality Gate не проходит**: линтер фиксирует **202 проблемы** (157 errors / 45 warnings), включая системный избыток `any`, `prefer-const`, проблемы hook dependencies и типизации. Это блокер для масштабируемой разработки.
2. **Test Gate не проходит**: падают 5 тестов в 2 test suites (`integration/auth-flow` и `use-mobile`). Есть признаки нестабильности тестовой среды и/или регрессии в поведении.
3. **Build проходит, но есть архитектурные предупреждения**:
   - Некорректный порядок CSS `@import`.
   - Dynamic import модулей, которые одновременно используются statically (chunking optimization не срабатывает).
4. **Backend (Node/Express) содержит масштабируемый anti-pattern**: создание нового Supabase client на каждый запрос в auth middleware.

## 3) Детальные наблюдения

### 3.1 Quality/Lint

- Основной технический долг — типизация: во многих слоях (UI, hooks, tests, data-access) используется `any`, что повышает риск runtime ошибок и ломает предсказуемость refactoring.
- Есть локальные code-smell сигналы (`prefer-const`, `no-empty-object-type`, `no-require-imports`).
- Часть warning'ов по `react-hooks/exhaustive-deps` потенциально указывает на race conditions/стейл-замыкания.

### 3.2 Тесты

- Падение интеграционного теста auth-flow: сценарий "profile fetch error" не доходит до ожидаемого UI-состояния (компонент застревает в loader-state).
- В `use-mobile` падают тесты на `matchMedia` и event listeners: это может быть несоответствие реализации и тестового mock-контракта.

### 3.3 Сборка/производительность

- Vite предупреждает о проблемном CSS-порядке `@import` (возможны неожиданные эффекты каскада и несовместимость с некоторыми tooling-цепочками).
- Выявлены случаи, когда dynamic import не дает выгоды из-за параллельных static imports того же модуля.

### 3.4 Архитектура backend и безопасность

- В `verifyAuthToken` каждый запрос создает `createClient(...)` с пользовательским bearer token. Это корректно функционально, но дорого по накладным расходам на high-RPS и усложняет контроль pooling/telemetry.
- В глобальном error-handler сервер логирует полную ошибку (`console.error('Error:', err)`), что может приводить к логированию чувствительных деталей. В ответ клиенту детали скрываются в production, но sanitization логов стоит усилить.

## 4) Риски для масштабирования

- **Velocity Risk (High):** разработка замедляется из-за несоблюдения Quality Gate.
- **Regression Risk (High):** непройденные тесты снижают доверие к поставкам.
- **Performance/Operability Risk (Medium):** неоптимальная стратегия инициализации клиентов и chunking-структура увеличивают latency/TTI и нагрузку.
- **Security/Compliance Risk (Medium):** избыточно подробные server logs при ошибках.

## 5) Приоритизированный план улучшений

### P0 (ближайшие 1–3 дня)
1. **Стабилизировать CI quality gates**
   - Зафиксировать baseline lint и убрать ошибки, мешающие merge (минимум: `no-explicit-any`, `prefer-const`, `no-empty-object-type`, `no-require-imports` в изменяемых модулях).
2. **Починить 5 failing tests**
   - `auth-flow` loader-deadlock
   - `use-mobile` контракт `matchMedia`/listeners.
3. **Вынести CSS `@import` в начало stylesheet**
   - устранить предупреждение сборки.

### P1 (1–2 недели)
1. **Типизация и контрактность data layer**
   - Ввести строгие типы для supabase-адаптеров и API response DTO.
2. **Пересобрать стратегию code-splitting**
   - Убрать конфликт dynamic+static import для одних и тех же модулей.
3. **Harden observability/security logging**
   - Маскирование токенов/PII в error logs, единый structured logger.

### P2 (2–4 недели)
1. **Квоты качества на команды/домены**
   - max new lint errors = 0, min test pass rate = 100% для changed scope.
2. **Регулярный architecture fitness review**
   - мониторинг bundle-size, test flakiness, latency p95/p99 по backend endpoint’ам.

## 6) KPI для контроля прогресса

- Lint errors: **157 → 0**.
- Failing tests: **5 → 0**.
- Hook dependency warnings: снижение минимум на 70%.
- Доля `any` в runtime-критичных слоях: снижение минимум на 80%.
- Bundle warnings (dynamic+static import conflicts): **0**.

## 7) Итог

Проект имеет сильную функциональную базу, но в текущем состоянии **не соответствует production-grade quality bar** для масштабируемой эволюции. Приоритет — восстановить доверие к quality gates (lint+tests), затем усилить архитектурные и эксплуатационные практики.


## 8) Execution Backlog (конкретные шаги исполнения)

### Трек A — Восстановление quality gates (P0)

| ID | Задача | Scope | Артефакт | ETA |
|---|---|---|---|---|
| A1 | Починить тест `auth-flow` (profile fetch error) | `src/__tests__/integration/auth-flow.test.tsx`, `src/contexts/AuthContext.tsx` | Зеленый integration suite | 0.5–1 день |
| A2 | Починить `use-mobile` тесты (`matchMedia`, listeners) | `src/hooks/use-mobile.tsx`, `src/hooks/__tests__/use-mobile.test.tsx`, `src/test/setup.ts` | Зеленый hooks suite | 0.5 дня |
| A3 | Исправить CSS `@import` warning | глобальный CSS entrypoint | Чистый `vite build` без warning про порядок `@import` | 0.25 дня |
| A4 | Убрать критичные lint-errors в изменяемом scope | Файлы из A1–A3 | `eslint` без новых errors | 0.5 дня |

**Definition of Done (трек A):**
- `npm run test:run` без падений в измененном scope.
- `npm run lint` без новых ошибок в измененном scope.
- `npm run build` без warning про порядок CSS `@import`.

### Трек B — Типизация и надежность (P1)

| ID | Задача | Scope | Артефакт | ETA |
|---|---|---|---|---|
| B1 | Снижение `any` в data-access | `src/lib/supabase-*.ts` | Явные DTO/return types | 2–4 дня |
| B2 | Устранение `no-empty-object-type` и `prefer-const` долгов | `src/types/database.types.ts`, data-layer | Чистый lint по выбранным правилам | 1–2 дня |
| B3 | Пересборка strategy code-splitting | Модули с dynamic+static import конфликтом | Снижение chunk warnings | 1–2 дня |

### Трек C — Эксплуатация и безопасность (P1/P2)

| ID | Задача | Scope | Артефакт | ETA |
|---|---|---|---|---|
| C1 | Санитизация error-логов | `backend/transcription-service/server.js` | Нет утечек чувствительных деталей в логах | 0.5 дня |
| C2 | Структурированное логирование | backend service | Коррелируемые, маскированные логи | 1–2 дня |
| C3 | Проверка auth-middleware на производительность | `backend/transcription-service/middleware/auth.js` | Рекомендации по клиентам/pooling | 1 день |

### Рекомендованный порядок PR

1. **PR-1 (Stabilization):** A1+A2+A3+A4.
2. **PR-2 (Typing Hardening):** B1+B2.
3. **PR-3 (Perf/Splitting):** B3.
4. **PR-4 (Observability/Security):** C1+C2+C3.

### Контрольные метрики на каждый PR

- Lint errors (global / changed scope).
- Количество failing tests.
- Build warnings count.
- Bundle-size diff на ключевых чанках.
- Время прогона CI.
