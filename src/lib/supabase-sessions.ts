import { supabase } from './supabase';
import type { Database } from '@/types/database.types';
import { hasActiveConsent } from './security';
import { generatePatientCaseSummary } from './supabase-ai';

type Session = Database['public']['Tables']['sessions']['Row'];
type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
type SessionUpdate = Database['public']['Tables']['sessions']['Update'];

export interface CreateSessionParams {
  userId: string;
  clinicId: string;
  patientId?: string | null;
  title?: string;
}

/**
 * Create a new session
 */
export async function createSession(params: CreateSessionParams): Promise<Session> {
  const { userId, clinicId, patientId, title } = params;

  const sessionData: SessionInsert = {
    user_id: userId,
    clinic_id: clinicId,
    patient_id: patientId || null, // Can be null for sessions without patient
    title: title || null,
    status: 'in_progress',
    started_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('sessions')
    .insert(sessionData)
    .select()
    .single();

  if (error) {
    console.error('Error creating session:', error);
    throw new Error(`Failed to create session: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create session: No data returned');
  }

  return data;
}

/**
 * Update session
 */
export async function updateSession(
  sessionId: string,
  updates: SessionUpdate
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('Error updating session:', error);
    throw new Error(`Failed to update session: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to update session: No data returned');
  }

  return data;
}

/**
 * Get session by ID (only non-deleted sessions)
 */
export async function getSession(sessionId: string): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .is('deleted_at', null) // Only get non-deleted sessions
    .single();

  if (error) {
    console.error('Error getting session:', error);
    throw new Error(`Failed to get session: ${error.message}`);
  }

  if (!data) {
    throw new Error('Session not found');
  }

  return data;
}

/**
 * Check if session has clinical notes and their statuses
 */
export async function checkSessionClinicalNotes(
  sessionId: string
): Promise<{
  hasNotes: boolean;
  notesCount: number;
  hasFinalizedNotes: boolean;
  finalizedCount: number;
  hasSignedNotes: boolean;
  signedCount: number;
}> {
  const { data, error } = await supabase
    .from('clinical_notes')
    .select('id, status')
    .eq('session_id', sessionId);

  if (error) {
    console.error('Error checking clinical notes:', error);
    throw new Error(`Failed to check clinical notes: ${error.message}`);
  }

  const notes = data || [];
  const finalizedNotes = notes.filter(n => n.status === 'finalized');
  const signedNotes = notes.filter(n => n.status === 'signed');

  return {
    hasNotes: notes.length > 0,
    notesCount: notes.length,
    hasFinalizedNotes: finalizedNotes.length > 0,
    finalizedCount: finalizedNotes.length,
    hasSignedNotes: signedNotes.length > 0,
    signedCount: signedNotes.length,
  };
}

/**
 * Link session to patient
 * Automatically creates consent if patient doesn't have active consent
 * CRITICAL: Creates BOTH data_processing AND recording consents
 * - data_processing: needed to view session and patient
 * - recording: needed to view recordings (recordings RLS policy requires it)
 * 
 * If session already has a patient, this will RE-LINK to a new patient.
 * All clinical notes will be updated to the new patient_id.
 * 
 * WARNING: Re-linking finalized or signed notes may have compliance implications.
 */
export async function linkSessionToPatient(
  sessionId: string,
  patientId: string,
  options?: {
    allowRelinkFinalized?: boolean; // Allow re-linking even if notes are finalized
    allowRelinkSigned?: boolean; // Allow re-linking even if notes are signed
  }
): Promise<Session> {
  // Get current session to check if it's already linked
  const currentSession = await getSession(sessionId);
  const isRelinking = currentSession.patient_id !== null && currentSession.patient_id !== patientId;

  // Check for existing clinical notes
  const notesCheck = await checkSessionClinicalNotes(sessionId);

  // Validate re-linking restrictions
  if (isRelinking) {
    if (notesCheck.hasSignedNotes && !options?.allowRelinkSigned) {
      throw new Error(
        `Невозможно перепривязать сессию: есть ${notesCheck.signedCount} подписанных клинических заметок. ` +
        `Перепривязка подписанных заметок запрещена из соображений соответствия требованиям.`
      );
    }

    if (notesCheck.hasFinalizedNotes && !options?.allowRelinkFinalized && !options?.allowRelinkSigned) {
      throw new Error(
        `Невозможно перепривязать сессию: есть ${notesCheck.finalizedCount} финализированных клинических заметок. ` +
        `Перепривязка финализированных заметок может нарушить целостность данных.`
      );
    }
  }

  // Helper function to create consent if missing
  const ensureConsent = async (
    consentType: 'data_processing' | 'recording',
    purpose: string,
    notes: string
  ) => {
    const { hasConsent, error: checkError } = await hasActiveConsent(
      patientId,
      consentType
    );

    if (checkError) {
      console.warn(
        `[linkSessionToPatient] Error checking ${consentType} consent:`,
        checkError
      );
      // Continue anyway - consent creation will be attempted
    }

    if (!hasConsent) {
      try {
        console.log(
          `[linkSessionToPatient] Creating ${consentType} consent via RPC function...`
        );
        const { data: consentId, error: consentError } = await supabase.rpc(
          'create_consent_for_patient' as any,
          {
            p_patient_id: patientId,
            p_consent_type: consentType,
            p_consent_purpose: purpose,
            p_legal_basis: 'contract',
            p_notes: notes,
          }
        );

        if (consentError) {
          console.error(
            `[linkSessionToPatient] Error creating ${consentType} consent via RPC:`,
            consentError
          );
          throw new Error(
            `Failed to create ${consentType} consent: ${consentError.message}`
          );
        }

        console.log(
          `[linkSessionToPatient] ${consentType} consent created successfully:`,
          consentId
        );

        // Wait a bit for database to update
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(
          `[linkSessionToPatient] Error in ${consentType} consent creation:`,
          error
        );
        throw error;
      }
    } else {
      console.log(
        `[linkSessionToPatient] Patient already has active ${consentType} consent`
      );
    }
  };

  // Create data_processing consent (required for viewing sessions and patients)
  await ensureConsent(
    'data_processing',
    isRelinking
      ? 'Обработка персональных данных для оказания медицинских услуг в соответствии с договором (перепривязка сессии)'
      : 'Обработка персональных данных для оказания медицинских услуг в соответствии с договором',
    isRelinking
      ? 'Автоматически создано при перепривязке сессии к пациенту. Требует подтверждения.'
      : 'Автоматически создано при привязке сессии к пациенту. Требует подтверждения.'
  );

  // Create recording consent (required for viewing recordings)
  // This is critical - recordings RLS policy checks for 'recording' consent
  await ensureConsent(
    'recording',
    isRelinking
      ? 'Запись аудио сессий для целей ведения медицинской документации (перепривязка сессии)'
      : 'Запись аудио сессий для целей ведения медицинской документации',
    isRelinking
      ? 'Автоматически создано при перепривязке сессии к пациенту. Требует подтверждения.'
      : 'Автоматически создано при привязке сессии к пациенту. Требует подтверждения.'
  );

  // Update session patient_id
  const updatedSession = await updateSession(sessionId, {
    patient_id: patientId,
  });

  // Update all clinical notes to match the new patient_id
  if (notesCheck.hasNotes) {
    console.log(
      `[linkSessionToPatient] Updating ${notesCheck.notesCount} clinical notes to new patient_id`
    );
    
    const { error: updateNotesError } = await supabase
      .from('clinical_notes')
      .update({ patient_id: patientId })
      .eq('session_id', sessionId);

    if (updateNotesError) {
      console.error(
        '[linkSessionToPatient] Error updating clinical notes:',
        updateNotesError
      );
      // This is critical - rollback session update if notes update fails
      await updateSession(sessionId, {
        patient_id: currentSession.patient_id,
      });
      throw new Error(
        `Failed to update clinical notes: ${updateNotesError.message}. Session update rolled back.`
      );
    }

    console.log(
      `[linkSessionToPatient] Successfully updated ${notesCheck.notesCount} clinical notes`
    );
  }

  return updatedSession;
}

/**
 * Complete session
 * Automatically updates patient case summary if session is linked to a patient
 */
export async function completeSession(sessionId: string): Promise<Session> {
  const session = await getSession(sessionId);
  const startedAt = session.started_at ? new Date(session.started_at) : new Date();
  const endedAt = new Date();
  const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

  const completedSession = await updateSession(sessionId, {
    status: 'completed',
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
  });

  // Automatically update case summary for patient if session is linked to a patient
  // Do this asynchronously to not block session completion
  if (completedSession.patient_id) {
    // Fire and forget - don't wait for completion, don't throw errors
    generatePatientCaseSummary(completedSession.patient_id).catch((error) => {
      // Log error but don't fail the session completion
      console.warn('[completeSession] Failed to auto-update case summary:', error);
    });
  }

  return completedSession;
}

/**
 * Soft delete session (mark as deleted, but keep in database)
 * Session will be hidden from user but preserved for audit/history
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({
      deleted_at: new Date().toISOString(),
    } as any)
    .eq('id', sessionId);

  if (error) {
    console.error('Error soft deleting session:', error);
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

/**
 * Get all sessions for a patient
 */
export async function getPatientSessions(patientId: string): Promise<{
  data: Session[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Session content counts for display in UI
 */
export interface SessionContentCounts {
  sessionId: string;
  recordingsCount: number;
  sessionNotesCount: number;
  clinicalNotesCount: number;
  totalCount: number;
}

/**
 * Get content counts for multiple sessions
 * Returns total count of recordings + session_notes + clinical_notes for each session
 */
export async function getSessionsContentCounts(
  sessionIds: string[]
): Promise<Map<string, SessionContentCounts>> {
  const countsMap = new Map<string, SessionContentCounts>();

  if (sessionIds.length === 0) {
    return countsMap;
  }

  // Initialize counts for all sessions
  sessionIds.forEach(id => {
    countsMap.set(id, {
      sessionId: id,
      recordingsCount: 0,
      sessionNotesCount: 0,
      clinicalNotesCount: 0,
      totalCount: 0,
    });
  });

  // Fetch counts in parallel
  const [recordingsResult, sessionNotesResult, clinicalNotesResult] = await Promise.all([
    // Recordings count (non-deleted)
    supabase
      .from('recordings')
      .select('session_id')
      .in('session_id', sessionIds)
      .is('deleted_at', null),

    // Session notes count
    supabase
      .from('session_notes')
      .select('session_id')
      .in('session_id', sessionIds),

    // Clinical notes count
    supabase
      .from('clinical_notes')
      .select('session_id')
      .in('session_id', sessionIds),
  ]);

  // Count recordings per session
  if (recordingsResult.data) {
    recordingsResult.data.forEach(r => {
      const counts = countsMap.get(r.session_id);
      if (counts) {
        counts.recordingsCount++;
        counts.totalCount++;
      }
    });
  }

  // Count session notes per session
  if (sessionNotesResult.data) {
    sessionNotesResult.data.forEach(n => {
      const counts = countsMap.get(n.session_id);
      if (counts) {
        counts.sessionNotesCount++;
        counts.totalCount++;
      }
    });
  }

  // Count clinical notes per session
  if (clinicalNotesResult.data) {
    clinicalNotesResult.data.forEach(n => {
      const counts = countsMap.get(n.session_id);
      if (counts) {
        counts.clinicalNotesCount++;
        counts.totalCount++;
      }
    });
  }

  return countsMap;
}

/**
 * Search sessions by content (transcript, session notes, clinical notes)
 * Returns session IDs that match the search query
 */
export async function searchPatientSessions(
  patientId: string,
  searchQuery: string
): Promise<{
  data: string[] | null;
  error: Error | null;
}> {
  try {
    if (!searchQuery.trim()) {
      // If empty query, return all session IDs
      const { data, error } = await supabase
        .from('sessions')
        .select('id')
        .eq('patient_id', patientId)
        .is('deleted_at', null);

      if (error) {
        return { data: null, error: new Error(error.message) };
      }

      return { data: data?.map(s => s.id) || [], error: null };
    }

    const query = searchQuery.toLowerCase().trim();
    const matchedSessionIds = new Set<string>();

    // Search in sessions (transcript, summary, title)
    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('id, transcript, summary, title')
      .eq('patient_id', patientId)
      .is('deleted_at', null);

    if (sessionsData) {
      sessionsData.forEach(session => {
        const searchableText = [
          session.transcript,
          session.summary,
          session.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (searchableText.includes(query)) {
          matchedSessionIds.add(session.id);
        }
      });
    }

    // Search in session notes
    const { data: sessionNotesData } = await supabase
      .from('session_notes')
      .select('session_id, content')
      .in(
        'session_id',
        sessionsData?.map(s => s.id) || []
      );

    if (sessionNotesData) {
      sessionNotesData.forEach(note => {
        if (note.content?.toLowerCase().includes(query)) {
          matchedSessionIds.add(note.session_id);
        }
      });
    }

    // Search in clinical notes (ai_summary)
    const { data: clinicalNotesData } = await supabase
      .from('clinical_notes')
      .select('session_id, ai_summary, title')
      .eq('patient_id', patientId);

    if (clinicalNotesData) {
      clinicalNotesData.forEach(note => {
        const searchableText = [note.ai_summary, note.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (searchableText.includes(query)) {
          matchedSessionIds.add(note.session_id);
        }
      });
    }

    // Search in sections content
    if (clinicalNotesData && clinicalNotesData.length > 0) {
      const clinicalNoteIds = clinicalNotesData.map(n => n.session_id);
      const { data: sectionsData } = await supabase
        .from('sections')
        .select('clinical_note_id, content, ai_content')
        .in(
          'clinical_note_id',
          clinicalNotesData.map(n => n.session_id) // This should be note id, let's fix
        );

      // Actually we need to get clinical note IDs first
      const { data: clinicalNoteIdsData } = await supabase
        .from('clinical_notes')
        .select('id, session_id')
        .eq('patient_id', patientId);

      if (clinicalNoteIdsData) {
        const noteIdToSessionId = new Map(
          clinicalNoteIdsData.map(n => [n.id, n.session_id])
        );

        const { data: sectionsData2 } = await supabase
          .from('sections')
          .select('clinical_note_id, content, ai_content')
          .in('clinical_note_id', clinicalNoteIdsData.map(n => n.id));

        if (sectionsData2) {
          sectionsData2.forEach(section => {
            const searchableText = [section.content, section.ai_content]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            if (searchableText.includes(query)) {
              const sessionId = noteIdToSessionId.get(section.clinical_note_id);
              if (sessionId) {
                matchedSessionIds.add(sessionId);
              }
            }
          });
        }
      }
    }

    return { data: Array.from(matchedSessionIds), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Update session summary
 */
export async function updateSessionSummary(
  sessionId: string,
  summary: string
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ summary })
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating session summary:', error);
    throw new Error(`Failed to update session summary: ${error.message}`);
  }
}

