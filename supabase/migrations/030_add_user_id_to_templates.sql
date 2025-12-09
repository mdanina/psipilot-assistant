-- PsiPilot Assistant - Add user_id to clinical_note_templates
-- Migration: 030_add_user_id_to_templates
-- Description: Add user_id column to support personal templates and update indexes

-- ============================================
-- ADD USER_ID COLUMN
-- ============================================

ALTER TABLE clinical_note_templates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- ============================================
-- UPDATE INDEXES
-- ============================================

-- Удаляем старый уникальный индекс для is_default
DROP INDEX IF EXISTS idx_clinical_note_templates_unique_default;

-- Создаем новый уникальный индекс: один шаблон по умолчанию на пользователя
-- Для системных шаблонов (user_id IS NULL) и шаблонов клиники (user_id IS NULL) 
-- уникальность на уровне clinic_id, для личных - на уровне user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_note_templates_unique_default_user
    ON clinical_note_templates(user_id, is_default) 
    WHERE is_default = true AND user_id IS NOT NULL;

-- Для шаблонов клиники (user_id IS NULL) - уникальность на уровне clinic_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_note_templates_unique_default_clinic
    ON clinical_note_templates(clinic_id, is_default) 
    WHERE is_default = true AND user_id IS NULL AND clinic_id IS NOT NULL;

-- Индекс для производительности запросов по user_id
CREATE INDEX IF NOT EXISTS idx_clinical_note_templates_user_id 
    ON clinical_note_templates(user_id) 
    WHERE user_id IS NOT NULL;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN clinical_note_templates.user_id IS 'Owner of the template. NULL for system templates and clinic templates. Set for personal templates.';

