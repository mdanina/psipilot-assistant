import { useState } from 'react';
import { Calendar, Copy, Check, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  generateCalendarFeedToken,
  revokeCalendarFeedToken,
  type CalendarFeedToken,
  toGoogleCalendarUrl,
  toWebcalUrl,
} from '@/lib/calendar-feed';

interface CalendarFeedDialogProps {
  triggerClassName?: string;
}

export function CalendarFeedDialog({ triggerClassName }: CalendarFeedDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedData, setFeedData] = useState<CalendarFeedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const { toast } = useToast();

  const handleGenerateToken = async () => {
    setLoading(true);
    try {
      const data = await generateCalendarFeedToken();
      setFeedData(data);
      toast({
        title: 'Успешно',
        description: 'Ссылка на календарь создана',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось создать ссылку',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!feedData?.feedUrl) return;

    try {
      await navigator.clipboard.writeText(feedData.feedUrl);
      setCopied(true);
      toast({
        title: 'Скопировано',
        description: 'Ссылка скопирована в буфер обмена',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать ссылку',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeToken = async () => {
    setLoading(true);
    try {
      await revokeCalendarFeedToken();
      setFeedData(null);
      setShowManualUrl(false);
      toast({
        title: 'Успешно',
        description: 'Ссылка на календарь удалена',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось удалить ссылку',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={triggerClassName || 'text-xs sm:text-sm'}>
          <Calendar className="w-4 h-4 mr-2" />
          Подписка на календарь
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Подписка на календарь
          </DialogTitle>
          <DialogDescription>
            {feedData
              ? 'Нажмите на кнопку вашего календаря для автоматического добавления.'
              : 'Добавьте ваши сессии в Google Calendar, Apple Calendar или другое приложение календаря.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {feedData ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <a
                  href={toGoogleCalendarUrl(feedData.feedUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <path d="M18.316 5.684H24L18.316 12l5.684 6.316h-5.684L12 12z" fill="#1a73e8"/>
                    <path d="M5.684 24L12 18.316 5.684 12 0 18.316z" fill="#ea4335"/>
                    <path d="M12 18.316L18.316 24V18.316L12 12z" fill="#34a853"/>
                    <path d="M0 5.684L5.684 12 12 5.684 5.684 0z" fill="#4285f4"/>
                    <path d="M5.684 0L12 5.684V0h5.684L12 5.684 5.684 0z" fill="#188038"/>
                  </svg>
                  Google Календарь
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </a>

                <a
                  href={toWebcalUrl(feedData.feedUrl)}
                  className="flex items-center justify-center gap-2 w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="5.4" fill="#FF3B30"/>
                    <path d="M17 4.5H7C5.9 4.5 5 5.4 5 6.5v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-12c0-1.1-.9-2-2-2zm-5 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5-4H7v-8h10v8z" fill="white"/>
                  </svg>
                  Apple / другой календарь
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </a>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => setShowManualUrl(!showManualUrl)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  {showManualUrl ? 'Скрыть ссылку' : 'Показать ссылку для ручного добавления'}
                </button>

                {showManualUrl && (
                  <div className="mt-2">
                    <div className="flex gap-2">
                      <Input
                        value={feedData.feedUrl}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyUrl}
                        disabled={loading}
                        title="Копировать ссылку"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleGenerateToken}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Обновить ссылку
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeToken}
                  disabled={loading}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleGenerateToken}
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Создать ссылку
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Календарь будет автоматически обновляться при изменении ваших сессий.
            Не передавайте эту ссылку третьим лицам.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
