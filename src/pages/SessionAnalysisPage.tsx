import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getSession } from '@/lib/supabase-sessions';
import { getClinicalNotesForSession } from '@/lib/supabase-ai';
import { AnalysisLayout } from '@/components/analysis/AnalysisLayout';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/types/database.types';
import type { GeneratedClinicalNote } from '@/types/ai.types';

type Session = Database['public']['Tables']['sessions']['Row'];

export default function SessionAnalysisPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState<GeneratedClinicalNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Session ID is required');
      setIsLoading(false);
      return;
    }

    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    if (!sessionId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Загружаем сессию
      const sessionData = await getSession(sessionId);
      setSession(sessionData);

      // Проверяем, что сессия привязана к пациенту
      if (!sessionData.patient_id) {
        setError('Сессия должна быть привязана к пациенту для AI-анализа');
        setIsLoading(false);
        return;
      }

      // Загружаем существующие клинические заметки
      const notes = await getClinicalNotesForSession(sessionId);
      setClinicalNotes(notes);
    } catch (err) {
      console.error('Error loading session data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load session data');
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить данные сессии',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-screen">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">Ошибка загрузки</h2>
            <p className="text-muted-foreground">{error || 'Сессия не найдена'}</p>
            <Button onClick={() => navigate('/sessions')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Вернуться к сессиям
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Header />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/sessions')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">
                  AI Анализ сессии
                </h1>
                <p className="text-sm text-muted-foreground">
                  {session.title || `Сессия от ${new Date(session.started_at).toLocaleDateString('ru-RU')}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <AnalysisLayout
          sessionId={sessionId!}
          session={session}
          clinicalNotes={clinicalNotes}
          onNotesUpdate={loadSessionData}
        />
      </div>
    </div>
  );
}



