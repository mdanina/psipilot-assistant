import { supabase } from './supabase';
import type { Database } from '@/types/database.types';
import { hasActiveConsent } from './security';

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
 * Link session to patient
 * Automatically creates consent if patient doesn't have active consent
 * CRITICAL: Creates BOTH data_processing AND recording consents
 * - data_processing: needed to view session and patient
 * - recording: needed to view recordings (recordings RLS policy requires it)
 */
export async function linkSessionToPatient(
  sessionId: string,
  patientId: string
): Promise<Session> {
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
          'create_consent_for_patient',
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
    'Обработка персональных данных для оказания медицинских услуг в соответствии с договором',
    'Автоматически создано при привязке сессии к пациенту. Требует подтверждения.'
  );

  // Create recording consent (required for viewing recordings)
  // This is critical - recordings RLS policy checks for 'recording' consent
  await ensureConsent(
    'recording',
    'Запись аудио сессий для целей ведения медицинской документации',
    'Автоматически создано при привязке сессии к пациенту. Требует подтверждения.'
  );

  return updateSession(sessionId, {
    patient_id: patientId,
  });
}

/**
 * Complete session
 */
export async function completeSession(sessionId: string): Promise<Session> {
  const session = await getSession(sessionId);
  const startedAt = session.started_at ? new Date(session.started_at) : new Date();
  const endedAt = new Date();
  const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

  return updateSession(sessionId, {
    status: 'completed',
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
  });
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
    })
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

