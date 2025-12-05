/**
 * PsiPilot Assistant - Supabase Database Types
 *
 * This file contains TypeScript types that match the database schema.
 * These types should be regenerated when the schema changes using:
 * npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          clinic_id: string | null;
          role: 'doctor' | 'admin' | 'assistant';
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          clinic_id?: string | null;
          role?: 'doctor' | 'admin' | 'assistant';
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          clinic_id?: string | null;
          role?: 'doctor' | 'admin' | 'assistant';
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_clinic_id_fkey';
            columns: ['clinic_id'];
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          }
        ];
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string;
          created_by: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          date_of_birth: string | null;
          gender: string | null;
          address: string | null;
          notes: string | null;
          tags: string[];
          last_activity_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          created_by?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          address?: string | null;
          notes?: string | null;
          tags?: string[];
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          created_by?: string | null;
          name?: string;
          email?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          address?: string | null;
          notes?: string | null;
          tags?: string[];
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'patients_clinic_id_fkey';
            columns: ['clinic_id'];
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patients_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      sessions: {
        Row: {
          id: string;
          patient_id: string;
          user_id: string;
          clinic_id: string;
          title: string | null;
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
          transcript: string | null;
          transcript_status: 'pending' | 'processing' | 'completed' | 'failed';
          scheduled_at: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          notes: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          user_id: string;
          clinic_id: string;
          title?: string | null;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
          transcript?: string | null;
          transcript_status?: 'pending' | 'processing' | 'completed' | 'failed';
          scheduled_at?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          notes?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          user_id?: string;
          clinic_id?: string;
          title?: string | null;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
          transcript?: string | null;
          transcript_status?: 'pending' | 'processing' | 'completed' | 'failed';
          scheduled_at?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          notes?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_patient_id_fkey';
            columns: ['patient_id'];
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_clinic_id_fkey';
            columns: ['clinic_id'];
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          }
        ];
      };
      clinical_notes: {
        Row: {
          id: string;
          session_id: string;
          patient_id: string;
          user_id: string;
          title: string;
          note_type: 'general' | 'initial_assessment' | 'follow_up' | 'discharge' | 'progress';
          ai_summary: string | null;
          ai_generated_at: string | null;
          status: 'draft' | 'in_review' | 'finalized' | 'signed';
          signed_at: string | null;
          signed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          patient_id: string;
          user_id: string;
          title?: string;
          note_type?: 'general' | 'initial_assessment' | 'follow_up' | 'discharge' | 'progress';
          ai_summary?: string | null;
          ai_generated_at?: string | null;
          status?: 'draft' | 'in_review' | 'finalized' | 'signed';
          signed_at?: string | null;
          signed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          patient_id?: string;
          user_id?: string;
          title?: string;
          note_type?: 'general' | 'initial_assessment' | 'follow_up' | 'discharge' | 'progress';
          ai_summary?: string | null;
          ai_generated_at?: string | null;
          status?: 'draft' | 'in_review' | 'finalized' | 'signed';
          signed_at?: string | null;
          signed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clinical_notes_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clinical_notes_patient_id_fkey';
            columns: ['patient_id'];
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clinical_notes_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clinical_notes_signed_by_fkey';
            columns: ['signed_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      sections: {
        Row: {
          id: string;
          clinical_note_id: string;
          name: string;
          slug: string | null;
          content: string | null;
          ai_content: string | null;
          ai_generated_at: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinical_note_id: string;
          name: string;
          slug?: string | null;
          content?: string | null;
          ai_content?: string | null;
          ai_generated_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinical_note_id?: string;
          name?: string;
          slug?: string | null;
          content?: string | null;
          ai_content?: string | null;
          ai_generated_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sections_clinical_note_id_fkey';
            columns: ['clinical_note_id'];
            referencedRelation: 'clinical_notes';
            referencedColumns: ['id'];
          }
        ];
      };
      section_templates: {
        Row: {
          id: string;
          clinic_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          default_content: string | null;
          note_type: string;
          position: number;
          is_required: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          default_content?: string | null;
          note_type?: string;
          position?: number;
          is_required?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          default_content?: string | null;
          note_type?: string;
          position?: number;
          is_required?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'section_templates_clinic_id_fkey';
            columns: ['clinic_id'];
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          }
        ];
      };
      recordings: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          file_path: string;
          file_name: string | null;
          file_size_bytes: number | null;
          mime_type: string;
          duration_seconds: number | null;
          transcription_status: 'pending' | 'processing' | 'completed' | 'failed';
          transcription_text: string | null;
          transcription_error: string | null;
          transcribed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          file_path: string;
          file_name?: string | null;
          file_size_bytes?: number | null;
          mime_type?: string;
          duration_seconds?: number | null;
          transcription_status?: 'pending' | 'processing' | 'completed' | 'failed';
          transcription_text?: string | null;
          transcription_error?: string | null;
          transcribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          file_path?: string;
          file_name?: string | null;
          file_size_bytes?: number | null;
          mime_type?: string;
          duration_seconds?: number | null;
          transcription_status?: 'pending' | 'processing' | 'completed' | 'failed';
          transcription_text?: string | null;
          transcription_error?: string | null;
          transcribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recordings_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recordings_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      documents: {
        Row: {
          id: string;
          patient_id: string;
          session_id: string | null;
          uploaded_by: string;
          file_path: string;
          file_name: string;
          file_size_bytes: number | null;
          mime_type: string | null;
          title: string | null;
          description: string | null;
          document_type: 'lab_result' | 'prescription' | 'referral' | 'consent' | 'other';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          session_id?: string | null;
          uploaded_by: string;
          file_path: string;
          file_name: string;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          title?: string | null;
          description?: string | null;
          document_type?: 'lab_result' | 'prescription' | 'referral' | 'consent' | 'other';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          session_id?: string | null;
          uploaded_by?: string;
          file_path?: string;
          file_name?: string;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          title?: string | null;
          description?: string | null;
          document_type?: 'lab_result' | 'prescription' | 'referral' | 'consent' | 'other';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_patient_id_fkey';
            columns: ['patient_id'];
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_uploaded_by_fkey';
            columns: ['uploaded_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {};
    Functions: {
      get_user_clinic_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_user_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      user_belongs_to_clinic: {
        Args: { clinic_uuid: string };
        Returns: boolean;
      };
      get_patient_document_count: {
        Args: { patient_uuid: string };
        Returns: number;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};

// ============================================
// CONVENIENCE TYPE ALIASES
// ============================================

// Table Row types
export type Clinic = Database['public']['Tables']['clinics']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Patient = Database['public']['Tables']['patients']['Row'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type ClinicalNote = Database['public']['Tables']['clinical_notes']['Row'];
export type Section = Database['public']['Tables']['sections']['Row'];
export type SectionTemplate = Database['public']['Tables']['section_templates']['Row'];
export type Recording = Database['public']['Tables']['recordings']['Row'];
export type Document = Database['public']['Tables']['documents']['Row'];

// Insert types
export type ClinicInsert = Database['public']['Tables']['clinics']['Insert'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type PatientInsert = Database['public']['Tables']['patients']['Insert'];
export type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
export type ClinicalNoteInsert = Database['public']['Tables']['clinical_notes']['Insert'];
export type SectionInsert = Database['public']['Tables']['sections']['Insert'];
export type SectionTemplateInsert = Database['public']['Tables']['section_templates']['Insert'];
export type RecordingInsert = Database['public']['Tables']['recordings']['Insert'];
export type DocumentInsert = Database['public']['Tables']['documents']['Insert'];

// Update types
export type ClinicUpdate = Database['public']['Tables']['clinics']['Update'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type PatientUpdate = Database['public']['Tables']['patients']['Update'];
export type SessionUpdate = Database['public']['Tables']['sessions']['Update'];
export type ClinicalNoteUpdate = Database['public']['Tables']['clinical_notes']['Update'];
export type SectionUpdate = Database['public']['Tables']['sections']['Update'];
export type SectionTemplateUpdate = Database['public']['Tables']['section_templates']['Update'];
export type RecordingUpdate = Database['public']['Tables']['recordings']['Update'];
export type DocumentUpdate = Database['public']['Tables']['documents']['Update'];

// Enums
export type UserRole = Profile['role'];
export type SessionStatus = Session['status'];
export type TranscriptStatus = Session['transcript_status'];
export type NoteType = ClinicalNote['note_type'];
export type NoteStatus = ClinicalNote['status'];
export type TranscriptionStatus = Recording['transcription_status'];
export type DocumentType = Document['document_type'];

// ============================================
// EXTENDED TYPES (with relations)
// ============================================

export interface PatientWithDocumentCount extends Patient {
  document_count: number;
}

export interface SessionWithRelations extends Session {
  patient: Patient;
  user: Profile;
  clinical_notes?: ClinicalNote[];
  recordings?: Recording[];
}

export interface ClinicalNoteWithSections extends ClinicalNote {
  sections: Section[];
  session?: Session;
  patient?: Patient;
}

export interface ProfileWithClinic extends Profile {
  clinic: Clinic | null;
}
