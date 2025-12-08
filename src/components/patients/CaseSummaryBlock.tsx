import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { generateCaseSummary } from '@/lib/supabase-ai';
import { supabase } from '@/lib/supabase';
import { decryptPHI } from '@/lib/encryption';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/types/database.types';

type Patient = Database['public']['Tables']['patients']['Row'];

interface CaseSummaryBlockProps {
  patientId: string;
  patient?: Patient;
}

/**
 * Компонент для отображения и генерации AI-сводки по случаю пациента
 */
export function CaseSummaryBlock({ patientId, patient }: CaseSummaryBlockProps) {
  const [caseSummary, setCaseSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadCaseSummary();
  }, [patientId]);

  const loadCaseSummary = async () => {
    try {
      setIsLoading(true);
      
      // Получаем данные пациента из базы
      const { data, error } = await supabase
        .from('patients')
        .select('case_summary_encrypted, case_summary_generated_at')
        .eq('id', patientId)
        .single();

      if (error) {
        console.error('Error loading case summary:', error);
        return;
      }

      if (data?.case_summary_encrypted) {
        try {
          const decrypted = await decryptPHI(data.case_summary_encrypted);
          setCaseSummary(decrypted);
          setGeneratedAt(data.case_summary_generated_at || null);
        } catch (err) {
          console.error('Error decrypting case summary:', err);
        }
      }
    } catch (error) {
      console.error('Error loading case summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      const result = await generateCaseSummary(patientId);
      
      setCaseSummary(result.case_summary);
      setGeneratedAt(result.generated_at);
      
      toast({
        title: 'Сводка сгенерирована',
        description: `Создана на основе ${result.based_on_notes_count} клинических заметок`,
      });
    } catch (error) {
      console.error('Error generating case summary:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      
      let userMessage = 'Не удалось сгенерировать сводку';
      if (errorMessage.includes('Нет завершённых клинических заметок')) {
        userMessage = 'Для генерации сводки необходимо наличие хотя бы одной завершённой клинической заметки.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        userMessage = 'Проблема с подключением к серверу. Проверьте интернет-соединение.';
      } else if (errorMessage.includes('auth') || errorMessage.includes('token')) {
        userMessage = 'Ошибка авторизации. Попробуйте перезайти в систему.';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
        userMessage = 'Превышен лимит запросов к OpenAI. Попробуйте позже.';
      } else if (errorMessage) {
        userMessage = errorMessage;
      }
      
      toast({
        title: 'Ошибка генерации',
        description: userMessage,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Сводка по случаю
          </CardTitle>
          <CardDescription>
            AI-анализ на основе всех клинических заметок пациента
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Сводка по случаю
          </CardTitle>
          <CardDescription>
            AI-анализ на основе всех клинических заметок пациента
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              {caseSummary ? 'Обновить' : 'Сгенерировать'}
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {caseSummary ? (
          <>
            {generatedAt && (
              <p className="text-sm text-muted-foreground mb-4">
                Обновлено: {new Date(generatedAt).toLocaleDateString('ru-RU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {caseSummary}
              </pre>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-4">
              Сводка ещё не сгенерирована. Нажмите "Сгенерировать" для создания
              AI-анализа на основе всех клинических заметок пациента.
            </p>
            <p className="text-xs text-muted-foreground">
              Для генерации необходимо наличие хотя бы одной завершённой клинической заметки.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
