-- Migration: Add summary field to sessions table
-- This field stores AI-generated summary of the session content

-- Add summary column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add comment for documentation
COMMENT ON COLUMN sessions.summary IS 'AI-generated summary of the session content, created when clinical note is finalized';

-- Create index for full-text search on summary
CREATE INDEX IF NOT EXISTS idx_sessions_summary_search
ON sessions USING GIN (to_tsvector('russian', COALESCE(summary, '')));

-- Create index for full-text search on transcript (if not exists)
CREATE INDEX IF NOT EXISTS idx_sessions_transcript_search
ON sessions USING GIN (to_tsvector('russian', COALESCE(transcript, '')));
