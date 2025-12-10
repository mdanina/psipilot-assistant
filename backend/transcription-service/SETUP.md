# Быстрая настройка Transcription Service

## Шаг 1: Установка зависимостей

```bash
cd backend/transcription-service
npm install
```

## Шаг 2: Создание файла .env

**ВАЖНО:** Без файла `.env` сервис не запустится с ошибкой `supabaseUrl is required`.

Создайте файл `.env` в директории `backend/transcription-service/` со следующим содержимым:

```env
# Server Configuration
PORT=3001

# AssemblyAI API Key
# Получите ключ на https://www.assemblyai.com/
ASSEMBLYAI_API_KEY=your-assemblyai-api-key

# Supabase Configuration
# Замените на ваши реальные значения из Supabase Dashboard
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Webhook URL (опционально, для асинхронной транскрипции)
WEBHOOK_URL=http://localhost:3001/api/webhook/assemblyai
```

## Шаг 3: Настройка Supabase

1. Откройте Supabase Dashboard
2. Перейдите в Settings > API
3. Скопируйте:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (НЕ anon key!)

## Шаг 4: Запуск сервиса

### Режим разработки (с автоперезагрузкой):
```bash
npm run dev
```

### Production режим:
```bash
npm start
```

Сервис будет доступен на `http://localhost:3001`

## Проверка работы

Откройте в браузере: `http://localhost:3001/health`

Должен вернуться ответ:
```json
{
  "status": "ok",
  "timestamp": "2024-..."
}
```

## Важные замечания

1. **API ключ AssemblyAI** - получите свой ключ на https://www.assemblyai.com/
2. **Service Role Key** - используйте именно service_role key, а не anon key, так как сервису нужны права для чтения файлов из Storage
3. **Безопасность** - файл `.env` уже в `.gitignore`, не коммитьте его в git
4. **Порт** - по умолчанию используется порт 3001, измените при необходимости

## Troubleshooting

### Ошибка "ASSEMBLYAI_API_KEY is not defined"
- Убедитесь, что файл `.env` создан в правильной директории
- Проверьте, что ключ указан без пробелов и кавычек

### Ошибка "Failed to generate signed URL"
- Проверьте, что используется `SUPABASE_SERVICE_ROLE_KEY`, а не anon key
- Убедитесь, что bucket `recordings` существует в Supabase Storage

### Ошибка "Unauthorized"
- Проверьте правильность Supabase URL и Service Role Key
- Убедитесь, что Supabase сервер запущен и доступен

