-- Migration: Add soft delete support to recordings table
-- Records will be marked as deleted instead of being physically removed
-- ============================================

ALTER TABLE recordings 
ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_recordings_deleted_at ON recordings(deleted_at);

COMMENT ON COLUMN recordings.deleted_at IS 'Timestamp when recording was soft deleted (NULL = not deleted)';


