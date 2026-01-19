# Граф зависимостей SessionsPage.tsx

> Создано: 2026-01-19
> Для рефакторинга компонента SessionsPage (~2800 строк)

## Обзор

Компонент SessionsPage - центральная страница для работы с сессиями пациентов.
Включает запись аудио, транскрипцию, заметки специалиста, генерацию клинических записей.

---

## 1. useState переменные (22 шт.)

| Переменная | Строка | Используется в | Примечания |
|------------|--------|----------------|------------|
| `activeSession` | 93 | effects, handlers, JSX, useMemo | Центральная переменная |
| `openTabs` | 94 | effects, handlers, JSX, useMemo | Set открытых вкладок |
| `recordings` | 95 | effects, JSX, useMemo | Записи текущей сессии |
| `isLinking` | 96 | handlers, JSX | Флаг привязки к пациенту |
| `selectedPatientId` | 187 | handlers, JSX | Выбранный пациент в диалоге |
| `linkDialogOpen` | 188 | handlers, JSX | Диалог привязки |
| `relinkWarning` | 189-194 | handlers, JSX | Предупреждение о перепривязке |
| `deletingRecordingId` | 195 | handlers, JSX | ID удаляемой записи |
| `deleteDialogOpen` | 196 | handlers, JSX | Диалог удаления записи |
| `closingSessionId` | 197 | handlers, JSX | ID закрываемой сессии |
| `closeSessionDialogOpen` | 198 | handlers, JSX | Диалог закрытия сессии |
| `searchQuery` | 199 | useMemo (filteredSessions) | Поиск по сессиям |
| `showRecoveryDialog` | 202 | handlers, JSX | Диалог восстановления |
| `unuploadedRecordings` | 203-209 | handlers, JSX | Незагруженные записи |
| `sessionNotes` | 212 | useMemo, handlers, JSX | Заметки сессии |
| `notesDialogOpen` | 213 | JSX | Диалог заметок |
| `clinicalNotes` | 216 | handlers, JSX | Клинические заметки |
| `selectedTemplateId` | 217 | handlers, JSX | Выбранный шаблон |
| `isGenerating` | 218 | handlers, JSX | Флаг генерации |
| `createSessionDialogOpen` | 221 | JSX | Диалог создания сессии |
| `isRecordingInSession` | 224 | handlers, JSX | Флаг записи в сессии |
| `isSavingRecording` | 225 | JSX | **⚠️ DEAD CODE** |

### Проблема: Dead Code
```typescript
// Строка 225 - setIsSavingRecording никогда не вызывается!
const [isSavingRecording, setIsSavingRecording] = useState(false);

// В JSX проверяется, но никогда не true:
{isRecordingInSession || isSavingRecording ? (...) : (...)}
```

---

## 2. useMemo (12 шт.)

### Граф зависимостей useMemo

```
patientsData (из usePatients)
    │
    ▼
patients ────────────────────┐
    │                        │
    ▼                        ▼
patientsMap            filteredSessions
                             ▲
                             │
tabSessions (из useSessionsByIds)
    │                        │
    ├───────────────────────►│
    │                        │
    ▼                        │
tabSessionsMap ──────────────┤
    │                        │
    ▼                        │
currentSession               │
    ▲                        │
    │                        │
activeSession ───────────────┤
    │                        │
    ▼                        │
currentRecordings ───────────┤
    │                        │
    ▼                        │
rawTranscriptText            │
    │                        │
    ▼                        │
transcriptText               │
    ▲                        │
    │                        │
currentNotes ◄───────────────┤
    ▲                        │
    │                        │
sessionNotes                 │
                             │
searchQuery ─────────────────┤
                             │
openTabs ────────────────────┘

sessions (из useSessions)
    │
    ▼
sessionsMap

profile?.clinic_id
    │
    ▼
stableClinicId

openTabs
    │
    ▼
openTabIds
```

### Детали useMemo

| Имя | Зависимости | Назначение |
|-----|-------------|------------|
| `stableClinicId` | `profile?.clinic_id` | Стабильный ID клиники для queryKey |
| `patients` | `patientsData` | Маппинг пациентов в тип Patient[] |
| `patientsMap` | `patients` | Map для O(1) поиска пациентов |
| `tabSessionsMap` | `tabSessions` | Map для O(1) поиска сессий вкладок |
| `sessionsMap` | `sessions` | Map для O(1) поиска всех сессий |
| `openTabIds` | `openTabs` | Array из Set для useSessionsByIds |
| `filteredSessions` | `tabSessions, patientsMap, searchQuery, openTabs` | Отфильтрованные сессии для UI |
| `currentSession` | `activeSession, openTabs, tabSessionsMap` | Текущая активная сессия |
| `currentRecordings` | `recordings, activeSession` | Записи текущей сессии |
| `currentNotes` | `sessionNotes, activeSession` | Заметки текущей сессии |
| `rawTranscriptText` | `currentRecordings` | Сырой текст транскрипта |
| `transcriptText` | `rawTranscriptText, currentNotes` | Комбинированный транскрипт |

---

## 3. useRef (9 шт.)

| Ref | Тип | Назначение |
|-----|-----|------------|
| `currentRecordingSessionIdRef` | `string \| null` | ID сессии текущей записи |
| `audioFileInputRef` | `HTMLInputElement` | DOM ref для file input |
| `lastCheckpointRef` | `string \| null` | ID последнего checkpoint |
| `processingNavigationRef` | `boolean` | Флаг обработки навигации |
| `saveTabsTimeoutRef` | `NodeJS.Timeout` | Таймер debounce сохранения |
| `lastSavedTabsRef` | `Set<string>` | Последние сохраненные вкладки |
| `tabsLoadedFromDBRef` | `boolean` | Флаг загрузки из БД |
| `pollingIntervalsRef` | `Map<string, NodeJS.Timeout>` | Таймеры polling |
| `pollingAttemptsRef` | `Map<string, number>` | Счетчики попыток polling |

---

## 4. useEffect (21 шт.)

### Группа: Инициализация и данные

| # | Зависимости | Назначение | Строки |
|---|-------------|------------|--------|
| 1 | `sessions, isLoadingSessions, stableClinicId` | Debug логирование сессий | 110-116 |
| 2 | `user?.id` | Загрузка вкладок из БД | 433-454 |
| 3 | `openTabs, user?.id` | Debounced сохранение вкладок в БД | 460-486 |
| 4 | `openTabs` | Маркировка вкладок как загруженных | 527-534 |
| 5 | `tabSessions, isLoadingTabSessions, openTabs` | Фильтрация удаленных сессий | 538-569 |
| 6 | `location.state, searchParams, ...` | Обработка навигации с sessionId | 572-634 |
| 7 | `user, profile` | Проверка незагруженных записей | 738-754 |
| 8 | `activeSession` | Загрузка recordings/notes/clinicalNotes | 998-1009 |

### Группа: Сессии и активная сессия

| # | Зависимости | Назначение | Строки |
|---|-------------|------------|--------|
| 9 | `tabSessions, openTabs, activeSession` | Выбор активной сессии | 489-521 |
| 10 | `activeSession, recordings` | Auto-refresh при pending транскрипциях | 1012-1029 |
| 11 | `activeSession` | Refresh при visibility change | 1032-1041 |

### Группа: Запись аудио

| # | Зависимости | Назначение | Строки |
|---|-------------|------------|--------|
| 12 | `isRecording, updateActivity` | Обновление activity каждые 30с | 253-267 |
| 13 | `recorderError, toast` | Показ ошибок записи | 321-329 |
| 14 | `wasPartialSave, audioBlob, toast` | Предупреждение о partial save | 332-340 |
| 15 | `isRecording, recordingTime, getCurrentChunks, getCurrentMimeType` | Periodic checkpoint каждые 10 мин | 818-874 |
| 16 | `isRecording, recordingTime, getCurrentChunks, getCurrentMimeType` | beforeunload/visibilitychange | 877-952 |
| 17 | `user, profile, toast` | Восстановление после перезагрузки | 955-985 |

### Группа: Сетевые операции

| # | Зависимости | Назначение | Строки |
|---|-------------|------------|--------|
| 18 | `user, profile, activeSession, retryUploadRecording` | Auto-retry при online | 757-815 |

### Группа: Cleanup

| # | Зависимости | Назначение | Строки |
|---|-------------|------------|--------|
| 19 | `[]` | Cleanup polling intervals при unmount | 1353-1359 |

---

## 5. Циклические зависимости

### Цикл 1: openTabs ↔ tabSessions

```
openTabs
    │
    ▼ (useSessionsByIds query)
tabSessions
    │
    ▼ (Filter deleted tabs effect)
setOpenTabs
    │
    ▼
openTabs (cycle)
```

**Риск**: При удалении сессии из БД, эффект фильтрации может вызвать каскадное обновление.

### Цикл 2: activeSession ↔ recordings

```
activeSession
    │
    ▼ (Auto-refresh effect)
loadRecordings()
    │
    ▼
setRecordings
    │
    ▼
recordings
    │
    ▼ (Dependency check in effect)
[re-evaluate effect]
```

**Митигация**: Условие `hasPendingTranscriptions` предотвращает бесконечный polling.

### Цикл 3: openTabs ↔ activeSession ↔ tabSessions

```
handleCloseSession
    │
    ├──► setOpenTabs
    │        │
    │        ▼
    │    openTabs
    │        │
    │        ▼ (Set active session effect)
    └──► setActiveSession
             │
             ▼
         activeSession
```

---

## 6. Event Handlers (18 функций)

### Асинхронные функции

| Функция | Зависимости | Мутации |
|---------|-------------|---------|
| `loadOpenTabs` | `user?.id` | returns Set |
| `saveOpenTabs` | `user?.id` | supabase insert/delete |
| `retryUploadRecording` | `user, profile, activeSession, transcriptionApiUrl, toast, addTranscription` | createSession, createRecording, uploadAudioFile, startTranscription |
| `loadRecordings` | `transcriptionApiUrl` | setRecordings, syncTranscriptionStatus |
| `loadSessionNotes` | - | setSessionNotes |
| `loadClinicalNotes` | - | setClinicalNotes |
| `handleCreateNote` | `activeSession, user` | createSessionNote, loadSessionNotes |
| `handleDeleteNote` | `activeSession` | deleteSessionNote, loadSessionNotes |
| `handleCloseSession` | `tabSessionsMap, sessionsMap, user, queryClient` | setOpenTabs, setActiveSession, saveOpenTabs, queryClient.invalidate |
| `handleLinkAndCloseSession` | `closingSessionId, selectedPatientId` | linkSessionMutation, completeSessionMutation, setOpenTabs |
| `handleDeleteSession` | `closingSessionId` | deleteSessionMutation |
| `handleDeleteRecording` | `activeSession` | deleteRecording, loadRecordings |
| `handleOpenLinkDialog` | `activeSession, tabSessionsMap` | checkSessionClinicalNotes, setRelinkWarning |
| `handleLinkToPatient` | `activeSession, selectedPatientId, tabSessionsMap, relinkWarning, profile` | linkSessionMutation, queryClient.invalidate, loadClinicalNotes |
| `handleCreateNewSession` | `user, profile` | createSessionMutation, linkSessionMutation, setOpenTabs, queryClient.invalidate |
| `handleStartRecordingInSession` | `user, profile, activeSession` | startRecording, setIsRecordingInSession |
| `handleStopRecordingInSession` | `currentRecordingSessionIdRef, user, recordingTime` | stopRecording, queueUpload, reset |
| `handleUploadAudioFile` | `user, profile, activeSession` | queueUpload |

### useCallback (1 шт.)

```typescript
retryUploadRecording: useCallback(..., [
  user, profile, activeSession, transcriptionApiUrl,
  toast, setRecordings, addTranscription
])
```

---

## 7. Внешние хуки

```typescript
// Авторизация
const { user, profile, updateActivity } = useAuth();

// Навигация
const navigate = useNavigate();
const location = useLocation();
const [searchParams, setSearchParams] = useSearchParams();

// Данные
const { data: sessions, isLoading: isLoadingSessions } = useSessions(stableClinicId);
const { data: tabSessions, isLoading: isLoadingTabSessions } = useSessionsByIds(openTabIds);
const { data: patientsData, isLoading: isLoadingPatients } = usePatients();

// Мутации
const createSessionMutation = useCreateSession();
const deleteSessionMutation = useDeleteSessionMutation();
const completeSessionMutation = useCompleteSession();
const linkSessionMutation = useLinkSessionToPatient();
const invalidateSessions = useInvalidateSessions();
const queryClient = useQueryClient();

// Запись аудио
const {
  status: recorderStatus,
  recordingTime,
  audioBlob,
  error: recorderError,
  wasPartialSave,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  cancelRecording,
  reset,
  getCurrentChunks,
  getCurrentMimeType,
} = useAudioRecorder();

// Транскрипция
const {
  processingTranscriptions,
  isAnyProcessing: isAnyTranscriptionProcessing,
  addTranscription,
} = useTranscriptionRecovery({ onComplete, onError });

// Фоновая загрузка
const {
  queueUpload,
  hasActiveUploads,
  pendingUploads,
  hasFailedUploads,
  failedUploadsCount,
  retryUpload,
  dismissFailedUpload
} = useBackgroundUpload();

// UI
const { toast } = useToast();
const recordingBlocker = useNavigationBlocker(...);
```

---

## 8. Обнаруженные проблемы

### 8.1 Dead Code: `isSavingRecording`

**Файл**: `SessionsPage.tsx`
**Строка**: 225

```typescript
const [isSavingRecording, setIsSavingRecording] = useState(false);
```

`setIsSavingRecording` никогда не вызывается. Переменная используется в JSX (строки 2404, 2409, 2460, 2479), но всегда `false`.

**Рекомендация**: Удалить или реализовать логику сохранения.

### 8.2 Variable Shadowing

**Файл**: `SessionsPage.tsx`
**Строки**: 1419, 1471

```typescript
// Строка 1419
const savedSessionId = activeSession;
// ...
// Строка 1471 - ПОВТОРНОЕ объявление
const savedSessionId = activeSession;
```

**Рекомендация**: Вынести в начало функции или использовать разные имена.

### 8.3 Потенциальные Stale Closures

**Файл**: `SessionsPage.tsx`
**Строки**: 279-318

Колбэки `onComplete`/`onError` в `useTranscriptionRecovery` используют `activeSession`:

```typescript
onComplete: async (recordingId, sessionId) => {
  if (sessionId === activeSession || !activeSession) {
    // activeSession может быть устаревшим
  }
}
```

**Митигация**: Колбэки в dependency array хука, но уже запланированные setTimeout могут использовать устаревшие значения.

**Рекомендация**: Использовать ref для activeSession или передавать sessionId через параметр.

### 8.4 Размер компонента

~2800 строк - слишком большой компонент.

**Рекомендация для рефакторинга**:
1. Выделить Recording Panel в отдельный компонент
2. Выделить Session Tabs в отдельный компонент
3. Выделить диалоги в отдельные компоненты
4. Создать кастомные хуки для:
   - Управления вкладками (`useSessionTabs`)
   - Управления записью (`useSessionRecording`)
   - Управления диалогами (`useSessionDialogs`)

---

## 9. Рекомендации по рефакторингу

### Приоритет 1: Критические исправления

1. **Удалить dead code** `isSavingRecording`
2. **Исправить shadowing** `savedSessionId`

### Приоритет 2: Архитектурные улучшения

1. **Разбить на под-компоненты**:
   - `SessionTabs` - управление вкладками
   - `RecordingPanel` - запись и транскрипция
   - `SourcesPanel` - левая колонка с транскриптом
   - `TemplatesPanel` - средняя колонка
   - `OutputPanel` - правая колонка

2. **Создать кастомные хуки**:
   ```typescript
   // useSessionTabs.ts
   export function useSessionTabs() {
     const [openTabs, setOpenTabs] = useState<Set<string>>(new Set());
     const [activeSession, setActiveSession] = useState<string | null>(null);
     // ... логика загрузки/сохранения вкладок
   }

   // useSessionRecording.ts
   export function useSessionRecording(sessionId: string | null) {
     // ... логика записи
   }
   ```

### Приоритет 3: Оптимизации

1. **Мемоизация inline функций в JSX** - особенно в map циклах
2. **Вынести константы** (`MAX_TRANSCRIPTION_RETRIES`, `RETRY_DELAYS`) в отдельный файл

---

## 10. Визуализация зависимостей

```
┌─────────────────────────────────────────────────────────────────┐
│                         SessionsPage                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   useAuth    │    │ useSessions  │    │  usePatients │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                    State Layer                        │       │
│  │  activeSession, openTabs, recordings, sessionNotes   │       │
│  └──────────────────────────┬───────────────────────────┘       │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         ▼                   ▼                   ▼               │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐          │
│  │   useMemo  │     │ useEffect  │     │ Handlers   │          │
│  │  (Maps,    │     │ (21 hooks) │     │ (18 funcs) │          │
│  │ filtering) │     │            │     │            │          │
│  └─────┬──────┘     └─────┬──────┘     └─────┬──────┘          │
│        │                  │                  │                  │
│        └──────────────────┼──────────────────┘                  │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                      JSX/UI                           │       │
│  │  SessionTabs | SourcesPanel | Templates | Output     │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
