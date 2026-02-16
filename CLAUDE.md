# CLAUDE.md — Project Guide for AI Assistants

## Project Overview

PsiPilot Assistant — AI-powered clinical documentation tool for mental health professionals.
React/TypeScript SPA with Supabase backend and AssemblyAI transcription service.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: shadcn/ui, Tailwind CSS
- **Backend**: Self-hosted Supabase (Postgres, Auth, Storage, RLS)
- **State**: TanStack Query (React Query)
- **Transcription**: AssemblyAI via custom Node.js service (`backend/transcription-service/`)
- **Testing**: Vitest + @testing-library/react, jsdom environment
- **Linting**: ESLint (no Prettier)
- **Path alias**: `@/*` → `./src/*`

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (Vite)
npm run build        # Production build
npx vitest run       # Run all tests
npx vitest run src/hooks/__tests__/useAudioRecorder.test.ts  # Run specific test
```

## Project Structure

```
src/
├── components/      # UI components (auth, calendar, patients, scribe, sessions, ui)
├── contexts/        # React contexts (AuthContext, BackgroundUploadContext)
├── hooks/           # Custom hooks (useAudioRecorder, useTranscriptionRecovery, etc.)
├── lib/             # Utilities (supabase-recordings, local-recording-storage, encryption)
├── pages/           # Page components (SessionsPage, ScribePage, PatientsPage)
├── types/           # TypeScript types (database.types.ts)
├── test/            # Test setup (setup.ts)
└── __tests__/       # Integration tests

backend/
├── transcription-service/  # Node.js API for AssemblyAI transcription
│   └── routes/transcribe.js  # POST /api/transcribe endpoint
└── telegram-bot/           # Telegram bot integration
```

## Architecture: Audio Recording & Transcription Flow

This is the most complex and bug-prone part of the system. The full pipeline:

### Recording (microphone)
1. `useAudioRecorder` hook → MediaRecorder API → collects Blob chunks
2. `stopRecording()` → assembles Blob → returns via Promise
3. Key refs: `stopResolveRef`, `stopResolvedRef`, `isStoppingRef` — prevent race conditions
4. `safeResolve` wrapper in `stopRecording()` ensures promise resolves only once

### Recording (external file upload)
1. User selects file via `<input type="file">` in SessionsPage
2. `handleUploadAudioFile()` validates format/size, extracts duration
3. Same pipeline as microphone from step 4 below

### Upload & Transcription
4. `queueUpload()` in `BackgroundUploadContext` → `processUpload()`:
   - Step 1: Save locally (IndexedDB via `local-recording-storage.ts`)
   - Step 3: `createRecording()` → DB record with **temp** `file_path`: `recordings/temp/{ts}-{name}`
   - Step 4: `uploadAudioFile()` → Supabase Storage, **updates** `file_path` to `recordings/{id}/{name}`
   - Step 7: `startTranscription()` → POST to backend `/api/transcribe`
5. Backend generates signed URL from `recording.file_path`, sends to AssemblyAI
6. AssemblyAI calls webhook on completion → updates DB

### Transcription Recovery
- `useTranscriptionRecovery` hook polls recording status with adaptive intervals
- Survives page navigation, handles stuck/failed transcriptions
- Global callback tracking prevents duplicate `onComplete` calls

### Known Pitfalls
- **file_path lifecycle**: Starts as `recordings/temp/...`, updated to `recordings/{id}/...` after upload. If upload fails, temp path stays — **always check before using**.
- **Filename sanitization**: External files may have Cyrillic/spaces in names. `sanitizeStorageFileName()` in `supabase-recordings.ts` handles this. Original name preserved in `file_name` field.
- **onerror handler ordering**: `stopResolveRef` must be called BEFORE setting `stopResolvedRef = true` (the safeResolve wrapper checks stopResolvedRef).
- **IndexedDB**: Recordings stored unencrypted locally with 48h TTL. Server-side encryption on upload.

## Testing

### Test Setup
- Config: `vitest.config.ts` — jsdom environment, globals enabled
- Setup file: `src/test/setup.ts` — mocks for matchMedia, ResizeObserver, localStorage, fetch, Supabase
- 24 test files, ~488 tests total

### Key Test Files for Recording
- `src/hooks/__tests__/useAudioRecorder.test.ts` — 20 tests (lifecycle, errors, timeout, cleanup)
- `src/lib/__tests__/local-recording-storage.test.ts` — 22 tests (IndexedDB CRUD, TTL, URL leak)
- `src/hooks/__tests__/useTranscriptionRecovery.test.ts` — 11 tests (polling, callbacks, stuck detection)
- `src/lib/__tests__/supabase-recordings.test.ts` — 26 tests (API, validation, filename sanitization)

### Testing Tips
- `Blob.arrayBuffer()` not available in jsdom — polyfill in test file if needed
- Mock `navigator.mediaDevices.getUserMedia` for recording tests
- Use `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for polling/timeout tests
- IndexedDB must be faked in-memory (see `local-recording-storage.test.ts` for pattern)

## Code Conventions

- Language: UI text in Russian, code/comments mixed Russian/English
- State management: Single `status` enum (discriminated union) instead of boolean flags
- Error handling: Always try to save partial recording data on errors
- DB operations: Each function opens/closes its own IndexedDB connection (try/finally)
- Supabase: Use `auth.uid()` from session, not passed userId (RLS compatibility)
- File paths: Always sanitize before using in Supabase Storage paths
- Soft delete: Recordings use `deleted_at` field, not hard delete

## Security Notes

- HIPAA/GDPR/152-ФЗ compliance required
- PHI fields encrypted with AES-GCM 256-bit (field-level encryption)
- RLS policies on all tables — always use auth UID
- Never commit `.env` files or credentials
- Local recordings: unencrypted (trusted device), server: encrypted
