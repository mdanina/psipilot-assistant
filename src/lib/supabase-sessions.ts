import { supabase } from './supabase';
import type { Database } from '@/types/database.types';

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
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
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
 */
export async function linkSessionToPatient(
  sessionId: string,
  patientId: string
): Promise<Session> {
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

