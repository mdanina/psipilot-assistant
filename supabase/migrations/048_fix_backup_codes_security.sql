-- PsiPilot Assistant - Secure Backup Codes
-- Migration: 048_fix_backup_codes_security
-- Description: Replaces hardcoded salt with per-user unique salt for backup codes
--              Fixes CRITICAL security vulnerability in backup code hashing

-- ============================================
-- 1. ADD UNIQUE SALT COLUMN FOR EACH USER
-- ============================================

-- Add column for per-user salt (32 bytes = 256 bits of entropy)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'backup_codes_salt'
    ) THEN
        ALTER TABLE profiles ADD COLUMN backup_codes_salt BYTEA;
    END IF;
END $$;

COMMENT ON COLUMN profiles.backup_codes_salt IS
'Unique per-user salt for backup code hashing (32 bytes).
Generated when backup codes are created. Required for HIPAA compliance.';

-- ============================================
-- 2. SECURE HASH FUNCTION WITH PER-USER SALT
-- ============================================

-- Drop old insecure function
DROP FUNCTION IF EXISTS hash_backup_code(TEXT);

-- New secure function that requires user's salt
CREATE OR REPLACE FUNCTION hash_backup_code_secure(code TEXT, user_salt BYTEA)
RETURNS TEXT AS $$
BEGIN
    IF user_salt IS NULL OR length(user_salt) < 16 THEN
        RAISE EXCEPTION 'Invalid salt: must be at least 16 bytes';
    END IF;

    -- Use SHA-256 with user-specific salt
    -- Salt is prepended to prevent length extension attacks
    RETURN encode(
        digest(user_salt || code::bytea, 'sha256'),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION hash_backup_code_secure IS
'Securely hashes a backup code using per-user salt (SHA-256).
The salt must be unique per user and stored in profiles.backup_codes_salt';

-- ============================================
-- 3. SECURE VERIFY FUNCTION
-- ============================================

-- Drop old insecure function
DROP FUNCTION IF EXISTS verify_backup_code(UUID, TEXT);

-- Legacy hash function for backward compatibility (TEMPORARY - will be removed)
-- This allows existing users to still use their old codes until they regenerate
CREATE OR REPLACE FUNCTION hash_backup_code_legacy(code TEXT)
RETURNS TEXT AS $$
BEGIN
    -- OLD INSECURE METHOD - only for backward compatibility
    -- Will be removed after migration period
    RETURN encode(digest(code || 'psipilot_backup_salt_v1', 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- New secure verification function with backward compatibility
CREATE OR REPLACE FUNCTION verify_backup_code(user_uuid UUID, code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_salt BYTEA;
    v_hashed_code TEXT;
    v_legacy_hashed_code TEXT;
    v_codes TEXT[];
    v_code TEXT;
    v_index INTEGER := 0;
    v_found BOOLEAN := false;
    v_is_legacy BOOLEAN := false;
BEGIN
    -- Get user's salt and hashed codes
    SELECT backup_codes_salt, backup_codes_hashed
    INTO v_user_salt, v_codes
    FROM profiles
    WHERE id = user_uuid;

    IF v_codes IS NULL OR array_length(v_codes, 1) IS NULL THEN
        RETURN false;
    END IF;

    -- Normalize input code
    code := upper(trim(code));

    -- Determine if this is legacy (no salt) or new secure format
    IF v_user_salt IS NULL THEN
        -- LEGACY MODE: use old insecure hashing (temporary backward compatibility)
        v_is_legacy := true;
        v_hashed_code := hash_backup_code_legacy(code);

        RAISE WARNING '[SECURITY] User % is using legacy backup codes without per-user salt. Please regenerate codes.', user_uuid;
    ELSE
        -- SECURE MODE: use per-user salt
        v_is_legacy := false;
        v_hashed_code := hash_backup_code_secure(code, v_user_salt);
    END IF;

    -- Check each stored hash
    FOREACH v_code IN ARRAY v_codes LOOP
        v_index := v_index + 1;
        IF v_code = v_hashed_code THEN
            v_found := true;

            -- Remove used code (one-time use)
            UPDATE profiles
            SET backup_codes_hashed = array_remove(backup_codes_hashed, v_code),
                updated_at = NOW()
            WHERE id = user_uuid;

            -- Log the backup code usage (security audit)
            PERFORM log_audit_event(
                'backup_code_used',
                'authentication',
                'profile',
                user_uuid,
                NULL,
                NULL,
                jsonb_build_object(
                    'code_index', v_index,
                    'codes_remaining', array_length(v_codes, 1) - 1,
                    'legacy_mode', v_is_legacy,
                    'security_warning', CASE WHEN v_is_legacy THEN 'User should regenerate backup codes' ELSE NULL END
                ),
                true,  -- Sensitive operation
                ARRAY['authentication']
            );

            RETURN true;
        END IF;
    END LOOP;

    -- Log failed attempt (security monitoring)
    PERFORM log_audit_event(
        'backup_code_failed',
        'authentication',
        'profile',
        user_uuid,
        NULL,
        NULL,
        jsonb_build_object('attempted', true),
        true,
        NULL
    );

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION verify_backup_code IS
'Verifies and consumes a backup code (one-time use).
Uses per-user salt for secure verification. Logs all attempts for security audit.';

-- ============================================
-- 4. SECURE GENERATE FUNCTION
-- ============================================

-- Drop old insecure function
DROP FUNCTION IF EXISTS generate_backup_codes(UUID, INTEGER);

-- New secure generation function
CREATE OR REPLACE FUNCTION generate_backup_codes(user_uuid UUID, code_count INTEGER DEFAULT 10)
RETURNS TEXT[] AS $$
DECLARE
    v_codes TEXT[] := ARRAY[]::TEXT[];
    v_hashed_codes TEXT[] := ARRAY[]::TEXT[];
    v_code TEXT;
    v_salt BYTEA;
    i INTEGER;
BEGIN
    -- Security check: only allow user to generate their own codes
    IF user_uuid != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: can only generate codes for own account';
    END IF;

    -- Validate code count (prevent abuse)
    IF code_count < 1 OR code_count > 20 THEN
        RAISE EXCEPTION 'Code count must be between 1 and 20';
    END IF;

    -- Generate new unique salt for this user (32 bytes = 256 bits)
    v_salt := gen_random_bytes(32);

    -- Generate codes
    FOR i IN 1..code_count LOOP
        -- Generate random 8-character uppercase hex code
        -- 4 bytes = 32 bits of entropy per code
        v_code := upper(encode(gen_random_bytes(4), 'hex'));
        v_codes := array_append(v_codes, v_code);
        v_hashed_codes := array_append(v_hashed_codes, hash_backup_code_secure(v_code, v_salt));
    END LOOP;

    -- Store NEW salt and hashed codes
    -- Clear old plaintext codes if they exist (legacy cleanup)
    UPDATE profiles
    SET backup_codes_salt = v_salt,
        backup_codes_hashed = v_hashed_codes,
        backup_codes = NULL,  -- Clear legacy plaintext codes
        updated_at = NOW()
    WHERE id = user_uuid;

    -- Log the generation (security audit)
    PERFORM log_audit_event(
        'backup_codes_generated',
        'authentication',
        'profile',
        user_uuid,
        NULL,
        NULL,
        jsonb_build_object(
            'count', code_count,
            'salt_rotated', true
        ),
        true,  -- Sensitive operation
        ARRAY['authentication']
    );

    -- Return plaintext codes (ONLY time they're visible to user!)
    -- User MUST save these securely - they cannot be recovered
    RETURN v_codes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_backup_codes IS
'Generates new backup codes with unique per-user salt.
Returns plaintext codes ONCE - they cannot be recovered after this.
Old codes are invalidated when new ones are generated.';

-- ============================================
-- 5. HELPER FUNCTION TO CHECK IF USER NEEDS NEW CODES
-- ============================================

CREATE OR REPLACE FUNCTION needs_backup_code_migration(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_uuid
        AND (
            -- Has old hashed codes but no salt (vulnerable)
            (backup_codes_hashed IS NOT NULL AND backup_codes_salt IS NULL)
            OR
            -- Has legacy plaintext codes (very vulnerable!)
            (backup_codes IS NOT NULL AND backup_codes != '{}')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION needs_backup_code_migration IS
'Checks if a user needs to regenerate their backup codes for security.
Returns true if user has codes with old (insecure) hashing method.';

-- ============================================
-- 6. ADMIN FUNCTION TO IDENTIFY VULNERABLE USERS
-- ============================================

CREATE OR REPLACE FUNCTION get_users_needing_backup_code_update()
RETURNS TABLE (
    user_id UUID,
    email VARCHAR,
    has_legacy_codes BOOLEAN,
    has_hashed_without_salt BOOLEAN,
    last_login TIMESTAMPTZ
) AS $$
BEGIN
    -- Only admins can run this
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can view vulnerable users list';
    END IF;

    RETURN QUERY
    SELECT
        p.id as user_id,
        p.email,
        (p.backup_codes IS NOT NULL AND p.backup_codes != '{}') as has_legacy_codes,
        (p.backup_codes_hashed IS NOT NULL AND p.backup_codes_salt IS NULL) as has_hashed_without_salt,
        p.last_sign_in_at as last_login
    FROM profiles p
    WHERE
        (p.backup_codes IS NOT NULL AND p.backup_codes != '{}')
        OR (p.backup_codes_hashed IS NOT NULL AND p.backup_codes_salt IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_users_needing_backup_code_update IS
'Admin function to identify users who need to regenerate their backup codes.
These users have codes stored with the old insecure hashing method.';

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION hash_backup_code_secure TO authenticated;
GRANT EXECUTE ON FUNCTION hash_backup_code_legacy TO authenticated;
GRANT EXECUTE ON FUNCTION verify_backup_code TO authenticated;
GRANT EXECUTE ON FUNCTION generate_backup_codes TO authenticated;
GRANT EXECUTE ON FUNCTION needs_backup_code_migration TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_needing_backup_code_update TO authenticated;

-- ============================================
-- 8. ADD INDEX FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_backup_codes_salt
ON profiles(id)
WHERE backup_codes_salt IS NOT NULL;

-- ============================================
-- MIGRATION NOTES
-- ============================================

/*
SECURITY IMPROVEMENT SUMMARY:
=============================

BEFORE (VULNERABLE):
- Single hardcoded salt: 'psipilot_backup_salt_v1'
- Visible in source code (Git)
- If DB leaked, attacker can brute-force ALL users' codes with one rainbow table
- 4 billion combinations (16^8) ≈ minutes on modern GPU

AFTER (SECURE):
- Unique 32-byte (256-bit) salt per user
- Salt stored in profiles.backup_codes_salt
- Even if DB leaked, attacker must brute-force EACH user separately
- Salt rotation on code regeneration

MIGRATION PATH FOR EXISTING USERS:
==================================
1. Users with legacy codes will be prompted to regenerate
2. needs_backup_code_migration(user_id) returns true for vulnerable users
3. Admin can identify all vulnerable users with get_users_needing_backup_code_update()
4. Old verification falls back gracefully but logs warning

RECOMMENDED ACTIONS:
===================
1. Deploy this migration
2. Send notification to users with legacy codes to regenerate
3. Add UI warning when needs_backup_code_migration() returns true
4. Set deadline for mandatory regeneration (e.g., 30 days)
5. After deadline, disable legacy codes completely
*/
