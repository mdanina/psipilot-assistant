-- Migration: Add transcript_id to recordings table
-- This field stores the AssemblyAI transcript ID for webhook processing
-- ============================================

ALTER TABLE recordings 
ADD COLUMN transcript_id VARCHAR(255);

CREATE INDEX idx_recordings_transcript_id ON recordings(transcript_id);

COMMENT ON COLUMN recordings.transcript_id IS 'AssemblyAI transcript ID for webhook processing';

