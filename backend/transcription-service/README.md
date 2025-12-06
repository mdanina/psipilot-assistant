# Transcription Service

Backend service for audio transcription using AssemblyAI API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in the `backend/transcription-service/` directory:
```bash
# Create .env file
touch .env
```

3. Add the following environment variables to `.env`:
```env
# Server Configuration
PORT=3001

# AssemblyAI API Key
# Используйте предоставленный ключ: 8bda602db37e4887ba24d711f4c75c8b
ASSEMBLYAI_API_KEY=8bda602db37e4887ba24d711f4c75c8b

# Supabase Configuration
# Замените на ваши реальные значения из Supabase Dashboard
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Webhook URL (optional, for async transcription)
WEBHOOK_URL=http://localhost:3001/api/webhook/assemblyai
```

**Важно:** 
- Файл `.env` уже добавлен в `.gitignore` и не будет попадать в git
- Не коммитьте API ключи в репозиторий!
- AssemblyAI API ключ уже предоставлен и настроен

## Running

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST /api/transcribe
Start transcription for a recording.

**Headers:**
- `Authorization: Bearer <supabase-jwt-token>`

**Body:**
```json
{
  "recordingId": "uuid-of-recording"
}
```

**Response:**
```json
{
  "success": true,
  "recordingId": "uuid",
  "transcriptId": "assemblyai-transcript-id",
  "status": "processing"
}
```

### GET /api/transcribe/:recordingId/status
Get transcription status for a recording.

**Headers:**
- `Authorization: Bearer <supabase-jwt-token>`

**Response:**
```json
{
  "status": "completed",
  "transcriptionText": "Transcribed text...",
  "error": null
}
```

### POST /api/webhook/assemblyai
Webhook endpoint for AssemblyAI to notify when transcription is complete.

## Security

- All endpoints require Supabase JWT authentication
- Service role key should only be used server-side
- Never expose AssemblyAI API key to clients

