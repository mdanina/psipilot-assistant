-- PsiPilot Assistant - Add Specialization to Profiles
-- Migration: 034_add_specialization
-- Description: Add specialization field to profiles and create specializations reference table

-- ============================================
-- ADD SPECIALIZATION COLUMN TO PROFILES
-- ============================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS specialization VARCHAR(100);

-- Create index for specialization lookups
CREATE INDEX IF NOT EXISTS idx_profiles_specialization 
ON profiles(specialization) 
WHERE specialization IS NOT NULL;

COMMENT ON COLUMN profiles.specialization IS 
'Специализация врача: psychiatrist, psychologist, neurologist, neuropsychologist, etc.';

-- ============================================
-- CREATE SPECIALIZATIONS REFERENCE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS specializations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for code lookups
CREATE INDEX IF NOT EXISTS idx_specializations_code ON specializations(code);

-- Add updated_at trigger
CREATE TRIGGER update_specializations_updated_at 
    BEFORE UPDATE ON specializations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED BASE SPECIALIZATIONS
-- ============================================

INSERT INTO specializations (code, name_ru, name_en, description) VALUES
    ('psychiatrist', 'Психиатр', 'Psychiatrist', 'Врач, специализирующийся на диагностике и лечении психических расстройств'),
    ('psychologist', 'Психолог', 'Psychologist', 'Специалист по психологии, занимающийся консультированием и психотерапией'),
    ('neurologist', 'Невролог', 'Neurologist', 'Врач, специализирующийся на заболеваниях нервной системы'),
    ('neuropsychologist', 'Нейропсихолог', 'Neuropsychologist', 'Специалист, изучающий связь между мозгом и поведением'),
    ('psychotherapist', 'Психотерапевт', 'Psychotherapist', 'Специалист, использующий психологические методы для лечения'),
    ('clinical_psychologist', 'Клинический психолог', 'Clinical Psychologist', 'Психолог, работающий в клинических условиях'),
    ('child_psychologist', 'Детский психолог', 'Child Psychologist', 'Психолог, специализирующийся на работе с детьми'),
    ('family_therapist', 'Семейный терапевт', 'Family Therapist', 'Специалист по семейной терапии'),
    ('group_therapist', 'Групповой терапевт', 'Group Therapist', 'Специалист, проводящий групповую терапию')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE specializations IS 
'Справочник специализаций врачей. Используется для выбора специализации при создании/редактировании профиля.';

