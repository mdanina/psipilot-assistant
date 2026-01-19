-- PsiPilot Assistant Database Migration
-- Migration: 055_increase_recordings_file_size_limit
-- Description: Increase storage bucket file size limit from 50MB to 500MB

-- ============================================
-- UPDATE STORAGE BUCKET FILE SIZE LIMIT
-- ============================================

-- Update the recordings bucket to allow files up to 500MB
-- 500 MB = 500 * 1024 * 1024 = 524288000 bytes
UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'recordings';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    current_limit BIGINT;
BEGIN
    SELECT file_size_limit INTO current_limit
    FROM storage.buckets
    WHERE id = 'recordings';

    IF current_limit = 524288000 THEN
        RAISE NOTICE 'Recordings bucket file size limit successfully updated to 500MB';
    ELSE
        RAISE WARNING 'Recordings bucket file size limit is %, expected 524288000', current_limit;
    END IF;
END $$;
