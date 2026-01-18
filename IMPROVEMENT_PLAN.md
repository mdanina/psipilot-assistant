# План улучшений PsiPilot Assistant
## Roadmap на основе UX-анализа

---

## Приоритеты

| Уровень | Описание | Критерий |
|---------|----------|----------|
| **P0** | Блокирующие | Потеря данных, невозможность работы |
| **P1** | Критические | Серьёзные проблемы UX, compliance |
| **P2** | Важные | Улучшение опыта, предотвращение ошибок |
| **P3** | Желательные | Polish, оптимизация |

---

## Фаза 1: Блокирующие проблемы (P0)

### 1.1. Timeout в stopRecording()
**Проблема:** UI зависает навсегда если mediaRecorder.onstop не срабатывает

**Файл:** `src/hooks/useAudioRecorder.ts:215-231`

**Задачи:**
```
[ ] Добавить timeout 10 секунд в Promise stopRecording()
[ ] При timeout: resolve(null), показать предупреждение
[ ] Добавить retry логику (попробовать stop() ещё раз)
[ ] Логировать случаи timeout для диагностики
```

**Код:**
```typescript
const stopRecording = useCallback((): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.error('[Recording] Stop timeout - forcing resolve');
      stopResolveRef.current = null;
      resolve(null);
      toast.error('Ошибка остановки записи. Попробуйте перезагрузить страницу.');
    }, 10000); // 10 секунд

    stopResolveRef.current = (blob) => {
      clearTimeout(timeoutId);
      resolve(blob);
    };

    mediaRecorder.stop();
  });
}, []);
```

**Оценка:** 2 часа

---

### 1.2. Проверка единственного администратора
**Проблема:** Клиника может остаться без админа

**Файлы:**
- `src/pages/AdministrationPage.tsx:221-278`
- `supabase/migrations/` - новая миграция

**Задачи:**
```
[ ] Создать SQL функцию check_last_admin(clinic_id, user_id)
[ ] Добавить проверку перед удалением пользователя
[ ] Добавить проверку перед сменой роли admin → specialist
[ ] Показывать понятную ошибку: "Невозможно удалить единственного администратора"
[ ] Добавить тест на этот сценарий
```

**SQL:**
```sql
CREATE OR REPLACE FUNCTION check_last_admin(
  p_clinic_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_admin_count
  FROM profiles
  WHERE clinic_id = p_clinic_id
    AND role = 'admin'
    AND id != p_user_id
    AND deleted_at IS NULL;

  RETURN v_admin_count > 0;
END;
$$ LANGUAGE plpgsql;
```

**Оценка:** 4 часа

---

### 1.3. Проверка активных сессий при удалении пациента
**Проблема:** Сессии становятся "сиротами"

**Файл:** `supabase/migrations/021_soft_delete_patient.sql`

**Задачи:**
```
[ ] Добавить проверку активных сессий в soft_delete_patient()
[ ] Варианты поведения:
    - Запретить удаление если есть active sessions
    - Показать warning с количеством сессий
    - Предложить: "Отменить сессии и удалить" / "Отмена"
[ ] Обновить UI PatientsPage для показа warning
[ ] Добавить счётчик сессий в диалог подтверждения
```

**SQL дополнение:**
```sql
-- В начале soft_delete_patient():
SELECT COUNT(*) INTO v_active_sessions
FROM sessions
WHERE patient_id = p_patient_id
  AND status IN ('scheduled', 'in_progress')
  AND deleted_at IS NULL;

IF v_active_sessions > 0 AND NOT p_force THEN
  RAISE EXCEPTION 'ACTIVE_SESSIONS:%', v_active_sessions;
END IF;
```

**Оценка:** 6 часов

---

### 1.4. Проверка конфликтов времени в календаре
**Проблема:** Врач может быть назначен на несколько встреч одновременно

**Файлы:**
- `src/lib/supabase-sessions.ts:677-870`
- `src/components/calendar/CreateAppointmentDialog.tsx`

**Задачи:**
```
[ ] Создать функцию check_time_conflicts(user_id, start_time, end_time)
[ ] Вызывать перед созданием встречи
[ ] Показывать список конфликтующих встреч
[ ] Предлагать ближайшее свободное время
[ ] Добавить визуализацию занятости в диалоге создания
```

**SQL функция:**
```sql
CREATE OR REPLACE FUNCTION check_time_conflicts(
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_exclude_session_id UUID DEFAULT NULL
) RETURNS TABLE (
  session_id UUID,
  title TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.title, s.scheduled_at, s.duration_minutes
  FROM sessions s
  WHERE s.user_id = p_user_id
    AND s.deleted_at IS NULL
    AND s.status != 'cancelled'
    AND (p_exclude_session_id IS NULL OR s.id != p_exclude_session_id)
    AND (
      (s.scheduled_at, s.scheduled_at + (s.duration_minutes || ' minutes')::INTERVAL)
      OVERLAPS
      (p_start_time, p_end_time)
    );
END;
$$ LANGUAGE plpgsql;
```

**Оценка:** 8 часов

---

## Фаза 2: Критические проблемы (P1)

### 2.1. Механизм отмены/перезапуска транскрипции
**Проблема:** Зависшую транскрипцию невозможно отменить

**Файлы:**
- `src/hooks/useTranscriptionRecovery.ts`
- `backend/transcription-service/routes/transcribe.js`
- Новый компонент `TranscriptionActions.tsx`

**Задачи:**
```
[ ] Создать API endpoint POST /api/transcribe/:id/cancel
[ ] Создать API endpoint POST /api/transcribe/:id/retry
[ ] Добавить кнопки в UI для stuck транскрипций (> 30 мин)
[ ] Добавить статус 'cancelled' в transcription_status enum
[ ] Показывать время в очереди транскрипции
[ ] Добавить ручной sync с AssemblyAI
```

**API:**
```javascript
// POST /api/transcribe/:recordingId/cancel
router.post('/transcribe/:recordingId/cancel', async (req, res) => {
  const { recordingId } = req.params;

  // Получить transcript_id
  const { data: recording } = await supabase
    .from('recordings')
    .select('transcript_id')
    .eq('id', recordingId)
    .single();

  // Отменить в AssemblyAI (если поддерживается)
  // Обновить статус в БД
  await supabase
    .from('recordings')
    .update({
      transcription_status: 'cancelled',
      transcription_error: 'Cancelled by user'
    })
    .eq('id', recordingId);

  res.json({ success: true });
});
```

**Оценка:** 12 часов

---

### 2.2. Исправление работы часовых поясов
**Проблема:** Время встреч показывается неправильно для разных timezone

**Файлы:**
- `src/components/calendar/CreateAppointmentDialog.tsx:244-278`
- `src/components/calendar/TimezoneSelector.tsx`
- `src/lib/supabase-sessions.ts`

**Задачи:**
```
[ ] Использовать выбранный timezone при создании встречи
[ ] Сохранять timezone вместе со встречей
[ ] Конвертировать время при отображении
[ ] Добавить индикатор timezone в календаре
[ ] Тестирование: создать встречу в UTC+3, проверить в UTC+0
```

**Код исправления:**
```typescript
import { zonedTimeToUtc } from 'date-fns-tz';

// При создании встречи:
const userTimezone = profile?.settings?.timezone || 'Europe/Moscow';
const localDateTime = new Date(selectedDate);
localDateTime.setHours(hours, minutes, 0, 0);

// Конвертируем в UTC с учётом timezone пользователя
const utcDateTime = zonedTimeToUtc(localDateTime, userTimezone);

const appointmentData = {
  scheduled_at: utcDateTime.toISOString(),
  timezone: userTimezone,
  // ...
};
```

**Оценка:** 8 часов

---

### 2.3. Версионирование при редактировании пациента
**Проблема:** Race condition при параллельном редактировании

**Файлы:**
- `src/pages/PatientDetailPage.tsx`
- `src/lib/supabase-patients.ts`
- Новая миграция для version column

**Задачи:**
```
[ ] Добавить поле version в таблицу patients
[ ] При загрузке сохранять текущую версию
[ ] При сохранении проверять: version = expected_version
[ ] Если версия изменилась → показать диалог конфликта
[ ] Предложить: "Перезаписать" / "Загрузить новые данные" / "Отмена"
```

**Миграция:**
```sql
ALTER TABLE patients ADD COLUMN version INTEGER DEFAULT 1;

CREATE OR REPLACE FUNCTION update_patient_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patients_version_trigger
BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION update_patient_version();
```

**Оценка:** 10 часов

---

### 2.4. Отзыв консентов при удалении пациента
**Проблема:** Нарушение GDPR - консент остаётся активным

**Файл:** `supabase/migrations/021_soft_delete_patient.sql`

**Задачи:**
```
[ ] Добавить отзыв консентов в soft_delete_patient()
[ ] Логировать отзыв для audit trail
[ ] Отправить уведомление пациенту (если есть email)
```

**SQL:**
```sql
-- Добавить в soft_delete_patient():
UPDATE consents
SET
  withdrawn_at = NOW(),
  withdrawal_reason = 'Patient deleted from system'
WHERE patient_id = p_patient_id
  AND withdrawn_at IS NULL;

-- Логировать
INSERT INTO audit_log (action, entity_type, entity_id, details)
VALUES ('consent_withdrawn', 'patient', p_patient_id,
  jsonb_build_object('reason', 'patient_deletion'));
```

**Оценка:** 4 часа

---

### 2.5. Предупреждение перед session timeout
**Проблема:** Потеря несохранённых данных при автоматическом logout

**Файл:** `src/contexts/AuthContext.tsx`

**Задачи:**
```
[ ] Создать компонент SessionTimeoutWarning
[ ] Показывать диалог за 2 минуты до logout
[ ] Кнопки: "Продолжить работу" (обновить activity) / "Выйти"
[ ] Показывать countdown таймер
[ ] Автоматически продлевать при клике "Продолжить"
```

**Компонент:**
```tsx
function SessionTimeoutWarning() {
  const { sessionExpiresAt, updateActivity, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  useEffect(() => {
    const checkTimeout = () => {
      const timeLeft = sessionExpiresAt - Date.now();
      if (timeLeft <= SESSION_WARNING_TIME && timeLeft > 0) {
        setShowWarning(true);
        setSecondsLeft(Math.floor(timeLeft / 1000));
      } else {
        setShowWarning(false);
      }
    };

    const interval = setInterval(checkTimeout, 1000);
    return () => clearInterval(interval);
  }, [sessionExpiresAt]);

  if (!showWarning) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Сессия скоро истечёт</AlertDialogTitle>
          <AlertDialogDescription>
            Вы будете автоматически выйдены через {secondsLeft} секунд.
            Несохранённые данные будут потеряны.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={signOut}>Выйти сейчас</AlertDialogCancel>
          <AlertDialogAction onClick={updateActivity}>
            Продолжить работу
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**Оценка:** 6 часов

---

### 2.6. Исправление MFA factorId
**Проблема:** Верификация MFA не работает

**Файл:** `src/contexts/AuthContext.tsx:715-775`

**Задачи:**
```
[ ] Сохранять factorId из enrollment в state/localStorage
[ ] Использовать сохранённый factorId в verifyMFA()
[ ] Добавить fallback: получить factorId из mfa.listFactors()
[ ] Тестирование полного flow MFA
```

**Код:**
```typescript
const enableMFA = useCallback(async () => {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
  });

  if (data) {
    // Сохраняем реальный factorId
    setMfaFactorId(data.id);
    localStorage.setItem('mfa_factor_id', data.id);
    return { qrCode: data.totp.qr_code, secret: data.totp.secret };
  }
}, []);

const verifyMFA = useCallback(async (code: string) => {
  // Получаем сохранённый factorId или из API
  let factorId = mfaFactorId || localStorage.getItem('mfa_factor_id');

  if (!factorId) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    factorId = factors?.totp?.[0]?.id;
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    code,
  });
}, [mfaFactorId]);
```

**Оценка:** 4 часа

---

## Фаза 3: Важные улучшения (P2)

### 3.1. Защита от double-click транскрипции
**Задачи:**
```
[ ] Добавить флаг isTranscribing в состояние
[ ] Disable кнопку во время транскрипции
[ ] Добавить проверку на сервере: уже есть активная транскрипция?
[ ] Показывать статус: "Транскрипция запущена..."
```

**Оценка:** 3 часа

---

### 3.2. Опция "удалить эту и последующие" для повторяющихся встреч
**Задачи:**
```
[ ] Добавить третью опцию в диалог удаления
[ ] Реализовать deleteRecurringFromDate(parentId, fromDate)
[ ] Тестирование всех трёх опций
```

**Оценка:** 6 часов

---

### 3.3. Объединение checkpoint'ов при восстановлении
**Задачи:**
```
[ ] При восстановлении: найти все checkpoint'ы одной сессии
[ ] Объединить в один Blob (конкатенация)
[ ] Удалить отдельные checkpoint'ы после объединения
[ ] Показать прогресс восстановления
```

**Оценка:** 8 часов

---

### 3.4. Каскадное обновление встреч при удалении пациента
**Задачи:**
```
[ ] При soft_delete_patient: отменить scheduled встречи
[ ] Или: показать warning со списком встреч
[ ] Предложить: "Отменить встречи" / "Оставить"
```

**Оценка:** 4 часа

---

### 3.5. Обновление кэша пациентов
**Задачи:**
```
[ ] Изменить staleTime с Infinity на 5 минут
[ ] Добавить refetchOnWindowFocus: true
[ ] Добавить manual refresh кнопку
```

**Оценка:** 2 часа

---

### 3.6. Аудит изменений ролей
**Задачи:**
```
[ ] Создать таблицу role_changes_audit
[ ] Логировать: кто, когда, какую роль, кому
[ ] Уведомлять пользователя о смене его роли
```

**Оценка:** 6 часов

---

## Фаза 4: Желательные улучшения (P3)

### 4.1. Система уведомлений о встречах
**Задачи:**
```
[ ] Создать таблицу notifications
[ ] Email при создании встречи (пациенту)
[ ] Напоминание за 24 часа (врачу и пациенту)
[ ] Напоминание за 1 час (врачу)
[ ] Push-уведомления (если включены)
```

**Оценка:** 20 часов

---

### 4.2. AI-генерация: retry для упавших секций
**Задачи:**
```
[ ] При ошибке секции: автоматический retry (3 попытки)
[ ] Кнопка "Перегенерировать секцию" в UI
[ ] Показывать какие секции failed
```

**Оценка:** 8 часов

---

### 4.3. Recovery для зависшей AI-генерации
**Задачи:**
```
[ ] Timeout для AI генерации (5 минут на секцию)
[ ] Статус 'generation_timeout'
[ ] Кнопка "Перезапустить генерацию"
```

**Оценка:** 6 часов

---

### 4.4. Лимит длительности записи в UI
**Задачи:**
```
[ ] Добавить MAX_RECORDING_DURATION = 2 часа
[ ] Показывать прогресс: "45:00 / 2:00:00"
[ ] Предупреждение за 10 минут до лимита
[ ] Автоматическая остановка при достижении лимита
```

**Оценка:** 4 часа

---

## Сводка по фазам

| Фаза | Задач | Часов | Приоритет |
|------|-------|-------|-----------|
| Фаза 1 (P0) | 4 | 20 | Немедленно |
| Фаза 2 (P1) | 6 | 44 | 1-2 недели |
| Фаза 3 (P2) | 6 | 29 | 2-4 недели |
| Фаза 4 (P3) | 4 | 38 | 4+ недель |
| **Итого** | **20** | **131** | - |

---

## Зависимости между задачами

```
Фаза 1 (параллельно):
├── 1.1 Timeout stopRecording ─────────────────┐
├── 1.2 Проверка единственного админа ─────────┤
├── 1.3 Проверка сессий при удалении ──────────┼── Можно делать параллельно
└── 1.4 Конфликты времени ─────────────────────┘

Фаза 2:
├── 2.1 Отмена транскрипции ← зависит от понимания 1.x
├── 2.2 Часовые пояса ← независимо
├── 2.3 Версионирование пациентов ← независимо
├── 2.4 Отзыв консентов ← после 1.3
├── 2.5 Session timeout warning ← независимо
└── 2.6 MFA factorId ← независимо

Фаза 3:
├── 3.1 Double-click защита ← после 2.1
├── 3.2 Удаление повторяющихся ← независимо
├── 3.3 Объединение checkpoint'ов ← независимо
├── 3.4 Каскадное обновление встреч ← после 1.3
├── 3.5 Кэш пациентов ← независимо
└── 3.6 Аудит ролей ← после 1.2

Фаза 4:
├── 4.1 Уведомления ← после 1.4
├── 4.2 AI retry ← независимо
├── 4.3 AI recovery ← после 4.2
└── 4.4 Лимит записи ← независимо
```

---

## Рекомендуемый порядок выполнения

### Спринт 1 (неделя 1):
1. ✅ 1.1 Timeout stopRecording (2ч)
2. ✅ 1.2 Проверка единственного админа (4ч)
3. ✅ 2.5 Session timeout warning (6ч)
4. ✅ 2.6 MFA factorId (4ч)
5. ✅ 3.5 Кэш пациентов (2ч)

**Итого: 18 часов**

### Спринт 2 (неделя 2):
1. ✅ 1.3 Проверка сессий при удалении (6ч)
2. ✅ 1.4 Конфликты времени (8ч)
3. ✅ 2.4 Отзыв консентов (4ч)

**Итого: 18 часов**

### Спринт 3 (неделя 3):
1. ✅ 2.1 Отмена транскрипции (12ч)
2. ✅ 3.1 Double-click защита (3ч)

**Итого: 15 часов**

### Спринт 4 (неделя 4):
1. ✅ 2.2 Часовые пояса (8ч)
2. ✅ 2.3 Версионирование пациентов (10ч)

**Итого: 18 часов**

### Последующие спринты:
- Фаза 3 оставшееся (24ч)
- Фаза 4 (38ч)

---

## Метрики успеха

| Метрика | Текущее | Цель |
|---------|---------|------|
| Потеря записей | ~2% | < 0.1% |
| Зависшие транскрипции | ~5% | < 1% |
| Конфликты встреч | Не отслеживается | 0 |
| Клиники без админа | Возможно | 0 |
| Session timeout с потерей данных | ~10% | < 1% |

---

*План создан: 2026-01-18*
*Версия: 1.0*
*Общая оценка: 131 час (примерно 4-6 недель при 20-30 ч/неделю)*
