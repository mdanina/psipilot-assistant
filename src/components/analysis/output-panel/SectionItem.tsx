import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, CheckCircle2, XCircle, Loader2, Edit2, Save } from 'lucide-react';
import { regenerateSection, updateSectionContent } from '@/lib/supabase-ai';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedSection } from '@/types/ai.types';

interface SectionItemProps {
  section: GeneratedSection;
  onUpdate: () => void;
}

/**
 * Компонент для отображения и редактирования секции
 */
export function SectionItem({ section, onUpdate }: SectionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(section.content || section.ai_content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateSectionContent(section.id, content);
      setIsEditing(false);
      toast({
        title: 'Сохранено',
        description: 'Секция успешно обновлена',
      });
      onUpdate();
    } catch (error) {
      console.error('Error saving section:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось сохранить секцию',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      const result = await regenerateSection(section.id);
      setContent(result.ai_content);
      toast({
        title: 'Перегенерировано',
        description: 'Секция успешно перегенерирована',
      });
      onUpdate();
    } catch (error) {
      console.error('Error regenerating section:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось перегенерировать секцию',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const getStatusBadge = () => {
    switch (section.generation_status) {
      case 'completed':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Готово
          </Badge>
        );
      case 'generating':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Генерация
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Ошибка
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            Ожидание
          </Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{section.name}</CardTitle>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {section.generation_status === 'completed' && (
              <>
                {!isEditing ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
        {section.generation_error && (
          <p className="text-sm text-destructive mt-2">
            {section.generation_error}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[200px] font-sans"
            placeholder="Введите содержимое секции..."
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {content || 'Контент отсутствует'}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}




