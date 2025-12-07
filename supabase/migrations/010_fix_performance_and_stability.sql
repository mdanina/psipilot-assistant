-- PsiPilot Assistant - Fix Performance and Stability Issues
-- Migration: 010_fix_performance_and_stability
-- Description: Fixes race conditions, optimizes RLS policies, adds missing indexes

-- ============================================
-- 1. FIX RACE CONDITION IN create_clinic_for_onboarding
-- ============================================

-- Replace the function with a version that uses FOR UPDATE to prevent race conditions
CREATE OR REPLACE FUNCTION create_clinic_for_onboarding(
    clinic_name VARCHAR(255),
    clinic_address TEXT DEFAULT NULL,
    clinic_phone VARCHAR(50) DEFAULT NULL,
    clinic_email VARCHAR(255) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_clinic_id UUID;
    v_existing_clinic_id UUID;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    -- Validate input
    IF clinic_name IS NULL OR trim(clinic_name) = '' THEN
        RAISE EXCEPTION 'Clinic name cannot be empty';
    END IF;
    
    -- Check if user already has a clinic with FOR UPDATE to prevent race condition
    -- This locks the row until the transaction completes
    SELECT clinic_id INTO v_existing_clinic_id
    FROM profiles
    WHERE id = v_user_id
    FOR UPDATE;  -- CRITICAL: Prevents race condition
    
    -- Handle case where profile doesn't exist yet (shouldn't happen, but be safe)
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found. Please contact support.';
    END IF;
    
    IF v_existing_clinic_id IS NOT NULL THEN
        RAISE EXCEPTION 'User already has a clinic assigned';
    END IF;
    
    -- Create the clinic
    INSERT INTO clinics (name, address, phone, email)
    VALUES (clinic_name, clinic_address, clinic_phone, clinic_email)
    RETURNING id INTO v_clinic_id;
    
    -- Update user profile with clinic_id and set as admin
    UPDATE profiles
    SET 
        clinic_id = v_clinic_id,
        role = 'admin',
        updated_at = NOW()
    WHERE id = v_user_id;
    
    -- Verify update succeeded
    IF NOT FOUND THEN
        -- Rollback clinic creation
        DELETE FROM clinics WHERE id = v_clinic_id;
        RAISE EXCEPTION 'Failed to update user profile';
    END IF;
    
    RETURN v_clinic_id;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle case where clinic was created by another transaction
        RAISE EXCEPTION 'A clinic is already being created for this user. Please try again.';
    WHEN OTHERS THEN
        -- Log error and re-raise
        RAISE;
END;
$$;

COMMENT ON FUNCTION create_clinic_for_onboarding IS
'Creates a new clinic and assigns it to the current user as admin.
This function bypasses RLS and ensures atomic operation.
Uses FOR UPDATE to prevent race conditions.
Only works for users without an existing clinic_id.';

-- ============================================
-- 2. OPTIMIZE RLS POLICY IN clinics INSERT
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users without clinic can create clinic" ON clinics;

-- Optimized policy: single query instead of two EXISTS
CREATE POLICY "Users without clinic can create clinic"
    ON clinics FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            -- Single query to check if clinic_id is NULL
            SELECT clinic_id IS NULL
            FROM profiles
            WHERE id = auth.uid()
        )
    );

COMMENT ON POLICY "Users without clinic can create clinic" ON clinics IS
'Allows authenticated users without a clinic_id to create a clinic.
Optimized to use a single query instead of multiple EXISTS subqueries.';

-- ============================================
-- 3. ADD MISSING INDEXES FOR PERFORMANCE
-- ============================================

-- Index on profiles.role for is_user_admin() function
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) 
WHERE role = 'admin';  -- Partial index since most users are not admins

COMMENT ON INDEX idx_profiles_role IS 
'Partial index for admin role lookups. Used by is_user_admin() function in RLS policies.';

-- Composite index for consent_records lookups (used in has_active_consent)
CREATE INDEX IF NOT EXISTS idx_consent_records_lookup 
ON consent_records(patient_id, consent_type, status, expires_at)
WHERE status = 'active';

COMMENT ON INDEX idx_consent_records_lookup IS 
'Composite index for fast consent lookups in RLS policies. 
Covers the typical query pattern in has_active_consent().';

-- Composite index for sessions (used in clinical_notes RLS policy)
CREATE INDEX IF NOT EXISTS idx_sessions_id_clinic_id 
ON sessions(id, clinic_id);

COMMENT ON INDEX idx_sessions_id_clinic_id IS 
'Composite index for clinical_notes RLS policy that checks session clinic_id.';

-- Composite index for clinical_notes (used in sections RLS policy)
CREATE INDEX IF NOT EXISTS idx_clinical_notes_id_user_id 
ON clinical_notes(id, user_id);

COMMENT ON INDEX idx_clinical_notes_id_user_id IS 
'Composite index for sections RLS policy that checks clinical_note ownership.';

-- Composite index for documents
CREATE INDEX IF NOT EXISTS idx_documents_patient_uploaded 
ON documents(patient_id, uploaded_by);

COMMENT ON INDEX idx_documents_patient_uploaded IS 
'Composite index for document access patterns.';

-- ============================================
-- 4. OPTIMIZE get_user_clinic_id() CALLS
-- ============================================

-- The function is already STABLE, which helps with caching.
-- However, we can add a comment about best practices.
COMMENT ON FUNCTION get_user_clinic_id() IS
'Returns the clinic_id for the current authenticated user.
SECURITY DEFINER bypasses RLS for internal lookups.
STABLE allows PostgreSQL to cache results within a statement.
Optimized with idx_profiles_clinic_id index.';

-- ============================================
-- 5. IMPROVE STATISTICS COLLECTION
-- ============================================

-- Set more aggressive autovacuum settings for frequently queried tables
ALTER TABLE profiles SET (
    autovacuum_analyze_scale_factor = 0.05,  -- Analyze after 5% changes
    autovacuum_analyze_threshold = 50        -- Or after 50 row changes
);

ALTER TABLE clinics SET (
    autovacuum_analyze_scale_factor = 0.05,
    autovacuum_analyze_threshold = 50
);

ALTER TABLE consent_records SET (
    autovacuum_analyze_scale_factor = 0.1,
    autovacuum_analyze_threshold = 100
);

-- Update statistics immediately
ANALYZE profiles;
ANALYZE clinics;
ANALYZE consent_records;
ANALYZE sessions;
ANALYZE clinical_notes;

-- ============================================
-- 6. ADD VALIDATION TO CRITICAL FUNCTIONS
-- ============================================

-- Add input validation helper function
CREATE OR REPLACE FUNCTION validate_clinic_name(name_input VARCHAR(255))
RETURNS BOOLEAN AS $$
BEGIN
    IF name_input IS NULL OR trim(name_input) = '' THEN
        RETURN false;
    END IF;
    
    IF length(trim(name_input)) < 2 THEN
        RETURN false;
    END IF;
    
    IF length(name_input) > 255 THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_clinic_name IS
'Validates clinic name input. Returns true if valid, false otherwise.';

-- ============================================
-- 7. IMPROVE ERROR HANDLING IN handle_new_user
-- ============================================

-- Create a table to log trigger errors (if it doesn't exist)
CREATE TABLE IF NOT EXISTS trigger_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    record_id UUID,
    error_message TEXT NOT NULL,
    error_detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_errors_created_at 
ON trigger_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trigger_errors_trigger_name 
ON trigger_errors(trigger_name);

COMMENT ON TABLE trigger_errors IS
'Logs errors from database triggers for monitoring and debugging.';

-- Update handle_new_user to log errors properly
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (
        id, 
        email, 
        full_name,
        mfa_enabled,
        backup_codes
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE((NEW.raw_user_meta_data->>'mfa_enabled')::boolean, false),
        COALESCE(
            CASE 
                WHEN NEW.raw_user_meta_data->'backup_codes' IS NOT NULL 
                THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'backup_codes'))
                ELSE ARRAY[]::TEXT[]
            END,
            ARRAY[]::TEXT[]
        )
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        updated_at = NOW();
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error to trigger_errors table
    INSERT INTO trigger_errors (
        trigger_name,
        table_name,
        record_id,
        error_message,
        error_detail
    ) VALUES (
        'on_auth_user_created',
        'profiles',
        NEW.id,
        SQLERRM,
        SQLSTATE || ': ' || SQLERRM || E'\n' || 
        COALESCE(current_setting('application_name', true), 'unknown')
    );
    
    -- Still log warning for immediate visibility
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    
    -- Return NEW to allow auth.users creation to succeed
    -- This prevents blocking user registration, but profile will need manual creation
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

COMMENT ON FUNCTION handle_new_user() IS 
'Automatically creates a profile record when a new user is created in auth.users. 
Handles mfa_enabled and backup_codes columns from migration 005.
Errors are logged to trigger_errors table for monitoring.';

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION validate_clinic_name TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================

COMMENT ON SCHEMA public IS
'Migration 010: Fixed performance and stability issues.
Changes:
1. Fixed race condition in create_clinic_for_onboarding with FOR UPDATE
2. Optimized clinics INSERT RLS policy (single query instead of two EXISTS)
3. Added missing indexes: profiles.role, consent_records composite, sessions composite
4. Improved autovacuum settings for better statistics
5. Added input validation
6. Improved error handling in handle_new_user trigger
7. Created trigger_errors table for monitoring';

