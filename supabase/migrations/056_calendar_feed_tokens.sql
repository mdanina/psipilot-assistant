-- Calendar Feed Tokens
-- Migration: 056_calendar_feed_tokens
-- Description: Add support for calendar feed subscriptions (iCal/ICS)

-- ============================================
-- CALENDAR FEED TOKENS TABLE
-- ============================================
CREATE TABLE calendar_feed_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,

    -- Ensure one token per user
    CONSTRAINT unique_user_token UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_calendar_feed_tokens_user_id ON calendar_feed_tokens(user_id);
CREATE INDEX idx_calendar_feed_tokens_token ON calendar_feed_tokens(token);

-- ============================================
-- TOKEN GENERATION FUNCTION
-- ============================================
-- Generate secure token using gen_random_uuid() (available in PostgreSQL 13+)
CREATE OR REPLACE FUNCTION generate_calendar_token()
RETURNS TEXT AS $$
DECLARE
    new_token TEXT;
BEGIN
    -- Combine two UUIDs and remove dashes for a 64-char hex string, then take first 32
    new_token := replace(replace(
        gen_random_uuid()::text || gen_random_uuid()::text,
        '-', ''
    ), '-', '');
    new_token := substring(new_token from 1 for 32);
    RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GET OR CREATE TOKEN FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_calendar_token(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    existing_token TEXT;
    new_token TEXT;
BEGIN
    -- Check for existing token
    SELECT token INTO existing_token
    FROM public.calendar_feed_tokens
    WHERE user_id = p_user_id;

    IF existing_token IS NOT NULL THEN
        RETURN existing_token;
    END IF;

    -- Generate new token
    new_token := generate_calendar_token();

    -- Insert new token
    INSERT INTO public.calendar_feed_tokens (user_id, token)
    VALUES (p_user_id, new_token);

    RETURN new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE LAST ACCESSED FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_calendar_token_accessed(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    UPDATE public.calendar_feed_tokens
    SET last_accessed_at = NOW()
    WHERE token = p_token
    RETURNING user_id INTO v_user_id;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own tokens
CREATE POLICY "Users can read own calendar tokens" ON calendar_feed_tokens
    FOR SELECT USING (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own calendar tokens" ON calendar_feed_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- Insert is handled by SECURITY DEFINER function, no direct insert policy needed
