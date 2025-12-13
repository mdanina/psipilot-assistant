# Настройка Webhook для транскрипции

## Обзор изменений

Реализована полная поддержка асинхронной транскрипции через webhook от AssemblyAI. Теперь транскрипты автоматически сохраняются в привязке к сессиям и пациентам.

## Что было сделано

1. ✅ Добавлено поле `transcript_id` в таблицу `recordings` (миграция 015)
2. ✅ Реализована обработка webhook для сохранения результатов транскрипции
3. ✅ Обновлены настройки транскрипции (добавлена модель `universal` для ускорения)
4. ✅ Обновлены TypeScript типы

## Шаги для применения изменений

### 1. Применить миграцию базы данных

Выполните миграцию `015_add_transcript_id.sql`:

```bash
# Если используете Supabase CLI
supabase migration up

# Или примените миграцию вручную через Supabase Dashboard
# SQL Editor > New Query > вставьте содержимое файла supabase/migrations/015_add_transcript_id.sql
```

### 2. Настроить Webhook URL в AssemblyAI

**Важно:** Webhook URL должен быть доступен из интернета. AssemblyAI отправляет POST запросы на этот URL при завершении транскрипции.

#### Для локальной разработки:

1. Установите ngrok или cloudflared:
   ```bash
   # ngrok
   ngrok http 3001
   
   # или cloudflared
   cloudflared tunnel --url http://localhost:3001
   ```

2. Скопируйте полученный URL (например, `https://abc123.ngrok.io`)

3. В файле `.env` в `backend/transcription-service/` добавьте:
   ```env
   WEBHOOK_URL=https://abc123.ngrok.io/api/webhook/assemblyai
   ```

4. В AssemblyAI Dashboard:
   - Settings > Webhooks
   - Добавьте webhook URL: `https://abc123.ngrok.io/api/webhook/assemblyai`

#### Для production:

1. Убедитесь, что ваш сервер доступен из интернета
2. В файле `.env` укажите полный URL:
   ```env
   WEBHOOK_URL=https://your-domain.com/api/webhook/assemblyai
   ```

3. В AssemblyAI Dashboard добавьте этот URL в настройки webhook

### 3. Перезапустить backend сервис

```bash
cd backend/transcription-service
npm start
# или для разработки
npm run dev
```

## Как это работает

1. **Запуск транскрипции:**
   - Пользователь делает запись в Скрайбере
   - Запись отправляется на транскрипцию через `/api/transcribe`
   - Backend сохраняет `transcript_id` в БД
   - AssemblyAI начинает обработку

2. **Асинхронная обработка:**
   - AssemblyAI обрабатывает аудио (может занять время)
   - При завершении AssemblyAI отправляет POST запрос на webhook URL
   - Webhook находит запись по `transcript_id`
   - Сохраняет транскрибированный текст с диаризацией
   - Обновляет статус на 'completed'

3. **Отображение результатов:**
   - Фронтенд опрашивает статус транскрипции (polling)
   - Когда статус становится 'completed', транскрипт отображается в разделе "Сессии"
   - Транскрипт автоматически привязан к сессии и пациенту (если сессия привязана)

## Проверка работы

1. Сделайте тестовую запись в Скрайбере
2. Проверьте логи backend сервиса - должен появиться `transcript_id`
3. Проверьте логи webhook - при завершении транскрипции должен прийти запрос от AssemblyAI
4. Проверьте раздел "Сессии" - транскрипт должен появиться автоматически

## Troubleshooting

### Webhook не получает запросы от AssemblyAI

- Убедитесь, что webhook URL доступен из интернета
- Проверьте, что URL добавлен в настройках AssemblyAI
- Проверьте логи backend сервиса на наличие ошибок

### Транскрипты не сохраняются

- Проверьте, что миграция применена (поле `transcript_id` существует)
- Проверьте логи webhook на наличие ошибок
- Убедитесь, что `SUPABASE_SERVICE_ROLE_KEY` настроен правильно

### Транскрипция работает медленно

- Модель `universal` уже настроена для ускорения
- Для очень длинных записей транскрипция может занять несколько минут
- Проверьте статус в AssemblyAI Dashboard

## Дополнительная информация

- Документация транскрипции: `docs/AUDIO_RECORDING_TRANSCRIPTION.md`
- Backend сервис: `backend/transcription-service/README.md`
- Настройка сервиса: `backend/transcription-service/SETUP.md`






