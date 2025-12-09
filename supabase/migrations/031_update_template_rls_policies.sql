-- PsiPilot Assistant - Update RLS policies for clinical_note_templates
-- Migration: 031_update_template_rls_policies
-- Description: Update RLS policies to support system/clinic/personal templates with proper access control

-- ============================================
-- DROP OLD POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view system and own clinic note templates" ON clinical_note_templates;
DROP POLICY IF EXISTS "Users can manage own clinic note templates" ON clinical_note_templates;

-- ============================================
-- NEW RLS POLICIES
-- ============================================

-- SELECT: Users can view:
-- 1. System templates (is_system = true)
-- 2. Clinic templates (clinic_id = user's clinic AND user_id IS NULL)
-- 3. Their own personal templates (user_id = auth.uid())
CREATE POLICY "Users can view system, clinic, and own personal templates"
    ON clinical_note_templates FOR SELECT
    TO authenticated
    USING (
        is_system = true
        OR (
            clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
            AND user_id IS NULL
        )
        OR user_id = auth.uid()
    );

-- INSERT: 
-- 1. Admins can create clinic templates (user_id = NULL, clinic_id = their clinic)
-- 2. All users can create personal templates (user_id = auth.uid())
-- 3. Nobody can create system templates (is_system = true)
CREATE POLICY "Admins can create clinic templates, users can create personal"
    ON clinical_note_templates FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            -- Clinic template: only admins, user_id must be NULL
            is_system = false
            AND user_id IS NULL
            AND clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
            AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        )
        OR (
            -- Personal template: any user, user_id must be auth.uid()
            is_system = false
            AND user_id = auth.uid()
            AND clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
        )
    );

-- UPDATE:
-- 1. Nobody can update system templates
-- 2. Admins can update clinic templates (clinic_id = their clinic, user_id IS NULL)
-- 3. Owners can update their personal templates (user_id = auth.uid())
CREATE POLICY "Admins can update clinic templates, owners can update personal"
    ON clinical_note_templates FOR UPDATE
    TO authenticated
    USING (
        is_system = false
        AND (
            (
                -- Clinic template: only admins
                user_id IS NULL
                AND clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
                AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
            )
            OR (
                -- Personal template: only owner
                user_id = auth.uid()
            )
        )
    );

-- DELETE:
-- 1. Nobody can delete system templates
-- 2. Admins can delete clinic templates (clinic_id = their clinic, user_id IS NULL)
-- 3. Owners can delete their personal templates (user_id = auth.uid())
CREATE POLICY "Admins can delete clinic templates, owners can delete personal"
    ON clinical_note_templates FOR DELETE
    TO authenticated
    USING (
        is_system = false
        AND (
            (
                -- Clinic template: only admins
                user_id IS NULL
                AND clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
                AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
            )
            OR (
                -- Personal template: only owner
                user_id = auth.uid()
            )
        )
    );

