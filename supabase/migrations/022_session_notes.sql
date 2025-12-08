-- PsiPilot Assistant - Session Notes Table
-- Migration: 022_session_notes
-- Description: Create table for specialist notes attached to sessions

-- ============================================
-- TABLE: SESSION_NOTES
-- ============================================
-- Stores specialist notes that can be added to sessions
-- Notes can be entered manually or extracted from uploaded files
-- They are appended to the combined transcript with "Комментарии специалиста" prefix

CREATE TABLE IF NOT EXISTS session_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'file')),
    original_filename TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_user_id ON session_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_created_at ON session_notes(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view notes for sessions in their clinic
CREATE POLICY "Users can view session notes in their clinic"
ON session_notes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM sessions s
        JOIN profiles p ON p.clinic_id = s.clinic_id
        WHERE s.id = session_notes.session_id
        AND p.id = auth.uid()
    )
);

-- Policy: Users can create notes for sessions in their clinic
CREATE POLICY "Users can create session notes in their clinic"
ON session_notes
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM sessions s
        JOIN profiles p ON p.clinic_id = s.clinic_id
        WHERE s.id = session_notes.session_id
        AND p.id = auth.uid()
    )
);

-- Policy: Users can update their own notes
CREATE POLICY "Users can update their own session notes"
ON session_notes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own notes
CREATE POLICY "Users can delete their own session notes"
ON session_notes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- TRIGGER: UPDATE TIMESTAMP
-- ============================================

CREATE OR REPLACE FUNCTION update_session_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_session_notes_updated_at ON session_notes;

CREATE TRIGGER trigger_session_notes_updated_at
    BEFORE UPDATE ON session_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_session_notes_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE session_notes IS 'Specialist notes attached to therapy sessions';
COMMENT ON COLUMN session_notes.id IS 'Unique identifier for the note';
COMMENT ON COLUMN session_notes.session_id IS 'Reference to the parent session';
COMMENT ON COLUMN session_notes.user_id IS 'User who created the note';
COMMENT ON COLUMN session_notes.content IS 'Text content of the note';
COMMENT ON COLUMN session_notes.source IS 'How the note was created: manual (typed) or file (extracted from uploaded file)';
COMMENT ON COLUMN session_notes.original_filename IS 'Original filename if note was extracted from a file';
COMMENT ON COLUMN session_notes.created_at IS 'When the note was created';
COMMENT ON COLUMN session_notes.updated_at IS 'When the note was last updated';
