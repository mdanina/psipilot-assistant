-- PsiPilot Assistant - Seed Data
-- Migration: 003_seed_section_templates
-- Description: Default section templates for clinical notes

-- ============================================
-- GLOBAL SECTION TEMPLATES (for Initial Psychiatric Assessment)
-- Based on UI components in SessionsPage.tsx
-- ============================================

INSERT INTO section_templates (name, slug, description, note_type, position, is_required) VALUES
-- Initial Psychiatric Assessment sections
('Contact reason', 'contact_reason', 'Primary reason for the patient visit or consultation', 'initial_assessment', 1, true),
('History of Present Illness', 'history_present_illness', 'Detailed history of the current symptoms and concerns', 'initial_assessment', 2, true),
('Past Psychiatric History', 'past_psychiatric_history', 'Previous mental health diagnoses, treatments, and hospitalizations', 'initial_assessment', 3, false),
('Medical History', 'medical_history', 'Relevant medical conditions and current medications', 'initial_assessment', 4, false),
('Family History', 'family_history', 'Family psychiatric and medical history', 'initial_assessment', 5, false),
('Social History', 'social_history', 'Living situation, occupation, relationships, substance use', 'initial_assessment', 6, false),
('Mental Status Examination', 'mental_status_exam', 'Appearance, behavior, mood, affect, thought process, cognition', 'initial_assessment', 7, true),
('Risk Assessment', 'risk_assessment', 'Suicidal/homicidal ideation, self-harm behaviors, safety concerns', 'initial_assessment', 8, true),
('Diagnosis', 'diagnosis', 'DSM-5 diagnoses and differential considerations', 'initial_assessment', 9, true),
('Treatment Plan', 'treatment_plan', 'Recommended medications, therapy, follow-up schedule', 'initial_assessment', 10, true);

-- Follow-up session sections
INSERT INTO section_templates (name, slug, description, note_type, position, is_required) VALUES
('Interval History', 'interval_history', 'Changes since last visit', 'follow_up', 1, true),
('Current Symptoms', 'current_symptoms', 'Present symptom severity and frequency', 'follow_up', 2, true),
('Medication Review', 'medication_review', 'Current medications, adherence, side effects', 'follow_up', 3, true),
('Mental Status Examination', 'mental_status_exam', 'Current mental status findings', 'follow_up', 4, true),
('Risk Assessment', 'risk_assessment', 'Current risk factors and safety', 'follow_up', 5, true),
('Assessment', 'assessment', 'Clinical impression and progress', 'follow_up', 6, true),
('Plan', 'plan', 'Treatment adjustments and next steps', 'follow_up', 7, true);

-- Progress note sections
INSERT INTO section_templates (name, slug, description, note_type, position, is_required) VALUES
('Subjective', 'subjective', 'Patient reported symptoms and concerns (SOAP format)', 'progress', 1, true),
('Objective', 'objective', 'Observable findings and measurements (SOAP format)', 'progress', 2, true),
('Assessment', 'assessment', 'Clinical interpretation and diagnosis update (SOAP format)', 'progress', 3, true),
('Plan', 'plan', 'Treatment plan and next steps (SOAP format)', 'progress', 4, true);

-- General note sections
INSERT INTO section_templates (name, slug, description, note_type, position, is_required) VALUES
('Chief Complaint', 'chief_complaint', 'Primary concern in patient''s words', 'general', 1, false),
('Notes', 'notes', 'General clinical observations', 'general', 2, false),
('Recommendations', 'recommendations', 'Clinical recommendations', 'general', 3, false);

-- Discharge summary sections
INSERT INTO section_templates (name, slug, description, note_type, position, is_required) VALUES
('Admission Summary', 'admission_summary', 'Reason for admission and presenting symptoms', 'discharge', 1, true),
('Hospital Course', 'hospital_course', 'Treatment provided during hospitalization', 'discharge', 2, true),
('Discharge Diagnosis', 'discharge_diagnosis', 'Final diagnoses at discharge', 'discharge', 3, true),
('Discharge Medications', 'discharge_medications', 'Medications prescribed at discharge', 'discharge', 4, true),
('Discharge Instructions', 'discharge_instructions', 'Patient instructions and restrictions', 'discharge', 5, true),
('Follow-up Plan', 'followup_plan', 'Scheduled appointments and referrals', 'discharge', 6, true);
