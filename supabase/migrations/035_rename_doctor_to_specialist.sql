-- PsiPilot Assistant - Rename Doctor Role to Specialist
-- Migration: 035_rename_doctor_to_specialist
-- Description: Expand role constraint to include 'specialist', migrate existing data, update default

-- ============================================
-- EXPAND ROLE CONSTRAINT
-- ============================================

-- Drop existing constraint
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Create new constraint with both 'doctor' and 'specialist' (for backward compatibility during migration)
ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('doctor', 'specialist', 'admin', 'assistant'));

-- Update default value for new users
ALTER TABLE profiles 
ALTER COLUMN role SET DEFAULT 'specialist';

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Migrate all 'doctor' roles to 'specialist'
UPDATE profiles 
SET role = 'specialist' 
WHERE role = 'doctor';

-- ============================================
-- VERIFICATION
-- ============================================

-- Check migration result (commented out - uncomment for verification)
-- SELECT role, COUNT(*) as count
-- FROM profiles 
-- GROUP BY role
-- ORDER BY role;

COMMENT ON COLUMN profiles.role IS 
'Роль пользователя: specialist (специалист), admin (администратор), assistant (ассистент). Старая роль "doctor" автоматически мигрирована в "specialist".';

