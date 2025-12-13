import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateClinicalNote } from '@/lib/supabase-ai';
import { useToast } from '@/hooks/use-toast';
import type { GenerateRequest } from '@/types/ai.types';

interface GenerateButtonProps {
  sessionId: string;
  templateId: string;
  onSuccess: () => void;
  disabled?: boolean;
  sourceType?: GenerateRequest['source_type'];
}

/**
 * Кнопка для запуска генерации клинической заметки
 */
export function GenerateButton({
  sessionId,
  templateId,
  onSuccess,
  disabled = false,
  sourceType = 'combined',
}: GenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!sessionId || !templateId) {
      toast({
        title: 'Ошибка',
        description: 'Необходимо выбрать сессию и шаблон',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);

      const request: GenerateRequest = {
        session_id: sessionId,
        template_id: templateId,
        source_type: sourceType,
      };

      const result = await generateClinicalNote(request);

      toast({
        title: 'Генерация запущена',
        description: `Создано ${result.sections_count} секций. Генерация выполняется в фоне.`,
      });

      // Обновляем данные
      onSuccess();
    } catch (error) {
      console.error('Error generating clinical note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      
      // Более детальные сообщения об ошибках
      let userMessage = 'Не удалось запустить генерацию';
      if (errorMessage.includes('Нет данных для анализа')) {
        userMessage = 'Нет данных для анализа. Убедитесь, что есть транскрипт или заметки сессии.';
      } else if (errorMessage.includes('привязана к пациенту')) {
        userMessage = 'Сессия должна быть привязана к пациенту для генерации заметок.';
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

  return (
    <Button
      onClick={handleGenerate}
      disabled={disabled || isGenerating}
      size="lg"
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Запуск...
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-4 w-4" />
          Сгенерировать заметку
        </>
      )}
    </Button>
  );
}




