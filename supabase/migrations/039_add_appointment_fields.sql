-- PsiPilot Assistant - Add Appointment Fields for Calendar
-- Migration: 039_add_appointment_fields
-- Description: Add fields to sessions table for calendar functionality: meeting format, duration, recurring appointments

-- ============================================
-- ADD NEW COLUMNS TO SESSIONS TABLE
-- ============================================

-- Meeting format: online or in-person
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS meeting_format VARCHAR(20) CHECK (meeting_format IN ('online', 'in_person'));

-- Duration in minutes (separate from duration_seconds for easier calendar management)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Recurring appointment pattern
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS recurring_pattern VARCHAR(50) CHECK (recurring_pattern IN ('weekly', 'monthly'));

-- End date for recurring appointments
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS recurring_end_date TIMESTAMPTZ;

-- Parent appointment ID for recurring series
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS parent_appointment_id UUID REFERENCES sessions(id) ON DELETE CASCADE;

-- ============================================
-- ADD INDEXES FOR PERFORMANCE
-- ============================================

-- Index for filtering by scheduled date and format
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_at_format 
ON sessions(scheduled_at, meeting_format) 
WHERE scheduled_at IS NOT NULL;

-- Index for recurring appointments
CREATE INDEX IF NOT EXISTS idx_sessions_recurring 
ON sessions(parent_appointment_id, recurring_pattern) 
WHERE parent_appointment_id IS NOT NULL;

-- Index for finding all appointments in a recurring series
CREATE INDEX IF NOT EXISTS idx_sessions_parent_appointment 
ON sessions(parent_appointment_id) 
WHERE parent_appointment_id IS NOT NULL;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN sessions.meeting_format IS 'Format of the meeting: online or in_person';
COMMENT ON COLUMN sessions.duration_minutes IS 'Duration of the appointment in minutes';
COMMENT ON COLUMN sessions.recurring_pattern IS 'Pattern for recurring appointments: weekly or monthly';
COMMENT ON COLUMN sessions.recurring_end_date IS 'End date for recurring appointment series';
COMMENT ON COLUMN sessions.parent_appointment_id IS 'Reference to parent appointment for recurring series';

