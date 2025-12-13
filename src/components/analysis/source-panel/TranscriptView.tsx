import { useState, useEffect } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getSessionRecordings } from '@/lib/supabase-recordings';
import { decryptPHI } from '@/lib/encryption';
import type { Database } from '@/types/database.types';

type Recording = Database['public']['Tables']['recordings']['Row'];

interface TranscriptViewProps {
  sessionId: string;
}

/**
 * Компонент для отображения транскрипта сессии
 */
export function TranscriptView({ sessionId }: TranscriptViewProps) {
  const [transcript, setTranscript] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTranscript();
  }, [sessionId]);

  const loadTranscript = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const recordings = await getSessionRecordings(sessionId);
      const completedRecordings = recordings.filter(
        (r: Recording) => r.transcription_status === 'completed' && r.transcription_text
      );

      if (completedRecordings.length === 0) {
        setTranscript('');
        setError('Нет завершённых транскриптов для этой сессии');
        return;
      }

      // Объединяем все транскрипты
      const transcripts = await Promise.all(
        completedRecordings.map(async (recording: Recording) => {
          try {
            return await decryptPHI(recording.transcription_text || '');
          } catch (err) {
            console.warn('Failed to decrypt transcript:', err);
            return recording.transcription_text || '';
          }
        })
      );

      setTranscript(transcripts.join('\n\n---\n\n'));
    } catch (err) {
      console.error('Error loading transcript:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transcript');
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

  if (!transcript) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          Нет транскрипта для этой сессии
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full px-4">
      <div className="py-4">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {transcript}
        </pre>
      </div>
    </ScrollArea>
  );
}




