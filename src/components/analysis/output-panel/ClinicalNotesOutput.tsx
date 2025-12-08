import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';
import { regenerateSection, updateSectionContent, finalizeClinicalNote } from '@/lib/supabase-ai';
import { decryptPHI } from '@/lib/encryption';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedClinicalNote, GeneratedSection } from '@/types/ai.types';

interface ClinicalNotesOutputProps {
  clinicalNote: GeneratedClinicalNote | null;
  onUpdate: () => void;
}

/**
 * Карточка секции с возможностью редактирования
 */
function SectionCard({
  section,
  onSave,
}: {
  section: GeneratedSection;
  onSave: (sectionId: string, content: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [decryptedContent, setDecryptedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Используем ref для отслеживания последнего обработанного контента
  const lastContentRef = useRef<string>('');
  const lastSectionIdRef = useRef<string>('');

  // Расшифровываем и обновляем контент при изменении секции
  useEffect(() => {
    const rawContent = section.content || section.ai_content || '';
    const sectionId = section.id;
    
    // Предотвращаем повторную обработку того же контента для той же секции
    if (rawContent === lastContentRef.current && sectionId === lastSectionIdRef.current) {
      return;
    }
    
    lastContentRef.current = rawContent;
    lastSectionIdRef.current = sectionId;

    const decryptContent = async () => {
      if (!rawContent) {
        setDecryptedContent('');
        setContent('');
        return;
      }

      // Проверяем, зашифрован ли контент
      const isLikelyEncrypted = rawContent.length > 50 &&
                                /^[A-Za-z0-9+/=]+$/.test(rawContent) &&
                                !rawContent.includes('\n') &&
                                !rawContent.includes(' ') &&
                                !rawContent.includes(':');

      if (isLikelyEncrypted) {
        try {
          setIsDecrypting(true);
          const decrypted = await decryptPHI(rawContent);
          setDecryptedContent(decrypted);
          setContent(decrypted);
        } catch (err) {
          console.warn('Failed to decrypt section content:', err);
          // Если расшифровка не удалась, используем как есть
          setDecryptedContent(rawContent);
          setContent(rawContent);
        } finally {
          setIsDecrypting(false);
        }
      } else {
        // Контент не зашифрован
        setDecryptedContent(rawContent);
        setContent(rawContent);
      }
    };

    decryptContent();
    // Сбрасываем режим редактирования только если секция изменилась
    if (sectionId !== lastSectionIdRef.current) {
      setIsEditing(false);
    }
  }, [section.id, section.content, section.ai_content]);

  const handleDoubleClick = () => {
    if (section.generation_status === 'completed' && !isDecrypting) {
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(section.id, content);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving section:', error);
      // При ошибке остаёмся в режиме редактирования
    } finally {
      setIsSaving(false);
    }
  };

  const handleBlur = () => {
    // Сохраняем при потере фокуса
    if (isEditing && content !== decryptedContent) {
      handleSave();
    } else {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setContent(decryptedContent);
      setIsEditing(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter или Cmd+Enter для сохранения
      handleSave();
    }
  };

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{section.name}</CardTitle>
        {section.generation_error && (
          <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive font-medium">Ошибка генерации:</p>
            <p className="text-sm text-destructive/80 mt-1">{section.generation_error}</p>
          </div>
        )}
      </CardHeader>
      <CardContent className="w-full max-w-full overflow-hidden">
        {isDecrypting ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Расшифровка...</span>
          </div>
        ) : isEditing ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="min-h-[150px] font-sans resize-none w-full"
            placeholder="Введите содержимое секции..."
            disabled={isSaving}
            autoFocus
          />
        ) : (
          <div 
            className="w-full max-w-full overflow-hidden"
            onDoubleClick={handleDoubleClick}
            style={{ 
              cursor: section.generation_status === 'completed' ? 'text' : 'default',
              userSelect: 'text'
            }}
            title={section.generation_status === 'completed' ? 'Двойной клик для редактирования' : ''}
          >
            <div 
              className="whitespace-pre-wrap font-sans text-sm leading-relaxed break-words overflow-wrap-anywhere word-break-break-word"
              style={{ 
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                maxWidth: '100%'
              }}
            >
              {content || 'Контент отсутствует'}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Правая колонка: все секции как карточки в одном списке
 */
export function ClinicalNotesOutput({ clinicalNote, onUpdate }: ClinicalNotesOutputProps) {
  const [sections, setSections] = useState<GeneratedSection[]>([]);
  const { toast } = useToast();
  const lastNoteIdRef = useRef<string | null>(null);
  const lastSectionsHashRef = useRef<string>('');

  // Инициализируем секции из clinicalNote
  useEffect(() => {
    if (!clinicalNote?.sections) {
      if (sections.length > 0) {
        setSections([]);
        lastNoteIdRef.current = null;
        lastSectionsHashRef.current = '';
      }
      return;
    }

    // Создаем хеш секций для сравнения
    const sorted = [...clinicalNote.sections].sort((a, b) => a.position - b.position);
    const sectionsHash = sorted.map(s => `${s.id}:${s.content || ''}:${s.ai_content || ''}`).join('|');
    
    // Предотвращаем обновление, если секции не изменились
    if (clinicalNote.id === lastNoteIdRef.current && sectionsHash === lastSectionsHashRef.current) {
      return;
    }
    
    setSections(sorted);
    lastNoteIdRef.current = clinicalNote.id;
    lastSectionsHashRef.current = sectionsHash;
  }, [clinicalNote]);

  const sortedSections = sections;

  const handleSave = async (sectionId: string, content: string) => {
    try {
      await updateSectionContent(sectionId, content);
      toast({
        title: 'Сохранено',
        description: 'Секция успешно обновлена',
      });
      onUpdate();
    } catch (error) {
      console.error('Error saving section:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: 'Ошибка сохранения',
        description: errorMessage.includes('network') || errorMessage.includes('fetch')
          ? 'Проблема с подключением. Проверьте интернет-соединение.'
          : errorMessage.includes('permission') || errorMessage.includes('auth')
          ? 'Ошибка доступа. Проверьте права доступа.'
          : 'Не удалось сохранить секцию. Попробуйте ещё раз.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const [isSavingSummary, setIsSavingSummary] = useState(false);

  const handleSaveSummary = async () => {
    if (!clinicalNote) return;

    try {
      setIsSavingSummary(true);
      await finalizeClinicalNote(clinicalNote.id);
      toast({
        title: 'Резюме сохранено',
        description: 'Клиническая заметка успешно сохранена и привязана к сессии',
      });
      onUpdate();
    } catch (error) {
      console.error('Error saving summary:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      
      // Более детальные сообщения об ошибках
      let description = 'Не удалось сохранить резюме. Попробуйте ещё раз.';
      
      if (errorMessage.includes('Недостаточно прав') || errorMessage.includes('владельцем')) {
        description = 'Недостаточно прав для сохранения. Вы не являетесь владельцем этой заметки.';
      } else if (errorMessage.includes('не найдена') || errorMessage.includes('недоступна')) {
        description = 'Заметка не найдена или недоступна. Обновите страницу и попробуйте снова.';
      } else if (errorMessage.includes('уже финализирована')) {
        description = 'Эта заметка уже была сохранена ранее.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        description = 'Проблема с подключением. Проверьте интернет-соединение.';
      } else if (errorMessage.includes('permission') || errorMessage.includes('auth') || errorMessage.includes('42501')) {
        description = 'Ошибка доступа. Проверьте права доступа или попробуйте перезайти в систему.';
      }
      
      toast({
        title: 'Ошибка сохранения',
        description,
        variant: 'destructive',
      });
    } finally {
      setIsSavingSummary(false);
    }
  };


  if (!clinicalNote) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <h4 className="font-semibold text-foreground mb-2">Заметок пока нет</h4>
          <p className="text-sm text-muted-foreground">
            Нажмите "Создать резюме" для генерации клинической заметки
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <Button
          onClick={handleSaveSummary}
          disabled={clinicalNote.status === 'finalized' || isSavingSummary}
          className="w-full"
          size="lg"
        >
          {isSavingSummary ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Сохранение...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {clinicalNote.status === 'finalized' ? 'Резюме сохранено' : 'Сохранить резюме'}
            </>
          )}
        </Button>
        {clinicalNote.status === 'finalized' && clinicalNote.created_at && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Сохранено {new Date(clinicalNote.created_at).toLocaleDateString('ru-RU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Sections list - все секции как карточки */}
      <ScrollArea className="flex-1 w-full">
        <div className="p-4 space-y-4 w-full max-w-full">
          {sortedSections.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Нет секций в этой заметке
            </p>
          ) : (
            sortedSections.map((section) => (
              <div key={section.id} className="w-full max-w-full">
                <SectionCard
                  section={section}
                  onSave={handleSave}
                />
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}