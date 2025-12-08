/**
 * Functions for working with patient documents
 */

import { supabase } from './supabase';
import type { Database } from '@/types/database.types';

type Document = Database['public']['Tables']['documents']['Row'];
type DocumentInsert = Database['public']['Tables']['documents']['Insert'];

/**
 * Get all documents for a patient
 * Includes documents directly attached to patient and documents attached to patient's sessions
 */
export async function getPatientDocuments(patientId: string): Promise<{
  data: Document[] | null;
  error: Error | null;
}> {
  try {
    // Get documents directly attached to patient
    const { data: directDocs, error: directError } = await supabase
      .from('documents')
      .select('*')
      .eq('patient_id', patientId);

    if (directError) {
      return { data: null, error: new Error(directError.message) };
    }

    // Get all session IDs for this patient
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id')
      .eq('patient_id', patientId)
      .is('deleted_at', null);

    if (sessionsError) {
      return { data: null, error: new Error(sessionsError.message) };
    }

    const sessionIds = sessions?.map(s => s.id) || [];

    // Get documents attached to patient's sessions
    let sessionDocs: Document[] = [];
    if (sessionIds.length > 0) {
      const { data: docs, error: sessionDocsError } = await supabase
        .from('documents')
        .select('*')
        .in('session_id', sessionIds);

      if (sessionDocsError) {
        return { data: null, error: new Error(sessionDocsError.message) };
      }

      sessionDocs = docs || [];
    }

    // Combine and deduplicate documents
    const allDocs = [...(directDocs || []), ...sessionDocs];
    const uniqueDocs = Array.from(
      new Map(allDocs.map(doc => [doc.id, doc])).values()
    );

    // Sort by created_at descending
    uniqueDocs.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    return { data: uniqueDocs, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Upload a document for a patient
 */
export async function uploadPatientDocument(
  patientId: string,
  file: File,
  metadata: {
    title?: string;
    description?: string;
    documentType?: 'lab_result' | 'prescription' | 'referral' | 'consent' | 'other';
    sessionId?: string | null;
  }
): Promise<{
  data: Document | null;
  error: Error | null;
}> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { data: null, error: new Error('Необходима авторизация') };
    }

    // Generate unique file path
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${patientId}/${fileName}`;

    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return { data: null, error: new Error(`Ошибка загрузки файла: ${uploadError.message}`) };
    }

    // Create document record
    const documentData: DocumentInsert = {
      patient_id: patientId,
      session_id: metadata.sessionId || null,
      uploaded_by: user.id,
      file_path: filePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      title: metadata.title || file.name,
      description: metadata.description || null,
      document_type: metadata.documentType || 'other',
    };

    const { data: document, error: insertError } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (insertError) {
      // Try to delete uploaded file if document creation failed
      await supabase.storage.from('documents').remove([filePath]);
      return { data: null, error: new Error(`Ошибка создания записи: ${insertError.message}`) };
    }

    return { data: document, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get download URL for a document
 */
export async function getDocumentDownloadUrl(filePath: string): Promise<{
  data: string | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // URL valid for 1 hour

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data.signedUrl, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<{
  success: boolean;
  error: Error | null;
}> {
  try {
    // Get document to get file path
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      return { success: false, error: new Error('Документ не найден') };
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.file_path]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      // Continue with database deletion anyway
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      return { success: false, error: new Error(deleteError.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

/**
 * Get document type label in Russian
 */
export function getDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    lab_result: 'Результат анализов',
    prescription: 'Рецепт',
    referral: 'Направление',
    consent: 'Согласие',
    other: 'Другое',
  };
  return labels[type] || type;
}
