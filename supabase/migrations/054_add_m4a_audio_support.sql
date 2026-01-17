-- PsiPilot Assistant Database Migration
-- Migration: 054_add_m4a_audio_support
-- Description: Add support for m4a audio format (Windows Voice Recorder)

-- ============================================
-- UPDATE RECORDINGS BUCKET MIME TYPES
-- ============================================

-- Add m4a/aac MIME types to recordings bucket
-- Windows Voice Recorder creates .m4a files which may report as:
-- - audio/x-m4a
-- - audio/mp4
-- - audio/aac
-- - audio/m4a
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/wav',
    'audio/mp3',
    'audio/x-m4a',
    'audio/aac',
    'audio/m4a'
]
WHERE id = 'recordings';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    mime_types text[];
BEGIN
    SELECT allowed_mime_types INTO mime_types
    FROM storage.buckets
    WHERE id = 'recordings';

    IF 'audio/x-m4a' = ANY(mime_types) THEN
        RAISE NOTICE 'M4A audio format support added successfully';
    ELSE
        RAISE WARNING 'Failed to add m4a support to recordings bucket';
    END IF;
END $$;
