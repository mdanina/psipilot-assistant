/**
 * Session management for overlay
 * Creates sessions and saves notes/recordings
 */

import { supabase } from './supabase';

export interface CreateSessionParams {
  patientId: string;
  userId: string;
  clinicId: string;
  title?: string;
}

/**
 * Create or get active session for patient
 */
export async function getOrCreateActiveSession(params: CreateSessionParams): Promise<string> {
  const { patientId, userId, clinicId, title } = params;

  // Проверяем, есть ли активная сессия для этого пациента
  const { data: existingSessions, error: fetchError } = await supabase
    .from('sessions')
    .select('id')
    .eq('patient_id', patientId)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.error('Error fetching sessions:', fetchError);
    throw new Error(`Failed to fetch sessions: ${fetchError.message}`);
  }

  // Если есть активная сессия, возвращаем её ID
  if (existingSessions && existingSessions.length > 0) {
    return existingSessions[0].id;
  }

  // Создаём новую сессию
  const { data: newSession, error: createError } = await supabase
    .from('sessions')
    .insert({
      patient_id: patientId,
      user_id: userId,
      clinic_id: clinicId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      title: title || `Сессия ${new Date().toLocaleDateString('ru-RU')}`,
    })
    .select('id')
    .single();

  if (createError) {
    console.error('Error creating session:', createError);
    throw new Error(`Failed to create session: ${createError.message}`);
  }

  if (!newSession) {
    throw new Error('Failed to create session: No data returned');
  }

  return newSession.id;
}

/**
 * Create a session note
 */
export async function createSessionNote(params: {
  sessionId: string;
  userId: string;
  content: string;
  source?: 'manual' | 'file';
}): Promise<void> {
  const { sessionId, userId, content, source = 'manual' } = params;

  const { error } = await supabase
    .from('session_notes')
    .insert({
      session_id: sessionId,
      user_id: userId,
      content,
      source,
    });

  if (error) {
    console.error('Error creating session note:', error);
    throw new Error(`Failed to create session note: ${error.message}`);
  }
}

/**
 * Get user's clinic_id from profile
 */
export async function getUserClinicId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data?.clinic_id || null;
}
