import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Loader2, ExternalLink, FileText, Sparkles, ChevronDown, ChevronUp, Search, Paperclip, X, Trash2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { ClinicalNoteView } from "./ClinicalNoteView";
import { 
  usePatientActivities, 
  useSearchPatientSessions, 
  useDeleteSession, 
  useDeleteClinicalNote 
} from "@/hooks/usePatientActivities";
import type { Database } from "@/types/database.types";
import type { GeneratedClinicalNote } from "@/types/ai.types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

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
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    parts.push(
      <mark key={keyCounter++} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
        {text.slice(index, index + lowerQuery.length)}
      </mark>
    );
    lastIndex = index + lowerQuery.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

interface PatientActivitiesTabProps {
  patientId: string;
}

export function PatientActivitiesTab({ patientId }: PatientActivitiesTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'session' | 'note'; id: string; title: string } | null>(null);

  // React Query hooks for data fetching with automatic caching
  const { 
    data: activitiesData, 
    isLoading, 
    error: activitiesError 
  } = usePatientActivities(patientId);

  const { 
    data: searchResults = [], 
    isLoading: isSearching 
  } = useSearchPatientSessions(patientId, searchQuery);

  const deleteSessionMutation = useDeleteSession();
  const deleteNoteMutation = useDeleteClinicalNote();

  // Extract data from activitiesData and filter out any undefined/null values
  const sessions = (activitiesData?.sessions || []).filter((s): s is Session => s != null);
  const clinicalNotes = (activitiesData?.clinicalNotes || []).filter((n): n is GeneratedClinicalNote => n != null);
  const contentCounts = activitiesData?.contentCounts || new Map();

  // Show error if activities query failed
  useEffect(() => {
    if (activitiesError) {
      console.error("Error loading activities:", activitiesError);
      toast({
        title: "Ошибка",
        description: `Не удалось загрузить активности: ${activitiesError.message}`,
        variant: "destructive",
      });
    }
  }, [activitiesError, toast]);

  // Convert search results to Set for filtering
  const filteredSessionIds = useMemo(() => {
    if (!searchQuery.trim()) {
      return null;
    }
    return searchResults.length > 0 ? new Set(searchResults) : null;
  }, [searchQuery, searchResults]);

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      scheduled: "Запланирована",
      in_progress: "В процессе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      scheduled: "text-primary bg-primary/10",
      in_progress: "text-yellow-600 bg-yellow-50",
      completed: "text-green-600 bg-green-50",
      cancelled: "text-red-600 bg-red-50",
    };
    return colors[status] || "text-muted-foreground bg-muted";
  };

  const handleSessionClick = (sessionId: string) => {
    navigate(`/sessions?sessionId=${sessionId}`);
  };

  const toggleNoteExpansion = (noteId: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedNotes(newExpanded);
  };

  const getNotesForSession = (sessionId: string): GeneratedClinicalNote[] => {
    return clinicalNotes.filter(note => note.session_id === sessionId);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  // Delete handlers
  const handleDeleteClick = (type: 'session' | 'note', id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({ type, id, title });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'session') {
        deleteSessionMutation.mutate(deleteTarget.id, {
          onSuccess: () => {
            toast({
              title: "Сессия удалена",
              description: "Сессия успешно удалена",
            });
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            // Cache will be automatically invalidated by useDeleteSession hook
          },
          onError: (error: Error) => {
            toast({
              title: "Ошибка",
              description: error.message || "Не удалось удалить сессию",
              variant: "destructive",
            });
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
          },
        });
      } else {
        deleteNoteMutation.mutate(deleteTarget.id, {
          onSuccess: () => {
            toast({
              title: "Заметка удалена",
              description: "Клиническая заметка успешно удалена",
            });
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            // Cache will be automatically invalidated by useDeleteClinicalNote hook
          },
          onError: (error: Error) => {
            toast({
              title: "Ошибка",
              description: error.message || "Не удалось удалить заметку",
              variant: "destructive",
            });
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
          },
        });
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: "Ошибка",
        description: deleteTarget.type === 'session'
          ? "Не удалось удалить сессию"
          : "Не удалось удалить заметку",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  // Filter sessions based on search
  const filteredSessions = useMemo(() => {
    if (!filteredSessionIds) {
      return sessions;
    }
    return sessions.filter(s => filteredSessionIds.has(s.id));
  }, [sessions, filteredSessionIds]);

  // Group sessions with notes
  const sessionsWithNotes = useMemo(() => {
    return filteredSessions.map(session => ({
      session,
      notes: getNotesForSession(session.id),
    }));
  }, [filteredSessions, clinicalNotes]);

  // Orphan notes (notes without sessions in filtered list)
  const orphanNotes = useMemo(() => {
    if (filteredSessionIds) {
      return clinicalNotes.filter(
        note => !filteredSessions.some(s => s.id === note.session_id) &&
                filteredSessionIds.has(note.session_id)
      );
    }
    return clinicalNotes.filter(
      note => !sessions.some(s => s.id === note.session_id)
    );
  }, [clinicalNotes, sessions, filteredSessions, filteredSessionIds]);

  // Объединяем все активности в единый timeline
  type TimelineActivity = 
    | { type: 'session'; data: Session; notes: GeneratedClinicalNote[] }
    | { type: 'clinical_note'; data: GeneratedClinicalNote };

  const timelineActivities = useMemo(() => {
    const activities: TimelineActivity[] = [];

    // Добавляем сессии
    sessionsWithNotes.forEach(({ session, notes }) => {
      activities.push({
        type: 'session',
        data: session,
        notes,
      });
    });

    // Добавляем orphan notes
    orphanNotes.forEach(note => {
      activities.push({
        type: 'clinical_note',
        data: note,
      });
    });

    // Сортируем по дате (самые новые сверху)
    return activities.sort((a, b) => {
      const getDate = (activity: TimelineActivity): Date => {
        switch (activity.type) {
          case 'session':
            return new Date(activity.data.started_at || activity.data.created_at);
          case 'clinical_note':
            return new Date(activity.data.created_at);
        }
      };
      
      const dateA = getDate(a);
      const dateB = getDate(b);
      return dateB.getTime() - dateA.getTime(); // По убыванию (новые сверху)
    });
  }, [sessionsWithNotes, orphanNotes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0 && clinicalNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Нет активностей</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по содержимому сессий..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Search results info */}
      {searchQuery && filteredSessionIds && (
        <p className="text-sm text-muted-foreground">
          Найдено сессий: {filteredSessions.length}
        </p>
      )}

      {/* No results message */}
      {searchQuery && filteredSessions.length === 0 && !isSearching && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Ничего не найдено по запросу "{searchQuery}"</p>
          <Button variant="link" onClick={clearSearch} className="mt-2">
            Сбросить поиск
          </Button>
        </div>
      )}

      {/* Timeline: All activities sorted by date */}
      {timelineActivities.map((activity, index) => {
        // Render session
        if (activity.type === 'session') {
          const session = activity.data;
          const notes = activity.notes;
          return (
            <div key={session.id} className="space-y-3">
              {/* Session card */}
              <div
                className="group border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleSessionClick(session.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Title and status */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-medium truncate">
                        {session.title?.replace(/^Запись\s/, 'Сессия ') || "Сессия без названия"}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(
                          session.status
                        )}`}
                      >
                        {getStatusLabel(session.status)}
                      </span>
                    </div>

                    {/* AI Summary */}
                    {session.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        <HighlightedText text={session.summary} query={searchQuery} />
                      </p>
                    )}

                    {/* Meta info: date and content count */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {/* Date - show only one */}
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>{formatDateTime(session.started_at || session.created_at)}</span>
                      </div>

                      {/* Total content count */}
                      {(() => {
                        const counts = contentCounts.get(session.id);
                        const totalCount = counts?.totalCount || 0;
                        if (totalCount > 0) {
                          return (
                            <div className="flex items-center gap-1.5">
                              <Paperclip className="w-4 h-4 flex-shrink-0" />
                              <span>{totalCount} {getElementsLabel(totalCount)}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteClick('session', session.id, session.title || 'Сессия', e)}
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Удалить сессию"
                      >
                        <Trash2 className="w-4 h-4 flex-shrink-0" />
                        <span>Удалить</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Clinical notes for this session */}
              {notes.length > 0 && (
                <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
                  {notes.map((note) => {
                    const isExpanded = expandedNotes.has(note.id);
                    const isInProgress = note.generation_status === 'generating';
                    const hasFailed = note.generation_status === 'failed' || note.generation_status === 'partial_failure';

                    return (
                      <div
                        key={note.id}
                        className="border border-border rounded-lg p-4 bg-muted/30"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                              <h4 className="font-medium text-sm">{note.title}</h4>
                              {isInProgress && (
                                <Badge variant="secondary" className="text-xs">
                                  Генерация...
                                </Badge>
                              )}
                              {hasFailed && (
                                <Badge variant="destructive" className="text-xs">
                                  Ошибка
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleNoteExpansion(note.id);
                              }}
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

                        {note.ai_summary && !isExpanded && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                            <HighlightedText text={note.ai_summary} query={searchQuery} />
                          </p>
                        )}

                        {isExpanded && (
                          <div className="mt-3">
                            <ClinicalNoteView 
                              clinicalNote={note} 
                              searchQuery={searchQuery}
                              onDelete={(e) => handleDeleteClick('note', note.id, note.title, e)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // Render orphan clinical note
        if (activity.type === 'clinical_note') {
          const note = activity.data;
          const isExpanded = expandedNotes.has(note.id);
          const isInProgress = note.generation_status === 'generating';
          const hasFailed = note.generation_status === 'failed' || note.generation_status === 'partial_failure';

          return (
            <div
              key={note.id}
              className="border border-border rounded-lg p-4 bg-muted/30"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                    <h4 className="font-medium text-sm">{note.title}</h4>
                    {isInProgress && (
                      <Badge variant="secondary" className="text-xs">
                        Генерация...
                      </Badge>
                    )}
                    {hasFailed && (
                      <Badge variant="destructive" className="text-xs">
                        Ошибка
                      </Badge>
                    )}
                  </div>
                  {note.created_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(note.created_at)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleNoteExpansion(note.id)}
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

              {note.ai_summary && !isExpanded && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                  <HighlightedText text={note.ai_summary} query={searchQuery} />
                </p>
              )}

              {isExpanded && (
                <div className="mt-3">
                  <ClinicalNoteView 
                    clinicalNote={note} 
                    searchQuery={searchQuery}
                    onDelete={(e) => handleDeleteClick('note', note.id, note.title, e)}
                  />
                </div>
              )}
            </div>
          );
        }

        // Render supervisor conversation
        if (activity.type === 'supervisor_conversation') {
          const conversation = activity.data;
          if (!conversation || !conversation.id) {
            return null;
          }
          
          const isExpanded = expandedNotes.has(conversation.id);
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
                    <Badge variant="outline" className="text-xs">
                      {conversation.message_count} сообщений
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span>{formatDateTime(conversation.saved_at)}</span>
                    </div>
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
                    onClick={() => toggleNoteExpansion(conversation.id)}
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
        }

        return null;
      })}

      {/* Legacy: Sessions with notes (keeping for reference, will be removed) */}
      {false && sessionsWithNotes.map(({ session, notes }) => (
        <div key={session.id} className="space-y-3">
          {/* Session card */}
          <div
            className="group border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => handleSessionClick(session.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {/* Title and status */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="font-medium truncate">
                    {session.title?.replace(/^Запись\s/, 'Сессия ') || "Сессия без названия"}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(
                      session.status
                    )}`}
                  >
                    {getStatusLabel(session.status)}
                  </span>
                </div>

                {/* AI Summary */}
                {session.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    <HighlightedText text={session.summary} query={searchQuery} />
                  </p>
                )}

                {/* Meta info: date and content count */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  {/* Date - show only one */}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span>{formatDateTime(session.started_at || session.created_at)}</span>
                  </div>

                  {/* Total content count */}
                  {(() => {
                    const counts = contentCounts.get(session.id);
                    const totalCount = counts?.totalCount || 0;
                    if (totalCount > 0) {
                      return (
                        <div className="flex items-center gap-1.5">
                          <Paperclip className="w-4 h-4 flex-shrink-0" />
                          <span>{totalCount} {getElementsLabel(totalCount)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDeleteClick('session', session.id, session.title || 'Сессия', e)}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Удалить сессию"
                  >
                    <Trash2 className="w-4 h-4 flex-shrink-0" />
                    <span>Удалить</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Clinical notes for this session */}
          {notes.length > 0 && (
            <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
              {notes.map((note) => {
                const isExpanded = expandedNotes.has(note.id);
                const isInProgress = note.generation_status === 'generating';
                const hasFailed = note.generation_status === 'failed' || note.generation_status === 'partial_failure';

                return (
                  <div
                    key={note.id}
                    className="border border-border rounded-lg p-4 bg-muted/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                          <h4 className="font-medium text-sm">{note.title}</h4>
                          {/* Show badge only for in-progress or failed states */}
                          {isInProgress && (
                            <Badge variant="secondary" className="text-xs">
                              Генерация...
                            </Badge>
                          )}
                          {hasFailed && (
                            <Badge variant="destructive" className="text-xs">
                              Ошибка
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleNoteExpansion(note.id);
                          }}
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

                    {/* Brief summary (if available and not expanded) */}
                    {note.ai_summary && !isExpanded && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        <HighlightedText text={note.ai_summary} query={searchQuery} />
                      </p>
                    )}

                    {/* Full note */}
                    {isExpanded && (
                      <div className="mt-3">
                        <ClinicalNoteView 
                          clinicalNote={note} 
                          searchQuery={searchQuery}
                          onDelete={(e) => handleDeleteClick('note', note.id, note.title, e)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Legacy: Orphan notes (keeping for reference, will be removed) */}
      {false && orphanNotes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Клинические заметки без привязки к сессии
          </h3>
          {orphanNotes.map((note) => {
            const isExpanded = expandedNotes.has(note.id);
            const isInProgress = note.generation_status === 'generating';
            const hasFailed = note.generation_status === 'failed' || note.generation_status === 'partial_failure';

            return (
              <div
                key={note.id}
                className="border border-border rounded-lg p-4 bg-muted/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                      <h4 className="font-medium text-sm">{note.title}</h4>
                      {isInProgress && (
                        <Badge variant="secondary" className="text-xs">
                          Генерация...
                        </Badge>
                      )}
                      {hasFailed && (
                        <Badge variant="destructive" className="text-xs">
                          Ошибка
                        </Badge>
                      )}
                    </div>
                    {/* Show date only for orphan notes since they don't have a session card */}
                    {note.created_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(note.created_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleNoteExpansion(note.id)}
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

                {note.ai_summary && !isExpanded && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                    <HighlightedText text={note.ai_summary} query={searchQuery} />
                  </p>
                )}

                {isExpanded && (
                  <div className="mt-3">
                    <ClinicalNoteView 
                      clinicalNote={note} 
                      searchQuery={searchQuery}
                      onDelete={(e) => handleDeleteClick('note', note.id, note.title, e)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === 'session' ? 'Удалить сессию?' : 'Удалить клиническую заметку?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'session'
                ? `Вы уверены, что хотите удалить сессию "${deleteTarget?.title}"? Все связанные данные (записи, заметки) также будут скрыты.`
                : `Вы уверены, что хотите удалить заметку "${deleteTarget?.title}"?`}
              <br /><br />
              <span className="text-muted-foreground text-xs">
                Данные не удаляются физически и могут быть восстановлены при необходимости.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSessionMutation.isPending || deleteNoteMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteSessionMutation.isPending || deleteNoteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {(deleteSessionMutation.isPending || deleteNoteMutation.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                'Удалить'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Helper function to get correct Russian plural form for "элемент"
 */
function getElementsLabel(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return "элементов";
  }

  if (lastDigit === 1) {
    return "элемент";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "элемента";
  }

  return "элементов";
}
