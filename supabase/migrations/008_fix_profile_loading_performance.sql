-- PsiPilot Assistant - Fix Profile Loading Performance
-- Migration: 008_fix_profile_loading_performance
-- Description: Adds missing indexes and optimizes RLS policies for profile fetching

-- ============================================
-- 1. ADD MISSING INDEX ON profiles.clinic_id
-- ============================================

-- This index is critical for RLS policy performance
-- Without it, get_user_clinic_id() comparisons do full table scans
CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON profiles(clinic_id);

-- Index for faster profile lookups by email (used in handle_new_user)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

COMMENT ON INDEX idx_profiles_clinic_id IS 'Critical for RLS performance - used by get_user_clinic_id() comparisons';
COMMENT ON INDEX idx_profiles_email IS 'Used for profile lookups by email';

-- ============================================
-- 2. OPTIMIZE get_user_clinic_id() FUNCTION
-- ============================================

-- Make the function more efficient with a direct auth.uid() lookup
-- The STABLE marker tells PostgreSQL it can cache the result within a statement
CREATE OR REPLACE FUNCTION get_user_clinic_id()
RETURNS UUID AS $$
DECLARE
    v_clinic_id UUID;
BEGIN
    -- Direct lookup by primary key (fastest possible)
    SELECT clinic_id INTO v_clinic_id
    FROM profiles
    WHERE id = auth.uid();

    RETURN v_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_clinic_id() IS
'Returns the clinic_id for the current authenticated user.
SECURITY DEFINER bypasses RLS for internal lookups.
STABLE allows PostgreSQL to cache results within a statement.';

-- ============================================
-- 3. ADD POLICY FOR PROFILES WITHOUT CLINIC
-- ============================================

-- Users without a clinic should still be able to see their own profile
-- This prevents the JOIN from hanging when clinic_id is NULL
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- Ensure policy for viewing clinic profiles still works but with better performance
DROP POLICY IF EXISTS "Users can view clinic profiles" ON profiles;

CREATE POLICY "Users can view clinic profiles"
    ON profiles FOR SELECT
    USING (
        clinic_id IS NOT NULL
        AND clinic_id = get_user_clinic_id()
    );

-- ============================================
-- 4. FIX CLINICS RLS FOR NULL clinic_id CASE
-- ============================================

-- Current policy blocks users without clinic_id from querying clinics
-- This causes the JOIN to hang. Add a safe fallback.
DROP POLICY IF EXISTS "Users can view their clinic" ON clinics;

CREATE POLICY "Users can view their clinic"
    ON clinics FOR SELECT
    USING (
        -- Only allow if user has a clinic_id AND it matches
        get_user_clinic_id() IS NOT NULL
        AND id = get_user_clinic_id()
    );

COMMENT ON POLICY "Users can view their clinic" ON clinics IS
'Allows users to view only their own clinic.
NULL clinic_id means no clinics are visible (prevents hang).';

-- ============================================
-- 5. ADD STATISTICS TARGETS FOR OPTIMIZER
-- ============================================

-- Increase statistics sampling for better query planning
ALTER TABLE profiles ALTER COLUMN clinic_id SET STATISTICS 1000;
ALTER TABLE clinics ALTER COLUMN id SET STATISTICS 1000;

-- Analyze tables to update statistics
ANALYZE profiles;
ANALYZE clinics;

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION get_user_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_clinic_id() TO anon;

-- ============================================
-- SUMMARY
-- ============================================

COMMENT ON SCHEMA public IS
'Migration 008: Fixed profile loading performance issues.
Changes:
1. Added idx_profiles_clinic_id index
2. Added idx_profiles_email index
3. Optimized get_user_clinic_id() function
4. Fixed RLS policies for users without clinic_id
5. Updated table statistics for query optimizer';
