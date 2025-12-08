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
 */
export async function linkSessionToPatient(
  sessionId: string,
  patientId: string
): Promise<Session> {
  // Check if patient has active consent for data_processing
  const { hasConsent, error: consentCheckError } = await hasActiveConsent(
    patientId,
    'data_processing'
  );

  if (consentCheckError) {
    console.error('Error checking consent:', consentCheckError);
    // Continue anyway - consent creation will be attempted
  }

  // If no active consent, create one automatically using RPC function
  // This bypasses RLS circular dependency (consent needed to see patient, but patient needed to create consent)
  if (!hasConsent) {
    try {
      console.log('[linkSessionToPatient] Creating consent via RPC function...');
      const { data: consentId, error: consentError } = await supabase.rpc(
        'create_consent_for_patient',
        {
          p_patient_id: patientId,
          p_consent_type: 'data_processing',
          p_consent_purpose:
            'Обработка персональных данных для оказания медицинских услуг в соответствии с договором',
          p_legal_basis: 'contract',
          p_notes:
            'Автоматически создано при привязке сессии к пациенту. Требует подтверждения.',
        }
      );

      if (consentError) {
        console.error('[linkSessionToPatient] Error creating consent via RPC:', consentError);
        throw new Error(
          `Failed to create consent: ${consentError.message}. This is required for linking session to patient.`
        );
      }

      console.log('[linkSessionToPatient] Consent created successfully:', consentId);

      // Verify consent was created by checking again
      const { hasConsent: verifyConsent } = await hasActiveConsent(patientId, 'data_processing');
      if (!verifyConsent) {
        console.warn(
          '[linkSessionToPatient] Warning: Consent was created but verification failed. Waiting and retrying...'
        );
        // Wait a bit for database to update
        await new Promise((resolve) => setTimeout(resolve, 200));
        const { hasConsent: retryVerify } = await hasActiveConsent(patientId, 'data_processing');
        if (!retryVerify) {
          console.error(
            '[linkSessionToPatient] Consent verification failed after retry. Session linking may fail.'
          );
        }
      }
    } catch (error) {
      console.error('[linkSessionToPatient] Error in consent creation:', error);
      throw error; // Re-throw to prevent session update without consent
    }
  }

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

