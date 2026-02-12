/**
 * Типы для AI-анализа терапевтических сессий
 */

export interface NoteBlockTemplate {
  id: string;
  clinic_id: string | null;
  name: string;
  name_en: string | null;
  slug: string;
  description: string | null;
  category: string;
  system_prompt: string;
  is_system: boolean;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ClinicalNoteTemplate {
  id: string;
  clinic_id: string | null;
  user_id: string | null;
  name: string;
  name_en: string | null;
  description: string | null;
  block_template_ids: string[];
  is_default: boolean;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Populated
  blocks?: NoteBlockTemplate[];
}

export type GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'skipped';
export type ClinicalNoteGenerationStatus = 'draft' | 'generating' | 'completed' | 'partial_failure' | 'failed';

export interface GeneratedSection {
  id: string;
  clinical_note_id: string;
  block_template_id: string | null;
  name: string;
  slug: string;
  content: string | null;        // Manual content
  ai_content: string | null;     // AI-generated content (encrypted in DB, decrypted in frontend)
  ai_generated_at: string | null;
  generation_status: GenerationStatus;
  generation_error: string | null;
  position: number;
  // Populated
  block_template?: NoteBlockTemplate;
}

export interface GeneratedClinicalNote {
  id: string;
  session_id: string;
  patient_id: string;
  user_id: string;
  template_id: string | null;
  title: string;
  note_type: string;
  ai_summary: string | null;
  ai_generated_at: string | null;
  generation_status: ClinicalNoteGenerationStatus;
  status: 'draft' | 'in_review' | 'finalized' | 'signed';
  source_hash: string | null;
  created_at: string;
  updated_at: string;
  // Populated
  sections?: GeneratedSection[];
  template?: ClinicalNoteTemplate;
}

export interface GenerationProgress {
  clinical_note_id: string;
  status: ClinicalNoteGenerationStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  sections: Array<{
    id: string;
    name: string;
    status: GenerationStatus;
  }>;
}

export interface GenerateRequest {
  session_id: string;
  template_id: string;
  source_type: 'transcript' | 'notes' | 'combined';
}

export interface RegenerateSectionRequest {
  custom_prompt?: string;
}

export interface CaseSummaryRequest {
  session_id: string;
}

export interface CaseSummary {
  session_id?: string;
  patient_id: string;
  case_summary: string;
  generated_at: string;
  based_on_notes_count: number;
  based_on_sessions_count?: number;
}

