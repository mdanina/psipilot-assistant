# Создание файла .env

## Проблема

Ошибка: `Error: supabaseUrl is required.`

Это означает, что файл `.env` не создан или не содержит необходимые переменные.

## Решение

Создайте файл `.env` в директории `backend/transcription-service/` со следующим содержимым:

```env
# Server Configuration
PORT=3001

# AssemblyAI API Key
ASSEMBLYAI_API_KEY=8bda602db37e4887ba24d711f4c75c8b

# Supabase Configuration
# Замените на ваши реальные значения!
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## Где найти Supabase ключи

1. Откройте Supabase Dashboard
2. Перейдите в **Settings** > **API**
3. Скопируйте:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (НЕ anon key!) → `SUPABASE_SERVICE_ROLE_KEY`

## Важно

- **Service Role Key** необходим для доступа к Supabase Storage
- **НЕ используйте** anon key для backend сервиса (он не имеет прав на Storage)
- Файл `.env` уже в `.gitignore` и не попадет в git

## После создания .env

Перезапустите сервис:
```bash
npm run dev
```

Сервис должен запуститься без ошибок.

## Проверка

Откройте в браузере: http://localhost:3001/health

Должен вернуться ответ:
```json
{
  "status": "ok",
  "timestamp": "2024-..."
}
```

