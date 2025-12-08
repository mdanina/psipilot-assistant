/**
 * Types for unified patient files display
 * Combines documents, transcripts, and session note files
 */

export type PatientFileType = 'document' | 'transcript' | 'note_file';
export type PatientFileSource = 'direct' | 'session';

export interface PatientFile {
  id: string;
  type: PatientFileType;
  source: PatientFileSource;
  sessionId: string | null;
  sessionTitle: string | null;
  name: string;
  description?: string | null;
  mimeType?: string | null;
  size?: number | null;
  filePath?: string | null; // for documents (download)
  createdAt: string;
  canDelete: boolean;
}

export function getFileTypeLabel(type: PatientFileType): string {
  const labels: Record<PatientFileType, string> = {
    document: 'Документ',
    transcript: 'Транскрипт',
    note_file: 'Файл заметки',
  };
  return labels[type] || type;
}

export function getFileTypeColor(type: PatientFileType): string {
  const colors: Record<PatientFileType, string> = {
    document: 'bg-blue-100 text-blue-800',
    transcript: 'bg-purple-100 text-purple-800',
    note_file: 'bg-green-100 text-green-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}
