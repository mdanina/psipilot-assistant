# CLAUDE.md — Project Guide for AI Assistants

## Project Overview

PsiPilot Assistant — AI-powered clinical documentation tool for mental health professionals (psychiatrists, psychologists, psychotherapists).
React/TypeScript SPA with self-hosted Supabase backend, AssemblyAI transcription, and OpenAI clinical note generation.
Multi-tenant architecture with clinic-level isolation, HIPAA/152-ФЗ compliant, field-level PHI encryption.

## Tech Stack

- **Frontend**: React 18.3, TypeScript 5.8, Vite 5.4
- **UI**: shadcn/ui (Radix UI primitives), Tailwind CSS 3.4, Lucide icons
- **Backend**: Self-hosted Supabase (Postgres, Auth, Storage, RLS), Express.js transcription service
- **State**: TanStack Query 5.83 (React Query), React Context for auth/uploads/sidebar
- **AI**: OpenAI (clinical note generation), AssemblyAI (audio transcription)
- **Forms**: React Hook Form 7.61 + Zod 3.25 (validation)
- **Routing**: React Router DOM 6.30
- **File Parsing**: mammoth (DOCX), pdfjs-dist 5.4 (PDF)
- **Drag & Drop**: @dnd-kit suite (section reordering)
- **Charts**: Recharts 2.15
- **Testing**: Vitest 4.0 + @testing-library/react, Playwright (E2E), jsdom environment
- **Linting**: ESLint 9.32 (no Prettier)
- **Path alias**: `@/*` → `./src/*`
- **TypeScript**: Loose mode (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`)

## Commands

```bash
# Frontend
npm install                    # Install dependencies
npm run dev                    # Dev server (Vite, port 3000)
npm run build                  # Production build
npm run lint                   # ESLint

# Tests
npx vitest run                 # Run all tests (~488 tests)
npx vitest run path/to/test.ts # Run specific test file
npm run test:ui                # Vitest UI
npm run test:coverage          # Coverage report
npm run test:e2e               # Playwright E2E tests

# Backend (transcription-service)
cd backend/transcription-service
npm install
npm run dev                    # Node.js with --watch (port 3001)
npm start                      # Production

# Telegram Bot
cd backend/telegram-bot
npm install
npm start

# Utility Scripts
npm run check:connection       # Check Supabase connectivity
npm run check:updates          # Check git updates
npm run check:app              # Check application issues
npm run create:user            # Create user script
```

## Project Structure

```
src/
├── components/          # UI components
│   ├── analysis/        #   AI analysis: AnalysisLayout, GenerateButton, TemplatesLibrary
│   │   ├── output-panel/   # ClinicalNotesOutput, SectionItem, SectionsList (dnd), TemplateSelector
│   │   └── source-panel/   # SourcePanel, TranscriptView, NotesView, FilesView
│   ├── auth/            #   ProtectedRoute, SessionTimeoutWarning, PasswordStrengthIndicator
│   ├── calendar/        #   CalendarView, AppointmentList, CreateAppointmentDialog, TimezoneSelector
│   ├── layout/          #   MainLayout, Header, Sidebar, MobileSidebar
│   ├── patients/        #   PatientForm, PatientDetailModal, CaseSummaryBlock, ClinicalNoteView
│   ├── scribe/          #   RecordingCard, RecoveryDialog
│   ├── sessions/        #   CreateSessionDialog, SessionNotesDialog, SessionCaseSummaryBlock
│   └── ui/              #   ~40 shadcn/ui primitives (button, dialog, form, table, tabs...)
├── contexts/            # AuthContext, BackgroundUploadContext, SidebarContext
├── hooks/               # 18 custom hooks (see Hooks section below)
├── lib/                 # 26 utility modules (see Lib Modules section below)
├── pages/               # 20 page components (see Pages section below)
├── types/               # TypeScript types (database.types.ts, ai.types.ts, patient-files.ts)
├── test/                # Test setup (setup.ts)
└── __tests__/           # Integration tests

backend/
├── transcription-service/   # Express.js API (port 3001)
│   ├── server.js            #   Main entry, middleware, routes
│   ├── routes/
│   │   ├── transcribe.js    #   POST /api/transcribe — AssemblyAI integration
│   │   ├── ai.js            #   POST /api/ai/* — OpenAI clinical note generation
│   │   ├── webhook.js       #   POST /api/webhook — AssemblyAI completion callbacks
│   │   ├── crypto.js        #   POST /api/crypto/* — PHI encryption/decryption
│   │   ├── research.js      #   GET /api/research/* — Anonymized data export
│   │   └── calendar.js      #   GET /api/calendar/* — iCal feed generation
│   ├── middleware/
│   │   ├── auth.js          #   JWT verification (user ID, email, clinic_id)
│   │   ├── webhook-auth.js  #   AssemblyAI webhook signature validation
│   │   ├── research-auth.js #   Research API auth
│   │   └── rate-limit-store.js  # Rate limiting storage
│   └── services/
│       ├── encryption.js    #   AES-256-GCM PHI encryption
│       ├── openai.js        #   OpenAI client with retry (4 retries, exponential backoff)
│       ├── supabase-admin.js    # Singleton Supabase admin client (SERVICE_ROLE_KEY)
│       ├── anonymization.js     # Data anonymization for research
│       ├── transcriptHelper.js  # Transcript processing
│       └── transcript-formatting.js  # Speaker label formatting
└── telegram-bot/            # Grammy Telegram bot for feedback/complaints
    └── src/index.js         #   Conversation flow with complaint categories

supabase/
└── migrations/              # 58 SQL migration files (see Database section below)

deploy/
├── nginx.conf               # Nginx config for Docker
└── .env.production.example  # Production env template
```

---

## Pages (20 files)

### Public Pages (no auth required)
| Page | Route | Purpose |
|------|-------|---------|
| `LoginPage.tsx` | `/login` | Email/password auth, links to register/forgot |
| `RegisterPage.tsx` | `/register` | Registration with password strength indicator |
| `VerifyEmailPage.tsx` | `/verify-email` | OTP email verification via InputOTP |
| `ForgotPasswordPage.tsx` | `/forgot-password` | Password reset email request |
| `ResetPasswordPage.tsx` | `/reset-password` | Token-based password reset |
| `UnauthorizedPage.tsx` | `/unauthorized` | 403 error page |
| `TermsPage.tsx` | `/terms` | Static terms of service (lazy loaded) |
| `PrivacyPage.tsx` | `/privacy` | Static privacy policy (lazy loaded) |

### Protected Pages (auth required, inside MainLayout)
| Page | Route | Role | Purpose |
|------|-------|------|---------|
| `Index.tsx` / `ScribePage.tsx` | `/` | any | Main dashboard — audio recording, transcription, upload |
| `SessionsPage.tsx` | `/sessions` | specialist, admin | Session management, recordings, analysis launcher, external file upload |
| `SessionAnalysisPage.tsx` | `/sessions/:sessionId/analysis` | specialist, admin | AI clinical note generation with template selection |
| `PatientsPage.tsx` | `/patients` | specialist, admin | Patient list with search/filter |
| `PatientCreatePage.tsx` | `/patients/new` | specialist, admin | New patient form |
| `PatientDetailPage.tsx` | `/patients/:id` | specialist, admin | Patient detail tabs: info, activities, documents, conversations, supervisor |
| `CalendarPage.tsx` | `/calendar` | specialist, admin | Appointment scheduling with timezone support |
| `AdministrationPage.tsx` | `/administration` | admin only | Clinic management, user invitations, user roles |
| `ProfilePage.tsx` | `/profile` | any | Profile editing, specialization, MFA setup |
| `OnboardingPage.tsx` | `/onboarding` | any (skipOnboardingCheck) | Clinic creation for new organizations |
| `NotFound.tsx` | `*` | — | 404 catch-all |

**Loading strategy**: 7 critical pages (Index, Login, Register, VerifyEmail, ForgotPassword, ResetPassword, Onboarding) loaded eagerly. Rest lazy-loaded via `LazyRoute`.

---

## Contexts (3 files)

### AuthContext (`src/contexts/AuthContext.tsx`)
Central authentication and user state management.

**State**: `user`, `profile` (with clinic), `session`, `isLoading`, `isAuthenticated`, `mfaEnabled`, `mfaVerified`, `lastActivity`, `sessionExpiresAt`, `protectedActivityCount`

**Methods**: `signIn()`, `signUp()`, `signOut()`, `resetPassword()`, `updatePassword()`, `enableMFA()`, `verifyMFA()`, `disableMFA()`, `refreshProfile()`, `updateActivity()`, `startProtectedActivity()`

**Features**:
- 15-minute session timeout with 2-minute warning dialog
- Profile and clinic caching with request deduplication
- MFA support (TOTP)
- Activity tracking to prevent premature session timeout
- Protected background activity guard: session timeout is suspended while recording/capture/finalization is active

### BackgroundUploadContext (`src/contexts/BackgroundUploadContext.tsx`)
Background recording upload management that persists across page navigation.

**State**: `pendingUploads: Map<string, PendingUpload>`, upload statuses (queued → uploading → transcribing → completed/failed)

**Methods**: `queueUpload()`, `retryUpload()`, `cancelUpload()`, `dismissFailedUpload()`, `setOnTranscriptionStarted()`

**Properties**: `hasActiveUploads`, `hasFailedUploads`, `failedUploadsCount`

**8-step upload pipeline** (inside `processUpload()`):
1. Save locally to IndexedDB
2. Validate auth session
3. Create DB recording (temp file_path)
4. Upload to Supabase Storage (final file_path)
5. Mark local recording as uploaded
6. Verify upload success
7. Start transcription (POST to backend)
8. Add to transcription recovery polling

### SidebarContext (`src/contexts/SidebarContext.tsx`)
Mobile sidebar toggle: `isOpen`, `open()`, `close()`, `toggle()`.

---

## Hooks (18 files)

### Audio & Recording
| Hook | Returns | Purpose |
|------|---------|---------|
| `useAudioRecorder` | status, isRecording, isPaused, isStopped, recordingTime, audioBlob, error, wasPartialSave, start/pause/resume/stop/cancel/reset, getCurrentChunks, getCurrentMimeType | MediaRecorder API wrapper. Key refs: `stopResolveRef`, `stopResolvedRef`, `isStoppingRef`. `safeResolve` prevents double-resolution. Error handler saves partial data. 120s stop timeout with partial save. |
| `useTabAudioCapture` | status, recordingTime, audioBlob, error, isSupported, startCapture, stopCapture, cancelCapture, reset | Screen Capture API for browser tab audio capture |
| `useTranscriptionRecovery` | processingTranscriptions, isAnyProcessing, count, addTranscription, removeTranscription, refreshFromDatabase | Adaptive polling: 5s (first 6), 30s (next 20), 60s after. Stuck detection at 6h. Max 720 attempts (~12h). Callbacks: onComplete, onError. |
| `useNavigationBlocker` | state, isBlocked, proceed, reset, navigate | Blocks React Router navigation during recording/upload |

### Data Fetching (React Query)
| Hook | Returns | Purpose |
|------|---------|---------|
| `usePatients` | data, isLoading, error, refetch | All patients with document counts |
| `useSearchPatients` | data, isLoading | Debounced patient search |
| `usePatient` | data, isLoading, error | Single patient by ID (decrypted) |
| `useSessions` | data, isLoading, error, refetch | All clinic sessions |
| `usePatientActivities` | data.sessions, data.clinicalNotes, data.contentCounts | Combined patient sessions + clinical notes |
| `usePatientCaseSummary` | data.caseSummary, data.generatedAt | Encrypted case summary with auto-decryption |

### Mutations
| Hook | Returns | Purpose |
|------|---------|---------|
| `useCreatePatient` | mutate, isPending, error | Create patient |
| `useDeletePatient` | mutate, isPending, error | Delete patient (soft) |
| `useCreateSession` | mutate, isPending, error | Create session |
| `useDeleteSession` | mutate, isPending, error | Delete session (soft) |
| `useCompleteSession` | mutate, isPending, error | Mark session complete |
| `useLinkSessionToPatient` | mutate, isPending, error | Link session to patient |

### Utility
| Hook | Returns | Purpose |
|------|---------|---------|
| `use-mobile` | boolean | Detects viewport < 768px |
| `use-toast` | toast, dismiss, toasts | Toast notification reducer pattern |

---

## Lib Modules (26 files)

### Core Infrastructure
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `supabase.ts` | `supabase`, `isSupabaseConfigured`, `getCurrentUser()`, `getCurrentProfile()`, `onAuthStateChange()`, `signOut()` | Supabase client init with auto-refresh tokens and URL session detection |
| `query-client.ts` | `queryClient`, `getQueryMetrics()`, `invalidateQueries()` | React Query client, 5-60min staleTime (env-configurable), exponential backoff retries, fetch metrics tracking |
| `utils.ts` | `cn()` | clsx + tailwind-merge for CSS class composition |
| `env-diagnostics.ts` | `getEnvDiagnostics()`, `validateRequiredEnvVars()` | Runtime VITE_* env var validation |
| `date-utils.ts` | `formatRelativeTime()`, `formatDate()`, `formatDateTime()` | Russian locale date formatting (date-fns) |
| `specializations.ts` | `SPECIALIZATIONS`, `getSpecializationName()`, `getSpecializationList()` | 9 medical specializations: psychiatrist, psychologist, neurologist, neuropsychologist, psychotherapist, clinical_psychologist, child_psychologist, family_therapist, group_therapist |

### Security & Compliance
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `encryption.ts` | `encryptPHI()`, `decryptPHI()`, `encryptPHIBatch()`, `decryptPHIBatch()` | Backend-side field-level PHI encryption via `/api/crypto`. Encryption keys never sent to browser. Status cached 1 min. |
| `recording-encryption.ts` | `generateSessionKey()`, `encryptBlob()`, `decryptBlob()` | **Legacy** client-side AES-GCM. Deprecated — new recordings stored unencrypted locally. Kept for backward compat with old encrypted recordings. |
| `security.ts` | IP blocking, backup codes, retention, consent, failed login tracking | HIPAA compliance: `checkIPBlock()`, `blockIP()`, `generateBackupCodes()`, `verifyBackupCode()`, `runRetentionCleanup()`, `recordFailedLogin()`, `createConsent()`, `withdrawConsent()`, `getPatientConsents()`, `hasActiveConsent()` |
| `break-the-glass.ts` | `requestEmergencyAccess()`, `hasEmergencyAccess()`, `logEmergencyAction()`, `revokeEmergencyAccess()` | Emergency access for life-threatening, court order, patient request, public health scenarios. All access logged for HIPAA audit. |
| `supabase-encrypted.ts` | `encryptedSupabase` | Supabase client wrapper that auto-encrypts/decrypts PHI fields on CRUD |
| `supabase-audited.ts` | `auditedSupabase`, `secureSupabase` | Audit logging wrapper for Supabase reads. Logs per-row PHI access for HIPAA. |

### Patient & Session Management
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `supabase-patients.ts` | `createPatient()`, `getPatient()`, `getPatients()`, `updatePatient()`, `deletePatient()`, `searchPatients()`, `migratePatientToEncrypted()` | All PII fields (name, email, phone, address, notes) encrypted. Batch decryption. Migration support for legacy unencrypted data. |
| `supabase-sessions.ts` | `createSession()`, `updateSession()`, `getSession()`, `completeSession()`, `deleteSession()`, `linkSessionToPatient()`, scheduling and appointment CRUD | Session lifecycle. Auto-creates consent records (data_processing + recording) on patient link. Recurring appointments (weekly/monthly). Soft deletes. |
| `supabase-patient-assignments.ts` | `assignPatientToDoctor()`, `unassignPatientFromDoctor()`, `reassignPatient()` | Assignment types: primary, consultant, group_therapist. Admin-only. Uses RPC functions. |
| `supabase-session-notes.ts` | Session notes CRUD | Session note management |

### Recording & Transcription
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `supabase-recordings.ts` | `createRecording()`, `uploadAudioFile()`, `startTranscription()`, `getRecordingStatus()`, `syncTranscriptionStatus()`, `getSessionRecordings()`, `deleteRecording()`, `validateFileSize()`, `sanitizeStorageFileName()` | Recording lifecycle. `MAX_FILE_SIZE_MB = 500`. Upload with 3-retry exponential backoff. Filename sanitization for Cyrillic/special chars. Auto-decrypts transcriptions. |
| `local-recording-storage.ts` | `saveRecordingLocally()`, `getLocalRecording()`, `markRecordingUploaded()`, `getUnuploadedRecordings()`, `deleteLocalRecording()`, `clearAllLocalRecordings()`, `downloadLocalRecording()`, `getStorageUsage()` | IndexedDB storage. 48h TTL. 50MB minimum free space check. Handles legacy encrypted + new unencrypted formats. Each operation opens/closes own DB connection. |
| `local-recording-audit.ts` | `logLocalStorageOperation()` | Audit logging for local storage ops |

### AI & Clinical Notes
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `supabase-ai.ts` | Template CRUD (`getBlockTemplates()`, `getNoteTemplates()`, `createNoteTemplate()`, `addBlockToTemplate()`), generation (`generateClinicalNote()`, `getGenerationStatus()`, `regenerateSection()`), case summary (`generateCaseSummary()`, `generatePatientCaseSummary()`), note CRUD (`getClinicalNote()`, `updateSectionContent()`, `finalizeClinicalNote()`, `softDeleteClinicalNote()`) | Core AI integration hub. Batch decrypts content via `decryptPHIBatch()`. |

### Documents & Files
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `supabase-documents.ts` | `uploadPatientDocument()`, `getDocumentDownloadUrl()`, `deleteDocument()`, `formatFileSize()` | Document CRUD. Types: lab_result, prescription, referral, consent, other. Signed download URLs (1h expiry). |
| `supabase-patient-files.ts` | `getPatientFiles()` | Unified file aggregation from documents + transcripts + session notes |
| `file-parser.ts` | `parseFile()`, `isSupportedFile()`, `SUPPORTED_EXTENSIONS` | Multi-format text extraction: TXT, MD, JSON, DOC/DOCX (mammoth), PDF (pdf.js). Dynamic imports for code splitting. |

### Other
| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `calendar-feed.ts` | `generateCalendarFeedToken()`, `revokeCalendarFeedToken()` | iCal subscription token generation |
| `supervisor-api.ts` | Supervisor API functions | N8N webhook integration for supervisor conversations |

---

## Architecture: Audio Recording & Transcription Flow

This is the most complex and bug-prone part of the system.

### Recording (microphone)
1. `useAudioRecorder` hook → `navigator.mediaDevices.getUserMedia()` → MediaRecorder API → collects Blob chunks
2. Timer updates `recordingTime` every second (paused when isPaused)
3. `stopRecording()` → builds `safeResolve` wrapper → calls `mediaRecorder.stop()` → waits for `onstop` event
4. `onstop` assembles Blob from chunks → resolves Promise via `safeResolve`
5. Key refs preventing race conditions:
   - `stopResolveRef` — holds the Promise resolve function
   - `stopResolvedRef` — boolean flag, checked by `safeResolve` to prevent double resolution
   - `isStoppingRef` — prevents concurrent stop calls
6. `onerror` handler: assembles partial Blob from existing chunks → resolves Promise → marks as stopped
7. Timeout: if `onstop` doesn't fire within 120s, force-resolves with partial data, sets `wasPartialSave = true`

### Recording (external file upload)
1. User selects file via `<input type="file" accept="audio/*">` in SessionsPage
2. `handleUploadAudioFile()` validates audio format and size (max 500MB)
3. Extracts audio duration via `<audio>` element
4. Same upload pipeline as microphone from step 4 below

### Upload Pipeline (BackgroundUploadContext.processUpload)
```
Step 1: saveRecordingLocally()     → IndexedDB (unencrypted, 48h TTL)
Step 2: Validate auth session       → supabase.auth.getSession()
Step 3: createRecording()           → DB record, temp file_path: recordings/temp/{ts}-{name}
Step 4: uploadAudioFile()           → Supabase Storage, updates file_path to recordings/{id}/{sanitized-name}
Step 5: markRecordingUploaded()     → Update IndexedDB record
Step 6: Verify upload                → getRecordingStatus()
Step 7: startTranscription()        → POST /api/transcribe with JWT
Step 8: addTranscription()          → Begin polling via useTranscriptionRecovery
```

### Backend Transcription Flow
1. `POST /api/transcribe` receives `{ recordingId }` with Bearer JWT
2. Auth middleware extracts user ID, validates token
3. Fetches recording from DB, validates `file_path` is not temp
4. Generates signed URL from Supabase Storage
5. Sends to AssemblyAI with `language_code: 'ru'`, `speaker_labels: true`
6. Stores `transcript_id` in recording
7. AssemblyAI processes async → calls webhook on completion
8. `POST /api/webhook` updates recording status, stores formatted transcript

### Transcription Recovery (useTranscriptionRecovery)
- Adaptive polling intervals: 5s (first 6 attempts) → 30s (next 20) → 60s (rest)
- Stuck detection fires at 6 hours → marks recording as failed
- Max 720 attempts (~12 hours) → timeout
- On completion: toast notification, invalidate queries, call `onComplete` callback
- On failure: destructive toast, `onError` callback, 5s delayed removal from UI
- Survives page navigation (context-level), deduplicates polling per recording ID
- Calls `updateActivity()` on each poll to prevent session timeout

### Known Pitfalls
- **file_path lifecycle**: Starts as `recordings/temp/...`, updated to `recordings/{id}/...` after upload. If upload fails mid-pipeline, temp path stays → backend signed URL fails → always validate before `startTranscription()`
- **Filename sanitization**: External files may have Cyrillic/spaces/brackets in names. `sanitizeStorageFileName()` replaces non-ASCII with `_`, collapses multiples, falls back to `file-{timestamp}` for fully non-ASCII names. Original name preserved in DB `file_name` field.
- **onerror handler ordering**: In `useAudioRecorder`, `stopResolveRef.current()` must be called BEFORE setting `stopResolvedRef.current = true` — the `safeResolve` wrapper checks `stopResolvedRef` and skips if already true
- **IndexedDB connections**: Each function opens/closes its own `IDBDatabase`. Must close in `finally` block. `getLocalRecording()` closes early before calling `deleteLocalRecording()` (which opens its own)
- **Blob.arrayBuffer()**: Not available in jsdom test environment — polyfill required in tests
- **Session timeout during long recording**: use `startProtectedActivity()` (or existing keep-alive hooks) for any long-running foreground/background process that must not be interrupted by the 15-minute inactivity logout

---

## Backend: Transcription Service

Express.js application on port 3001 with the following routes:

### Routes

| Route | Method | Auth | Rate Limit | Purpose |
|-------|--------|------|------------|---------|
| `/api/transcribe` | POST | JWT | 100/hour | Start AssemblyAI transcription for recording |
| `/api/webhook` | POST | Webhook signature | — | AssemblyAI completion callback |
| `/api/ai/generate` | POST | JWT | 200/hour | Generate clinical note via OpenAI |
| `/api/ai/generate/status/:noteId` | GET | JWT | — | Check generation progress |
| `/api/ai/regenerate-section` | POST | JWT | 200/hour | Regenerate single section |
| `/api/ai/case-summary` | POST | JWT | 200/hour | Generate patient case summary |
| `/api/crypto/encrypt` | POST | JWT | 500/min | Encrypt PHI text |
| `/api/crypto/decrypt` | POST | JWT | 500/min | Decrypt PHI text |
| `/api/crypto/encrypt-batch` | POST | JWT | 500/min | Batch encrypt |
| `/api/crypto/decrypt-batch` | POST | JWT | 500/min | Batch decrypt |
| `/api/research/*` | GET | Research auth | — | Anonymized data export |
| `/api/calendar/:token` | GET | Token-based | — | iCal feed |
| `/health` | GET | None | — | Health check |

### Middleware Stack
1. **Helmet.js** — Security headers
2. **CORS** — Environment-aware origin validation (`CORS_ORIGINS` env var)
3. **express-rate-limit** — User-based rate limiting (different limits per route group)
4. **auth.js** — JWT verification: extracts `userId`, `email`, `clinic_id` from Supabase token
5. **webhook-auth.js** — AssemblyAI webhook signature validation

### Encryption Service (`services/encryption.js`)
- Algorithm: AES-256-GCM
- Key: 32-byte base64 from `ENCRYPTION_KEY` env var
- Random 12-byte IV per encryption
- Output format: `{iv}:{authTag}:{ciphertext}` (all base64)
- Backend-only — encryption key never sent to browser

### OpenAI Service (`services/openai.js`)
- Retry logic: 4 attempts with exponential backoff
- Used for clinical note generation, section regeneration, case summaries

---

## Database Schema (58 migrations)

### Core Tables

**clinics**
- `id`, `name`, `description`, `created_at`, `updated_at`
- Root tenant entity for multi-tenancy isolation

**profiles** (extends auth.users)
- `id` (FK to auth.users), `full_name`, `email`, `role` (admin/doctor/assistant), `clinic_id` (FK to clinics), `specialization`, `onboarding_completed`, `created_at`, `updated_at`
- Auto-created via trigger on user signup

**patients**
- `id`, `clinic_id`, `full_name_encrypted`, `email_encrypted`, `phone_encrypted`, `address_encrypted`, `notes_encrypted`, `date_of_birth`, `gender`, `created_at`, `updated_at`, `deleted_at` (soft delete)
- PII fields encrypted with AES-256-GCM (field-level)
- RLS: clinic-scoped access

**sessions**
- `id`, `clinic_id`, `user_id`, `patient_id` (nullable), `status` (scheduled/in_progress/completed), `session_date`, `duration_minutes`, `summary`, `notes`, `deleted_at`, `appointment_*` fields (timezone, recurring, type)
- Supports both ad-hoc sessions and scheduled appointments
- Soft delete with deleted_at

**recordings**
- `id`, `session_id`, `user_id`, `file_path`, `file_name`, `file_size_bytes`, `duration_seconds`, `mime_type`, `transcription_status` (pending/processing/completed/failed), `transcription_text`, `transcription_encrypted`, `transcript_id` (AssemblyAI), `deleted_at`
- `file_path` lifecycle: `recordings/temp/{ts}-{name}` → `recordings/{id}/{sanitized-name}`
- Supabase Storage bucket: `recordings`

**clinical_notes**
- `id`, `session_id`, `patient_id`, `clinic_id`, `user_id`, `template_id`, `generation_status` (draft/generating/completed/partial_failure/failed), `finalized`, `finalized_at`, `deleted_at`
- AI-generated clinical documentation

**sections**
- `id`, `clinical_note_id`, `block_template_id`, `title`, `content_encrypted`, `ai_content_encrypted`, `manual_content`, `generation_status`, `order_index`, `is_edited`
- Content fields encrypted

**note_block_templates**
- `id`, `name`, `slug`, `category` (subjective/objective/assessment/plan/other), `description`, `system_prompt`, `user_prompt_template`, `is_system`, `clinic_id`, `user_id`
- Pre-defined AI prompt templates for note sections

**clinical_note_templates**
- `id`, `name`, `description`, `block_ids` (UUID[]), `is_default`, `clinic_id`, `user_id`
- Compositions of block templates

### Security & Compliance Tables

| Table | Purpose |
|-------|---------|
| `audit_logs` | All data access logging (HIPAA), action types, PHI field tracking |
| `consent_records` | Patient consent tracking (data_processing, recording, sharing) |
| `break_the_glass_log` | Emergency access logging (life_threatening, court_order, etc.) |
| `ip_blocklist` | IP-based access blocking |
| `failed_login_attempts` | Brute-force detection |
| `backup_codes` | MFA backup code storage |

### Supporting Tables

| Table | Purpose |
|-------|---------|
| `documents` | Patient/session file attachments (lab_result, prescription, referral, consent, other) |
| `patient_assignments` | Doctor-patient assignments (primary, consultant, group_therapist) |
| `session_notes` | Session note text entries |
| `user_invitations` | Clinic user invitation system |
| `complaints` | Telegram bot feedback (bug, feature, complaint, question, other) |
| `calendar_feed_tokens` | iCal subscription authentication |
| `supervisor_conversations` | Supervisor conversation tracking |
| `research_*` | Anonymized research data tables |

### Key RLS Patterns
- All tables use `clinic_id` for tenant isolation
- Reads: `WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())`
- Writes: verify `user_id = auth.uid()` or admin role
- Soft deletes: queries always include `WHERE deleted_at IS NULL`
- Service role (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS for backend operations

### Key Migrations Timeline
| # | Migration | What it does |
|---|-----------|-------------|
| 001 | initial_schema | Core tables: clinics, profiles, patients, sessions, clinical_notes, sections, recordings, documents |
| 002 | row_level_security | RLS policies for multi-tenant clinic isolation |
| 003 | seed_section_templates | Initial clinical note section templates |
| 004 | audit_and_compliance | Audit logging and compliance tables |
| 005 | mfa_and_security | MFA support tables |
| 012 | user_invitations | User invitation system |
| 013 | make_sessions_patient_nullable | Sessions can exist without linked patient |
| 014 | recordings_storage_bucket | Supabase Storage bucket + policies |
| 016-017 | soft_delete_* | Soft delete for recordings and sessions |
| 020 | create_consent_for_patient | Patient consent tracking |
| 021 | soft_delete_patient | Soft delete for patients |
| 022 | session_notes | Session notes table |
| 023-025 | ai_analysis_* | Block/note templates, AI generation tables, seed data |
| 037 | patient_assignments | Doctor-patient assignment management |
| 039-040 | appointment_fields | Appointment timezone, recurring support |
| 049 | supervisor_conversations | Supervisor conversation tracking |
| 052 | rls_performance_optimization | RLS query optimization |
| 056 | calendar_feed_tokens | iCal feed authentication |
| 057 | complaints_table | Telegram complaint storage |

---

## AI Clinical Note Generation

### Flow
1. User selects template (composition of block templates) in `SessionAnalysisPage`
2. Clicks "Generate" → `generateClinicalNote()` → POST `/api/ai/generate`
3. Backend iterates each block template:
   - Builds prompt from `system_prompt` + `user_prompt_template`
   - Injects transcript, session notes, patient context
   - Calls OpenAI (GPT-4) → stores encrypted result
4. Frontend polls `getGenerationStatus()` until all sections complete
5. User can edit sections, reorder (drag-and-drop), regenerate individual sections
6. `finalizeClinicalNote()` marks note as final

### Template System
- **Block templates** (`note_block_templates`): Individual section prompts with category (subjective/objective/assessment/plan/other). System templates are immutable. Clinic and user-level custom templates supported.
- **Note templates** (`clinical_note_templates`): Ordered list of block template UUIDs. Default templates per clinic. User can create custom combinations.
- Categories follow SOAP note structure (Subjective, Objective, Assessment, Plan)

### Case Summary
- `generatePatientCaseSummary()` aggregates all patient sessions/notes
- Generates comprehensive summary via OpenAI
- Stored encrypted, displayed in `CaseSummaryBlock` component

---

## Component Architecture

### Layout
- `MainLayout` → `Header` + `Sidebar` (desktop) / `MobileSidebar` (mobile, Sheet-based)
- `ProtectedRoute` wraps all auth-required routes, checks role + onboarding
- `SessionTimeoutWarning` — global overlay, 2-minute warning before 15-min timeout

### Analysis System (`components/analysis/`)
- `AnalysisLayout` — two-panel resizable layout
- **Source Panel** (left): `TranscriptView`, `NotesView`, `FilesView` — read-only inputs
- **Output Panel** (right): `TemplateSelector` → `GenerateButton` → `ClinicalNotesOutput` → `SectionsList` (draggable via @dnd-kit) → `SectionItem` (editable)
- `TemplatesLibrary` — CRUD for block/note templates
- `GenerationProgress` — real-time progress bar during AI generation

### Patient System (`components/patients/`)
- `PatientForm` — shared create/edit form with Zod validation
- `PatientDetailModal` — quick view modal
- Tabs in `PatientDetailPage`: Info, Activities, Documents, Conversations, Supervisor
- `CaseSummaryBlock` — AI-generated patient case summary
- `ClinicalNoteView` — rendered clinical note with sections

### Session System (`components/sessions/`)
- `CreateSessionDialog` — dialog form with patient linking
- `SessionNotesDialog` — text editor for session notes
- Recording list in `SessionsPage` with playback, "Fix" button for failed transcriptions

### Calendar System (`components/calendar/`)
- `CalendarView` — monthly/weekly calendar display
- `CreateAppointmentDialog` — appointment creation with patient selection
- `TimezoneSelector` — timezone-aware scheduling
- `CalendarFeedDialog` — iCal subscription token management
- Supports recurring appointments (weekly/monthly)

---

## Environment Variables

### Frontend (VITE_*)
| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase API URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `VITE_API_URL` | No | Backend API URL (default: relative `/api`) |
| `VITE_TELEGRAM_SUPPORT_BOT` | No | Telegram support bot username |

### Backend (Transcription Service)
| Variable | Required | Purpose |
|----------|----------|---------|
| `ASSEMBLYAI_API_KEY` | Yes | Audio transcription API key |
| `OPENAI_API_KEY` | Yes | Clinical note generation API key |
| `SUPABASE_URL` | Yes | Supabase API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Yes | Anonymous key |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key (base64, 32 bytes). Generate: `openssl rand -base64 32` |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | development / production |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |

### Telegram Bot
| Variable | Required | Purpose |
|----------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | Yes | Admin group ID for notifications |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Yes | Email notification SMTP |
| `NOTIFY_EMAIL` | Yes | Email for complaint notifications |

---

## Deployment

### Docker
- **Frontend**: Multi-stage build (Node 20 Alpine → Nginx Alpine), port 80
- **Backend**: Node 20 Alpine, port 3001, health check on `/health`
- **Telegram Bot**: Node 20 Alpine
- **Network**: `psipilot-network` (bridge)

### Docker Compose
- `docker-compose.yml` — Development (frontend + backend)
- `docker-compose.prod.yml` — Production (frontend + backend + telegram-bot, restart: unless-stopped)

### Build Optimization (vite.config.ts)
Manual chunk splitting for optimal loading:
- `vendor-pdf` — pdfjs-dist (lazy loaded)
- `vendor-docx` — mammoth
- `vendor-charts` — recharts
- `vendor-dnd` — @dnd-kit
- `vendor-ui-dialogs`, `vendor-ui-menus`, `vendor-ui-forms` — UI components
- `vendor-data` — React Query, Supabase
- `vendor-utils` — Utility libraries
- Chunk size warning limit: 1MB

---

## Testing

### Test Setup
- Config: `vitest.config.ts` — jsdom environment, globals enabled
- Setup file: `src/test/setup.ts` — mocks for matchMedia, ResizeObserver, localStorage, fetch, Supabase client
- 24 test files, ~488 tests total

### Key Test Files
| File | Tests | Coverage |
|------|-------|----------|
| `src/hooks/__tests__/useAudioRecorder.test.ts` | 20 | Lifecycle, errors, timeout, onerror regression, cleanup |
| `src/lib/__tests__/local-recording-storage.test.ts` | 22 | IndexedDB CRUD, TTL, URL leak fix, legacy encrypted format |
| `src/hooks/__tests__/useTranscriptionRecovery.test.ts` | 11 | Polling, adaptive intervals, stuck detection, callbacks |
| `src/lib/__tests__/supabase-recordings.test.ts` | 26 | API calls, validation, filename sanitization (Cyrillic) |
| `src/components/auth/__tests__/ProtectedRoute.test.tsx` | — | Route guard testing |
| `src/components/auth/__tests__/PasswordStrengthIndicator.test.tsx` | — | Password validation |
| `e2e/session-timeout-protected.spec.ts` | 1 smoke | Verifies inactivity timeout is blocked by protected activity and resumes after release |

### Testing Patterns
- **jsdom limitations**: `Blob.arrayBuffer()` not available — polyfill with FileReader in test file
- **MediaRecorder mock**: Custom `MockMediaRecorder` class with state machine, see `useAudioRecorder.test.ts`
- **IndexedDB mock**: In-memory `FakeIndexedDB` implementation with `FakeObjectStore`, `FakeTransaction`, `FakeDB` classes
- **Supabase mock**: `vi.mock('../supabase')` with chainable mock objects (`.from().select().eq().single()`)
- **Fake timers**: `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` for polling and timeout tests
- **MediaStream mock**: `createMockStream()` with audio tracks and `stop` spy

---

## Code Conventions

- **Language**: UI text in Russian, code/comments mixed Russian/English
- **State management**: Single `status` enum (discriminated union) instead of boolean flags
- **Error handling**: Always save partial recording data on errors (never lose user's audio)
- **DB connections**: Each IndexedDB operation opens/closes its own connection (try/finally)
- **Supabase auth**: Always use `auth.uid()` from session, never trust passed `userId` (RLS compatibility)
- **File paths**: Always sanitize with `sanitizeStorageFileName()` before Supabase Storage
- **Soft delete**: Recordings, sessions, patients, clinical notes all use `deleted_at` field
- **Encryption**: PHI encrypted server-side only. Local storage is trusted (device-level security)
- **Imports**: Use `@/` path alias for all src imports
- **Components**: shadcn/ui patterns with Radix primitives, Tailwind for styling
- **Forms**: React Hook Form + Zod schemas for validation
- **Data fetching**: React Query with `staleTime: Infinity` (manual refresh via `invalidateQueries`)
- **Toast notifications**: Russian text, `variant: 'destructive'` for errors

## Security Notes

- HIPAA / GDPR / 152-ФЗ compliance required
- PHI fields encrypted with AES-256-GCM (field-level, backend-side)
- RLS policies on all tables — always use auth UID, never trust client
- Encryption key in `ENCRYPTION_KEY` env var — never in browser code
- Service role key only on backend — never expose to frontend
- Never commit `.env` files or credentials
- Local recordings: unencrypted (trusted device), server: encrypted
- Session timeout: 15 minutes of inactivity (except active protected background tasks such as recording/capture/upload finalization)
- MFA support (TOTP) for additional security
- Audit logs track all PHI access
- Break-the-glass emergency access with full logging
- Rate limiting on all API endpoints
- IP blocklist for brute-force protection
