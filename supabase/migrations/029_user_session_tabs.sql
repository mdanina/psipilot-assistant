-- Migration: 029_user_session_tabs
-- Description: Store user's open session tabs in database for persistence across page refreshes

-- Table to track which session tabs are open for each user
CREATE TABLE IF NOT EXISTS user_session_tabs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one user can only have one record per session
    UNIQUE(user_id, session_id)
);

-- Indexes for fast lookups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_user_session_tabs_user_id'
    ) THEN
        CREATE INDEX idx_user_session_tabs_user_id ON user_session_tabs(user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_user_session_tabs_session_id'
    ) THEN
        CREATE INDEX idx_user_session_tabs_session_id ON user_session_tabs(session_id);
    END IF;
END $$;

-- ============================================
-- DATA MIGRATION: Initialize open tabs for existing users
-- ============================================
-- For each user, add all their existing (non-deleted) sessions to user_session_tabs
-- This ensures existing users see their sessions after the migration
-- IMPORTANT: This must run BEFORE RLS is enabled to avoid permission issues
INSERT INTO user_session_tabs (user_id, session_id, opened_at, created_at)
SELECT DISTINCT
    s.user_id,
    s.id,
    s.created_at, -- Use session creation time as opened_at
    NOW()
FROM sessions s
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (
    -- Avoid duplicates
    SELECT 1 FROM user_session_tabs ust
    WHERE ust.user_id = s.user_id
      AND ust.session_id = s.id
  )
ON CONFLICT (user_id, session_id) DO NOTHING;

-- RLS policies
-- Enable RLS (safe to run multiple times - no error if already enabled)
ALTER TABLE user_session_tabs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own open tabs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_session_tabs' 
        AND policyname = 'Users can view their own session tabs'
    ) THEN
        CREATE POLICY "Users can view their own session tabs"
            ON user_session_tabs
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Users can insert their own session tabs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_session_tabs' 
        AND policyname = 'Users can insert their own session tabs'
    ) THEN
        CREATE POLICY "Users can insert their own session tabs"
            ON user_session_tabs
            FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Users can delete their own session tabs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_session_tabs' 
        AND policyname = 'Users can delete their own session tabs'
    ) THEN
        CREATE POLICY "Users can delete their own session tabs"
            ON user_session_tabs
            FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

