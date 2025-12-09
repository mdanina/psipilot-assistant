import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Sparkles, Copy, Printer } from 'lucide-react';
import { generatePatientCaseSummary } from '@/lib/supabase-ai';
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
 * Компонент для отображения HTML контента сводки с ленивой загрузкой DOMPurify
 */
function CaseSummaryContent({ content }: { content: string }) {
  const [sanitizedContent, setSanitizedContent] = useState<string>('');

  useEffect(() => {
    // Ленивая загрузка DOMPurify
    import('dompurify').then((DOMPurify) => {
      const clean = DOMPurify.default.sanitize(content, {
        ALLOWED_TAGS: ['h2', 'p', 'ul', 'li', 'strong', 'em', 'br'],
        ALLOWED_ATTR: [],
      });
      setSanitizedContent(clean);
    });
  }, [content]);

  if (!sanitizedContent) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div 
        className="case-summary-content prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        style={{
          lineHeight: '1.6',
        }}
      />
      <style>{`
        .case-summary-content h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: hsl(var(--foreground));
        }
        .case-summary-content h2:first-child {
          margin-top: 0;
        }
        .case-summary-content p {
          margin-bottom: 0.75rem;
          color: hsl(var(--foreground));
        }
        .case-summary-content ul {
          margin-left: 1.5rem;
          margin-bottom: 0.75rem;
          list-style-type: disc;
        }
        .case-summary-content li {
          margin-bottom: 0.5rem;
          color: hsl(var(--foreground));
        }
        .case-summary-content strong {
          font-weight: 600;
        }
        .case-summary-content em {
          font-style: italic;
        }
        @media print {
          .case-summary-content {
            font-size: 12pt;
            line-height: 1.6;
          }
          .case-summary-content h2 {
            font-size: 16pt;
            page-break-after: avoid;
            margin-top: 20pt;
          }
          .case-summary-content p {
            margin-bottom: 10pt;
            text-align: justify;
          }
          .case-summary-content ul {
            margin-left: 20pt;
            margin-bottom: 10pt;
          }
        }
      `}</style>
    </>
  );
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
      const result = await generatePatientCaseSummary(patientId);
      
      setCaseSummary(result.case_summary);
      setGeneratedAt(result.generated_at);
      
      const sessionsInfo = result.based_on_sessions_count 
        ? ` на основе ${result.based_on_notes_count} клинических заметок из ${result.based_on_sessions_count} сессий`
        : ` на основе ${result.based_on_notes_count} клинических заметок`;
      
      toast({
        title: 'Сводка сгенерирована',
        description: `Создана${sessionsInfo}`,
      });
      
      // Перезагружаем после генерации
      await loadCaseSummary();
    } catch (error) {
      console.error('Error generating case summary:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      
      let userMessage = 'Не удалось сгенерировать сводку';
      if (errorMessage.includes('Нет доступного контента')) {
        userMessage = 'Для генерации сводки необходимо наличие хотя бы одной завершённой клинической заметки или транскрипта сессии.';
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

  const handleCopy = async () => {
    if (!caseSummary) return;
    
    try {
      // Создаем временный элемент для извлечения текста из HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = caseSummary;
      const textContent = tempDiv.textContent || tempDiv.innerText || '';
      
      await navigator.clipboard.writeText(textContent);
      toast({
        title: 'Скопировано',
        description: 'Сводка скопирована в буфер обмена',
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать в буфер обмена',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = async () => {
    if (!caseSummary) return;
    
    // Создаем новое окно для печати
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось открыть окно для печати. Разрешите всплывающие окна.',
        variant: 'destructive',
      });
      return;
    }

    // Ленивая загрузка DOMPurify для печати
    const DOMPurify = (await import('dompurify')).default;
    
    // Санитизируем HTML для безопасности
    const sanitizedHTML = DOMPurify.sanitize(caseSummary, {
      ALLOWED_TAGS: ['h2', 'p', 'ul', 'li', 'strong', 'em', 'br'],
      ALLOWED_ATTR: [],
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Сводка по случаю</title>
          <style>
            @media print {
              @page {
                margin: 2cm;
              }
              body {
                font-family: 'Times New Roman', serif;
                font-size: 12pt;
                line-height: 1.6;
                color: #000;
                max-width: 100%;
              }
              h2 {
                font-size: 16pt;
                font-weight: bold;
                margin-top: 20pt;
                margin-bottom: 10pt;
                page-break-after: avoid;
              }
              p {
                margin-bottom: 10pt;
                text-align: justify;
              }
              ul {
                margin-left: 20pt;
                margin-bottom: 10pt;
              }
              li {
                margin-bottom: 5pt;
              }
              strong {
                font-weight: bold;
              }
              em {
                font-style: italic;
              }
            }
            body {
              font-family: Arial, sans-serif;
              font-size: 12pt;
              line-height: 1.6;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            h2 {
              font-size: 18pt;
              font-weight: bold;
              margin-top: 24pt;
              margin-bottom: 12pt;
              color: #1a1a1a;
            }
            p {
              margin-bottom: 12pt;
            }
            ul {
              margin-left: 24pt;
              margin-bottom: 12pt;
            }
            li {
              margin-bottom: 6pt;
            }
          </style>
        </head>
        <body>
          ${sanitizedHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    
    // Ждем загрузки и открываем диалог печати
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
            AI-анализ на основе всех клинических заметок и транскриптов всех сессий пациента
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {caseSummary && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-2"
                title="Копировать в буфер обмена"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2"
                title="Печать"
              >
                <Printer className="w-4 h-4" />
              </Button>
            </>
          )}
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
        </div>
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
            <CaseSummaryContent content={caseSummary} />
            <style>{`
              .case-summary-content h2 {
                font-size: 1.25rem;
                font-weight: 600;
                margin-top: 1.5rem;
                margin-bottom: 0.75rem;
                color: hsl(var(--foreground));
              }
              .case-summary-content h2:first-child {
                margin-top: 0;
              }
              .case-summary-content p {
                margin-bottom: 0.75rem;
                color: hsl(var(--foreground));
              }
              .case-summary-content ul {
                margin-left: 1.5rem;
                margin-bottom: 0.75rem;
                list-style-type: disc;
              }
              .case-summary-content li {
                margin-bottom: 0.5rem;
                color: hsl(var(--foreground));
              }
              .case-summary-content strong {
                font-weight: 600;
              }
              .case-summary-content em {
                font-style: italic;
              }
              @media print {
                .case-summary-content {
                  font-size: 12pt;
                  line-height: 1.6;
                }
                .case-summary-content h2 {
                  font-size: 16pt;
                  page-break-after: avoid;
                  margin-top: 20pt;
                }
                .case-summary-content p {
                  margin-bottom: 10pt;
                  text-align: justify;
                }
                .case-summary-content ul {
                  margin-left: 20pt;
                  margin-bottom: 10pt;
                }
              }
            `}</style>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-4">
              Сводка ещё не сгенерирована. Нажмите "Сгенерировать" для создания
              AI-анализа на основе всех клинических заметок и транскриптов всех сессий пациента.
            </p>
            <p className="text-xs text-muted-foreground">
              Для генерации необходимо наличие хотя бы одной завершённой клинической заметки или транскрипта сессии.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

