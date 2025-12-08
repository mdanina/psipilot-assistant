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
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here

# Supabase Configuration
# Замените на ваши реальные значения!
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here

# Webhook URL (опционально, для async transcription)
WEBHOOK_URL=http://localhost:3001/api/webhook/assemblyai

# OpenAI API Configuration (для AI-анализа сессий)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Encryption Key (для шифрования PHI данных)
# Генерируется одним из способов:
#   1. Скрипт: node scripts/generate-encryption-key.js
#   2. Команда: openssl rand -base64 32
#   3. PowerShell: [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
# ВАЖНО: Храните этот ключ в безопасности! Не коммитьте в git!
ENCRYPTION_KEY=your-base64-encryption-key-here
```

## Генерация ключа шифрования

Для генерации ключа шифрования используйте один из способов:

**Способ 1: Использовать скрипт (рекомендуется)**
```bash
cd backend/transcription-service
node scripts/generate-encryption-key.js
```

**Способ 2: Команда openssl (Linux/Mac)**
```bash
openssl rand -base64 32
```

**Способ 3: PowerShell (Windows)**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Скопируйте сгенерированный ключ и вставьте в `.env` файл в переменную `ENCRYPTION_KEY`.

## Где найти Supabase ключи

1. Откройте Supabase Dashboard
2. Перейдите в **Settings** > **API**
3. Скопируйте:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (НЕ anon key!) → `SUPABASE_SERVICE_ROLE_KEY`
   - **anon public key** → `SUPABASE_ANON_KEY`

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



