import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, FileText, Circle, User, Link2, Loader2, Mic, Pause, Play, Square, Sparkles, ChevronDown, RefreshCw, Trash2, X, File, Upload, Search, AlertTriangle } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useNavigationBlocker } from "@/hooks/useNavigationBlocker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { getSession, checkSessionClinicalNotes, createSession } from "@/lib/supabase-sessions";
import { getSessionRecordings, getRecordingStatus, createRecording, uploadAudioFile, updateRecording, startTranscription, syncTranscriptionStatus, deleteRecording } from "@/lib/supabase-recordings";
import { usePatients } from "@/hooks/usePatients";
import { useSessions, useSessionsByIds, useCreateSession, useDeleteSession as useDeleteSessionMutation, useCompleteSession, useLinkSessionToPatient, useInvalidateSessions } from "@/hooks/useSessions";
import { useQueryClient } from "@tanstack/react-query";
import { getSessionNotes, createSessionNote, deleteSessionNote, getCombinedTranscriptWithNotes } from "@/lib/supabase-session-notes";
import { getClinicalNotesForSession, generateClinicalNote } from "@/lib/supabase-ai";
import { SessionNotesDialog } from "@/components/sessions/SessionNotesDialog";
import { CreateSessionDialog } from "@/components/sessions/CreateSessionDialog";
import { TemplatesLibrary } from "@/components/analysis/TemplatesLibrary";
import { ClinicalNotesOutput } from "@/components/analysis/output-panel/ClinicalNotesOutput";
import { GenerationProgress } from "@/components/analysis/GenerationProgress";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useTranscriptionRecovery } from "@/hooks/useTranscriptionRecovery";
import { useBackgroundUpload } from "@/contexts/BackgroundUploadContext";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  saveRecordingLocally,
  markRecordingUploaded,
  markRecordingUploadFailed,
  getUnuploadedRecordings,
  getLocalRecording,
  deleteLocalRecording,
} from "@/lib/local-recording-storage";
import { logLocalStorageOperation } from "@/lib/local-recording-audit";
import { RecoveryDialog } from "@/components/scribe/RecoveryDialog";
import type { Database } from "@/types/database.types";
import type { GeneratedClinicalNote } from "@/types/ai.types";

type Session = Database['public']['Tables']['sessions']['Row'];
type Recording = Database['public']['Tables']['recordings']['Row'];
type Patient = Database['public']['Tables']['patients']['Row'];
type SessionNote = Database['public']['Tables']['session_notes']['Row'];

// Утилита для retry транскрипции с экспоненциальной задержкой
const MAX_TRANSCRIPTION_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 45000]; // 5с, 15с, 45с

async function startTranscriptionWithRetry(
  recordingId: string,
  apiUrl: string,
  onAttempt?: (attempt: number, maxAttempts: number) => void
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_TRANSCRIPTION_RETRIES; attempt++) {
    try {
      onAttempt?.(attempt + 1, MAX_TRANSCRIPTION_RETRIES);
      await startTranscription(recordingId, apiUrl);
      return true;
    } catch (error) {
      console.warn(`[Transcription] Attempt ${attempt + 1}/${MAX_TRANSCRIPTION_RETRIES} failed:`, error);

      if (attempt < MAX_TRANSCRIPTION_RETRIES - 1) {
        // Ждём перед следующей попыткой
        const delay = RETRY_DELAYS[attempt];
        console.log(`[Transcription] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

const SessionsPage = () => {
  const { user, profile, updateActivity } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<Set<string>>(new Set());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLinking, setIsLinking] = useState(false);
  
  // Stabilize clinicId to prevent queryKey changes
  // This ensures React Query doesn't treat it as a new query when profile loads
  const stableClinicId = useMemo(() => profile?.clinic_id, [profile?.clinic_id]);
  
  // React Query hooks for data fetching with automatic caching
  const {
    data: sessions = [],
    isLoading: isLoadingSessions,
    error: sessionsError
  } = useSessions(stableClinicId);
  
  // Debug: log sessions data
  useEffect(() => {
    if (sessions.length > 0) {
      console.log('[SessionsPage] Loaded sessions:', sessions.length, sessions.map(s => ({ id: s.id, title: s.title, patient_id: s.patient_id, created_at: s.created_at })));
    } else if (!isLoadingSessions && stableClinicId) {
      console.warn('[SessionsPage] No sessions loaded, clinicId:', stableClinicId);
    }
  }, [sessions, isLoadingSessions, stableClinicId]);

  // Load sessions for open tabs separately (not limited by 50)
  const openTabIds = useMemo(() => Array.from(openTabs), [openTabs]);
  const {
    data: tabSessions = [],
    isLoading: isLoadingTabSessions,
  } = useSessionsByIds(openTabIds);

  const {
    data: patientsData = [],
    isLoading: isLoadingPatients
  } = usePatients();
  
  // Extract patients from React Query data (patients have documentCount, but we need just Patient[])
  // Memoized to prevent unnecessary recalculations on every render
  const patients = useMemo(() => patientsData.map(p => ({
    id: p.id,
    clinic_id: p.clinic_id,
    created_by: p.created_by,
    name: p.name,
    email: p.email,
    phone: p.phone,
    date_of_birth: p.date_of_birth,
    gender: p.gender,
    address: p.address,
    notes: p.notes,
    tags: p.tags,
    last_activity_at: p.last_activity_at,
    created_at: p.created_at,
    updated_at: p.updated_at,
    deleted_at: p.deleted_at,
  })) as Patient[], [patientsData]);

  // Create Map for O(1) patient lookups instead of O(n) find()
  const patientsMap = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const patient of patients) {
      map.set(patient.id, patient);
    }
    return map;
  }, [patients]);

  // Create Map for O(1) session lookups from tabSessions
  const tabSessionsMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of tabSessions) {
      map.set(session.id, session);
    }
    return map;
  }, [tabSessions]);

  // Create Map for O(1) session lookups from all sessions
  const sessionsMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of sessions) {
      map.set(session.id, session);
    }
    return map;
  }, [sessions]);
  
  const isLoading = isLoadingSessions || isLoadingPatients;
  
  // Mutations
  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSessionMutation();
  const completeSessionMutation = useCompleteSession();
  const linkSessionMutation = useLinkSessionToPatient();
  const invalidateSessions = useInvalidateSessions();
  const queryClient = useQueryClient();
  const { queueUpload, hasActiveUploads, pendingUploads, hasFailedUploads, failedUploadsCount, retryUpload, dismissFailedUpload, setOnTranscriptionStarted } = useBackgroundUpload();
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [relinkWarning, setRelinkWarning] = useState<{
    show: boolean;
    notesCount: number;
    finalizedCount: number;
    signedCount: number;
  } | null>(null);
  const [deletingRecordingId, setDeletingRecordingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [closeSessionDialogOpen, setCloseSessionDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Local storage state
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [unuploadedRecordings, setUnuploadedRecordings] = useState<Array<{
    id: string;
    fileName: string;
    duration: number;
    createdAt: number;
    uploadError?: string;
  }>>([]);

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
  const currentRecordingSessionIdRef = useRef<string | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const lastCheckpointRef = useRef<string | null>(null);
  const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || '';

  // Audio recorder hook
  const {
    status: recorderStatus,
    recordingTime,
    audioBlob,
    error: recorderError,
    wasPartialSave,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    reset,
    getCurrentChunks,
    getCurrentMimeType,
  } = useAudioRecorder();

  // Вычисляемые значения из status для удобства
  const isRecording = recorderStatus === 'recording' || recorderStatus === 'paused';
  const isPaused = recorderStatus === 'paused';

  // Обновление activity во время записи для предотвращения session timeout
  useEffect(() => {
    if (!isRecording) return;

    // Обновляем activity каждые 30 секунд во время записи
    const intervalId = setInterval(() => {
      updateActivity();
    }, 30000);

    // Также обновляем сразу при начале записи
    updateActivity();

    return () => {
      clearInterval(intervalId);
    };
  }, [isRecording, updateActivity]);

  // Transcription recovery hook - tracks processing transcriptions for ALL user's sessions
  // This replaces the local polling logic and survives page navigation
  // Don't filter by activeSession - track all transcriptions to show them in UI
  const {
    processingTranscriptions,
    isAnyProcessing: isAnyTranscriptionProcessing,
    addTranscription,
  } = useTranscriptionRecovery({
    // Don't filter by sessionId - track all user's transcriptions
    // This ensures processing transcriptions are visible even if their session is not open
    onComplete: async (recordingId, sessionId) => {
      console.log(`[SessionsPage] Transcription completed: ${recordingId} in session ${sessionId}`);
      
      // Open tab for the session if it's not already open
      setOpenTabs(prev => {
        if (!prev.has(sessionId)) {
          console.log(`[SessionsPage] Opening tab for completed transcription session: ${sessionId}`);
          return new Set(prev).add(sessionId);
        }
        return prev;
      });
      
      // Set as active session if no active session or if this is the active one
      if (!activeSession || sessionId === activeSession) {
        setActiveSession(sessionId);
      }
      
      // Reload recordings to update UI
      if (sessionId === activeSession || !activeSession) {
        try {
          const recordingsData = await getSessionRecordings(sessionId);
          setRecordings(recordingsData);
        } catch (error) {
          console.error('Error reloading recordings after transcription:', error);
        }
      }
    },
    onError: async (recordingId, error) => {
      console.error(`[SessionsPage] Transcription failed: ${recordingId}`, error);
      // Reload recordings to show error state
      if (activeSession) {
        try {
          const recordingsData = await getSessionRecordings(activeSession);
          setRecordings(recordingsData);
        } catch (err) {
          console.error('Error reloading recordings after error:', err);
        }
      }
    },
  });

  // Connect BackgroundUploadContext to useTranscriptionRecovery
  // When a transcription starts via BackgroundUpload, add it to tracking
  const addTranscriptionRef = useRef(addTranscription);
  addTranscriptionRef.current = addTranscription;

  useEffect(() => {
    setOnTranscriptionStarted((recordingId, sessionId) => {
      console.log('[SessionsPage] Background transcription started, adding to tracking:', recordingId, sessionId);
      addTranscriptionRef.current(recordingId, sessionId);
    });

    return () => {
      setOnTranscriptionStarted(null);
    };
  }, [setOnTranscriptionStarted]);

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

  // Show warning if recording was partially saved due to timeout
  useEffect(() => {
    if (wasPartialSave && audioBlob) {
      toast({
        title: "Предупреждение",
        description: "Запись сохранена. Возможна потеря последних секунд из-за медленной обработки браузером.",
        variant: "default",
      });
    }
  }, [wasPartialSave, audioBlob, toast]);

  // Block navigation while recording
  const recordingBlocker = useNavigationBlocker(
    (currentPath, nextPath) =>
      isRecording && currentPath !== nextPath
  );

  // Load open tabs from database
  const loadOpenTabs = async (): Promise<Set<string>> => {
    if (!user?.id) {
      console.log('[Tabs] No user.id, returning empty set');
      return new Set();
    }
    
    try {
      console.log('[Tabs] Loading open tabs for user:', user.id);
      const { data, error } = await supabase
        .from('user_session_tabs')
        .select('session_id')
        .eq('user_id', user.id);
      
      if (error) {
        console.error('[Tabs] Error loading open tabs:', error);
        throw error;
      }
      
      const sessionIds = data?.map(row => row.session_id) || [];
      console.log('[Tabs] Loaded tabs from DB:', sessionIds.length, 'tabs:', sessionIds);
      
      return new Set(sessionIds);
    } catch (error) {
      console.error('[Tabs] Error loading open tabs:', error);
      return new Set();
    }
  };

  // Save open tabs to database
  const saveOpenTabs = async (sessionIds: Set<string>) => {
    if (!user?.id) return;
    
    try {
      // Get current open tabs from DB
      const { data: currentTabs } = await supabase
        .from('user_session_tabs')
        .select('session_id')
        .eq('user_id', user.id);
      
      const currentTabIds = new Set(currentTabs?.map(row => row.session_id) || []);
      const newTabIds = Array.from(sessionIds);
      
      // Find tabs to add
      const toAdd = newTabIds.filter(id => !currentTabIds.has(id));
      // Find tabs to remove
      const toRemove = Array.from(currentTabIds).filter(id => !sessionIds.has(id));
      
      // Add new tabs
      if (toAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('user_session_tabs')
          .insert(toAdd.map(sessionId => ({
            user_id: user.id,
            session_id: sessionId
          })));
        
        if (insertError) throw insertError;
      }
      
      // Remove closed tabs
      if (toRemove.length > 0) {
        console.log('[saveOpenTabs] Removing tabs from DB:', toRemove);
        const { error: deleteError } = await supabase
          .from('user_session_tabs')
          .delete()
          .eq('user_id', user.id)
          .in('session_id', toRemove);
        
        if (deleteError) {
          console.error('[saveOpenTabs] Error deleting tabs:', deleteError);
          throw deleteError;
        }
        console.log('[saveOpenTabs] ✅ Successfully removed tabs from DB:', toRemove);
      }
    } catch (error) {
      console.error('Error saving open tabs:', error);
    }
  };

  // Track if we're processing navigation with sessionId
  const processingNavigationRef = useRef(false);

  // Load open tabs immediately when user is available
  // user is available immediately after login, profile loads later
  useEffect(() => {
    if (user?.id) {
      console.log('[Tabs] useEffect triggered, user.id:', user.id);
      // Always reload tabs from DB when component mounts or user changes
      // This ensures tabs are always restored from DB, even after long navigation
      loadOpenTabs().then(tabs => {
        console.log('[Tabs] ✅ Loaded tabs from DB:', Array.from(tabs), '(count:', tabs.size, ')');
        // Always set tabs from DB - they are the source of truth
        // Don't merge with existing tabs, as DB tabs are authoritative
        setOpenTabs(tabs);
        tabsLoadedFromDBRef.current = true;
        console.log('[Tabs] ✅ Tabs set and flag marked as loaded');
      }).catch(err => {
        console.error('[Tabs] ❌ Error in loadOpenTabs promise:', err);
        // Don't reset flag on error - keep previous state
      });
    } else {
      console.log('[Tabs] useEffect triggered, but no user.id');
      // Reset flag when user logs out
      tabsLoadedFromDBRef.current = false;
    }
  }, [user?.id]);

  // Save open tabs when they change (debounced)
  // BUT: if tabs were closed via handleCloseSession, don't save again (already saved immediately)
  const saveTabsTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedTabsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user?.id) return;
    
    // Skip if tabs haven't actually changed (prevent unnecessary saves)
    const tabsArray = Array.from(openTabs).sort().join(',');
    const lastSavedArray = Array.from(lastSavedTabsRef.current).sort().join(',');
    if (tabsArray === lastSavedArray) {
      return;
    }
    
    // Debounce saves to avoid too many DB calls
    if (saveTabsTimeoutRef.current) {
      clearTimeout(saveTabsTimeoutRef.current);
    }
    
    saveTabsTimeoutRef.current = setTimeout(() => {
      saveOpenTabs(openTabs).then(() => {
        lastSavedTabsRef.current = new Set(openTabs);
      });
    }, 500);
    
    return () => {
      if (saveTabsTimeoutRef.current) {
        clearTimeout(saveTabsTimeoutRef.current);
      }
    };
  }, [openTabs, user?.id]);

  // Set active session when sessions and openTabs are loaded
  useEffect(() => {
    // Пропускаем, если идет обработка навигации с sessionId
    if (processingNavigationRef.current) {
      return;
    }
    
    // Если все вкладки закрыты - сбросить активную сессию
    if (openTabs.size === 0) {
      if (activeSession) {
        setActiveSession(null);
      }
      return;
    }
    
    // Если активная сессия больше не в открытых вкладках - выбрать первую открытую
    if (activeSession && !openTabs.has(activeSession)) {
      const firstOpenTab = Array.from(openTabs).find(id =>
        tabSessions.some(s => s.id === id)
      );
      setActiveSession(firstOpenTab || null);
      return;
    }

    // Если нет активной сессии, но есть открытые вкладки - выбрать первую
    if (tabSessions.length > 0 && !activeSession && openTabs.size > 0) {
      const firstOpenTab = Array.from(openTabs).find(id =>
        tabSessions.some(s => s.id === id)
      );
      if (firstOpenTab) {
        setActiveSession(firstOpenTab);
      }
    }
  }, [tabSessions, openTabs, activeSession]);

  // Track if we've loaded tabs from DB to prevent premature filtering
  const tabsLoadedFromDBRef = useRef(false);
  
  // Mark tabs as loaded when they're loaded from DB
  useEffect(() => {
    if (openTabs.size > 0 && !tabsLoadedFromDBRef.current) {
      // Check if these tabs came from DB by checking if they were set recently
      // This is a simple heuristic - in practice, tabs from DB are set in loadOpenTabs
      tabsLoadedFromDBRef.current = true;
      console.log('[Tabs] Marked tabs as loaded from DB:', Array.from(openTabs));
    }
  }, [openTabs]);

  // Filter openTabs to remove ONLY deleted sessions (sessions that don't exist in DB anymore)
  // We use tabSessions (loaded by ID) instead of sessions (limited to 50) to determine validity
  useEffect(() => {
    // Don't filter if tab sessions are still loading
    if (isLoadingTabSessions) {
      console.log('[Tabs] Tab sessions still loading, skipping filter');
      return;
    }

    // Don't filter if tabs haven't been loaded from DB yet
    if (!tabsLoadedFromDBRef.current) {
      console.log('[Tabs] Tabs not loaded from DB yet, skipping filter');
      return;
    }

    // Only filter if we have tabs and tabSessions query has completed
    if (openTabs.size === 0) {
      return;
    }

    // Find tabs that were NOT found in the database (deleted sessions)
    const loadedSessionIds = new Set(tabSessions.map(s => s.id));
    const deletedTabs = Array.from(openTabs).filter(tabId => !loadedSessionIds.has(tabId));

    // Only remove tabs for sessions that were definitely deleted (queried but not found)
    if (deletedTabs.length > 0 && tabSessions.length > 0) {
      console.log('[Tabs] Removing tabs for deleted sessions:', deletedTabs);
      setOpenTabs(prev => {
        const newTabs = new Set(prev);
        deletedTabs.forEach(id => newTabs.delete(id));
        return newTabs;
      });
    }
  }, [tabSessions, isLoadingTabSessions, openTabs]);

  // Handle navigation with session ID from patient card or other pages
  useEffect(() => {
    // Проверяем и location.state, и URL параметры
    const sessionIdFromState = location.state?.sessionId;
    const sessionIdFromUrl = searchParams.get('sessionId');
    const sessionId = sessionIdFromState || sessionIdFromUrl;
    
    if (sessionId && !isLoading && user?.id && !processingNavigationRef.current) {
      // Check if session exists in loaded sessions or tab sessions
      // Note: session might not be in top 50, but should be in tabSessions if tab is open
      const sessionExists = sessions.some(s => s.id === sessionId) || tabSessions.some(s => s.id === sessionId);
      if (!sessionExists && sessions.length > 0) {
        // If sessions are loaded but this one is not found, it might be outside top 50
        // In this case, we'll still try to open it (it will be loaded via useSessionsByIds)
        console.log(`[SessionsPage] Session ${sessionId} not in top 50, will load via useSessionsByIds`);
      } else if (!sessionExists && sessions.length === 0) {
        // No sessions loaded yet, wait
        return;
      }
      
      processingNavigationRef.current = true;
      
      // СНАЧАЛА сохраняем в БД, ПОТОМ загружаем вкладки
      supabase
        .from('user_session_tabs')
        .insert({
          user_id: user.id,
          session_id: sessionId
        })
        .then(async ({ error }) => {
          if (error) {
            // Если уже существует - это нормально (UNIQUE constraint)
            if (error.code !== '23505') {
              console.error('Error saving session tab:', error);
              processingNavigationRef.current = false;
              return;
            }
          }
          
          // После сохранения в БД - загружаем все вкладки заново
          const tabs = await loadOpenTabs();
          setOpenTabs(tabs);
          
          // Небольшая задержка, чтобы React успел обновить состояние
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Устанавливаем активную сессию
          setActiveSession(sessionId);
          
          // Еще небольшая задержка перед очисткой state
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Очищаем location state и URL параметры
          searchParams.delete('sessionId');
          setSearchParams(searchParams, { replace: true });
          navigate(location.pathname, { replace: true, state: {} });
          processingNavigationRef.current = false;
        })
        .catch((error) => {
          console.error('[Navigation] Unexpected error:', error);
          processingNavigationRef.current = false;
        });
    }
  }, [location.state, searchParams, navigate, location.pathname, isLoading, sessions, user?.id, setSearchParams]);

  // Функция для повторной загрузки записи (объявлена до использования)
  const retryUploadRecording = useCallback(async (localId: string, recording: {
    blob: Blob;
    fileName: string;
    duration: number;
    mimeType: string;
    recordingId?: string;
    sessionId?: string;
  }) => {
    if (!user || !profile || !profile.clinic_id) return;

    try {
      // If we have existing recordingId, check if it already exists
      if (recording.recordingId && recording.sessionId) {
        // Recording already exists in DB, just mark as uploaded
        await markRecordingUploaded(localId, recording.recordingId, recording.sessionId);
        await logLocalStorageOperation('local_storage_upload_success', recording.recordingId, {
          fileName: recording.fileName,
          duration: recording.duration,
        });
        return;
      }

      // Use saved sessionId or active session or create new one
      let sessionId = recording.sessionId || activeSession;
      if (!sessionId) {
        const newSession = await createSession({
          userId: user.id,
          clinicId: profile.clinic_id,
          patientId: null,
          title: `Сессия ${new Date(recording.duration * 1000).toLocaleString('ru-RU')}`,
        });
        sessionId = newSession.id;
      }

      // Create recording record
      const newRecording = await createRecording({
        sessionId,
        userId: user.id,
        fileName: recording.fileName,
      });

      // Upload audio file
      await uploadAudioFile({
        recordingId: newRecording.id,
        audioBlob: recording.blob,
        fileName: newRecording.file_name || recording.fileName,
        mimeType: recording.mimeType,
      });

      // Update recording with duration
      await updateRecording(newRecording.id, {
        duration_seconds: recording.duration,
      });

      // Mark as uploaded
      await markRecordingUploaded(localId, newRecording.id, sessionId);
      await logLocalStorageOperation('local_storage_upload_success', newRecording.id, {
        fileName: recording.fileName,
        duration: recording.duration,
      });

      // Start transcription with retry
      const transcriptionStarted = await startTranscriptionWithRetry(
        newRecording.id,
        transcriptionApiUrl,
        (attempt, max) => console.log(`[SessionsPage] Transcription attempt ${attempt}/${max} for recovered recording`)
      );

      if (transcriptionStarted) {
        // Track transcription in recovery hook
        addTranscription(newRecording.id, sessionId);
      } else {
        console.warn('[SessionsPage] Transcription not started after all retries for recovered recording');
      }

      // Reload recordings if this is the active session
      if (sessionId === activeSession) {
        // Use getSessionRecordings directly to avoid dependency issues
        const recordingsData = await getSessionRecordings(sessionId);
        setRecordings(recordingsData);
      }

      toast({
        title: "Запись восстановлена",
        description: transcriptionStarted
          ? `Запись "${recording.fileName}" успешно загружена и транскрипция запущена`
          : `Запись "${recording.fileName}" загружена, но транскрипция не запущена. Попробуйте позже.`,
      });
    } catch (error) {
      console.error('[SessionsPage] Retry upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      await markRecordingUploadFailed(localId, errorMessage);
      await logLocalStorageOperation('local_storage_upload_failed', null, {
        fileName: recording.fileName,
        error: errorMessage,
      });
      throw error;
    }
  }, [user, profile, activeSession, transcriptionApiUrl, toast, setRecordings, addTranscription]);

  // Проверка не загруженных записей при загрузке страницы
  useEffect(() => {
    const checkUnuploadedRecordings = async () => {
      try {
        const unuploaded = await getUnuploadedRecordings();
        if (unuploaded.length > 0) {
          setUnuploadedRecordings(unuploaded);
          setShowRecoveryDialog(true);
        }
      } catch (error) {
        console.error('Error checking unuploaded recordings:', error);
      }
    };

    if (user && profile) {
      checkUnuploadedRecordings();
    }
  }, [user, profile]);

  // Автоматическая повторная загрузка при восстановлении соединения
  useEffect(() => {
    const handleOnline = async () => {
      if (!user || !profile || !profile.clinic_id) return;

      try {
        const unuploaded = await getUnuploadedRecordings();
        if (unuploaded.length === 0) return;

        console.log('[SessionsPage] Connection restored, attempting to upload', unuploaded.length, 'recordings');

        // Дедупликация: загружаем только уникальные записи
        const processedIds = new Set<string>();
        for (const recordingMeta of unuploaded) {
          // Пропускаем checkpoint'ы - они будут удалены после успешной загрузки основной записи
          if (recordingMeta.fileName.includes('checkpoint') || recordingMeta.fileName.includes('hidden')) {
            continue;
          }
          
          // Пропускаем дубликаты
          if (processedIds.has(recordingMeta.id)) {
            continue;
          }
          
          try {
            const recording = await getLocalRecording(recordingMeta.id);
            if (!recording || recording.uploaded) continue;

            // Try to upload
            await retryUploadRecording(recordingMeta.id, recording);
            processedIds.add(recordingMeta.id);
          } catch (error) {
            console.error(`[SessionsPage] Failed to retry upload for ${recordingMeta.id}:`, error);
          }
        }
        
        // Удаляем checkpoint'ы после успешной загрузки
        for (const recordingMeta of unuploaded) {
          if ((recordingMeta.fileName.includes('checkpoint') || recordingMeta.fileName.includes('hidden')) && processedIds.size > 0) {
            try {
              await deleteLocalRecording(recordingMeta.id);
            } catch (error) {
              console.warn(`[SessionsPage] Failed to delete checkpoint ${recordingMeta.id}:`, error);
            }
          }
        }

        // Refresh unuploaded list
        const updated = await getUnuploadedRecordings();
        setUnuploadedRecordings(updated);
      } catch (error) {
        console.error('[SessionsPage] Error in automatic retry:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [user, profile, activeSession, retryUploadRecording]);

  // Периодическое сохранение во время записи (каждые 10 минут)
  useEffect(() => {
    if (!isRecording || !currentRecordingSessionIdRef.current) {
      lastCheckpointRef.current = null;
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const chunks = getCurrentChunks();
        if (chunks.length === 0) {
          return; // Нет данных для сохранения
        }

        const mimeType = getCurrentMimeType();
        const blob = new Blob(chunks, { type: mimeType });
        const sessionId = currentRecordingSessionIdRef.current;
        
        if (!sessionId) {
          return;
        }

        // Удаляем предыдущий checkpoint, если есть
        if (lastCheckpointRef.current) {
          try {
            await deleteLocalRecording(lastCheckpointRef.current);
          } catch (error) {
            console.warn('[SessionsPage] Failed to delete old checkpoint:', error);
          }
        }

        // Сохранить новый checkpoint
        const fileName = `recording-${Date.now()}-checkpoint.webm`;
        const checkpointId = await saveRecordingLocally(
          blob,
          fileName,
          recordingTime,
          mimeType,
          sessionId
        );
        
        lastCheckpointRef.current = checkpointId;
        console.log('[SessionsPage] Periodic checkpoint saved:', fileName, 'duration:', recordingTime);
        await logLocalStorageOperation('local_storage_checkpoint', null, {
          fileName,
          duration: recordingTime,
          sessionId,
        });
      } catch (error) {
        console.warn('[SessionsPage] Failed to save periodic checkpoint:', error);
        // Не прерываем запись из-за ошибки сохранения
      }
    }, 10 * 60 * 1000); // 10 минут

    return () => {
      clearInterval(intervalId);
    };
  }, [isRecording, recordingTime, getCurrentChunks, getCurrentMimeType]);

  // Сохранение при закрытии вкладки или потере фокуса
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording && currentRecordingSessionIdRef.current) {
        // Используем синхронный подход для beforeunload
        // Сохраняем в sessionStorage как fallback
        try {
          const chunks = getCurrentChunks();
          if (chunks.length > 0) {
            const mimeType = getCurrentMimeType();
            const blob = new Blob(chunks, { type: mimeType });
            const sessionId = currentRecordingSessionIdRef.current;
            
            // Сохраняем метаданные в sessionStorage для восстановления после перезагрузки
            const metadata = {
              chunksCount: chunks.length,
              mimeType,
              sessionId,
              duration: recordingTime,
              timestamp: Date.now(),
            };
            sessionStorage.setItem('pending_recording_metadata', JSON.stringify(metadata));
            
            // Показываем предупреждение пользователю
            e.preventDefault();
            e.returnValue = 'Идет запись. Вы уверены, что хотите закрыть страницу?';
            return e.returnValue;
          }
        } catch (error) {
          console.error('[SessionsPage] Failed to save on unload:', error);
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (document.hidden && isRecording && currentRecordingSessionIdRef.current) {
        try {
          const chunks = getCurrentChunks();
          if (chunks.length > 0) {
            const mimeType = getCurrentMimeType();
            const blob = new Blob(chunks, { type: mimeType });
            const sessionId = currentRecordingSessionIdRef.current;
            
            // Удаляем предыдущий checkpoint, если есть
            if (lastCheckpointRef.current) {
              try {
                await deleteLocalRecording(lastCheckpointRef.current);
              } catch (error) {
                // Игнорируем ошибки удаления
              }
            }
            
            const checkpointId = await saveRecordingLocally(
              blob,
              `recording-${Date.now()}-hidden.webm`,
              recordingTime,
              mimeType,
              sessionId
            );
            
            lastCheckpointRef.current = checkpointId;
            console.log('[SessionsPage] Saved recording on visibility change');
          }
        } catch (error) {
          console.error('[SessionsPage] Failed to save on visibility change:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording, recordingTime, getCurrentChunks, getCurrentMimeType]);

  // Восстановление записи после перезагрузки страницы
  useEffect(() => {
    const restorePendingRecording = async () => {
      const metadataStr = sessionStorage.getItem('pending_recording_metadata');
      if (!metadataStr) return;

      try {
        const metadata = JSON.parse(metadataStr);
        // Проверяем, что метаданные не старше 1 часа
        if (Date.now() - metadata.timestamp > 60 * 60 * 1000) {
          sessionStorage.removeItem('pending_recording_metadata');
          return;
        }

        // Показываем уведомление пользователю
        toast({
          title: "Восстановление записи",
          description: "Обнаружена незавершенная запись. Проверьте локальные записи.",
          variant: "default",
        });

        sessionStorage.removeItem('pending_recording_metadata');
      } catch (error) {
        console.error('[SessionsPage] Failed to restore pending recording:', error);
        sessionStorage.removeItem('pending_recording_metadata');
      }
    };

    if (user && profile) {
      restorePendingRecording();
    }
  }, [user, profile, toast]);

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
      // Load all session data in parallel for better performance
      Promise.all([
        loadRecordings(activeSession),
        loadSessionNotes(activeSession),
        loadClinicalNotes(activeSession)
      ]).catch(error => {
        console.error('Error loading session data:', error);
      });
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

  // Helper to refresh sessions (for manual refresh button)
  const refreshSessions = async () => {
    // Invalidate and refetch sessions
    invalidateSessions(profile?.clinic_id);
  };

  const loadRecordings = async (sessionId: string) => {
    try {
      const recordingsData = await getSessionRecordings(sessionId);
      setRecordings(recordingsData);

      // Collect old processing recordings that need immediate sync
      const now = new Date();
      const oldRecordings = recordingsData.filter(recording => {
        if (recording.transcription_status === 'processing' && recording.transcript_id) {
          const createdAt = new Date(recording.created_at);
          const minutesSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60);
          return minutesSinceCreated > 2;
        }
        return false;
      });

      // Sync all old recordings in parallel (only once)
      if (oldRecordings.length > 0) {
        console.log(`Syncing ${oldRecordings.length} old recording(s) immediately`);
        await Promise.all(
          oldRecordings.map(recording =>
            syncTranscriptionStatus(recording.id, transcriptionApiUrl).catch(err => {
              console.warn(`Failed to sync old recording ${recording.id}:`, err);
            })
          )
        );
        // Reload recordings ONCE after all syncs complete
        const updatedRecordings = await getSessionRecordings(sessionId);
        setRecordings(updatedRecordings);
      }

      // Note: Polling for transcriptions is now handled by useTranscriptionRecovery hook
      // which survives page navigation and provides better UX
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

    const session = tabSessionsMap.get(sessionId) || sessionsMap.get(sessionId);
    if (!session) {
      return;
    }

    // If session is linked to patient, just close the tab (no deletion option)
    if (session.patient_id) {
      // Simply remove from open tabs and update active session if needed
      let newTabs: Set<string>;
      setOpenTabs(prev => {
        newTabs = new Set(prev);
        newTabs.delete(sessionId);
        
        // If closed session was active, select another one from remaining open tabs
        if (activeSession === sessionId) {
          const remainingOpenTabIds = Array.from(newTabs);
          const remainingSessions = tabSessions.filter(s => remainingOpenTabIds.includes(s.id));
          if (remainingSessions.length > 0) {
            setActiveSession(remainingSessions[0].id);
          } else {
            setActiveSession(null);
          }
        }
        
        return newTabs;
      });
      
        // Save to DB immediately (don't wait for debounce)
        // This prevents race conditions where loadOpenTabs might reload old data
        if (user?.id && newTabs) {
          console.log('[handleCloseSession] Saving closed tab to DB immediately:', sessionId, 'newTabs:', Array.from(newTabs));
          // Wait for save to complete to prevent race conditions
          await saveOpenTabs(newTabs);
          console.log('[handleCloseSession] ✅ Successfully saved closed tab to DB');
          
          // Update lastSavedTabsRef to prevent debounced save from overwriting
          lastSavedTabsRef.current = new Set(newTabs);
          
          // Invalidate and refetch React Query cache for sessions by IDs to force update
          // This ensures tabSessions updates immediately after closing
          // Use the specific queryKey based on current openTabIds to refetch the correct query
          const newTabIds = Array.from(newTabs).sort();
          const newIdsKey = newTabIds.join(',');
          queryClient.invalidateQueries({ queryKey: ['sessions', 'byIds', newIdsKey] });
          queryClient.invalidateQueries({ queryKey: ['sessions', 'byIds'] });
          await queryClient.refetchQueries({ queryKey: ['sessions', 'byIds'] });
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
      await linkSessionMutation.mutateAsync({ 
        sessionId: closingSessionId, 
        patientId: selectedPatientId 
      });

      // Then complete the session
      await completeSessionMutation.mutateAsync(closingSessionId);

      // Remove from open tabs (close the tab)
      setOpenTabs(prev => {
        const newTabs = new Set(prev);
        newTabs.delete(closingSessionId);
        return newTabs;
      });

      // If closed session was active, select another one from remaining open tabs
      if (activeSession === closingSessionId) {
        const remainingOpenTabIds = [...openTabs].filter(id => id !== closingSessionId);
        const remainingSessions = tabSessions.filter(s => remainingOpenTabIds.includes(s.id));
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
      await deleteSessionMutation.mutateAsync(closingSessionId);
      
      toast({
        title: "Успешно",
        description: "Сессия удалена",
      });
      
      // If deleted session was active, select another one
      if (activeSession === closingSessionId) {
        const remainingSessions = tabSessions.filter(s => s.id !== closingSessionId);
        if (remainingSessions.length > 0) {
          setActiveSession(remainingSessions[0].id);
        } else {
          setActiveSession(null);
        }
      }
      
      // Cache will be automatically invalidated by useDeleteSessionMutation
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

  // Check for clinical notes when opening link dialog
  const handleOpenLinkDialog = async () => {
    if (!activeSession) return;
    
    setLinkDialogOpen(true);
    setSelectedPatientId("");

    // Check if session already has a patient and clinical notes
    const session = tabSessionsMap.get(activeSession);
    if (session?.patient_id) {
      try {
        const notesCheck = await checkSessionClinicalNotes(activeSession);
        if (notesCheck.hasNotes) {
          setRelinkWarning({
            show: true,
            notesCount: notesCheck.notesCount,
            finalizedCount: notesCheck.finalizedCount,
            signedCount: notesCheck.signedCount,
          });
        } else {
          setRelinkWarning(null);
        }
      } catch (error) {
        console.error('Error checking clinical notes:', error);
        setRelinkWarning(null);
      }
    } else {
      setRelinkWarning(null);
    }
  };

  const handleLinkToPatient = async () => {
    if (!activeSession || !selectedPatientId) return;

    setIsLinking(true);
    const savedSessionId = activeSession;

    try {
      // Determine if this is a re-link
      const session = tabSessionsMap.get(activeSession);
      const isRelinking = session?.patient_id !== null && session?.patient_id !== selectedPatientId;
      
      // Get notes check for re-linking
      let allowRelinkFinalized = false;
      let allowRelinkSigned = false;
      
      if (isRelinking && relinkWarning) {
        // For re-linking, we need user confirmation for finalized/signed notes
        if (relinkWarning.signedCount > 0) {
          // Don't allow re-linking signed notes without explicit confirmation
          throw new Error(
            `Невозможно перепривязать: есть ${relinkWarning.signedCount} подписанных заметок. ` +
            `Перепривязка подписанных заметок запрещена.`
          );
        }
        
        if (relinkWarning.finalizedCount > 0) {
          // Allow but warn - in production, show confirmation dialog
          console.warn(
            `Re-linking session with ${relinkWarning.finalizedCount} finalized notes`
          );
          allowRelinkFinalized = true;
        }
      }

      await linkSessionMutation.mutateAsync({
        sessionId: activeSession,
        patientId: selectedPatientId,
        options: {
          allowRelinkFinalized,
          allowRelinkSigned,
        },
      });
      
      toast({
        title: "Успешно",
        description: isRelinking 
          ? "Сессия перепривязана к новому пациенту" 
          : "Сессия привязана к пациенту",
      });
      
      setLinkDialogOpen(false);
      setSelectedPatientId("");
      setRelinkWarning(null);
      
      // Cache will be automatically invalidated by useLinkSessionToPatient mutation
      // Restore active session after cache update
      const savedSessionId = activeSession;
      await queryClient.invalidateQueries({ queryKey: ['sessions', profile?.clinic_id] });
      
      // Wait a bit for cache to update, then find the session
      setTimeout(() => {
        const sessionToSelect = sessionsMap.get(savedSessionId!) || sessions[0];
        if (sessionToSelect) {
          setActiveSession(sessionToSelect.id);
        } else if (sessions.length > 0) {
          setActiveSession(sessions[0].id);
        } else {
          setActiveSession(null);
        }
      }, 100);
      
      // Reload clinical notes if they exist
      if (activeSession) {
        await loadClinicalNotes(activeSession);
      }
    } catch (error) {
      console.error('Error linking session to patient:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка",
        description: errorMessage,
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

      // Create session using React Query mutation
      const newSession = await createSessionMutation.mutateAsync({
        userId: user.id,
        clinicId: profile.clinic_id,
        patientId: patientId || undefined,
        title: sessionTitle,
      });

      // If patient is selected, link session to patient (creates consents)
      if (patientId) {
        await linkSessionMutation.mutateAsync({ 
          sessionId: newSession.id, 
          patientId 
        });
      }

      toast({
        title: "Успешно",
        description: patientId
          ? "Сессия создана и привязана к пациенту"
          : "Сессия создана. Не забудьте привязать её к пациенту.",
      });

      // Add new session to open tabs
      setOpenTabs(prev => new Set(prev).add(newSession.id));
      
      // Cache will be automatically invalidated by useCreateSession mutation
      // Wait for cache to update and select the new session
      await queryClient.invalidateQueries({ queryKey: ['sessions', profile.clinic_id] });
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

  // Filter sessions for the tab list at the top
  // Show only sessions that are in openTabs (open tabs)
  const filteredSessions = useMemo(() => {
    // Only show sessions that are in openTabs
    // Use tabSessions (loaded by ID) as the source, as they are guaranteed to be loaded
    let result = tabSessions.filter(session => openTabs.has(session.id));
    
    // Sort by created_at DESC (newest first)
    result = result.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    console.log('[FilteredSessions] tabSessions:', tabSessions.length, 'openTabs:', openTabs.size, 'filtered (open tabs only):', result.length);

    // Filter by search query if provided
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((session) => {
        // Search by title
        if (session.title && session.title.toLowerCase().includes(query)) {
          return true;
        }

        // Search by patient name
        if (session.patient_id) {
          const patient = patientsMap.get(session.patient_id);
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
  }, [tabSessions, patientsMap, searchQuery, openTabs]);

  // Get current session from tab sessions (loaded by ID)
  const currentSession = useMemo(() =>
    activeSession && openTabs.has(activeSession)
      ? tabSessionsMap.get(activeSession) || null
      : null,
    [activeSession, openTabs, tabSessionsMap]
  );

  // Memoize filtered recordings and notes to avoid recalculating on every render
  const currentRecordings = useMemo(() =>
    recordings.filter(r => r.session_id === activeSession),
    [recordings, activeSession]
  );

  const currentNotes = useMemo(() =>
    sessionNotes.filter(n => n.session_id === activeSession),
    [sessionNotes, activeSession]
  );

  // Get transcript text from recordings - memoized for performance
  const rawTranscriptText = useMemo(() =>
    currentRecordings
      .filter(r => r.transcription_status === 'completed' && r.transcription_text)
      .map(r => r.transcription_text)
      .join('\n\n'),
    [currentRecordings]
  );

  // Combined transcript with specialist notes
  const transcriptText = useMemo(() =>
    getCombinedTranscriptWithNotes(rawTranscriptText, currentNotes),
    [rawTranscriptText, currentNotes]
  );

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

  // Handle stop recording in session context - uses background upload
  const handleStopRecordingInSession = async () => {
    if (!currentRecordingSessionIdRef.current || !user) {
      await stopRecording();
      reset();
      setIsRecordingInSession(false);
      return;
    }

    const sessionId = currentRecordingSessionIdRef.current;
    const duration = recordingTime;

    try {
      // Stop recording and get the blob
      const blob = await stopRecording();

      if (!blob) {
        toast({
          title: "Ошибка записи",
          description: "Не удалось сохранить аудио. Попробуйте записать ещё раз.",
          variant: "destructive",
        });
        reset();
        setIsRecordingInSession(false);
        currentRecordingSessionIdRef.current = null;
        return;
      }

      // Queue upload in background - user can continue working immediately
      await queueUpload({
        blob,
        duration,
        sessionId, // Passing sessionId so it uploads to existing session
      });

      // Reset recording state immediately - upload continues in background
      reset();
      setIsRecordingInSession(false);
      currentRecordingSessionIdRef.current = null;

      // Delete checkpoint since recording is now queued
      if (lastCheckpointRef.current) {
        try {
          await deleteLocalRecording(lastCheckpointRef.current);
          lastCheckpointRef.current = null;
        } catch {
          // Ignore errors
        }
      }

    } catch (error) {
      console.error('Error queuing upload:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось начать загрузку записи",
        variant: "destructive",
      });

      reset();
      setIsRecordingInSession(false);
      currentRecordingSessionIdRef.current = null;
    }
  };

  // Handle cancel recording
  const handleCancelRecordingInSession = () => {
    cancelRecording(); // cancelRecording уже вызывает reset() внутри
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
    // Note: m4a files (Windows Voice Recorder) may report as audio/x-m4a, audio/mp4, or audio/aac
    const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/m4a'];
    // Also check file extension for m4a files that may have empty or incorrect MIME type
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const allowedExtensions = ['webm', 'mp3', 'wav', 'ogg', 'mpeg', 'mp4', 'm4a', 'aac'];

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension || '')) {
      toast({
        title: "Ошибка",
        description: "Неподдерживаемый формат файла. Поддерживаемые форматы: mp3, wav, m4a, ogg, webm, mp4",
        variant: "destructive",
      });
      return;
    }

    // Get audio duration before queuing
    let duration = 0;
    try {
      duration = await getAudioDuration(file);
    } catch (error) {
      console.warn('Could not determine audio duration:', error);
      // Continue with 0 duration
    }

    // Queue for background upload (validation happens inside queueUpload)
    try {
      await queueUpload({
        blob: file,
        duration,
        sessionId: activeSession,
        fileName: file.name,
      });
      // Reset file input
      if (audioFileInputRef.current) {
        audioFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error queuing audio file:', error);
      // Error toast is already shown by queueUpload
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
        <div className="px-4 md:px-6 py-3 border-b border-border">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск сессий..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        
        {/* Session tabs - show only open tabs */}
        {filteredSessions.length > 0 && (
          <div className="border-b border-border px-4 md:px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            {isLoadingSessions ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Загрузка...</span>
              </div>
            ) : (
              <>
                {filteredSessions.map((session) => {
                  const isOpenTab = openTabs.has(session.id);
                  const isActive = activeSession === session.id;
                  
                  // Only show close button if session is in open tabs
                  // Sessions not in open tabs are just in the list, clicking them opens them
                  return (
                    <div
                      key={session.id}
                      className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors whitespace-nowrap group ${
                        isActive
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
                      {isOpenTab && (
                        <button
                          onClick={(e) => handleCloseSession(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                          title="Закрыть вкладку"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
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
        )}
        
        {/* Main content - 3 колонки: исходники, библиотека шаблонов, результат */}
        <div className="flex-1 overflow-hidden">
          {openTabs.size === 0 && filteredSessions.length === 0 ? (
            // Empty state - нет сессий вообще
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="mb-4 flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">Нет сессий</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Создайте новую сессию, чтобы начать работу.
                </p>
                <Button 
                  onClick={() => setCreateSessionDialogOpen(true)}
                  size="lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Создать новую сессию
                </Button>
              </div>
            </div>
          ) : openTabs.size === 0 && filteredSessions.length > 0 ? (
            // Есть сессии, но нет открытых вкладок - показываем подсказку
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="mb-4 flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">Выберите сессию</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Выберите сессию из списка выше, чтобы начать работу.
                </p>
              </div>
            </div>
          ) : (
          <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="h-full">
            {/* Левая колонка - Исходники (транскрипт, заметки) */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <div className="h-full border-r border-border flex flex-col">
            <div className="p-4 md:p-6 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">Ввод информации о пациенте</h2>
                {currentSession && !currentSession.patient_id && (
                  <Dialog open={linkDialogOpen} onOpenChange={(open) => {
                    setLinkDialogOpen(open);
                    if (!open) {
                      setRelinkWarning(null);
                      setSelectedPatientId("");
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2" onClick={handleOpenLinkDialog}>
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
                            onClick={() => {
                              setLinkDialogOpen(false);
                              setRelinkWarning(null);
                              setSelectedPatientId("");
                            }}
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
                <Dialog open={linkDialogOpen} onOpenChange={(open) => {
                  setLinkDialogOpen(open);
                  if (!open) {
                    setRelinkWarning(null);
                    setSelectedPatientId("");
                  }
                }}>
                  <DialogTrigger asChild>
                    {(() => {
                      const linkedPatient = currentSession.patient_id ? patientsMap.get(currentSession.patient_id) : undefined;
                      return linkedPatient ? (
                        <button
                          onClick={handleOpenLinkDialog}
                          className="text-sm text-foreground font-medium hover:text-primary hover:underline transition-colors cursor-pointer"
                        >
                          {linkedPatient.name}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Загрузка...
                        </span>
                      );
                    })()}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Перепривязать сессию к пациенту</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {relinkWarning && relinkWarning.show && (
                        <Alert variant="warning">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Внимание: перепривязка сессии</AlertTitle>
                          <AlertDescription className="mt-2">
                            <p className="mb-2">
                              У этой сессии уже есть клинические заметки:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              <li>Всего заметок: {relinkWarning.notesCount}</li>
                              {relinkWarning.finalizedCount > 0 && (
                                <li className="text-amber-600 dark:text-amber-500">
                                  Финализированных: {relinkWarning.finalizedCount}
                                </li>
                              )}
                              {relinkWarning.signedCount > 0 && (
                                <li className="text-red-600 dark:text-red-500">
                                  Подписанных: {relinkWarning.signedCount} (перепривязка запрещена)
                                </li>
                              )}
                            </ul>
                            {relinkWarning.signedCount === 0 && (
                              <p className="mt-2 text-sm">
                                Все заметки будут перепривязаны к новому пациенту.
                              </p>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}
                      <PatientCombobox
                        patients={patients}
                        value={selectedPatientId}
                        onValueChange={setSelectedPatientId}
                        placeholder="Выберите нового пациента"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setLinkDialogOpen(false);
                            setRelinkWarning(null);
                            setSelectedPatientId("");
                          }}
                          disabled={isLinking}
                        >
                          Отмена
                        </Button>
                        <Button
                          onClick={handleLinkToPatient}
                          disabled={
                            !selectedPatientId || 
                            isLinking || 
                            (relinkWarning?.signedCount ?? 0) > 0
                          }
                        >
                          {isLinking ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Перепривязка...
                            </>
                          ) : (
                            "Перепривязать"
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
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
                            {recording.transcription_status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    toast({
                                      title: "Повторный запуск",
                                      description: "Запускаем транскрипцию...",
                                    });
                                    await startTranscription(recording.id, transcriptionApiUrl);
                                    addTranscription(recording.id, recording.session_id);
                                    await loadRecordings(activeSession || '');
                                    toast({
                                      title: "Транскрипция запущена",
                                      description: "Ожидайте завершения обработки",
                                    });
                                  } catch (error) {
                                    console.error('Error retrying transcription:', error);
                                    toast({
                                      title: "Ошибка",
                                      description: "Не удалось запустить транскрипцию",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                className="h-6 px-2 text-xs"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Повторить
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
                  {hasFailedUploads ? (
                    <div className="flex items-center gap-2 flex-1">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <span className="text-sm text-destructive">
                        Ошибка загрузки ({failedUploadsCount})
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          // Retry all failed uploads
                          Array.from(pendingUploads.entries())
                            .filter(([_, u]) => u.status === 'failed')
                            .forEach(([id]) => retryUpload(id));
                        }}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Повторить
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          // Dismiss all failed uploads
                          Array.from(pendingUploads.entries())
                            .filter(([_, u]) => u.status === 'failed')
                            .forEach(([id]) => dismissFailedUpload(id));
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : hasActiveUploads ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">
                        Загрузка в фоне ({pendingUploads.size})...
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-sm text-muted-foreground">Готов</span>
                    </div>
                  )}
              
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => audioFileInputRef.current?.click()}
                  disabled={!activeSession}
                  className="gap-1"
                  title="Загрузить аудио файл"
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/webm,audio/mp3,audio/wav,audio/ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/m4a,.m4a,.aac"
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

                      const session = tabSessionsMap.get(activeSession);
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
                    disabled={!activeSession || !(activeSession && tabSessionsMap.get(activeSession)?.patient_id) || !selectedTemplateId || isGenerating}
                    title={
                      !activeSession
                        ? 'Выберите сессию'
                        : !(activeSession && tabSessionsMap.get(activeSession)?.patient_id)
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
          )}
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

      {/* Recovery Dialog */}
      <RecoveryDialog
        open={showRecoveryDialog}
        onOpenChange={setShowRecoveryDialog}
        recordings={unuploadedRecordings}
        onRetryUpload={async (localId: string) => {
          try {
            const recording = await getLocalRecording(localId);
            if (!recording) {
              toast({
                title: "Ошибка",
                description: "Запись не найдена",
                variant: "destructive",
              });
              return;
            }
            await retryUploadRecording(localId, recording);
            // Refresh list
            const updated = await getUnuploadedRecordings();
            setUnuploadedRecordings(updated);
            if (updated.length === 0) {
              setShowRecoveryDialog(false);
            }
          } catch (error) {
            console.error('Error retrying upload:', error);
            toast({
              title: "Ошибка",
              description: "Не удалось загрузить запись",
              variant: "destructive",
            });
          }
        }}
        onRefresh={async () => {
          const updated = await getUnuploadedRecordings();
          setUnuploadedRecordings(updated);
          if (updated.length === 0) {
            setShowRecoveryDialog(false);
          }
        }}
      />

      {/* Navigation Blocker Dialog for Recording */}
      <AlertDialog open={recordingBlocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Запись в процессе</AlertDialogTitle>
            <AlertDialogDescription>
              Идёт запись аудио в сессии. Если вы покинете страницу, запись будет потеряна.
              Вы уверены, что хотите уйти?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => recordingBlocker.reset?.()}>
              Остаться
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => recordingBlocker.proceed?.()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Покинуть страницу
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SessionsPage;
