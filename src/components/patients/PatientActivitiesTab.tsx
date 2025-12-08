import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Loader2, ExternalLink, FileText, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPatientSessions } from "@/lib/supabase-sessions";
import { getClinicalNotesForPatient } from "@/lib/supabase-ai";
import { formatDateTime } from "@/lib/date-utils";
import { ClinicalNoteView } from "./ClinicalNoteView";
import type { Database } from "@/types/database.types";
import type { GeneratedClinicalNote } from "@/types/ai.types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

interface PatientActivitiesTabProps {
  patientId: string;
}

export function PatientActivitiesTab({ patientId }: PatientActivitiesTabProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<GeneratedClinicalNote[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [patientId]);

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

  // Группируем заметки по сессиям
  const sessionsWithNotes = sessions.map(session => ({
    session,
    notes: getNotesForSession(session.id),
  }));

  // Заметки без сессий (если есть)
  const orphanNotes = clinicalNotes.filter(
    note => !sessions.some(s => s.id === note.session_id)
  );

  return (
    <div className="space-y-4">
      {/* Сессии с заметками */}
      {sessionsWithNotes.map(({ session, notes }) => (
        <div key={session.id} className="space-y-3">
          {/* Сессия */}
          <div
            className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => handleSessionClick(session.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-medium">
                    {session.title?.replace(/^Запись\s/, 'Сессия ') || "Сессия без названия"}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                      session.status
                    )}`}
                  >
                    {getStatusLabel(session.status)}
                  </span>
                  {notes.length > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <FileText className="w-3 h-3" />
                      {notes.length} {notes.length === 1 ? 'заметка' : 'заметок'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {session.started_at && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{formatDateTime(session.started_at)}</span>
                    </div>
                  )}
                  {session.created_at && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>Создана: {formatDateTime(session.created_at)}</span>
                    </div>
                  )}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
            </div>
          </div>

          {/* Клинические заметки для этой сессии */}
          {notes.length > 0 && (
            <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
              {notes.map((note) => {
                const isExpanded = expandedNotes.has(note.id);
                return (
                  <div
                    key={note.id}
                    className="border border-border rounded-lg p-4 bg-muted/30"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <h4 className="font-medium text-sm">{note.title}</h4>
                          <Badge
                            variant={
                              note.generation_status === 'completed'
                                ? 'default'
                                : note.generation_status === 'generating'
                                ? 'secondary'
                                : 'destructive'
                            }
                            className="text-xs"
                          >
                            {note.generation_status === 'completed'
                              ? 'Готово'
                              : note.generation_status === 'generating'
                              ? 'Генерация'
                              : note.generation_status === 'failed'
                              ? 'Ошибка'
                              : 'Черновик'}
                          </Badge>
                          {note.status === 'finalized' && (
                            <Badge variant="outline" className="text-xs">
                              Финализировано
                            </Badge>
                          )}
                        </div>
                        {note.created_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDateTime(note.created_at)}
                          </p>
                        )}
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

                    {/* Краткое саммари (если есть) */}
                    {note.ai_summary && !isExpanded && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        {note.ai_summary}
                      </p>
                    )}

                    {/* Полная заметка */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <ClinicalNoteView clinicalNote={note} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Заметки без сессий */}
      {orphanNotes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Клинические заметки без привязки к сессии
          </h3>
          {orphanNotes.map((note) => {
            const isExpanded = expandedNotes.has(note.id);
            return (
              <div
                key={note.id}
                className="border border-border rounded-lg p-4 bg-muted/30"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h4 className="font-medium text-sm">{note.title}</h4>
                      <Badge
                        variant={
                          note.generation_status === 'completed'
                            ? 'default'
                            : note.generation_status === 'generating'
                            ? 'secondary'
                            : 'destructive'
                        }
                        className="text-xs"
                      >
                        {note.generation_status === 'completed'
                          ? 'Готово'
                          : note.generation_status === 'generating'
                          ? 'Генерация'
                          : note.generation_status === 'failed'
                          ? 'Ошибка'
                          : 'Черновик'}
                      </Badge>
                    </div>
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
                    {note.ai_summary}
                  </p>
                )}

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <ClinicalNoteView clinicalNote={note} />
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
