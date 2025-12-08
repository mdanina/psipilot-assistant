import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, FileText, Calendar } from 'lucide-react';
import { formatDate } from '@/lib/date-utils';
import type { GeneratedClinicalNote, GeneratedSection } from '@/types/ai.types';

interface ClinicalNoteViewProps {
  clinicalNote: GeneratedClinicalNote;
}

/**
 * Компонент для просмотра полной клинической заметки
 */
export function ClinicalNoteView({ clinicalNote }: ClinicalNoteViewProps) {
  const sections = clinicalNote.sections || [];
  const sortedSections = [...sections].sort((a, b) => a.position - b.position);

  const getStatusBadge = (section: GeneratedSection) => {
    switch (section.generation_status) {
      case 'completed':
        return (
          <Badge variant="default" className="gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" />
            Готово
          </Badge>
        );
      case 'generating':
        return (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Генерация
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1 text-xs">
            <XCircle className="h-3 w-3" />
            Ошибка
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            Ожидание
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{clinicalNote.title}</h3>
          {clinicalNote.template && (
            <p className="text-sm text-muted-foreground mt-1">
              Шаблон: {clinicalNote.template.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge({
            id: clinicalNote.id,
            clinical_note_id: clinicalNote.id,
            block_template_id: null,
            name: 'Note',
            slug: 'note',
            content: null,
            ai_content: null,
            ai_generated_at: clinicalNote.ai_generated_at,
            generation_status: clinicalNote.generation_status === 'completed' ? 'completed' : 
                              clinicalNote.generation_status === 'generating' ? 'generating' :
                              clinicalNote.generation_status === 'failed' ? 'failed' : 'pending',
            generation_error: null,
            position: 0,
          } as GeneratedSection)}
          {clinicalNote.created_at && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(clinicalNote.created_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      {sortedSections.length > 0 ? (
        <div className="space-y-4">
          {sortedSections.map((section) => (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{section.name}</CardTitle>
                  {getStatusBadge(section)}
                </div>
                {section.generation_error && (
                  <p className="text-sm text-destructive mt-2">
                    Ошибка: {section.generation_error}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {section.content || section.ai_content || 'Контент отсутствует'}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            Нет секций в этой заметке
          </p>
        </div>
      )}
    </div>
  );
}
