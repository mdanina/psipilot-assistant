/**
 * Functions for getting all patient files (documents, transcripts, note files)
 */

import { supabase } from './supabase';
import type { PatientFile } from '@/types/patient-files';

/**
 * Get all files for a patient from different sources:
 * - Documents (directly attached or via sessions)
 * - Transcripts (from recordings via sessions)
 * - Note files (from session_notes with source='file')
 */
export async function getPatientFiles(patientId: string): Promise<{
  data: PatientFile[] | null;
  error: Error | null;
}> {
  try {
    const files: PatientFile[] = [];

    // 1. Get patient's sessions first (needed for transcripts and note files)
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, title')
      .eq('patient_id', patientId)
      .is('deleted_at', null);

    if (sessionsError) {
      return { data: null, error: new Error(sessionsError.message) };
    }

    const sessionMap = new Map<string, string | null>();
    (sessions || []).forEach(s => sessionMap.set(s.id, s.title));
    const sessionIds = Array.from(sessionMap.keys());

    // 2. Get documents directly attached to patient
    const { data: directDocs, error: directDocsError } = await supabase
      .from('documents')
      .select('*')
      .eq('patient_id', patientId)
      .is('session_id', null);

    if (directDocsError) {
      return { data: null, error: new Error(directDocsError.message) };
    }

    // Add direct documents (can be deleted)
    (directDocs || []).forEach(doc => {
      files.push({
        id: doc.id,
        type: 'document',
        source: 'direct',
        sessionId: null,
        sessionTitle: null,
        name: doc.title || doc.file_name,
        description: doc.description,
        mimeType: doc.mime_type,
        size: doc.file_size_bytes,
        filePath: doc.file_path,
        createdAt: doc.created_at,
        canDelete: true,
      });
    });

    // 3. Get documents attached to patient's sessions
    if (sessionIds.length > 0) {
      const { data: sessionDocs, error: sessionDocsError } = await supabase
        .from('documents')
        .select('*')
        .in('session_id', sessionIds);

      if (sessionDocsError) {
        return { data: null, error: new Error(sessionDocsError.message) };
      }

      // Add session documents (cannot be deleted from here)
      (sessionDocs || []).forEach(doc => {
        files.push({
          id: doc.id,
          type: 'document',
          source: 'session',
          sessionId: doc.session_id,
          sessionTitle: doc.session_id ? sessionMap.get(doc.session_id) || null : null,
          name: doc.title || doc.file_name,
          description: doc.description,
          mimeType: doc.mime_type,
          size: doc.file_size_bytes,
          filePath: doc.file_path,
          createdAt: doc.created_at,
          canDelete: false,
        });
      });

      // 4. Get transcripts from recordings
      const { data: recordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('id, session_id, transcription_text, transcription_status, created_at')
        .in('session_id', sessionIds)
        .is('deleted_at', null)
        .eq('transcription_status', 'completed')
        .not('transcription_text', 'is', null);

      if (recordingsError) {
        return { data: null, error: new Error(recordingsError.message) };
      }

      // Add transcripts (cannot be deleted from here)
      (recordings || []).forEach(rec => {
        if (rec.transcription_text) {
          files.push({
            id: `transcript-${rec.id}`,
            type: 'transcript',
            source: 'session',
            sessionId: rec.session_id,
            sessionTitle: sessionMap.get(rec.session_id) || null,
            name: `Транскрипт записи`,
            description: null,
            mimeType: 'text/plain',
            size: rec.transcription_text.length,
            filePath: null,
            createdAt: rec.created_at,
            canDelete: false,
          });
        }
      });

      // 5. Get note files from session_notes
      const { data: noteFiles, error: noteFilesError } = await supabase
        .from('session_notes')
        .select('id, session_id, original_filename, created_at')
        .in('session_id', sessionIds)
        .eq('source', 'file')
        .not('original_filename', 'is', null);

      if (noteFilesError) {
        return { data: null, error: new Error(noteFilesError.message) };
      }

      // Add note files (cannot be deleted from here)
      (noteFiles || []).forEach(note => {
        files.push({
          id: `note-${note.id}`,
          type: 'note_file',
          source: 'session',
          sessionId: note.session_id,
          sessionTitle: sessionMap.get(note.session_id) || null,
          name: note.original_filename || 'Файл заметки',
          description: null,
          mimeType: null,
          size: null,
          filePath: null,
          createdAt: note.created_at,
          canDelete: false,
        });
      });
    }

    // Sort by created_at descending (newest first)
    files.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return { data: files, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
