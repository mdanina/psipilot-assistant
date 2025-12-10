-- PsiPilot Assistant - Add Patient Role
-- Migration: 045_add_patient_role
-- Description: Add 'patient' role to profiles table for future patient portal functionality

-- ============================================
-- ADD PATIENT ROLE
-- ============================================

-- Update profiles table to include 'patient' role
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('specialist', 'admin', 'assistant', 'researcher', 'patient'));

COMMENT ON CONSTRAINT profiles_role_check ON profiles IS 
'Allowed roles: specialist, admin, assistant, researcher, patient. 
Patients will have separate portal functionality (to be implemented).
Patients are not tied to clinics (clinic_id = NULL).';

