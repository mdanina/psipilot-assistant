import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Loader2, ExternalLink, FileText, Sparkles, ChevronDown, ChevronUp, Search, Paperclip, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPatientSessions, getSessionsContentCounts, searchPatientSessions, type SessionContentCounts } from "@/lib/supabase-sessions";
import { getClinicalNotesForPatient } from "@/lib/supabase-ai";
import { formatDateTime } from "@/lib/date-utils";
import { ClinicalNoteView } from "./ClinicalNoteView";
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<GeneratedClinicalNote[]>([]);
  const [contentCounts, setContentCounts] = useState<Map<string, SessionContentCounts>>(new Map());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSessionIds, setFilteredSessionIds] = useState<Set<string> | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadData();
  }, [patientId]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessionIds(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await searchPatientSessions(patientId, searchQuery);
        if (data) {
          setFilteredSessionIds(new Set(data));
        }
      } catch (error) {
        console.error("Error searching sessions:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, patientId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [sessionsData, notesData] = await Promise.all([
        getPatientSessions(patientId),
        getClinicalNotesForPatient(patientId),
      ]);

      if (sessionsData.error) {
        console.error("Error loading sessions:", sessionsData.error);
      } else {
        setSessions(sessionsData.data || []);

        // Load content counts for all sessions
        if (sessionsData.data && sessionsData.data.length > 0) {
          const sessionIds = sessionsData.data.map(s => s.id);
          const counts = await getSessionsContentCounts(sessionIds);
          setContentCounts(counts);
        }
      }

      setClinicalNotes(notesData || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
    setFilteredSessionIds(null);
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

      {/* Sessions with notes */}
      {sessionsWithNotes.map(({ session, notes }) => (
        <div key={session.id} className="space-y-3">
          {/* Session card */}
          <div
            className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
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
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
            </div>
          </div>

          {/* Clinical notes for this session */}
          {notes.length > 0 && (
            <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
              {notes.map((note) => {
                const isExpanded = expandedNotes.has(note.id);
                const isInProgress = note.generation_status === 'generating';
                const hasFailed = note.generation_status === 'failed';

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

                    {/* Brief summary (if available and not expanded) */}
                    {note.ai_summary && !isExpanded && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        <HighlightedText text={note.ai_summary} query={searchQuery} />
                      </p>
                    )}

                    {/* Full note */}
                    {isExpanded && (
                      <div className="mt-3">
                        <ClinicalNoteView clinicalNote={note} searchQuery={searchQuery} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Orphan notes (without session) */}
      {orphanNotes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Клинические заметки без привязки к сессии
          </h3>
          {orphanNotes.map((note) => {
            const isExpanded = expandedNotes.has(note.id);
            const isInProgress = note.generation_status === 'generating';
            const hasFailed = note.generation_status === 'failed';

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

                {note.ai_summary && !isExpanded && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                    <HighlightedText text={note.ai_summary} query={searchQuery} />
                  </p>
                )}

                {isExpanded && (
                  <div className="mt-3">
                    <ClinicalNoteView clinicalNote={note} searchQuery={searchQuery} />
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
