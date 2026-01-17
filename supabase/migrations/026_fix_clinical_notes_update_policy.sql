-- Fix RLS policy for clinical_notes UPDATE to allow finalizing notes
-- Migration: 026_fix_clinical_notes_update_policy
-- Description: Add WITH CHECK clause to allow users to update their own notes, including status changes to 'finalized'

-- Drop existing policy
DROP POLICY IF EXISTS "Users can update own notes" ON clinical_notes;

-- Recreate policy with both USING and WITH CHECK
-- USING: Check if user can update the existing row (OLD) - must not be finalized/signed
-- WITH CHECK: Check if user can save the new row (NEW) - only check ownership, allow status change to finalized
CREATE POLICY "Users can update own notes"
    ON clinical_notes FOR UPDATE
    USING (
        user_id = auth.uid()
        AND status NOT IN ('finalized', 'signed')
    )
    WITH CHECK (
        user_id = auth.uid()
        -- Allow updating to any status (including finalized/signed) if user is the owner
        -- This allows the finalize operation while preventing updates to already finalized notes
    );






