import { useState, useEffect, useRef } from "react";
import { Calendar, Plus, FileText, Circle, User, Link2, Loader2, Mic, Pause, Play, Square, Sparkles, ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/layout/Header";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { linkSessionToPatient, getSession, createSession } from "@/lib/supabase-sessions";
import { getSessionRecordings, getRecordingStatus, createRecording, uploadAudioFile, updateRecording, startTranscription, syncTranscriptionStatus, deleteRecording } from "@/lib/supabase-recordings";
import { getPatients } from "@/lib/supabase-patients";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import type { Database } from "@/types/database.types";

type Session = Database['public']['Tables']['sessions']['Row'];
type Recording = Database['public']['Tables']['recordings']['Row'];
type Patient = Database['public']['Tables']['patients']['Row'];

const SessionsPage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deletingRecordingId, setDeletingRecordingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Recording state
  const [isRecordingInSession, setIsRecordingInSession] = useState(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const currentRecordingSessionIdRef = useRef<string | null>(null);
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
        setActiveSession(sessionId);
        // Clear location state
        navigate(location.pathname, { replace: true, state: {} });
      }, 500);
    }
  }, [location.state, navigate, location.pathname]);

  // Load recordings when session changes
  useEffect(() => {
    if (activeSession) {
      loadRecordings(activeSession);
    }
  }, [activeSession]);

  // Auto-refresh recordings periodically for active session
  useEffect(() => {
    if (!activeSession) return;

    const refreshInterval = setInterval(() => {
      loadRecordings(activeSession);
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(refreshInterval);
  }, [activeSession]);

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

  const loadSessions = async () => {
    if (!profile?.clinic_id) return;

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('clinic_id', profile.clinic_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setSessions(data || []);
      if (data && data.length > 0 && !activeSession) {
        setActiveSession(data[0].id);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить сессии",
        variant: "destructive",
      });
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

  // Cleanup polling on unmount
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
        description: "Запись скрыта",
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
        description: "Не удалось удалить запись",
        variant: "destructive",
      });
    }
  };

  const handleLinkToPatient = async () => {
    if (!activeSession || !selectedPatientId) return;

    setIsLinking(true);
    try {
      await linkSessionToPatient(activeSession, selectedPatientId);
      toast({
        title: "Успешно",
        description: "Сессия привязана к пациенту",
      });
      setLinkDialogOpen(false);
      setSelectedPatientId("");
      loadSessions();
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

  const currentSession = sessions.find(s => s.id === activeSession);
  const currentRecordings = recordings.filter(r => r.session_id === activeSession);

  // Get transcript text from recordings
  const transcriptText = currentRecordings
    .filter(r => r.transcription_status === 'completed' && r.transcription_text)
    .map(r => r.transcription_text)
    .join('\n\n');

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
        description: "Не удалось начать запись",
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
          description: "Запись сохранена. Транскрипция запущена.",
        });
      } catch (transcriptionError) {
        console.error('Error starting transcription:', transcriptionError);
        toast({
          title: "Предупреждение",
          description: "Запись сохранена, но транскрипция не запущена",
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
        userFriendlyMessage = 'Не удалось создать запись в базе данных. Проверьте подключение к Supabase.';
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

  return (
    <>
      <Header title="Сессии" icon={<Calendar className="w-5 h-5" />} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Session tabs */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Загрузка...</span>
            </div>
          ) : (
            <>
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSession(session.id)}
                  className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeSession === session.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
                  <Circle className={`w-2 h-2 ${!session.patient_id ? "text-destructive" : "text-success"} fill-current`} />
                  {session.title || `Сессия ${new Date(session.created_at).toLocaleDateString('ru-RU')}`}
                  {!session.patient_id && (
                    <Badge variant="outline" className="ml-1 text-xs">
                      Не привязано
                    </Badge>
                  )}
            </button>
          ))}
              <button 
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                onClick={() => navigate('/scribe')}
              >
            <Plus className="w-4 h-4" />
          </button>
            </>
          )}
        </div>
        
        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Patient information input */}
          <div className="flex-1 border-r border-border flex flex-col">
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
                        <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите пациента" />
                          </SelectTrigger>
                          <SelectContent>
                            {patients.map((patient) => (
                              <SelectItem key={patient.id} value={patient.id}>
                                {patient.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Записи</h3>
                </div>
                {currentRecordings.length > 0 ? (
                  currentRecordings.map((recording) => (
                    <div key={recording.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {recording.file_name || 'Запись'}
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
                    Нет записей для этой сессии. Начните запись ниже.
                  </p>
                )}
              </div>
            </div>

            {/* Delete confirmation dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Скрыть запись?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Запись будет скрыта из списка, но останется в базе данных. Вы больше не сможете её видеть, но данные будут сохранены.
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
                    Скрыть
                  </AlertDialogAction>
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
                      {isSavingRecording ? "Сохранение..." : isRecording ? "Идет запись" : "Готов"}
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
                      disabled={!activeSession}
                      className="gap-1"
                    >
                  <Mic className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" className="gap-1">
                  <ChevronDown className="w-4 h-4" />
                </Button>
                    <Button size="sm" variant="ghost" className="gap-1">
                      <FileText className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex-1" />
              
                  <Button size="sm" variant="default" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Создать резюме
              </Button>
                </>
              )}
            </div>
          </div>
          
          {/* Right panel - Clinical notes output */}
          <div className="w-[400px] flex flex-col">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Клинические заметки</h2>
            </div>
            
            <div className="flex-1 p-6 overflow-auto">
              <div className="text-center mt-12">
                <h4 className="font-semibold text-foreground mb-2">Заметок пока нет</h4>
                <p className="text-sm text-muted-foreground">
                  Функционал создания клинических заметок будет добавлен позже.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SessionsPage;
