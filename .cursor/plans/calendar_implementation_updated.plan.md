---
name: Calendar Implementation (без синхронизации, с заделом на n8n)
overview: "Реализация календаря для планирования встреч с клиентами. Синхронизация с внешними календарями отложена, но структура подготовлена для будущей интеграции через n8n."
todos:
  - id: db-migration
    content: Создать миграцию 039 для добавления полей meeting_format, duration_minutes, recurring_pattern, recurring_end_date, parent_appointment_id в таблицу sessions
    status: pending
  - id: calendar-page
    content: "Создать страницу CalendarPage.tsx с основным layout: заголовок, переключатель вида, кнопки действий, левая панель с календарем, правая панель с расписанием"
    status: pending
  - id: create-appointment-dialog
    content: Создать компонент CreateAppointmentDialog.tsx с формами выбора клиента, деталей встречи и настройки повторений
    status: pending
  - id: calendar-view
    content: Создать компонент CalendarView.tsx для отображения календаря в режимах день/неделя/месяц
    status: pending
  - id: appointment-list
    content: Создать компонент AppointmentList.tsx для отображения списка встреч на день с возможностью редактирования
    status: pending
  - id: session-functions
    content: Добавить функции getScheduledSessions, createAppointment, updateAppointment, deleteAppointment в supabase-sessions.ts
    status: pending
  - id: sidebar-integration
    content: Добавить ссылку на календарь в Sidebar.tsx
    status: pending
  - id: app-routing
    content: Добавить маршрут /calendar в App.tsx
    status: pending
  - id: update-types
    content: Обновить типы в database.types.ts после миграции (перегенерировать или обновить вручную)
    status: pending
---

# Реализация календаря встреч

## Обзор

Реализация календаря для планирования встреч с клиентами на основе скриншотов. Календарь будет отдельной страницей `/calendar` с поддержкой просмотра день/неделя/месяц, создания встреч (существующий/новый клиент), формата встречи (онлайн/очно), продолжительности и повторяющихся встреч.

**Синхронизация с внешними календарями отложена**, но структура БД и API endpoints подготовлены для будущей интеграции через n8n.

## База данных

### Миграция 039: Расширение таблицы sessions для календаря

**Файл:** `supabase/migrations/039_add_appointment_fields.sql`

Добавить поля в таблицу `sessions`:

- `meeting_format` VARCHAR(20) - 'online' | 'in_person' | NULL
- `duration_minutes` INTEGER - продолжительность встречи в минутах
- `recurring_pattern` VARCHAR(50) - 'weekly' | 'monthly' | NULL (для повторяющихся встреч)
- `recurring_end_date` TIMESTAMPTZ - дата окончания повторений
- `parent_appointment_id` UUID - ссылка на родительскую встречу для повторений

Индексы:

- `idx_sessions_scheduled_at_format` - для фильтрации по дате и формату
- `idx_sessions_recurring` - для поиска повторяющихся встреч

## Frontend компоненты

### 1. Страница календаря

**Файл:** `src/pages/CalendarPage.tsx`

Основная страница календаря с:

- Заголовком "Календарь сессий"
- Переключателем вида: День/Неделя/Месяц
- Кнопкой "Синхронизация" (заглушка с сообщением о будущей функции)
- Кнопкой "+ Новая встреча"
- Левым панелем с месячным календарем и легендой
- Правым панелем с расписанием выбранного дня

### 2. Компонент создания встречи

**Файл:** `src/components/calendar/CreateAppointmentDialog.tsx`

Модальное окно с формами:

- Выбор клиента: "Существующий клиент" / "Новый клиент"
- Для существующего: поиск и выбор из списка
- Для нового: поля "Имя клиента" и "Контактная информация"
- Детали встречи: дата, время, продолжительность (dropdown), формат (онлайн/очно)
- Повторяющаяся встреча: toggle с описанием

### 3. Компонент календарного вида

**Файл:** `src/components/calendar/CalendarView.tsx`

Компонент для отображения календаря в разных режимах:

- День: список временных слотов с возможностью добавления встречи
- Неделя: таблица с днями недели и временными слотами
- Месяц: сетка календаря с отображением встреч

### 4. Компонент списка встреч

**Файл:** `src/components/calendar/AppointmentList.tsx`

Отображение встреч для выбранного дня с:

- Временными слотами
- Информацией о клиенте
- Форматом встречи (цветовая индикация)
- Возможностью редактирования/удаления

## Библиотеки функций

### Расширение supabase-sessions.ts

**Файл:** `src/lib/supabase-sessions.ts`

Добавить функции:

- `getScheduledSessions(startDate, endDate)` - получение запланированных встреч для диапазона дат
- `createAppointment(params)` - создание встречи с поддержкой повторений
- `updateAppointment(id, updates)` - обновление встречи
- `deleteAppointment(id)` - удаление встречи (soft delete)
- `getRecurringAppointments(parentId)` - получение повторяющихся встреч

## Интеграция

### Обновление Sidebar

**Файл:** `src/components/layout/Sidebar.tsx`

Добавить пункт меню:

```typescript
{ name: "Календарь", icon: Calendar, path: "/calendar" }
```

### Обновление App.tsx

**Файл:** `src/App.tsx`

Добавить маршрут:

```typescript
<Route path="/calendar" element={<ProtectedRoute><MainLayout><CalendarPage /></MainLayout></ProtectedRoute>} />
```

### Обновление типов

**Файл:** `src/types/database.types.ts`

Обновить типы для sessions после миграции (добавить новые поля).

## Стилизация

Использовать существующие UI компоненты:

- `Calendar` из `@/components/ui/calendar`
- `Dialog` для модальных окон
- `Button`, `Input`, `Select`, `RadioGroup`, `Switch` из UI библиотеки
- Цветовая схема: зеленый для свободного времени, синий для онлайн, фиолетовый для очно

## Синхронизация с внешними календарями (задел на будущее через n8n)

### Структура для будущей интеграции

**Файл:** `supabase/migrations/040_calendar_sync.sql` (создать позже, когда понадобится)

Таблицы для будущей синхронизации:

- `calendar_connections` - настройки подключений пользователей (без токенов, токены в n8n)
  - `user_id`, `provider` (google/outlook), `external_calendar_id`, `sync_enabled`, `sync_direction`
- `external_calendar_events` - события из внешних календарей (занятые слоты)
  - `user_id`, `external_event_id`, `start_time`, `end_time`, `title`, `is_busy`, `synced_at`

**Файл:** `src/lib/calendar-api.ts` (создать позже)

REST API endpoints для n8n:

- `getUserAppointments(userId, startDate, endDate)` - для экспорта
- `createAppointmentFromExternal(data)` - для импорта
- `getBusySlots(userId, startDate, endDate)` - для отображения занятых слотов

**Кнопка "Синхронизация":**

На текущем этапе показывает toast/alert: "Синхронизация с внешними календарями будет доступна в будущих обновлениях"

## Особенности реализации

1. **Повторяющиеся встречи**: При создании повторяющейся встречи создавать серию записей в sessions с parent_appointment_id
2. **Создание нового клиента**: Использовать `createPatient` из `supabase-patients.ts` при создании встречи с новым клиентом
3. **RLS политики**: Существующие политики для sessions должны работать, возможно потребуется обновление для поддержки NULL patient_id при создании встречи
4. **Локализация**: Все тексты на русском языке согласно скриншотам
5. **Синхронизация**: Отложена. Структура БД и API endpoints будут созданы позже для интеграции через n8n

