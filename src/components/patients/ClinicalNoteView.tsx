import { useState } from 'react';
import { FileText, Copy, Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedClinicalNote } from '@/types/ai.types';

interface ClinicalNoteViewProps {
  clinicalNote: GeneratedClinicalNote;
  searchQuery?: string;
}

/**
 * Highlight search query in text
 */
function HighlightedText({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);
  let keyCounter = 0;

  while (index !== -1) {
    // Add text before match
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    // Add highlighted match
    parts.push(
      <mark key={keyCounter++} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
        {text.slice(index, index + lowerQuery.length)}
      </mark>
    );
    lastIndex = index + lowerQuery.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

/**
 * Convert clinical note to plain text for copying
 */
function noteToPlainText(clinicalNote: GeneratedClinicalNote): string {
  const sections = clinicalNote.sections || [];
  const sortedSections = [...sections].sort((a, b) => a.position - b.position);

  const lines: string[] = [];

  // Title
  lines.push(clinicalNote.title);
  lines.push('');

  // Template info
  if (clinicalNote.template) {
    lines.push(`Шаблон: ${clinicalNote.template.name}`);
    lines.push('');
  }

  // Sections
  sortedSections.forEach(section => {
    const content = section.content || section.ai_content;
    if (content) {
      lines.push(section.name);
      lines.push(content);
      lines.push('');
    }
  });

  return lines.join('\n').trim();
}

/**
 * Компонент для просмотра полной клинической заметки
 * Показывает все секции как единый документ
 */
export function ClinicalNoteView({ clinicalNote, searchQuery }: ClinicalNoteViewProps) {
  const { toast } = useToast();
  const [isCopied, setIsCopied] = useState(false);

  const sections = clinicalNote.sections || [];
  const sortedSections = [...sections].sort((a, b) => a.position - b.position);

  // Filter out sections with no content
  const sectionsWithContent = sortedSections.filter(
    section => section.content || section.ai_content
  );

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = noteToPlainText(clinicalNote);
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast({
        title: 'Скопировано',
        description: 'Заметка скопирована в буфер обмена',
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать текст',
        variant: 'destructive',
      });
    }
  };

  const handleExportPDF = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Use hidden iframe for printing to avoid navigation issues
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${clinicalNote.title}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 20px;
              line-height: 1.6;
              color: #333;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 8px;
              color: #111;
            }
            .template {
              font-size: 12px;
              color: #666;
              margin-bottom: 24px;
            }
            .section {
              margin-bottom: 20px;
            }
            .section-title {
              font-weight: 600;
              font-size: 14px;
              color: #111;
              margin-bottom: 4px;
            }
            .section-content {
              font-size: 14px;
              color: #444;
              white-space: pre-wrap;
            }
            @media print {
              body { margin: 0; padding: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>${clinicalNote.title}</h1>
          ${clinicalNote.template ? `<div class="template">Шаблон: ${clinicalNote.template.name}</div>` : ''}
          ${sectionsWithContent.map(section => `
            <div class="section">
              <div class="section-title">${section.name}</div>
              <div class="section-content">${(section.content || section.ai_content || '').replace(/\n/g, '<br>')}</div>
            </div>
          `).join('')}
        </body>
        </html>
      `);
      iframeDoc.close();

      // Wait for content to load then print
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();

        // Remove iframe after printing
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 100);
    }
  };

  if (sectionsWithContent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Нет содержимого в этой заметке
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs"
        >
          {isCopied ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              Скопировано
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              Копировать
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          className="h-7 text-xs"
        >
          <Download className="w-3 h-3 mr-1" />
          PDF / Печать
        </Button>
      </div>

      {/* Template name as subtitle if available */}
      {clinicalNote.template && (
        <p className="text-xs text-muted-foreground">
          Шаблон: {clinicalNote.template.name}
        </p>
      )}

      {/* All sections as unified document */}
      <div className="space-y-4">
        {sectionsWithContent.map((section) => {
          const content = section.content || section.ai_content || '';
          return (
            <div key={section.id}>
              {/* Section title */}
              <h4 className="font-medium text-sm text-foreground mb-1">
                <HighlightedText text={section.name} query={searchQuery} />
              </h4>
              {/* Section content */}
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                <HighlightedText text={content} query={searchQuery} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
