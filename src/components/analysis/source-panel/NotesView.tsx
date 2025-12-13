import { useState, useEffect } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getSessionNotes } from '@/lib/supabase-session-notes';
import type { Database } from '@/types/database.types';

type SessionNote = Database['public']['Tables']['session_notes']['Row'];

interface NotesViewProps {
  sessionId: string;
}

/**
 * Компонент для отображения заметок сессии
 */
export function NotesView({ sessionId }: NotesViewProps) {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNotes();
  }, [sessionId]);

  const loadNotes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const sessionNotes = await getSessionNotes(sessionId);
      setNotes(sessionNotes);
    } catch (err) {
      console.error('Error loading notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          Нет заметок для этой сессии
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full px-4">
      <div className="py-4 space-y-4">
        {notes.map((note) => (
          <div
            key={note.id}
            className="border rounded-lg p-4 bg-background"
          >
            {note.original_filename && (
              <div className="text-xs text-muted-foreground mb-2">
                {note.original_filename}
              </div>
            )}
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {note.content}
            </pre>
            <div className="text-xs text-muted-foreground mt-2">
              {new Date(note.created_at).toLocaleString('ru-RU')}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}




