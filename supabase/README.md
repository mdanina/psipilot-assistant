# PsiPilot Assistant - Supabase Database Setup

This directory contains SQL migrations for setting up the PsiPilot Assistant database on a self-hosted Supabase instance.

## Database Schema

The database includes the following tables:

| Table | Description |
|-------|-------------|
| `clinics` | Medical clinics/practices |
| `profiles` | User profiles (extends Supabase auth.users) |
| `patients` | Patient records |
| `sessions` | Therapy/consultation sessions |
| `clinical_notes` | Clinical documentation |
| `sections` | Sections within clinical notes |
| `section_templates` | Predefined templates for note sections |
| `recordings` | Audio recordings from sessions |
| `documents` | Attached files and documents |

## Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Core tables, indexes, and triggers |
| `002_row_level_security.sql` | RLS policies for multi-tenant security |
| `003_seed_section_templates.sql` | Default section templates for clinical notes |

## Setup Instructions

### Option 1: Using Supabase Dashboard

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Run migrations in order:
   - First: `001_initial_schema.sql`
   - Second: `002_row_level_security.sql`
   - Third: `003_seed_section_templates.sql`

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Option 3: Using psql directly

```bash
# Connect to your Supabase PostgreSQL
psql "postgresql://postgres:your-password@your-host:5432/postgres"

# Run migrations
\i supabase/migrations/001_initial_schema.sql
\i supabase/migrations/002_row_level_security.sql
\i supabase/migrations/003_seed_section_templates.sql
```

## Storage Buckets

After running migrations, create storage buckets for file uploads:

```sql
-- In Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
```

## Row Level Security (RLS)

The database uses RLS to ensure:
- Users can only access data from their own clinic
- Patients are isolated by clinic
- Sessions and notes are protected by ownership
- Soft-deleted patients are hidden from normal queries

## Key Features

- **Multi-tenant**: Clinic-based data isolation
- **Soft delete**: Patients can be archived without permanent deletion
- **Audit trail**: `created_at` and `updated_at` timestamps on all tables
- **Auto-profile creation**: New auth users automatically get a profile
- **AI-ready**: Fields for AI-generated content in notes and sections

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Regenerating Types

To regenerate TypeScript types from the database:

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```
