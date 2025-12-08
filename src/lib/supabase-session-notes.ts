import { supabase } from './supabase';
import type { Database } from '@/types/database.types';

type SessionNote = Database['public']['Tables']['session_notes']['Row'];
type SessionNoteInsert = Database['public']['Tables']['session_notes']['Insert'];

export interface CreateSessionNoteParams {
  sessionId: string;
  userId: string;
  content: string;
  source: 'manual' | 'file';
  originalFilename?: string | null;
}

/**
 * Get all notes for a session
 */
export async function getSessionNotes(sessionId: string): Promise<SessionNote[]> {
  const { data, error } = await supabase
    .from('session_notes')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching session notes:', error);
    throw new Error(`Failed to fetch session notes: ${error.message}`);
  }

  return data || [];
}

/**
 * Create a new session note
 */
export async function createSessionNote(params: CreateSessionNoteParams): Promise<SessionNote> {
  const { sessionId, userId, content, source, originalFilename } = params;

  const noteData: SessionNoteInsert = {
    session_id: sessionId,
    user_id: userId,
    content,
    source,
    original_filename: originalFilename || null,
  };

  const { data, error } = await supabase
    .from('session_notes')
    .insert(noteData)
    .select()
    .single();

  if (error) {
    console.error('Error creating session note:', error);
    throw new Error(`Failed to create session note: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create session note: No data returned');
  }

  return data;
}

/**
 * Delete a session note
 */
export async function deleteSessionNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('session_notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    console.error('Error deleting session note:', error);
    throw new Error(`Failed to delete session note: ${error.message}`);
  }
}

/**
 * Get combined transcript with specialist notes
 * Returns the transcript text with notes appended at the end
 */
export function getCombinedTranscriptWithNotes(
  transcriptText: string,
  notes: SessionNote[]
): string {
  if (notes.length === 0) {
    return transcriptText;
  }

  const notesText = notes
    .map((note) => {
      const sourceInfo = note.original_filename
        ? ` (из файла: ${note.original_filename})`
        : '';
      return note.content;
    })
    .join('\n\n');

  if (!transcriptText) {
    return `--- Комментарии специалиста ---\n\n${notesText}`;
  }

  return `${transcriptText}\n\n--- Комментарии специалиста ---\n\n${notesText}`;
}
