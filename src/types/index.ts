/**
 * PsiPilot Assistant - Type Exports
 *
 * Central export point for all TypeScript types
 */

// Database types
export * from './database.types';

// Re-export commonly used types for convenience
export type {
  // Entities
  Clinic,
  Profile,
  Patient,
  Session,
  ClinicalNote,
  Section,
  SectionTemplate,
  Recording,
  Document,
  PatientAssignment,

  // Insert types
  ClinicInsert,
  ProfileInsert,
  PatientInsert,
  SessionInsert,
  ClinicalNoteInsert,
  SectionInsert,
  RecordingInsert,
  DocumentInsert,
  PatientAssignmentInsert,

  // Update types
  ClinicUpdate,
  ProfileUpdate,
  PatientUpdate,
  SessionUpdate,
  ClinicalNoteUpdate,
  SectionUpdate,
  RecordingUpdate,
  DocumentUpdate,
  PatientAssignmentUpdate,

  // Enums
  UserRole,
  SessionStatus,
  TranscriptStatus,
  NoteType,
  NoteStatus,
  TranscriptionStatus,
  DocumentType,

  // Extended types
  PatientWithDocumentCount,
  SessionWithRelations,
  ClinicalNoteWithSections,
  ProfileWithClinic,

  // Database type
  Database,
} from './database.types';
