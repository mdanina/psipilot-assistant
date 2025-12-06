-- Migration: Add soft delete support to sessions table
-- Sessions will be marked as deleted instead of being physically removed
-- ============================================

ALTER TABLE sessions 
ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_sessions_deleted_at ON sessions(deleted_at);

COMMENT ON COLUMN sessions.deleted_at IS 'Timestamp when session was soft deleted (NULL = not deleted)';

