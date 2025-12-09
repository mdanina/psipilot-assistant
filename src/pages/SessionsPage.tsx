import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Plus, FileText, Circle, User, Link2, Loader2, Mic, Pause, Play, Square, Sparkles, ChevronDown, RefreshCw, Trash2, X, File, Upload, Search } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { PatientCombobox } from "@/components/ui/patient-combobox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { linkSessionToPatient, getSession, createSession, deleteSession, completeSession } from "@/lib/supabase-sessions";
import { getSessionRecordings, getRecordingStatus, createRecording, uploadAudioFile, updateRecording, startTranscription, syncTranscriptionStatus, deleteRecording } from "@/lib/supabase-recordings";
import { getPatients } from "@/lib/supabase-patients";
import { getSessionNotes, createSessionNote, deleteSessionNote, getCombinedTranscriptWithNotes } from "@/lib/supabase-session-notes";
import { getClinicalNotesForSession, generateClinicalNote } from "@/lib/supabase-ai";
import { SessionNotesDialog } from "@/components/sessions/SessionNotesDialog";
import { CreateSessionDialog } from "@/components/sessions/CreateSessionDialog";
import { TemplatesLibrary } from "@/components/analysis/TemplatesLibrary";
import { ClinicalNotesOutput } from "@/components/analysis/output-panel/ClinicalNotesOutput";
import { GenerationProgress } from "@/components/analysis/GenerationProgress";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { Database } from "@/types/database.types";
import type { GeneratedClinicalNote } from "@/types/ai.types";

type Session = Database['public']['Tables']['sessions']['Row'];
type Recording = Database['public']['Tables']['recordings']['Row'];
type Patient = Database['public']['Tables']['patients']['Row'];
type SessionNote = Database['public']['Tables']['session_notes']['Row'];

const SessionsPage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<Set<string>>(new Set());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deletingRecordingId, setDeletingRecordingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [closeSessionDialogOpen, setCloseSessionDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Session notes state
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);

  // AI Analysis state
  const [clinicalNotes, setClinicalNotes] = useState<GeneratedClinicalNote[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Create session dialog state
  const [createSessionDialogOpen, setCreateSessionDialogOpen] = useState(false);
  
  // Recording state
  const [isRecordingInSession, setIsRecordingInSession] = useState(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const currentRecordingSessionIdRef = useRef<string | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

  // Audio recorder hook
  const {
    isRecording,
    isPaused,
    isStopped,
    recordingTime,
    audioBlob,
    error: recorderError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    reset,
  } = useAudioRecorder();
  
  // Show recorder errors
  useEffect(() => {
    if (recorderError) {
      toast({
        title: "Ошибка записи",
        description: recorderError,
        variant: "destructive",
      });
    }
  }, [recorderError, toast]);

  // Load sessions
  useEffect(() => {
    loadSessions();
    loadPatients();
  }, [profile]);

  // Handle navigation with session ID from ScribePage
  useEffect(() => {
    if (location.state?.sessionId) {
      const sessionId = location.state.sessionId;
      // Wait for sessions to load, then select the session
      setTimeout(() => {
        // Add to open tabs
        setOpenTabs(prev => {
          const newTabs = new Set(prev);
          newTabs.add(sessionId);
          return newTabs;
        });
        setActiveSession(sessionId);
        // Clear location state
        navigate(location.pathname, { replace: true, state: {} });
      }, 500);
    }
  }, [location.state, navigate, location.pathname]);

  // Load recordings and notes when session changes
  // Load clinical notes for active session
  const loadClinicalNotes = async (sessionId: string) => {
    try {
      const notes = await getClinicalNotesForSession(sessionId);
      setClinicalNotes(notes);
    } catch (error) {
      console.error('Error loading clinical notes:', error);
    }
  };

  useEffect(() => {
    if (activeSession) {
      loadRecordings(activeSession);
      loadSessionNotes(activeSession);
      loadClinicalNotes(activeSession);
    }
  }, [activeSession]);

  // Auto-refresh recordings ONLY if there are pending/processing transcriptions
  useEffect(() => {
    if (!activeSession) return;

    // Check if there are any recordings that need polling
    const hasPendingTranscriptions = recordings.some(
      r => r.session_id === activeSession &&
           (r.transcription_status === 'pending' || r.transcription_status === 'processing')
    );

    // Only set up interval if there are pending transcriptions
    if (!hasPendingTranscriptions) return;

    const refreshInterval = setInterval(() => {
      loadRecordings(activeSession);
    }, 5000);

    return () => clearInterval(refreshInterval);
  }, [activeSession, recordings]);

  // Refresh recordings when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeSession) {
        loadRecordings(activeSession);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeSession]);

  const loadSessions = async (): Promise<Session[]> => {
    if (!profile?.clinic_id) return [];

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('clinic_id', profile.clinic_id)
        .is('deleted_at', null) // Only get non-deleted sessions
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const sessionsData = data || [];
      setSessions(sessionsData);

      // On initial load (empty openTabs), add all sessions
      // Otherwise, only keep sessions that are still valid (not deleted from DB)
      setOpenTabs(prev => {
        const validSessionIds = new Set(sessionsData.map(s => s.id));

        // If openTabs is empty (initial load), add all sessions
        if (prev.size === 0) {
          return validSessionIds;
        }

        // Otherwise, only keep tabs that still exist in the database
        const newTabs = new Set<string>();
        prev.forEach(id => {
          if (validSessionIds.has(id)) {
            newTabs.add(id);
          }
        });
        return newTabs;
      });

      if (sessionsData.length > 0 && !activeSession) {
        setActiveSession(sessionsData[0].id);
      }
      return sessionsData;
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить сессии",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      const { data, error } = await getPatients();
      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadRecordings = async (sessionId: string) => {
    try {
      const recordingsData = await getSessionRecordings(sessionId);
      setRecordings(recordingsData);

      // Check and sync old processing recordings immediately
      recordingsData.forEach(async (recording) => {
        if (recording.transcription_status === 'processing' && recording.transcript_id) {
          // Check if recording is old (more than 2 minutes old)
          const createdAt = new Date(recording.created_at);
          const now = new Date();
          const minutesSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60);
          
          // If recording is older than 2 minutes, sync immediately
          if (minutesSinceCreated > 2) {
            try {
              console.log(`Syncing old recording ${recording.id} immediately`);
              await syncTranscriptionStatus(recording.id, transcriptionApiUrl);
              // Reload recordings after sync
              const updatedRecordings = await getSessionRecordings(sessionId);
              setRecordings(updatedRecordings);
            } catch (syncError) {
              console.warn('Failed to sync old recording:', syncError);
            }
          }
        }
        
        // Start polling for pending and processing recordings
        if (recording.transcription_status === 'pending' || recording.transcription_status === 'processing') {
          startPollingRecording(recording.id, sessionId);
        }
      });
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const loadSessionNotes = async (sessionId: string) => {
    try {
      const notesData = await getSessionNotes(sessionId);
      setSessionNotes(notesData);
    } catch (error) {
      console.error('Error loading session notes:', error);
    }
  };

  const handleCreateNote = async (content: string, source: 'manual' | 'file', filename?: string) => {
    if (!activeSession || !user) {
      throw new Error('Необходимо выбрать сессию');
    }

    await createSessionNote({
      sessionId: activeSession,
      userId: user.id,
      content,
      source,
      originalFilename: filename,
    });

    // Reload notes
    await loadSessionNotes(activeSession);
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteSessionNote(noteId);
      toast({
        title: "Успешно",
        description: "Заметка удалена",
      });
      // Reload notes
      if (activeSession) {
        await loadSessionNotes(activeSession);
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить заметку",
        variant: "destructive",
      });
    }
  };

  // Polling function with cleanup and max attempts
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingAttemptsRef = useRef<Map<string, number>>(new Map());
  const MAX_POLLING_ATTEMPTS = 120; // 4 minutes max (120 * 2 seconds)

  const startPollingRecording = (recordingId: string, sessionId: string) => {
    // Clear existing polling for this recording
    const existingInterval = pollingIntervalsRef.current.get(recordingId);
    if (existingInterval) {
      clearTimeout(existingInterval);
    }

    // Reset attempts if not already polling
    if (!pollingAttemptsRef.current.has(recordingId)) {
      pollingAttemptsRef.current.set(recordingId, 0);
    }

    const checkStatus = async () => {
      try {
        const attempts = pollingAttemptsRef.current.get(recordingId) || 0;
        
        if (attempts >= MAX_POLLING_ATTEMPTS) {
          console.warn(`Max polling attempts reached for recording ${recordingId}`);
          pollingIntervalsRef.current.delete(recordingId);
          pollingAttemptsRef.current.delete(recordingId);
          return;
        }

        pollingAttemptsRef.current.set(recordingId, attempts + 1);
        
        // Sync from AssemblyAI if processing for more than 15 attempts (30 seconds)
        // This helps when webhook is not configured
        const shouldSync = attempts > 15;
        const status = await getRecordingStatus(recordingId, transcriptionApiUrl, shouldSync);
        
        if (status.status === 'completed' || status.status === 'failed') {
          // Reload recordings to update UI
          await loadRecordings(sessionId);
          // Cleanup
          pollingIntervalsRef.current.delete(recordingId);
          pollingAttemptsRef.current.delete(recordingId);
        } else if (status.status === 'pending' || status.status === 'processing') {
          // If still processing after many attempts, try manual sync
          if (attempts > 30 && attempts % 10 === 0) {
            try {
              await syncTranscriptionStatus(recordingId, transcriptionApiUrl);
              // Check again immediately after sync
              const syncedStatus = await getRecordingStatus(recordingId);
              if (syncedStatus.status === 'completed' || syncedStatus.status === 'failed') {
                await loadRecordings(sessionId);
                pollingIntervalsRef.current.delete(recordingId);
                pollingAttemptsRef.current.delete(recordingId);
                return;
              }
            } catch (syncError) {
              console.warn('Sync failed, continuing polling:', syncError);
            }
          }
          
          // Continue polling
          const interval = setTimeout(checkStatus, 2000);
          pollingIntervalsRef.current.set(recordingId, interval);
        }
      } catch (error) {
        console.error('Error checking transcription status:', error);
        // Retry after error
        const interval = setTimeout(() => checkStatus(), 5000);
        pollingIntervalsRef.current.set(recordingId, interval);
      }
    };

    // Start polling after a short delay
    const interval = setTimeout(checkStatus, 2000);
    pollingIntervalsRef.current.set(recordingId, interval);
  };

  // Close tab (just hide it, don't delete session)
  // But if session is not linked to patient, show dialog to link or delete
  // For linked sessions, also complete the session when closing
  const handleCloseSession = async (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent session selection

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // If session is linked to patient, complete it and close the tab
    if (session.patient_id) {
      try {
        // Complete the session (set status to 'completed', set end time, calculate duration)
        await completeSession(sessionId);

        // Update session status locally (don't reload to avoid race condition)
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, status: 'completed' } : s
        ));

        // Remove from open tabs
        setOpenTabs(prev => {
          const newTabs = new Set(prev);
          newTabs.delete(sessionId);
          return newTabs;
        });

        // If closed session was active, select another one from remaining open tabs
        if (activeSession === sessionId) {
          // We need to calculate remaining tabs manually since state hasn't updated yet
          const remainingOpenTabIds = [...openTabs].filter(id => id !== sessionId);
          const remainingSessions = sessions.filter(s => remainingOpenTabIds.includes(s.id));
          if (remainingSessions.length > 0) {
            setActiveSession(remainingSessions[0].id);
          } else {
            setActiveSession(null);
          }
        }

        toast({
          title: "Сессия завершена",
          description: "Сессия успешно завершена и закрыта",
        });
      } catch (error) {
        console.error('Error completing session:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось завершить сессию. Попробуйте ещё раз.",
          variant: "destructive",
        });
      }
    } else {
      // If not linked, show dialog - user must link or delete
      setClosingSessionId(sessionId);
      setCloseSessionDialogOpen(true);
    }
  };

  const handleLinkAndCloseSession = async () => {
    if (!closingSessionId || !selectedPatientId) return;

    try {
      // First link session to patient
      await linkSessionToPatient(closingSessionId, selectedPatientId);

      // Then complete the session
      await completeSession(closingSessionId);

      // Update session locally (don't reload to avoid race condition)
      setSessions(prev => prev.map(s =>
        s.id === closingSessionId
          ? { ...s, patient_id: selectedPatientId, status: 'completed' }
          : s
      ));

      // Remove from open tabs (close the tab)
      setOpenTabs(prev => {
        const newTabs = new Set(prev);
        newTabs.delete(closingSessionId);
        return newTabs;
      });

      // If closed session was active, select another one from remaining open tabs
      if (activeSession === closingSessionId) {
        const remainingOpenTabIds = [...openTabs].filter(id => id !== closingSessionId);
        const remainingSessions = sessions.filter(s => remainingOpenTabIds.includes(s.id));
        if (remainingSessions.length > 0) {
          setActiveSession(remainingSessions[0].id);
        } else {
          setActiveSession(null);
        }
      }

      toast({
        title: "Успешно",
        description: "Сессия привязана к пациенту и завершена",
      });

      setCloseSessionDialogOpen(false);
      setClosingSessionId(null);
      setSelectedPatientId("");
    } catch (error) {
      console.error('Error linking and closing session:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось привязать и завершить сессию",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSession = async () => {
    if (!closingSessionId) return;
    
    try {
      await deleteSession(closingSessionId);
      toast({
        title: "Успешно",
        description: "Сессия удалена",
      });
      
      // If deleted session was active, select another one
      if (activeSession === closingSessionId) {
        const remainingSessions = sessions.filter(s => s.id !== closingSessionId);
        if (remainingSessions.length > 0) {
          setActiveSession(remainingSessions[0].id);
        } else {
          setActiveSession(null);
        }
      }
      
      await loadSessions();
      setCloseSessionDialogOpen(false);
      setClosingSessionId(null);
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить сессию",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    return () => {
      pollingIntervalsRef.current.forEach((interval) => clearTimeout(interval));
      pollingIntervalsRef.current.clear();
      pollingAttemptsRef.current.clear();
    };
  }, []);

  const handleDeleteRecording = async (recordingId: string) => {
    try {
      await deleteRecording(recordingId);
      toast({
        title: "Успешно",
        description: "Запись удалена",
      });
      // Reload recordings
      if (activeSession) {
        await loadRecordings(activeSession);
      }
      setDeleteDialogOpen(false);
      setDeletingRecordingId(null);
    } catch (error) {
      console.error('Error deleting recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить сессию",
        variant: "destructive",
      });
    }
  };

  const handleLinkToPatient = async () => {
    if (!activeSession || !selectedPatientId) return;

    setIsLinking(true);
    // Save current session ID before reloading
    const savedSessionId = activeSession;
    try {
      await linkSessionToPatient(activeSession, selectedPatientId);
      toast({
        title: "Успешно",
        description: "Сессия привязана к пациенту",
      });
      setLinkDialogOpen(false);
      setSelectedPatientId("");
      // Reload sessions and restore active session
      const updatedSessions = await loadSessions();
      // Restore active session if it still exists, otherwise select the first one
      const sessionToSelect = updatedSessions.find(s => s.id === savedSessionId) || updatedSessions[0];
      if (sessionToSelect) {
        setActiveSession(sessionToSelect.id);
      } else if (updatedSessions.length > 0) {
        setActiveSession(updatedSessions[0].id);
      } else {
        setActiveSession(null);
      }
    } catch (error) {
      console.error('Error linking session to patient:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось привязать сессию к пациенту",
        variant: "destructive",
      });
    } finally {
      setIsLinking(false);
    }
  };

  // Handle create new session
  const handleCreateNewSession = async (patientId: string | null, title?: string) => {
    if (!user || !profile?.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация и привязка к клинике",
        variant: "destructive",
      });
      throw new Error("Not authenticated");
    }

    try {
      // Generate default title if not provided
      const sessionTitle = title || `Сессия ${new Date().toLocaleString('ru-RU')}`;

      // Create session
      const newSession = await createSession({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: patientId || undefined,
        title: sessionTitle,
      });

      // If patient is selected, link session to patient (creates consents)
      if (patientId) {
        await linkSessionToPatient(newSession.id, patientId);
      }

      toast({
        title: "Успешно",
        description: patientId
          ? "Сессия создана и привязана к пациенту"
          : "Сессия создана. Не забудьте привязать её к пациенту.",
      });

      // Add new session to open tabs
      setOpenTabs(prev => new Set(prev).add(newSession.id));
      
      // Reload sessions and select the new one
      await loadSessions();
      setActiveSession(newSession.id);
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать сессию",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Filter sessions by search query and open tabs
  const filteredSessions = useMemo(() => {
    // First filter by open tabs
    let result = sessions.filter(session => openTabs.has(session.id));
    
    // Then filter by search query if provided
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((session) => {
        // Search by title
        if (session.title && session.title.toLowerCase().includes(query)) {
          return true;
        }

        // Search by patient name
        if (session.patient_id) {
          const patient = patients.find((p) => p.id === session.patient_id);
          if (patient && patient.name && patient.name.toLowerCase().includes(query)) {
            return true;
          }
        }

        // Search by date (formatted date string)
        const sessionDate = new Date(session.created_at);
        const dateStr = sessionDate.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        if (dateStr.includes(query)) {
          return true;
        }

        // Search by status
        const statusMap: Record<string, string> = {
          scheduled: 'запланировано',
          in_progress: 'в процессе',
          completed: 'завершено',
          cancelled: 'отменено',
        };
        if (statusMap[session.status]?.includes(query)) {
          return true;
        }

        return false;
      });
    }
    
    return result;
  }, [sessions, patients, searchQuery, openTabs]);

  const currentSession = filteredSessions.find(s => s.id === activeSession) || sessions.find(s => s.id === activeSession);
  const currentRecordings = recordings.filter(r => r.session_id === activeSession);
  const currentNotes = sessionNotes.filter(n => n.session_id === activeSession);

  // Get transcript text from recordings
  const rawTranscriptText = currentRecordings
    .filter(r => r.transcription_status === 'completed' && r.transcription_text)
    .map(r => r.transcription_text)
    .join('\n\n');

  // Combined transcript with specialist notes
  const transcriptText = getCombinedTranscriptWithNotes(rawTranscriptText, currentNotes);

  // Handle start recording in session context
  const handleStartRecordingInSession = async () => {
    if (!user || !profile?.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация и привязка к клинике",
        variant: "destructive",
      });
      return;
    }

    if (!activeSession) {
      toast({
        title: "Ошибка",
        description: "Выберите сессию для записи",
        variant: "destructive",
      });
      return;
    }

    try {
      await startRecording();
      setIsRecordingInSession(true);
      currentRecordingSessionIdRef.current = activeSession;
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось начать сессию",
        variant: "destructive",
      });
    }
  };

  // Handle stop recording in session context
  const handleStopRecordingInSession = async () => {
    if (!currentRecordingSessionIdRef.current || !user) {
      await stopRecording();
      reset();
      setIsRecordingInSession(false);
      return;
    }

    const sessionId = currentRecordingSessionIdRef.current;
    const duration = recordingTime;

    setIsSavingRecording(true);

    try {
      // Stop recording and get the blob directly
      const blob = await stopRecording();

      if (!blob) {
        throw new Error('Не удалось получить аудио данные');
      }

      // Create recording record
      const recording = await createRecording({
        sessionId,
        userId: user.id,
        fileName: `recording-${Date.now()}.webm`,
      });

      // Determine MIME type from blob
      const mimeType = blob.type || 'audio/webm';

      // Upload audio file
      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob: blob,
        fileName: recording.file_name || `recording-${recording.id}.webm`,
        mimeType,
      });

      // Update recording with duration
      await updateRecording(recording.id, {
        duration_seconds: duration,
      });

      // Start transcription
      try {
        await startTranscription(recording.id, transcriptionApiUrl);
        toast({
          title: "Успешно",
          description: "Сессия сохранена. Транскрипция запущена.",
        });
      } catch (transcriptionError) {
        console.error('Error starting transcription:', transcriptionError);
        toast({
          title: "Предупреждение",
          description: "Сессия сохранена, но транскрипция не запущена",
          variant: "default",
        });
      }

      // Reload recordings
      await loadRecordings(sessionId);

      reset();
      setIsRecordingInSession(false);
      currentRecordingSessionIdRef.current = null;
    } catch (error) {
      console.error('Error saving recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

      // More detailed error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Failed to create recording')) {
        userFriendlyMessage = 'Не удалось создать сессию в базе данных. Проверьте подключение к Supabase.';
      } else if (errorMessage.includes('Failed to upload audio file')) {
        userFriendlyMessage = 'Не удалось загрузить аудио файл. Проверьте, что bucket "recordings" создан в Supabase Storage.';
      } else if (errorMessage.includes('row-level security')) {
        userFriendlyMessage = 'Ошибка прав доступа. Убедитесь, что вы авторизованы и имеете права на создание записей.';
      }

      toast({
        title: "Ошибка",
        description: userFriendlyMessage,
        variant: "destructive",
      });

      reset();
      setIsRecordingInSession(false);
      currentRecordingSessionIdRef.current = null;
    } finally {
      setIsSavingRecording(false);
    }
  };

  // Handle cancel recording
  const handleCancelRecordingInSession = () => {
    cancelRecording();
    reset();
    setIsRecordingInSession(false);
    currentRecordingSessionIdRef.current = null;
  };

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")} : ${secs.toString().padStart(2, "0")}`;
  };

  // Get audio duration from file
  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(Math.floor(audio.duration));
      });
      
      audio.addEventListener('error', (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось определить длительность аудио'));
      });
      
      audio.src = url;
    });
  };

  // Handle audio file upload
  const handleUploadAudioFile = async (file: File) => {
    if (!user || !profile?.clinic_id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация и привязка к клинике",
        variant: "destructive",
      });
      return;
    }

    if (!activeSession) {
      toast({
        title: "Ошибка",
        description: "Выберите сессию для загрузки аудио",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Ошибка",
        description: `Неподдерживаемый формат файла. Поддерживаемые форматы: ${allowedTypes.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAudio(true);

    try {
      // Get audio duration
      let duration: number | null = null;
      try {
        duration = await getAudioDuration(file);
      } catch (error) {
        console.warn('Could not determine audio duration:', error);
        // Continue without duration
      }

      // Read file as Blob
      const audioBlob = file;

      // Create recording record
      const recording = await createRecording({
        sessionId: activeSession,
        userId: user.id,
        fileName: file.name,
      });

      // Upload audio file
      await uploadAudioFile({
        recordingId: recording.id,
        audioBlob,
        fileName: file.name,
        mimeType: file.type,
      });

      // Update recording with duration if available
      if (duration !== null) {
        await updateRecording(recording.id, {
          duration_seconds: duration,
        });
      }

      // Start transcription
      try {
        await startTranscription(recording.id, transcriptionApiUrl);
        toast({
          title: "Успешно",
          description: "Аудио файл загружен. Транскрипция запущена.",
        });
      } catch (transcriptionError) {
        console.error('Error starting transcription:', transcriptionError);
        toast({
          title: "Предупреждение",
          description: "Аудио файл загружен, но транскрипция не запущена",
          variant: "default",
        });
      }

      // Reload recordings
      await loadRecordings(activeSession);
    } catch (error) {
      console.error('Error uploading audio file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Failed to create recording')) {
        userFriendlyMessage = 'Не удалось создать сессию в базе данных. Проверьте подключение к Supabase.';
      } else if (errorMessage.includes('Failed to upload audio file')) {
        userFriendlyMessage = 'Не удалось загрузить аудио файл. Проверьте, что bucket "recordings" создан в Supabase Storage.';
      } else if (errorMessage.includes('row-level security')) {
        userFriendlyMessage = 'Ошибка прав доступа. Убедитесь, что вы авторизованы и имеете права на создание записей.';
      }

      toast({
        title: "Ошибка",
        description: userFriendlyMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploadingAudio(false);
      // Reset file input
      if (audioFileInputRef.current) {
        audioFileInputRef.current.value = '';
      }
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadAudioFile(file);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="px-6 py-3 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по сессиям (название, пациент, дата, статус)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        
        {/* Session tabs */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Загрузка...</span>
            </div>
          ) : (
            <>
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors whitespace-nowrap group ${
                activeSession === session.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <button
                onClick={() => {
                  // Add to open tabs if not already there
                  setOpenTabs(prev => {
                    const newTabs = new Set(prev);
                    newTabs.add(session.id);
                    return newTabs;
                  });
                  setActiveSession(session.id);
                }}
                className="flex items-center gap-2 flex-1"
              >
                <Circle className={`w-2 h-2 ${!session.patient_id ? "text-destructive" : "text-success"} fill-current`} />
                {(session.title?.replace(/^Запись\s/, 'Сессия ') || `Сессия ${new Date(session.created_at).toLocaleDateString('ru-RU')}`)}
                {!session.patient_id && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    Не привязано
                  </Badge>
                )}
              </button>
              <button
                onClick={(e) => handleCloseSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                title="Закрыть сессию"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
              <button
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                onClick={() => setCreateSessionDialogOpen(true)}
                title="Создать новую сессию"
              >
            <Plus className="w-4 h-4" />
          </button>
            </>
          )}
        </div>
        
        {/* Main content - 3 колонки: исходники, библиотека шаблонов, результат */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Левая колонка - Исходники (транскрипт, заметки) */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <div className="h-full border-r border-border flex flex-col">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-foreground">Ввод информации о пациенте</h2>
                {currentSession && !currentSession.patient_id && (
                  <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Link2 className="w-4 h-4" />
                        Привязать к пациенту
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Привязать сессию к пациенту</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <PatientCombobox
                          patients={patients}
                          value={selectedPatientId}
                          onValueChange={setSelectedPatientId}
                          placeholder="Выберите пациента"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setLinkDialogOpen(false)}
                            disabled={isLinking}
                          >
                            Отмена
                          </Button>
                          <Button
                            onClick={handleLinkToPatient}
                            disabled={!selectedPatientId || isLinking}
                          >
                            {isLinking ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Привязка...
                              </>
                            ) : (
                              "Привязать"
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {currentSession?.patient_id && (
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                    <User className="w-3 h-3" />
                    Привязано к пациенту
                </Badge>
                {(() => {
                  const linkedPatient = patients.find(p => p.id === currentSession.patient_id);
                  return linkedPatient ? (
                    <span className="text-sm text-foreground font-medium">
                      {linkedPatient.name}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Загрузка...
                    </span>
                  );
                })()}
              </div>
              )}
            </div>
            
            <div className="flex-1 p-6 overflow-auto">
              {/* Show transcript text if available */}
              {transcriptText && (
                <div className="mb-6 prose prose-sm max-w-none">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Объединенный транскрипт</h3>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans bg-muted/50 p-4 rounded-lg">{transcriptText}</pre>
                </div>
              )}
              
              {/* Always show list of recordings with delete buttons */}
              <div className="space-y-4">
                {currentRecordings.length > 0 ? (
                  currentRecordings.map((recording) => (
                    <div key={recording.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {(recording.file_name?.replace(/^Запись\s/, 'Сессия ') || 'Сессия')}
                          </span>
                          <div className="flex items-center gap-2">
                            {(recording.transcription_status === 'processing' || recording.transcription_status === 'pending') && recording.transcript_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await syncTranscriptionStatus(recording.id, transcriptionApiUrl);
                                    await loadRecordings(activeSession || '');
                                    toast({
                                      title: "Синхронизация",
                                      description: "Статус транскрипции обновлен",
                                    });
                                  } catch (error) {
                                    console.error('Error syncing transcription:', error);
                                    toast({
                                      title: "Ошибка",
                                      description: "Не удалось синхронизировать транскрипцию",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                className="h-6 px-2 text-xs"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Синхронизировать
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeletingRecordingId(recording.id);
                                setDeleteDialogOpen(true);
                              }}
                              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <Badge
                              variant={
                                recording.transcription_status === 'completed'
                                  ? 'default'
                                  : recording.transcription_status === 'processing'
                                  ? 'secondary'
                                  : 'destructive'
                              }
                            >
                              {recording.transcription_status === 'completed'
                                ? 'Завершено'
                                : recording.transcription_status === 'processing'
                                ? 'Обработка...'
                                : recording.transcription_status === 'failed'
                                ? 'Ошибка'
                                : 'Ожидание'}
                            </Badge>
                          </div>
                        </div>
                        {recording.transcription_status === 'completed' && recording.transcription_text && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {recording.transcription_text.substring(0, 200)}...
                          </p>
                        )}
                        {recording.transcription_error && (
                          <p className="text-sm text-destructive mt-2">
                            Ошибка: {recording.transcription_error}
                          </p>
                        )}
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Нет сессий для этой встречи. Начните запись ниже.
                  </p>
                )}
              </div>

              {/* Session notes section */}
              {currentNotes.length > 0 && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Заметки специалиста</h3>
                  </div>
                  {currentNotes.map((note) => (
                    <div key={note.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <File className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {note.original_filename || 'Заметка'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(note.created_at).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteNote(note.id)}
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {note.content.substring(0, 300)}
                        {note.content.length > 300 && '...'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete confirmation dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это действие нельзя отменить. Запись будет удалена.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeletingRecordingId(null);
                  }}>
                    Отмена
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (deletingRecordingId) {
                        handleDeleteRecording(deletingRecordingId);
                      }
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Close session dialog for unlinked sessions - must link or delete */}
            <AlertDialog open={closeSessionDialogOpen} onOpenChange={setCloseSessionDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Сессия не привязана к пациенту</AlertDialogTitle>
                  <AlertDialogDescription>
                    Чтобы закрыть вкладку, необходимо сначала привязать сессию к пациенту. Иначе вы не сможете найти её позже. Выберите действие:
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Привязать к пациенту:</label>
                      <PatientCombobox
                        patients={patients}
                        value={selectedPatientId}
                        onValueChange={setSelectedPatientId}
                        placeholder="Выберите пациента"
                      />
                    </div>
                  </div>
                </div>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel onClick={() => {
                    setCloseSessionDialogOpen(false);
                    setClosingSessionId(null);
                    setSelectedPatientId("");
                  }}>
                    Отмена
                  </AlertDialogCancel>
                  <Button
                    onClick={handleDeleteSession}
                    variant="outline"
                    className="w-full sm:w-auto text-muted-foreground hover:text-foreground"
                  >
                    Удалить сессию
                  </Button>
                  <Button
                    onClick={handleLinkAndCloseSession}
                    disabled={!selectedPatientId}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto ml-auto"
                  >
                    Привязать и закрыть
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {/* Recording controls at the bottom */}
            <div className="p-4 border-t border-border flex items-center gap-3">
              {isRecordingInSession || isSavingRecording ? (
                <div className="flex items-center gap-3 w-full">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-recording animate-pulse-recording" : "bg-success"}`} />
                    <span className="text-sm text-muted-foreground">
                      {isSavingRecording ? "Сохранение..." : isRecording ? "Идет сессия" : "Готов"}
                    </span>
                  </div>
                  
                  {isRecording && (
                    <>
                      <div className="flex items-center gap-1">
                        <Mic className="w-4 h-4 text-recording" />
                        <span className="text-sm font-mono text-foreground">{formatTime(recordingTime)}</span>
                      </div>
                      
                      {/* Waveform visualization */}
                      <div className="flex items-center gap-0.5 h-6 flex-1">
                        {[...Array(12)].map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-primary/60 rounded-full waveform-bar"
                            style={{ 
                              animationDelay: `${i * 0.1}s`,
                              height: `${Math.random() * 16 + 4}px`
                            }}
                          />
                        ))}
                      </div>
                      
                      {/* Pause/Resume button */}
                      {isPaused ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={resumeRecording}
                          className="gap-1"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={pauseRecording}
                          className="gap-1"
                        >
                          <Pause className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Stop button */}
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleStopRecordingInSession}
                        disabled={isSavingRecording}
                        className="gap-1 bg-recording hover:bg-recording/90"
                      >
                        <Square className="w-4 h-4" />
                      </Button>
                      
                      {/* Cancel button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelRecordingInSession}
                        disabled={isSavingRecording}
                        className="text-destructive hover:text-destructive/80"
                      >
                        ×
                      </Button>
                    </>
                  )}
                  
                  {isSavingRecording && (
                    <div className="flex items-center gap-2 flex-1">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Сохранение записи...</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground">Готов</span>
              </div>
              
                  <div className="flex items-center gap-1 flex-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleStartRecordingInSession}
                      disabled={!activeSession || isUploadingAudio}
                      className="gap-1"
                    >
                  <Mic className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => audioFileInputRef.current?.click()}
                  disabled={!activeSession || isUploadingAudio}
                  className="gap-1"
                  title="Загрузить аудио файл"
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/webm,audio/mp3,audio/wav,audio/ogg,audio/mpeg,audio/mp4"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => setNotesDialogOpen(true)}
                      disabled={!activeSession}
                      title="Добавить заметку специалиста"
                    >
                      <FileText className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex-1" />
              
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="gap-2"
                    onClick={async () => {
                      if (!activeSession) {
                        toast({
                          title: 'Ошибка',
                          description: 'Выберите сессию для анализа',
                          variant: 'destructive',
                        });
                        return;
                      }

                      const session = sessions.find(s => s.id === activeSession);
                      if (!session?.patient_id) {
                        toast({
                          title: 'Ошибка',
                          description: 'Сессия должна быть привязана к пациенту',
                          variant: 'destructive',
                        });
                        return;
                      }

                      if (!selectedTemplateId) {
                        toast({
                          title: 'Ошибка',
                          description: 'Выберите шаблон для генерации',
                          variant: 'destructive',
                        });
                        return;
                      }

                      try {
                        setIsGenerating(true);
                        const result = await generateClinicalNote({
                          session_id: activeSession,
                          template_id: selectedTemplateId,
                          source_type: 'combined',
                        });

                        toast({
                          title: 'Генерация запущена',
                          description: `Создано ${result.sections_count} секций. Генерация выполняется в фоне.`,
                        });

                        // Обновляем список заметок
                        await loadClinicalNotes(activeSession);
                      } catch (error) {
                        console.error('Error generating clinical note:', error);
                        toast({
                          title: 'Ошибка генерации',
                          description: error instanceof Error ? error.message : 'Не удалось запустить генерацию',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsGenerating(false);
                      }
                    }}
                    disabled={!activeSession || !sessions.find(s => s.id === activeSession)?.patient_id || !selectedTemplateId || isGenerating}
                    title={
                      !activeSession 
                        ? 'Выберите сессию' 
                        : !sessions.find(s => s.id === activeSession)?.patient_id 
                        ? 'Сессия должна быть привязана к пациенту' 
                        : !selectedTemplateId
                        ? 'Выберите шаблон'
                        : 'Запустить генерацию клинической заметки'
                    }
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Генерация...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Создать резюме
                      </>
                    )}
              </Button>
                </>
              )}
            </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Средняя колонка - Библиотека шаблонов */}
            <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
              {activeSession && currentSession?.patient_id ? (
                <TemplatesLibrary
                  selectedTemplateId={selectedTemplateId}
                  onTemplateSelect={setSelectedTemplateId}
                />
              ) : (
                <div className="h-full flex items-center justify-center p-8 text-center border-r border-border bg-muted/30">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Выберите сессию с привязанным пациентом для доступа к библиотеке шаблонов
                    </p>
                  </div>
                </div>
              )}
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Правая колонка - Результат генерации */}
            <ResizablePanel defaultSize={35} minSize={25}>
              <div className="h-full flex flex-col bg-background">
                {activeSession && clinicalNotes.length > 0 && clinicalNotes[0] && (
                  <GenerationProgress 
                    clinicalNoteId={clinicalNotes[0].id}
                    onComplete={() => {
                      if (activeSession) {
                        loadClinicalNotes(activeSession);
                      }
                    }}
                  />
                )}
                <ClinicalNotesOutput
                  clinicalNote={activeSession && clinicalNotes.length > 0 ? clinicalNotes[0] : null}
                  onUpdate={() => {
                    if (activeSession) {
                      loadClinicalNotes(activeSession);
                    }
                  }}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* Session Notes Dialog */}
      <SessionNotesDialog
        open={notesDialogOpen}
        onOpenChange={setNotesDialogOpen}
        onSave={handleCreateNote}
      />

      {/* Create Session Dialog */}
      <CreateSessionDialog
        open={createSessionDialogOpen}
        onOpenChange={setCreateSessionDialogOpen}
        patients={patients}
        onCreateSession={handleCreateNewSession}
      />
    </>
  );
};

export default SessionsPage;
