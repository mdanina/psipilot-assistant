-- PsiPilot Assistant - User Invitations System
-- Migration: 012_user_invitations
-- Description: System for inviting users to clinics

-- ============================================
-- USER INVITATIONS TABLE
-- ============================================
CREATE TABLE user_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'doctor' CHECK (role IN ('doctor', 'admin', 'assistant')),
    token VARCHAR(255) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate pending invitations
    CONSTRAINT unique_pending_invitation UNIQUE (clinic_id, email, status) 
        DEFERRABLE INITIALLY DEFERRED
);

-- Indexes
CREATE INDEX idx_user_invitations_clinic_id ON user_invitations(clinic_id);
CREATE INDEX idx_user_invitations_email ON user_invitations(email);
CREATE INDEX idx_user_invitations_token ON user_invitations(token);
CREATE INDEX idx_user_invitations_status ON user_invitations(status) WHERE status = 'pending';

-- Update trigger
CREATE TRIGGER update_user_invitations_updated_at 
    BEFORE UPDATE ON user_invitations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: Create user invitation
-- ============================================
CREATE OR REPLACE FUNCTION create_user_invitation(
    p_email VARCHAR(255),
    p_full_name VARCHAR(255) DEFAULT NULL,
    p_role VARCHAR(50) DEFAULT 'doctor'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID;
    v_clinic_id UUID;
    v_invitation_id UUID;
    v_existing_user_id UUID;
    v_existing_invitation_id UUID;
BEGIN
    -- Get current user
    v_admin_id := auth.uid();
    
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    -- Check if user is admin
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can invite users';
    END IF;
    
    -- Get admin's clinic_id
    SELECT clinic_id INTO v_clinic_id
    FROM profiles
    WHERE id = v_admin_id;
    
    IF v_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Admin must belong to a clinic';
    END IF;
    
    -- Validate role
    IF p_role NOT IN ('doctor', 'admin', 'assistant') THEN
        RAISE EXCEPTION 'Invalid role. Must be doctor, admin, or assistant';
    END IF;
    
    -- Check if user already exists and is in this clinic
    SELECT id INTO v_existing_user_id
    FROM profiles
    WHERE email = LOWER(TRIM(p_email))
      AND clinic_id = v_clinic_id;
    
    IF v_existing_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'User with email % is already in your clinic', p_email;
    END IF;
    
    -- Check if there's a pending invitation for this email
    SELECT id INTO v_existing_invitation_id
    FROM user_invitations
    WHERE email = LOWER(TRIM(p_email))
      AND clinic_id = v_clinic_id
      AND status = 'pending'
      AND expires_at > NOW();
    
    IF v_existing_invitation_id IS NOT NULL THEN
        RAISE EXCEPTION 'A pending invitation already exists for email %', p_email;
    END IF;
    
    -- Create invitation
    INSERT INTO user_invitations (
        clinic_id,
        invited_by,
        email,
        full_name,
        role,
        token,
        status,
        expires_at
    )
    VALUES (
        v_clinic_id,
        v_admin_id,
        LOWER(TRIM(p_email)),
        NULLIF(TRIM(p_full_name), ''),
        p_role,
        encode(gen_random_bytes(32), 'hex'),
        'pending',
        NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO v_invitation_id;
    
    RETURN v_invitation_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'An invitation for this email already exists';
    WHEN OTHERS THEN
        RAISE;
END;
$$;

COMMENT ON FUNCTION create_user_invitation IS 
'Creates a user invitation for the current admin''s clinic. 
Only admins can create invitations. 
Returns the invitation ID.';

-- ============================================
-- FUNCTION: Accept invitation (called by trigger)
-- ============================================
CREATE OR REPLACE FUNCTION accept_user_invitation(p_user_id UUID, p_email VARCHAR(255))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation RECORD;
BEGIN
    -- Find valid pending invitation
    SELECT * INTO v_invitation
    FROM user_invitations
    WHERE email = LOWER(TRIM(p_email))
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update profile with clinic_id and role
    UPDATE profiles
    SET 
        clinic_id = v_invitation.clinic_id,
        role = v_invitation.role,
        full_name = COALESCE(NULLIF(TRIM(profiles.full_name), ''), v_invitation.full_name),
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Mark invitation as accepted
    UPDATE user_invitations
    SET 
        status = 'accepted',
        accepted_at = NOW(),
        accepted_by = p_user_id,
        updated_at = NOW()
    WHERE id = v_invitation.id;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail user creation
        RAISE WARNING 'Error accepting invitation for user %: %', p_user_id, SQLERRM;
        RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION accept_user_invitation IS 
'Automatically accepts invitation when user registers with invited email. 
Called by handle_new_user trigger.';

-- ============================================
-- UPDATE handle_new_user TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create profile
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
    
    -- Try to accept invitation if exists
    PERFORM accept_user_invitation(NEW.id, NEW.email);
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- ============================================
-- RLS POLICIES FOR user_invitations
-- ============================================
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view invitations for their clinic
CREATE POLICY "Admins can view clinic invitations"
    ON user_invitations FOR SELECT
    USING (
        clinic_id = get_user_clinic_id() 
        AND is_user_admin()
    );

-- Admins can create invitations for their clinic
CREATE POLICY "Admins can create clinic invitations"
    ON user_invitations FOR INSERT
    WITH CHECK (
        clinic_id = get_user_clinic_id() 
        AND invited_by = auth.uid()
        AND is_user_admin()
    );

-- Admins can update invitations for their clinic
CREATE POLICY "Admins can update clinic invitations"
    ON user_invitations FOR UPDATE
    USING (
        clinic_id = get_user_clinic_id() 
        AND is_user_admin()
    );

-- Admins can cancel invitations for their clinic
CREATE POLICY "Admins can cancel clinic invitations"
    ON user_invitations FOR DELETE
    USING (
        clinic_id = get_user_clinic_id() 
        AND is_user_admin()
    );

-- Users can view their own pending invitation by token
CREATE POLICY "Users can view invitation by token"
    ON user_invitations FOR SELECT
    USING (
        status = 'pending' 
        AND expires_at > NOW()
    );

COMMENT ON TABLE user_invitations IS 
'Stores user invitations for clinics. Admins can invite users by email. 
When user registers, they are automatically added to the clinic.';

