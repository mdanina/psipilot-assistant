import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Loader2, AlertCircle, FileText, MessageSquare, ChevronDown, ChevronUp, Search, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  sendMessageToSupervisor,
  type SupervisorRequest,
  type SupervisorPatientContext,
} from '@/lib/supervisor-api';
import { usePatient } from '@/hooks/usePatients';
import { usePatientActivities } from '@/hooks/usePatientActivities';
import { usePatientCaseSummary } from '@/hooks/usePatientCaseSummary';
import { getSessionRecordings } from '@/lib/supabase-recordings';
import {
  getSupervisorConversations,
  searchSupervisorConversations,
  saveSupervisorConversation,
  updateSupervisorConversation,
  type SupervisorMessage,
  type SupervisorConversationWithMessages,
} from '@/lib/supabase-supervisor-conversations';
import { formatDateTime } from '@/lib/date-utils';

interface PatientSupervisorTabProps {
  patientId: string;
  patientName?: string;
}

export function PatientSupervisorTab({
  patientId,
  patientName,
}: PatientSupervisorTabProps) {
  const [messages, setMessages] = useState<SupervisorMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Загружаем список сохраненных бесед
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['supervisor-conversations', patientId],
    queryFn: () => getSupervisorConversations(patientId),
    enabled: !!patientId,
  });

  // Поиск по беседам
  const { data: searchResults } = useQuery({
    queryKey: ['supervisor-conversations-search', patientId, searchQuery],
    queryFn: () => searchSupervisorConversations(patientId, searchQuery),
    enabled: !!patientId && searchQuery.trim().length > 0,
  });

  const conversations = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchResults?.data || [];
    }
    return conversationsData?.data || [];
  }, [searchQuery, searchResults, conversationsData]);

  // Загружаем данные пациента для контекста супервизора
  const { data: patient } = usePatient(patientId);
  const { data: activitiesData } = usePatientActivities(patientId);
  const { data: caseSummaryData } = usePatientCaseSummary(patientId);

  // Загружаем транскрипты для всех сессий пациента
  const sessionIds = useMemo(
    () => (activitiesData?.sessions || []).map((s) => s.id),
    [activitiesData?.sessions]
  );

  const { data: transcriptsMap } = useQuery({
    queryKey: ['supervisor-transcripts', patientId, sessionIds],
    queryFn: async () => {
      const map = new Map<string, string[]>();
      const results = await Promise.allSettled(
        sessionIds.map((sid) => getSessionRecordings(sid))
      );
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          const texts = result.value
            .filter((r) => r.transcription_status === 'completed' && r.transcription_text)
            .map((r) => r.transcription_text as string);
          if (texts.length > 0) {
            map.set(sessionIds[i], texts);
          }
        }
      });
      return map;
    },
    enabled: sessionIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const supervisorContext = useMemo<SupervisorPatientContext>(() => {
    const ctx: SupervisorPatientContext = {};

    if (patient) {
      ctx.patient = {
        fullName: patient.full_name_decrypted || patientName,
        dateOfBirth: patient.date_of_birth || undefined,
        gender: patient.gender || undefined,
        notes: patient.notes_decrypted || undefined,
      };
    }

    if (caseSummaryData?.caseSummary) {
      ctx.caseSummary = caseSummaryData.caseSummary;
    }

    if (activitiesData?.sessions?.length) {
      ctx.sessions = activitiesData.sessions
        .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
        .slice(0, 20)
        .map((s) => ({
          date: s.session_date,
          status: s.status,
          durationMinutes: s.duration_minutes || undefined,
          summary: s.summary || undefined,
          notes: s.notes || undefined,
          transcripts: transcriptsMap?.get(s.id) || undefined,
        }));
    }

    if (activitiesData?.clinicalNotes?.length) {
      ctx.clinicalNotes = activitiesData.clinicalNotes
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10)
        .map((n) => ({
          title: n.title,
          status: n.status,
          createdAt: n.created_at,
          summary: n.ai_summary || undefined,
        }));
    }

    return ctx;
  }, [patient, patientName, activitiesData, caseSummaryData, transcriptsMap]);

  // Супервизор всегда доступен (backend co-located)
  useEffect(() => {
    setIsAvailable(true);
  }, []);

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Мутация для сохранения беседы
  const saveMutation = useMutation({
    mutationFn: async (messagesToSave: SupervisorMessage[]) => {
      if (activeConversationId) {
        return updateSupervisorConversation(activeConversationId, {
          messages: messagesToSave as any,
        });
      }
      return saveSupervisorConversation(patientId, messagesToSave);
    },
    onSuccess: () => {
      const wasUpdate = !!activeConversationId;
      queryClient.invalidateQueries({ queryKey: ['supervisor-conversations', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'activities'] });
      setMessages([]);
      setActiveConversationId(null);
      toast({
        title: 'Успешно',
        description: wasUpdate ? 'Беседа обновлена' : 'Беседа сохранена в активностях пациента',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Ошибка',
        description: err.message || 'Не удалось сохранить беседу',
        variant: 'destructive',
      });
    },
  });

  const handleSend = async () => {
    if (!input.trim() || isLoading || !isAvailable) return;

    const userMessage: SupervisorMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const request: SupervisorRequest = {
        message: userMessage.content,
        patientId,
        patientName,
        conversationHistory: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        context: supervisorContext,
      };

      const response = await sendMessageToSupervisor(request);

      const assistantMessage: SupervisorMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: response.timestamp || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Error sending message:', err);
      setError(
        err instanceof Error ? err.message : 'Не удалось отправить сообщение супервизору'
      );
      
      // Удаляем последнее сообщение пользователя при ошибке
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation(); // Prevent event from bubbling to parent Tabs component
      handleSend();
    }
  };

  const handleSaveConversation = async () => {
    if (messages.length === 0) {
      toast({
        title: 'Нет сообщений',
        description: 'Нет сообщений для сохранения',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingConversation(true);
    setError(null);

    try {
      await saveMutation.mutateAsync(messages);
    } catch (err) {
      console.error('Error saving conversation:', err);
      setError(
        err instanceof Error ? err.message : 'Не удалось сохранить беседу'
      );
    } finally {
      setIsSavingConversation(false);
    }
  };

  const toggleConversationExpansion = (conversationId: string) => {
    setExpandedConversations((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });
  };

  const handleContinueConversation = (conversation: SupervisorConversationWithMessages) => {
    setMessages(conversation.messages || []);
    setActiveConversationId(conversation.id);
    setError(null);
    // Scroll to chat after state update
    setTimeout(() => {
      scrollAreaRef.current?.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const handleDetachConversation = () => {
    setActiveConversationId(null);
  };

  if (isAvailable === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Супервизор</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Супервизор недоступен. Проверьте настройки backend сервиса.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Чат с супервизором */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Супервизор</CardTitle>
          <Button
            onClick={handleSaveConversation}
            disabled={messages.length === 0 || isLoading || isSavingConversation}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {isSavingConversation ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Сохранить беседу
          </Button>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          <ScrollArea className="flex-1 px-6" ref={scrollAreaRef}>
            <div className="space-y-4 py-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Начните диалог с AI супервизором. Задайте вопрос или опишите ситуацию.
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {error && (
            <div className="px-6 pt-2">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          <div className="border-t p-4">
            {activeConversationId && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-md text-sm mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-muted-foreground truncate">Продолжение беседы</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 ml-auto flex-shrink-0"
                  onClick={handleDetachConversation}
                  title="Начать новую беседу"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Введите сообщение..."
                disabled={isLoading || !isAvailable}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || !isAvailable}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
              <Button
                onClick={handleSaveConversation}
                disabled={messages.length === 0 || isLoading || isSavingConversation}
                variant="outline"
                title="Сохранить беседу"
              >
                {isSavingConversation ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Сохраненные беседы */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Сохраненные беседы</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по беседам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingConversations ? (
            <div className="text-center text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
              Загрузка...
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchQuery.trim() ? 'Ничего не найдено' : 'Нет сохраненных бесед'}
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conversation) => {
                const isExpanded = expandedConversations.has(conversation.id);
                const firstMessage = conversation.messages?.[0]?.content || '';
                const preview = firstMessage.substring(0, 100) + (firstMessage.length > 100 ? '...' : '');

                return (
                  <div
                    key={conversation.id}
                    className="border border-border rounded-lg p-4 bg-muted/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                          <h4 className="font-medium text-sm">{conversation.title || 'Беседа с супервизором'}</h4>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                          <span>
                            {conversation.saved_at
                              ? formatDateTime(conversation.saved_at)
                              : conversation.started_at
                              ? formatDateTime(conversation.started_at)
                              : 'Нет даты'}
                          </span>
                          <span>{conversation.message_count || conversation.messages?.length || 0} сообщений</span>
                        </div>
                        {!isExpanded && preview && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                            {preview}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleContinueConversation(conversation)}
                          className="h-7 px-2"
                          title="Продолжить беседу"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleConversationExpansion(conversation.id)}
                          className="h-7 px-2"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        {(conversation.messages || []).filter(m => m != null).map((message, index) => (
                          <div
                            key={index}
                            className={`flex ${
                              message.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                message.role === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              <p className="text-xs opacity-70 mt-1">
                                {new Date(message.timestamp).toLocaleString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
