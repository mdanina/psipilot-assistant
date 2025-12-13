-- PsiPilot Assistant - Fix Clinic Creation Policy
-- Migration: 009_fix_clinic_creation_policy
-- Description: Allow users without clinic_id to create clinics (for onboarding)

-- ============================================
-- FUNCTION: CREATE CLINIC FOR ONBOARDING
-- ============================================

-- SECURITY DEFINER function to create clinic and update profile atomically
-- This bypasses RLS issues and ensures data consistency
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
    
    -- Check if user already has a clinic
    SELECT clinic_id INTO v_existing_clinic_id
    FROM profiles
    WHERE id = v_user_id;
    
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
END;
$$;

COMMENT ON FUNCTION create_clinic_for_onboarding IS
'Creates a new clinic and assigns it to the current user as admin.
This function bypasses RLS and ensures atomic operation.
Only works for users without an existing clinic_id.';

GRANT EXECUTE ON FUNCTION create_clinic_for_onboarding TO authenticated;

-- ============================================
-- CLINICS INSERT POLICY (Fallback)
-- ============================================

-- Drop existing policy if it exists (for idempotent migration)
DROP POLICY IF EXISTS "Users without clinic can create clinic" ON clinics;

-- Allow authenticated users without a clinic to create a clinic (for onboarding)
-- This is a fallback policy, but the function above is preferred
CREATE POLICY "Users without clinic can create clinic"
    ON clinics FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            -- User doesn't have a profile yet (new user)
            NOT EXISTS (
                SELECT 1 FROM profiles WHERE id = auth.uid()
            )
            OR
            -- User has profile but no clinic_id
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND clinic_id IS NULL
            )
        )
    );





