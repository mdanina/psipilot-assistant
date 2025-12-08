-- PsiPilot Assistant - AI Analysis Tables
-- Migration: 023_ai_analysis_tables
-- Description: Create tables for AI-powered session analysis: block templates and note templates

-- ============================================
-- TABLE: NOTE_BLOCK_TEMPLATES
-- ============================================
-- Library of block templates with system prompts for AI generation
-- Each block represents a section type (e.g., "Contact Reason", "History of Present Illness")
-- Can be system-wide (is_system=true) or clinic-specific (clinic_id set)

CREATE TABLE IF NOT EXISTS note_block_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- Basic info
    name VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    slug VARCHAR(50) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,

    -- AI settings
    system_prompt TEXT NOT NULL,

    -- Flags
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    -- Order
    position INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT unique_slug_per_clinic UNIQUE (clinic_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_note_block_templates_clinic ON note_block_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_note_block_templates_category ON note_block_templates(category);
CREATE INDEX IF NOT EXISTS idx_note_block_templates_active ON note_block_templates(is_active) WHERE is_active = true;

-- ============================================
-- TABLE: CLINICAL_NOTE_TEMPLATES
-- ============================================
-- Templates for sets of blocks (e.g., "Initial Psychiatric Assessment")
-- Contains ordered array of block template IDs
-- Can be system-wide (is_system=true) or clinic-specific (clinic_id set)

CREATE TABLE IF NOT EXISTS clinical_note_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- Basic info
    name VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    description TEXT,

    -- Template composition (ordered array of block template IDs)
    block_template_ids UUID[] NOT NULL,

    -- Flags
    is_default BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clinical_note_templates_clinic ON clinical_note_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_templates_active ON clinical_note_templates(is_active) WHERE is_active = true;

-- Unique index: only one default template per clinic
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_note_templates_unique_default 
    ON clinical_note_templates(clinic_id, is_default) 
    WHERE is_default = true;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE note_block_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_note_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view system and own clinic templates
CREATE POLICY "Users can view system and own clinic block templates"
    ON note_block_templates FOR SELECT
    TO authenticated
    USING (
        is_system = true
        OR clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

-- Policy: Users can manage own clinic block templates
CREATE POLICY "Users can manage own clinic block templates"
    ON note_block_templates FOR ALL
    TO authenticated
    USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
        AND is_system = false
    );

-- Policy: Users can view system and own clinic note templates
CREATE POLICY "Users can view system and own clinic note templates"
    ON clinical_note_templates FOR SELECT
    TO authenticated
    USING (
        is_system = true
        OR clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

-- Policy: Users can manage own clinic note templates
CREATE POLICY "Users can manage own clinic note templates"
    ON clinical_note_templates FOR ALL
    TO authenticated
    USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
        AND is_system = false
    );

-- ============================================
-- TRIGGERS: UPDATE TIMESTAMP
-- ============================================

CREATE OR REPLACE FUNCTION update_note_block_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_note_block_templates_updated_at ON note_block_templates;
CREATE TRIGGER trigger_note_block_templates_updated_at
    BEFORE UPDATE ON note_block_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_note_block_templates_updated_at();

CREATE OR REPLACE FUNCTION update_clinical_note_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clinical_note_templates_updated_at ON clinical_note_templates;
CREATE TRIGGER trigger_clinical_note_templates_updated_at
    BEFORE UPDATE ON clinical_note_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_clinical_note_templates_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE note_block_templates IS 'Library of block templates with system prompts for AI generation';
COMMENT ON COLUMN note_block_templates.id IS 'Unique identifier for the block template';
COMMENT ON COLUMN note_block_templates.clinic_id IS 'Clinic that owns this template (NULL for system templates)';
COMMENT ON COLUMN note_block_templates.name IS 'Display name of the block (Russian)';
COMMENT ON COLUMN note_block_templates.name_en IS 'Display name of the block (English)';
COMMENT ON COLUMN note_block_templates.slug IS 'URL-friendly identifier (unique per clinic)';
COMMENT ON COLUMN note_block_templates.description IS 'Description of what this block contains';
COMMENT ON COLUMN note_block_templates.category IS 'Category of the block (assessment, history, treatment, status, conclusion)';
COMMENT ON COLUMN note_block_templates.system_prompt IS 'System prompt for OpenAI to generate content for this block';
COMMENT ON COLUMN note_block_templates.is_system IS 'Whether this is a system template (cannot be modified)';
COMMENT ON COLUMN note_block_templates.is_active IS 'Whether this template is active and available for use';
COMMENT ON COLUMN note_block_templates.position IS 'Display order';

COMMENT ON TABLE clinical_note_templates IS 'Templates for sets of blocks (e.g., "Initial Psychiatric Assessment")';
COMMENT ON COLUMN clinical_note_templates.id IS 'Unique identifier for the note template';
COMMENT ON COLUMN clinical_note_templates.clinic_id IS 'Clinic that owns this template (NULL for system templates)';
COMMENT ON COLUMN clinical_note_templates.name IS 'Display name of the template (Russian)';
COMMENT ON COLUMN clinical_note_templates.name_en IS 'Display name of the template (English)';
COMMENT ON COLUMN clinical_note_templates.description IS 'Description of when to use this template';
COMMENT ON COLUMN clinical_note_templates.block_template_ids IS 'Ordered array of block template IDs that compose this template';
COMMENT ON COLUMN clinical_note_templates.is_default IS 'Whether this is the default template for the clinic';
COMMENT ON COLUMN clinical_note_templates.is_system IS 'Whether this is a system template (cannot be modified)';
COMMENT ON COLUMN clinical_note_templates.is_active IS 'Whether this template is active and available for use';
