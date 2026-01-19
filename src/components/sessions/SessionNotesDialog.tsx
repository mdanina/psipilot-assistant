import { useState, useRef, useCallback } from "react";
import { FileText, Upload, X, Loader2, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { parseFile, FILE_ACCEPT_STRING, getFormatDescription, isSupportedFile } from "@/lib/file-parser";

interface SessionNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (content: string, source: 'manual' | 'file', filename?: string) => Promise<void>;
}

export function SessionNotesDialog({
  open,
  onOpenChange,
  onSave,
}: SessionNotesDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'text' | 'file'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedContent, setParsedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const resetState = () => {
    setTextContent('');
    setSelectedFile(null);
    setParsedContent('');
    setActiveTab('text');
    setIsLoading(false);
    setIsParsing(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileSelect = async (file: File) => {
    if (!isSupportedFile(file.name)) {
      toast({
        title: "Неподдерживаемый формат",
        description: getFormatDescription(),
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);

    try {
      const content = await parseFile(file);
      setParsedContent(content);
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({
        title: "Ошибка чтения файла",
        description: error instanceof Error ? error.message : "Не удалось прочитать файл",
        variant: "destructive",
      });
      setSelectedFile(null);
      setParsedContent('');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setParsedContent('');
  };

  const handleSave = async () => {
    const content = activeTab === 'text' ? textContent : parsedContent;

    if (!content.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите текст заметки или загрузите файл",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await onSave(
        content.trim(),
        activeTab === 'text' ? 'manual' : 'file',
        activeTab === 'file' ? selectedFile?.name : undefined
      );

      toast({
        title: "Успешно",
        description: "Заметка добавлена",
      });

      handleClose();
    } catch (error) {
      console.error('Error saving note:', error);
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить заметку",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canSave = activeTab === 'text'
    ? textContent.trim().length > 0
    : parsedContent.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Добавить заметку специалиста
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'text' | 'file')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text">Ввод текста</TabsTrigger>
            <TabsTrigger value="file">Загрузить файл</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4">
            <Textarea
              placeholder="Введите текст заметки..."
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="min-h-[200px] resize-none"
            />
          </TabsContent>

          <TabsContent value="file" className="mt-4">
            {!selectedFile ? (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT_STRING}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Перетащите файл сюда или
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Выберите файл
                </Button>
                <p className="text-xs text-muted-foreground mt-4">
                  {getFormatDescription()}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selected file info */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <File className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    disabled={isParsing}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Parsed content preview */}
                {isParsing ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
                    <span className="text-sm text-muted-foreground">
                      Извлечение текста...
                    </span>
                  </div>
                ) : parsedContent ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Извлечённый текст:
                    </p>
                    <div className="max-h-[200px] overflow-auto p-3 bg-muted/30 rounded-lg">
                      <pre className="text-sm whitespace-pre-wrap font-sans">
                        {parsedContent.substring(0, 1000)}
                        {parsedContent.length > 1000 && '...'}
                      </pre>
                    </div>
                    {parsedContent.length > 1000 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Показаны первые 1000 символов из {parsedContent.length}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isLoading || isParsing}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Сохранение...
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
