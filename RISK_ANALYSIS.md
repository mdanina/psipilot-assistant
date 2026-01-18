# Анализ рисков реализации плана улучшений
## Риски, последствия и пути митигации

---

## Категории рисков

| Категория | Описание |
|-----------|----------|
| 🔴 **Критический** | Потеря данных, невозможность работы |
| 🟠 **Высокий** | Серьёзные проблемы, требует rollback |
| 🟡 **Средний** | Заметные проблемы, можно hotfix |
| 🟢 **Низкий** | Минорные неудобства |

---

## 1. Timeout в stopRecording()

### Задача
Добавить 10-секундный timeout для предотвращения deadlock.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Ложное срабатывание** — timeout на медленных устройствах | Средняя | 🔴 Критический |
| Потеря записи при легитимно долгой остановке | Средняя | 🔴 Критический |
| Разные браузеры = разное время stop() | Высокая | 🟡 Средний |

### Сценарий проблемы
```
1. Врач записывает 2-часовую сессию на старом планшете
2. mediaRecorder.stop() обрабатывает большой буфер
3. Обработка занимает 12 секунд
4. Timeout срабатывает на 10 секунде
5. Запись ПОТЕРЯНА, хотя могла бы сохраниться
```

### Митигация

**Вариант A: Адаптивный timeout**
```typescript
// Рассчитываем timeout на основе длительности записи
const calculateTimeout = (recordingDurationMs: number) => {
  const baseTimeout = 10000; // 10 сек минимум
  const extraPerHour = 5000; // +5 сек за каждый час записи
  const hours = recordingDurationMs / (1000 * 60 * 60);
  return baseTimeout + (hours * extraPerHour);
};

// Для 2-часовой записи: 10 + 10 = 20 секунд timeout
```

**Вариант B: Retry с увеличением timeout**
```typescript
const stopWithRetry = async (): Promise<Blob | null> => {
  const timeouts = [5000, 15000, 30000]; // Прогрессивный timeout

  for (const timeout of timeouts) {
    const result = await attemptStop(timeout);
    if (result) return result;
    console.warn(`Stop attempt failed with ${timeout}ms, retrying...`);
  }

  return null; // Только после 3 попыток
};
```

**Вариант C: Сохранение частичных данных**
```typescript
// При timeout — сохранить уже накопленные chunks
const stopRecording = async () => {
  const timeoutId = setTimeout(() => {
    // Не теряем данные — собираем что есть
    const partialBlob = new Blob(accumulatedChunks, { type: 'audio/webm' });
    resolve(partialBlob);
    toast.warning('Запись сохранена частично. Проверьте качество.');
  }, timeout);
  // ...
};
```

### Рекомендация
Использовать **Вариант C** — никогда не терять данные, сохранять частично.

---

## 2. Проверка единственного администратора

### Задача
Запретить удаление/разжалование единственного админа клиники.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Race condition** — два админа удаляют друг друга одновременно | Низкая | 🔴 Критический |
| Клиника с 0 админов уже существует в БД | Низкая | 🟠 Высокий |
| Блокировка легитимных операций | Средняя | 🟡 Средний |

### Сценарий проблемы (Race Condition)
```
t=0: Клиника имеет 2 админов: Alice и Bob
t=1: Alice проверяет: "Есть ли другие админы?" → Да, Bob
t=2: Bob проверяет: "Есть ли другие админы?" → Да, Alice
t=3: Alice удаляет Bob
t=4: Bob удаляет Alice
t=5: Клиника без админов!
```

### Митигация

**Вариант A: Блокировка на уровне БД (рекомендуется)**
```sql
-- Триггер с exclusive lock
CREATE OR REPLACE FUNCTION prevent_last_admin_removal()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  -- Получаем exclusive lock на уровне клиники
  PERFORM pg_advisory_xact_lock(
    hashtext('admin_check_' || OLD.clinic_id::text)
  );

  SELECT COUNT(*) INTO v_admin_count
  FROM profiles
  WHERE clinic_id = OLD.clinic_id
    AND role = 'admin'
    AND id != OLD.id
    AND deleted_at IS NULL;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Cannot remove last admin from clinic';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

**Вариант B: Миграция существующих данных**
```sql
-- Найти клиники без админов
SELECT c.id, c.name
FROM clinics c
LEFT JOIN profiles p ON p.clinic_id = c.id AND p.role = 'admin'
WHERE p.id IS NULL;

-- Назначить владельца клиники админом
UPDATE profiles
SET role = 'admin'
WHERE id IN (
  SELECT c.owner_id FROM clinics c
  WHERE c.id IN (/* клиники без админов */)
);
```

### Дополнительная защита
```typescript
// В UI: подтверждение с вводом текста
if (isLastAdmin) {
  const confirmation = prompt(
    'Вы единственный администратор. Введите "ПЕРЕДАТЬ ПРАВА" для продолжения'
  );
  if (confirmation !== 'ПЕРЕДАТЬ ПРАВА') return;

  // Показать диалог выбора нового админа ПЕРЕД удалением
  showTransferAdminDialog();
}
```

---

## 3. Проверка сессий при удалении пациента

### Задача
Запретить удаление пациента с активными сессиями.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Невозможно удалить проблемного пациента** | Средняя | 🟠 Высокий |
| Сессии в статусе "processing" блокируют навсегда | Средняя | 🟠 Высокий |
| Удаление требует ручной очистки сначала | Высокая | 🟡 Средний |

### Сценарий проблемы
```
1. Пациент просит удалить свои данные (GDPR)
2. У пациента зависшая транскрипция (status=processing)
3. Транскрипция никогда не завершится
4. Пациента НЕВОЗМОЖНО удалить
5. Нарушение GDPR — штраф до €20M
```

### Митигация

**Вариант A: Force delete с аудитом**
```typescript
interface DeletePatientOptions {
  patientId: string;
  force?: boolean;
  reason?: 'gdpr_request' | 'duplicate' | 'other';
  adminConfirmation?: string;
}

async function deletePatient(options: DeletePatientOptions) {
  const { sessions } = await checkActiveSessions(options.patientId);

  if (sessions.length > 0 && !options.force) {
    throw new ActiveSessionsError(sessions);
  }

  if (options.force) {
    // Требуем подтверждение и логируем
    if (options.adminConfirmation !== 'FORCE_DELETE') {
      throw new Error('Force delete requires confirmation');
    }

    await auditLog({
      action: 'force_delete_patient',
      patientId: options.patientId,
      reason: options.reason,
      affectedSessions: sessions.map(s => s.id),
    });

    // Отменяем все сессии
    await cancelAllSessions(options.patientId);
  }

  await softDeletePatient(options.patientId);
}
```

**Вариант B: Автоматическое закрытие зависших сессий**
```sql
-- Закрывать сессии старше 24 часов в processing статусе
UPDATE recordings
SET
  transcription_status = 'timeout',
  transcription_error = 'Auto-closed after 24h'
WHERE transcription_status = 'processing'
  AND updated_at < NOW() - INTERVAL '24 hours';
```

**Вариант C: Предложить действия вместо блокировки**
```tsx
// Вместо ошибки — показать опции
<Dialog>
  <DialogTitle>Невозможно удалить пациента</DialogTitle>
  <DialogDescription>
    У пациента {activeSessions.length} активных сессий.
  </DialogDescription>

  <div className="space-y-2">
    <Button onClick={cancelAllAndDelete}>
      Отменить все сессии и удалить
    </Button>
    <Button onClick={archivePatient}>
      Архивировать пациента (данные сохранятся)
    </Button>
    <Button onClick={viewSessions}>
      Просмотреть сессии
    </Button>
  </div>
</Dialog>
```

---

## 4. Проверка конфликтов времени

### Задача
Предотвращать создание пересекающихся встреч.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Ложные конфликты** из-за часовых поясов | Высокая | 🟠 Высокий |
| Производительность при большом количестве встреч | Средняя | 🟡 Средний |
| Блокировка перерывов (обед как "встреча") | Средняя | 🟡 Средний |
| Конфликт с существующими overlapping встречами | Высокая | 🟡 Средний |

### Сценарий проблемы (Ложные конфликты)
```
1. Врач в Москве (UTC+3) создаёт встречу на 14:00 MSK
2. Система сохраняет как 11:00 UTC
3. Проверка конфликтов ищет по UTC
4. Врач из Калининграда (UTC+2) видит 13:00 по своему времени
5. Создаёт встречу на 14:00 по своему времени (12:00 UTC)
6. Система говорит: "Нет конфликта" (11:00 vs 12:00)
7. Но оба врача — один человек! Конфликт не обнаружен
```

### Митигация

**Вариант A: Проверка всегда в UTC**
```sql
CREATE OR REPLACE FUNCTION check_time_conflicts(
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,  -- Уже в UTC!
  p_end_time TIMESTAMPTZ,
  p_exclude_session_id UUID DEFAULT NULL
) RETURNS TABLE (
  session_id UUID,
  title TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  conflict_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.scheduled_at,
    s.duration_minutes,
    CASE
      WHEN s.scheduled_at = p_start_time THEN 'exact_overlap'
      WHEN s.scheduled_at < p_start_time THEN 'starts_before'
      ELSE 'starts_during'
    END as conflict_type
  FROM sessions s
  WHERE s.user_id = p_user_id
    AND s.deleted_at IS NULL
    AND s.status NOT IN ('cancelled', 'completed')
    AND (p_exclude_session_id IS NULL OR s.id != p_exclude_session_id)
    AND tstzrange(s.scheduled_at,
                  s.scheduled_at + (s.duration_minutes || ' minutes')::INTERVAL)
        &&
        tstzrange(p_start_time, p_end_time);
END;
$$ LANGUAGE plpgsql;
```

**Вариант B: Индекс для производительности**
```sql
-- GiST индекс для быстрого поиска пересечений
CREATE INDEX idx_sessions_time_range ON sessions
USING GIST (
  tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::INTERVAL)
)
WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'completed');
```

**Вариант C: Типы встреч с разным поведением**
```typescript
type AppointmentType =
  | 'patient_session'    // Строгий контроль конфликтов
  | 'break'              // Не проверять конфликты
  | 'admin_time'         // Мягкое предупреждение
  | 'tentative';         // Только предупреждение

const checkConflicts = (type: AppointmentType) => {
  if (type === 'break') return { check: false };
  if (type === 'tentative') return { check: true, blocking: false };
  return { check: true, blocking: true };
};
```

**Вариант D: Миграция существующих конфликтов**
```sql
-- Найти все существующие конфликты
WITH overlapping AS (
  SELECT
    s1.id as session1_id,
    s2.id as session2_id,
    s1.user_id,
    s1.scheduled_at as time1,
    s2.scheduled_at as time2
  FROM sessions s1
  JOIN sessions s2 ON s1.user_id = s2.user_id
    AND s1.id < s2.id
    AND tstzrange(s1.scheduled_at, s1.scheduled_at + (s1.duration_minutes || ' min')::INTERVAL)
        &&
        tstzrange(s2.scheduled_at, s2.scheduled_at + (s2.duration_minutes || ' min')::INTERVAL)
  WHERE s1.deleted_at IS NULL AND s2.deleted_at IS NULL
)
SELECT * FROM overlapping;

-- Отправить уведомления владельцам о необходимости разрешить конфликты
```

---

## 5. Механизм отмены транскрипции

### Задача
Позволить отменять зависшие транскрипции.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Потеря оплаченных минут AssemblyAI** | Высокая | 🟡 Средний |
| Отмена успешной транскрипции "в последний момент" | Средняя | 🟠 Высокий |
| Rate limits при массовых retry | Низкая | 🟡 Средний |
| Рассинхронизация статуса БД и AssemblyAI | Средняя | 🟠 Высокий |

### Сценарий проблемы (Рассинхронизация)
```
1. Пользователь отменяет транскрипцию (статус → cancelled)
2. AssemblyAI продолжает обработку (не знает об отмене)
3. AssemblyAI завершает успешно
4. Webhook приходит с результатом
5. Конфликт: БД=cancelled, AssemblyAI=completed
6. Что делать с результатом?
```

### Митигация

**Вариант A: Мягкая отмена с сохранением результата**
```typescript
async function cancelTranscription(recordingId: string) {
  // Помечаем как "user_cancelled", но не удаляем
  await supabase
    .from('recordings')
    .update({
      transcription_status: 'user_cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', recordingId);

  // Webhook handler проверяет:
  // Если статус user_cancelled, но пришёл результат — сохраняем!
}

// В webhook handler:
if (recording.transcription_status === 'user_cancelled' && result.status === 'completed') {
  await supabase
    .from('recordings')
    .update({
      transcription_status: 'completed_after_cancel',
      transcript_text: result.text,
    })
    .eq('id', recordingId);

  // Уведомить пользователя: "Транскрипция завершилась после отмены"
}
```

**Вариант B: Тарификация и лимиты**
```typescript
// Ограничить retry чтобы не тратить минуты
const MAX_RETRIES_PER_RECORDING = 3;
const MAX_RETRIES_PER_DAY = 50; // На всю клинику

async function retryTranscription(recordingId: string, clinicId: string) {
  const retryCount = await getRetryCount(recordingId);
  if (retryCount >= MAX_RETRIES_PER_RECORDING) {
    throw new Error('Превышен лимит повторных попыток для этой записи');
  }

  const dailyRetries = await getDailyRetryCount(clinicId);
  if (dailyRetries >= MAX_RETRIES_PER_DAY) {
    throw new Error('Превышен дневной лимит повторных транскрипций');
  }

  // Продолжить с retry
}
```

---

## 6. Исправление часовых поясов

### Задача
Корректно сохранять и отображать время встреч.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Миграция существующих данных** | Высокая | 🔴 Критический |
| Встречи "прыгают" во времени после фикса | Высокая | 🔴 Критический |
| DST (переход на летнее время) | Средняя | 🟠 Высокий |
| Пользователи в разных timezone одной клиники | Средняя | 🟡 Средний |

### Сценарий проблемы (Миграция)
```
BEFORE: Встречи сохранялись некорректно (local time как UTC)
- Встреча на 14:00 MSK сохранена как 14:00 UTC

AFTER: Исправляем логику
- Новые встречи корректны
- Старые встречи теперь показываются как 17:00 MSK!
- Врачи приходят на 3 часа позже
```

### Митигация

**Вариант A: Миграция с сохранением "намерения"**
```sql
-- 1. Добавить колонку для оригинального timezone
ALTER TABLE sessions ADD COLUMN original_timezone TEXT;

-- 2. Определить timezone создателя на момент создания
-- (предположим, все старые были в Europe/Moscow)
UPDATE sessions
SET original_timezone = 'Europe/Moscow'
WHERE original_timezone IS NULL
  AND created_at < '2026-01-19';  -- Дата деплоя фикса

-- 3. Скорректировать время (НЕ делаем! Опасно)
-- Вместо этого добавляем флаг
ALTER TABLE sessions ADD COLUMN needs_timezone_review BOOLEAN DEFAULT FALSE;

UPDATE sessions
SET needs_timezone_review = TRUE
WHERE created_at < '2026-01-19'
  AND scheduled_at > NOW();  -- Только будущие встречи
```

**Вариант B: UI для ручной проверки**
```tsx
// Показать баннер для встреч, требующих проверки
{session.needs_timezone_review && (
  <Alert variant="warning">
    <AlertTitle>Проверьте время встречи</AlertTitle>
    <AlertDescription>
      Эта встреча была создана до обновления системы.
      Пожалуйста, убедитесь что время {formatTime(session.scheduled_at)} корректно.
    </AlertDescription>
    <Button onClick={() => confirmTimezone(session.id)}>
      Время верное
    </Button>
    <Button onClick={() => editSession(session.id)}>
      Изменить время
    </Button>
  </Alert>
)}
```

**Вариант C: Feature flag для постепенного rollout**
```typescript
// Включаем новую логику только для новых встреч
const useNewTimezoneLogic = (session: Session) => {
  return session.created_at > TIMEZONE_FIX_DATE
    || session.timezone_confirmed;
};

// Для старых — используем legacy отображение
const displayTime = (session: Session) => {
  if (useNewTimezoneLogic(session)) {
    return formatInTimezone(session.scheduled_at, session.timezone);
  }
  // Legacy: показываем как есть (без конвертации)
  return formatUTC(session.scheduled_at);
};
```

---

## 7. Версионирование пациентов

### Задача
Предотвратить перезапись данных при параллельном редактировании.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Конфликты раздражают пользователей** | Высокая | 🟡 Средний |
| Потеря изменений при неправильном merge | Средняя | 🟠 Высокий |
| Сложность UI для разрешения конфликтов | Высокая | 🟡 Средний |

### Сценарий проблемы
```
1. Врач А открывает карточку (version=5)
2. Врач Б открывает карточку (version=5)
3. Врач А меняет телефон, сохраняет (version→6)
4. Врач Б меняет адрес, пытается сохранить
5. Система: "Конфликт! Кто-то изменил данные"
6. Врач Б: "Я не менял телефон, почему конфликт?!"
```

### Митигация

**Вариант A: Field-level версионирование (рекомендуется)**
```typescript
// Отслеживать изменения по полям, не по всей записи
interface PatientUpdate {
  id: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

async function updatePatient(update: PatientUpdate) {
  const current = await getPatient(update.id);

  const conflicts = update.changes.filter(change => {
    // Конфликт только если поле изменилось И мы его тоже меняем
    return current[change.field] !== change.oldValue;
  });

  if (conflicts.length > 0) {
    return { conflicts, canAutoMerge: false };
  }

  // Нет конфликтов — применяем изменения
  await applyChanges(update);
}
```

**Вариант B: Автоматический merge неконфликтующих полей**
```typescript
async function smartMerge(
  baseVersion: Patient,
  userChanges: Partial<Patient>,
  currentVersion: Patient
): Promise<MergeResult> {
  const result: Partial<Patient> = {};
  const conflicts: FieldConflict[] = [];

  for (const [field, userValue] of Object.entries(userChanges)) {
    const baseValue = baseVersion[field];
    const currentValue = currentVersion[field];

    if (baseValue === currentValue) {
      // Поле не менялось другим пользователем — применяем наши изменения
      result[field] = userValue;
    } else if (userValue === currentValue) {
      // Мы хотим то же что уже есть — ничего не делаем
      result[field] = currentValue;
    } else {
      // Реальный конфликт
      conflicts.push({ field, baseValue, userValue, currentValue });
    }
  }

  return { merged: result, conflicts };
}
```

**Вариант C: Real-time sync (WebSocket)**
```typescript
// Показывать изменения других пользователей в реальном времени
useEffect(() => {
  const subscription = supabase
    .channel(`patient:${patientId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'patients',
      filter: `id=eq.${patientId}`,
    }, (payload) => {
      if (payload.new.updated_by !== currentUserId) {
        // Показать уведомление
        toast.info(`${payload.new.updated_by_name} изменил(а) данные пациента`);
        // Подсветить изменённые поля
        highlightChangedFields(payload.old, payload.new);
      }
    })
    .subscribe();

  return () => subscription.unsubscribe();
}, [patientId]);
```

---

## 8. Session timeout warning

### Задача
Предупреждать за 2 минуты до автоматического logout.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Надоедливые уведомления** при активной работе | Средняя | 🟡 Средний |
| Warning не показывается (рендер проблемы) | Низкая | 🟠 Высокий |
| Пользователь игнорирует warning | Высокая | 🟡 Средний |

### Митигация

**Вариант A: Умный показ warning**
```typescript
const SessionTimeoutWarning = () => {
  const { lastActivity, sessionExpiresAt } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Не показывать если:
  // 1. Пользователь недавно взаимодействовал
  // 2. Уже закрыл это предупреждение
  // 3. Идёт активная запись
  const shouldShow = useMemo(() => {
    const timeLeft = sessionExpiresAt - Date.now();
    const recentActivity = Date.now() - lastActivity < 30000; // 30 сек

    return timeLeft <= WARNING_TIME
      && timeLeft > 0
      && !dismissed
      && !isRecording
      && !recentActivity; // Не показывать если юзер активен
  }, [sessionExpiresAt, lastActivity, dismissed, isRecording]);

  // Auto-dismiss при активности
  useEffect(() => {
    if (Date.now() - lastActivity < 5000) {
      setDismissed(false); // Reset при активности
    }
  }, [lastActivity]);
};
```

**Вариант B: Автосохранение вместо warning**
```typescript
// Вместо предупреждения — автосохранение черновика
useEffect(() => {
  const saveInterval = setInterval(() => {
    if (hasUnsavedChanges) {
      saveDraft(); // Сохранить в localStorage
    }
  }, 30000); // Каждые 30 секунд

  return () => clearInterval(saveInterval);
}, [hasUnsavedChanges]);

// При session timeout:
const handleSessionTimeout = () => {
  saveDraft(); // Гарантированно сохранить
  signOut();
};

// При следующем входе:
const draft = loadDraft();
if (draft) {
  toast.info('Восстановлены несохранённые изменения');
  restoreFromDraft(draft);
}
```

---

## 9. Исправление MFA factorId

### Задача
Использовать реальный factorId вместо hardcoded 'totp'.

### Риски

| Риск | Вероятность | Категория |
|------|-------------|-----------|
| **Пользователи с уже включённым MFA не смогут войти** | Высокая | 🔴 Критический |
| Потеря factorId при очистке localStorage | Средняя | 🟠 Высокий |
| Несколько устройств = несколько factorId | Низкая | 🟡 Средний |

### Сценарий проблемы
```
1. Пользователь включил MFA (factorId сохранён в localStorage)
2. Пользователь очистил кэш браузера
3. localStorage пуст, factorId потерян
4. Hardcoded 'totp' не работает
5. Пользователь ЗАБЛОКИРОВАН
```

### Митигация

**Вариант A: Получать factorId из API (рекомендуется)**
```typescript
const verifyMFA = async (code: string) => {
  // Всегда получаем актуальный factorId из Supabase
  const { data: factors } = await supabase.auth.mfa.listFactors();

  const totpFactor = factors?.totp?.find(f => f.status === 'verified');

  if (!totpFactor) {
    throw new Error('MFA не настроен');
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: totpFactor.id,  // Реальный ID из API
    code,
  });

  return { error };
};
```

**Вариант B: Fallback chain**
```typescript
const getFactorId = async (): Promise<string> => {
  // 1. Попробовать из state
  if (mfaFactorId) return mfaFactorId;

  // 2. Попробовать из localStorage
  const stored = localStorage.getItem('mfa_factor_id');
  if (stored) return stored;

  // 3. Получить из API
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.[0];

  if (factor) {
    localStorage.setItem('mfa_factor_id', factor.id);
    return factor.id;
  }

  throw new Error('MFA factor not found');
};
```

---

## 10. Общие риски деплоя

### Database migrations

| Риск | Митигация |
|------|-----------|
| Миграция ломает production | Тестировать на staging с копией prod данных |
| Долгая миграция блокирует таблицы | Использовать `CONCURRENTLY` для индексов |
| Rollback невозможен | Писать down-миграции для каждой up |

### Feature flags

```typescript
// Все новые фичи за feature flags
const FEATURE_FLAGS = {
  CONFLICT_CHECK: process.env.ENABLE_CONFLICT_CHECK === 'true',
  NEW_TIMEZONE_LOGIC: process.env.ENABLE_NEW_TZ === 'true',
  MFA_V2: process.env.ENABLE_MFA_V2 === 'true',
};

// Использование
if (FEATURE_FLAGS.CONFLICT_CHECK) {
  await checkTimeConflicts(appointment);
}
```

### Rollback план

```bash
# Для каждого деплоя иметь rollback script
#!/bin/bash

# 1. Откатить код
git revert HEAD --no-commit
git commit -m "Rollback: [feature name]"
git push

# 2. Откатить миграции (если есть down)
npx supabase db reset --db-url $PROD_DB

# 3. Очистить кэш
curl -X POST $CDN_PURGE_URL

# 4. Уведомить команду
slack-notify "Rollback completed for [feature]"
```

---

## Матрица приоритетов с учётом рисков

| Задача | Риск без митигации | Сложность митигации | Рекомендация |
|--------|-------------------|---------------------|--------------|
| 1.1 Timeout stopRecording | 🔴 Критический | Средняя | Делать с вариантом C |
| 1.2 Единственный админ | 🟠 Высокий | Низкая | Делать сразу |
| 1.3 Проверка сессий | 🟠 Высокий | Средняя | Делать с force delete |
| 1.4 Конфликты времени | 🟠 Высокий | Высокая | Сначала миграция данных |
| 2.1 Отмена транскрипции | 🟡 Средний | Средняя | Делать с мягкой отменой |
| 2.2 Часовые пояса | 🔴 Критический | Высокая | Feature flag + ручная проверка |
| 2.3 Версионирование | 🟡 Средний | Средняя | Field-level |
| 2.5 Session warning | 🟡 Средний | Низкая | С автосохранением |
| 2.6 MFA factorId | 🔴 Критический | Низкая | API fallback обязателен |

---

## Рекомендуемый порядок с учётом рисков

### Неделя 1: Низкорисковые, высокоценные
1. ✅ Единственный админ (низкий риск, высокая ценность)
2. ✅ MFA factorId с API fallback (критический риск → низкий после митигации)
3. ✅ Session warning с автосохранением

### Неделя 2: Средние риски
4. ✅ Timeout stopRecording (с частичным сохранением)
5. ✅ Проверка сессий (с force delete)

### Неделя 3: Подготовка к сложным
6. ✅ Миграция данных для конфликтов времени
7. ✅ Feature flag для новой TZ логики

### Неделя 4: Высокорисковые с protection
8. ✅ Конфликты времени (под feature flag)
9. ✅ Часовые пояса (под feature flag + ручная проверка)

### Неделя 5+: Итеративные улучшения
10. ✅ Версионирование (field-level)
11. ✅ Отмена транскрипции

---

*Анализ рисков создан: 2026-01-18*
*Версия: 1.0*
