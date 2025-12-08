-- PsiPilot Assistant - AI Analysis Columns
-- Migration: 024_ai_analysis_columns
-- Description: Add AI-related columns to existing tables (sections, clinical_notes, patients)

-- ============================================
-- ALTER TABLE: SECTIONS
-- ============================================
-- Add fields for AI generation tracking and anonymization

-- Link to block template
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS block_template_id UUID REFERENCES note_block_templates(id);

-- Generation status
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) DEFAULT 'pending';

-- Add constraint for generation_status
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'sections_generation_status_check'
    ) THEN
        ALTER TABLE sections
        ADD CONSTRAINT sections_generation_status_check
        CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed', 'skipped'));
    END IF;
END $$;

-- Generation error
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS generation_error TEXT;

-- Encrypted anonymization mapping
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS anonymization_map_encrypted TEXT;

-- Index for generation status
CREATE INDEX IF NOT EXISTS idx_sections_generation_status ON sections(generation_status);
CREATE INDEX IF NOT EXISTS idx_sections_block_template_id ON sections(block_template_id);

-- ============================================
-- ALTER TABLE: CLINICAL_NOTES
-- ============================================
-- Add fields for AI generation tracking

-- Link to note template
ALTER TABLE clinical_notes
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES clinical_note_templates(id);

-- Generation status for entire note
ALTER TABLE clinical_notes
ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) DEFAULT 'draft';

-- Add constraint for generation_status
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'clinical_notes_generation_status_check'
    ) THEN
        ALTER TABLE clinical_notes
        ADD CONSTRAINT clinical_notes_generation_status_check
        CHECK (generation_status IN ('draft', 'generating', 'completed', 'failed'));
    END IF;
END $$;

-- Source hash for detecting changes
ALTER TABLE clinical_notes
ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64);

-- Index for generation status
CREATE INDEX IF NOT EXISTS idx_clinical_notes_generation_status ON clinical_notes(generation_status);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_template_id ON clinical_notes(template_id);

-- ============================================
-- ALTER TABLE: PATIENTS
-- ============================================
-- Add fields for AI-generated case summary

-- AI-generated case summary (encrypted)
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS case_summary_encrypted TEXT;

-- When case summary was generated
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS case_summary_generated_at TIMESTAMPTZ;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN sections.block_template_id IS 'Reference to the block template used for AI generation';
COMMENT ON COLUMN sections.generation_status IS 'Status of AI generation: pending, generating, completed, failed, skipped';
COMMENT ON COLUMN sections.generation_error IS 'Error message if generation failed';
COMMENT ON COLUMN sections.anonymization_map_encrypted IS 'Encrypted mapping of anonymized placeholders to original PHI data';

COMMENT ON COLUMN clinical_notes.template_id IS 'Reference to the note template used for AI generation';
COMMENT ON COLUMN clinical_notes.generation_status IS 'Status of AI generation for entire note: draft, generating, completed, failed';
COMMENT ON COLUMN clinical_notes.source_hash IS 'SHA-256 hash of source data (transcript + notes) for change detection';

COMMENT ON COLUMN patients.case_summary_encrypted IS 'AI-generated case summary (encrypted)';
COMMENT ON COLUMN patients.case_summary_generated_at IS 'Timestamp when case summary was generated';
