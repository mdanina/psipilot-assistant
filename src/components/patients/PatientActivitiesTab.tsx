import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Loader2, ExternalLink } from "lucide-react";
import { getPatientSessions } from "@/lib/supabase-sessions";
import { formatDateTime } from "@/lib/date-utils";
import type { Database } from "@/types/database.types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

interface PatientActivitiesTabProps {
  patientId: string;
}

export function PatientActivitiesTab({ patientId }: PatientActivitiesTabProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, [patientId]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getPatientSessions(patientId);

      if (error) {
        console.error("Error loading sessions:", error);
        return;
      }

      setSessions(data || []);
    } catch (error) {
      console.error("Error loading sessions:", error);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Нет активностей</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
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
      ))}
    </div>
  );
}
