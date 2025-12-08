-- PsiPilot Assistant - Add is_encrypted column to recordings
-- Migration: 027_add_recordings_is_encrypted
-- Description: Add explicit is_encrypted flag to recordings table for reliable encryption detection

-- ============================================
-- ALTER TABLE: RECORDINGS
-- ============================================
-- Add is_encrypted column to explicitly track encryption status
-- This replaces unreliable heuristic-based detection

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS transcription_encrypted BOOLEAN DEFAULT false;

-- Update existing records: assume transcripts with certain patterns are encrypted
-- This is a one-time migration to set the flag for existing data
-- New records will have this flag set explicitly by the application

-- Comment explaining the column
COMMENT ON COLUMN recordings.transcription_encrypted IS 'Whether transcription_text is encrypted. Set by application when saving encrypted content.';

-- Index for quick filtering if needed
CREATE INDEX IF NOT EXISTS idx_recordings_transcription_encrypted ON recordings(transcription_encrypted);
