-- PsiPilot Assistant - Add Timezone Support
-- Migration: 040_add_timezone_support
-- Description: Add timezone field to sessions table for calendar synchronization

-- ============================================
-- ADD TIMEZONE COLUMN TO SESSIONS TABLE
-- ============================================

-- Add timezone field to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';

-- Add index for timezone queries (useful for filtering by timezone)
CREATE INDEX IF NOT EXISTS idx_sessions_timezone 
ON sessions(timezone) 
WHERE timezone IS NOT NULL;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN sessions.timezone IS 'IANA timezone identifier (e.g., Europe/Moscow, America/New_York). Used for calendar synchronization and proper time display.';

