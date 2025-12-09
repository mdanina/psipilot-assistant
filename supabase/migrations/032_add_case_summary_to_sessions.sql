-- PsiPilot Assistant - Add case summary fields to sessions table
-- Migration: 032_add_case_summary_to_sessions
-- Description: Add case_summary_encrypted and case_summary_generated_at to sessions table
--               to support session-level case summaries instead of patient-level

-- ============================================
-- ADD CASE SUMMARY FIELDS TO SESSIONS
-- ============================================

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS case_summary_encrypted TEXT,
ADD COLUMN IF NOT EXISTS case_summary_generated_at TIMESTAMPTZ;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN sessions.case_summary_encrypted IS 'Encrypted AI-generated case summary for this specific session. Replaces patient-level summaries.';
COMMENT ON COLUMN sessions.case_summary_generated_at IS 'Timestamp when the case summary was generated for this session.';

