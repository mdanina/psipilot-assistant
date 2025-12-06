-- PsiPilot Assistant Database Migration
-- Migration: 014_recordings_storage_bucket
-- Description: Create storage bucket for audio recordings and set up access policies

-- ============================================
-- CREATE STORAGE BUCKET
-- ============================================

-- Create the recordings bucket (private by default)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'recordings',
    'recordings',
    false,
    52428800, -- 50MB max file size
    ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own clinic recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access to recordings" ON storage.objects;

-- Policy: Authenticated users can upload recordings to the bucket
CREATE POLICY "Users can upload recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'recordings'
    AND auth.uid() IS NOT NULL
);

-- Policy: Users can read recordings from their clinic
-- This joins through recordings -> sessions -> clinic to verify access
CREATE POLICY "Users can read own clinic recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'recordings'
    AND (
        -- User uploaded this file (path contains their recording ID)
        EXISTS (
            SELECT 1 FROM public.recordings r
            JOIN public.sessions s ON r.session_id = s.id
            JOIN public.profiles p ON p.id = auth.uid()
            WHERE r.file_path = storage.objects.name
            AND s.clinic_id = p.clinic_id
        )
        OR
        -- Service role can access all
        auth.jwt()->>'role' = 'service_role'
    )
);

-- Policy: Users can update their own recordings
CREATE POLICY "Users can update own recordings"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'recordings'
    AND EXISTS (
        SELECT 1 FROM public.recordings r
        WHERE r.file_path = storage.objects.name
        AND r.user_id = auth.uid()
    )
);

-- Policy: Users can delete their own recordings
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'recordings'
    AND EXISTS (
        SELECT 1 FROM public.recordings r
        WHERE r.file_path = storage.objects.name
        AND r.user_id = auth.uid()
    )
);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant usage on storage schema to authenticated users
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify bucket was created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'recordings') THEN
        RAISE EXCEPTION 'Failed to create recordings bucket';
    END IF;
    RAISE NOTICE 'Recordings storage bucket created successfully';
END $$;
