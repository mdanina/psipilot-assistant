-- Migration: Add soft delete support to clinical_notes table
-- Clinical notes will be marked as deleted instead of being physically removed
-- This preserves data for audit/legal purposes while hiding from UI
-- ============================================

ALTER TABLE clinical_notes
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clinical_notes_deleted_at ON clinical_notes(deleted_at);

COMMENT ON COLUMN clinical_notes.deleted_at IS 'Timestamp when clinical note was soft deleted (NULL = not deleted)';
