import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Clinic, Profile, ProfileWithClinic } from '@/types';
import { clearAllLocalRecordings } from '@/lib/local-recording-storage';
import { clearSessionKey } from '@/lib/recording-encryption';

type ProfileQueryResult = { data: Profile | null; error: { message?: string } | null };
type ProfileWithMfaFlag = ProfileWithClinic & { mfa_enabled?: boolean };

function hasMfaEnabled(profile: ProfileWithMfaFlag | null): boolean {
  return Boolean(profile?.mfa_enabled);
}

interface AuthState {
  user: User | null;
  profile: ProfileWithClinic | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  lastActivity: number;
  sessionExpiresAt: number | null;
  protectedActivityCount: number;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<ProfileWithClinic | null>;
  // Password reset methods
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  // MFA methods
  enableMFA: () => Promise<{ error: Error | null; data?: { qrCode: string; secret: string } }>;
  verifyMFA: (code: string) => Promise<{ error: Error | null }>;
  disableMFA: () => Promise<{ error: Error | null }>;
  updateActivity: () => void;
  startProtectedActivity: () => () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Session timeout constant (15 minutes)
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const SESSION_WARNING_TIME = 2 * 60 * 1000; // 2 minutes before timeout
const ACTIVITY_DEBOUNCE = 5000; // Only update activity every 5 seconds max

// Simple in-memory cache for profiles and clinics to prevent duplicate requests
const profileCache = new Map<string, { data: ProfileWithClinic | null; timestamp: number }>();
const clinicCache = new Map<string, { data: Clinic; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Request deduplication: track in-flight requests to prevent parallel duplicate requests
const profileRequests = new Map<string, Promise<ProfileWithClinic | null>>();
const clinicRequests = new Map<string, Promise<Clinic | null>>();

// Helper to get cached profile or fetch if not cached
async function getCachedProfile(userId: string): Promise<ProfileWithClinic | null> {
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

// Helper to cache profile
function setCachedProfile(userId: string, profile: ProfileWithClinic | null) {
  profileCache.set(userId, { data: profile, timestamp: Date.now() });
}

// Helper to get cached clinic or fetch if not cached
async function getCachedClinic(clinicId: string): Promise<Clinic | null> {
  const cached = clinicCache.get(clinicId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

// Helper to cache clinic
function setCachedClinic(clinicId: string, clinic: Clinic) {
  clinicCache.set(clinicId, { data: clinic, timestamp: Date.now() });
}

// Helper to load clinic with caching and request deduplication
async function loadClinicWithCache(clinicId: string): Promise<Clinic | null> {
  // Check cache first
  const cached = await getCachedClinic(clinicId);
  if (cached !== null) {
    console.log('✅ Clinic loaded from cache:', clinicId);
    return cached;
  }

  // Check if request is already in-flight (deduplication)
  const inFlightRequest = clinicRequests.get(clinicId);
  if (inFlightRequest) {
    console.log('⏳ Clinic request already in-flight, waiting...', clinicId);
    return inFlightRequest;
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', clinicId)
        .single();

      if (clinicError || !clinicData) {
        console.warn('⚠️  Could not load clinic:', clinicError?.message);
        return null;
      }

      // Cache the clinic
      setCachedClinic(clinicId, clinicData);
      console.log('✅ Clinic loaded from database:', clinicId);
      return clinicData;
    } catch (err) {
      console.warn('⚠️  Error loading clinic:', err);
      return null;
    } finally {
      // Remove from in-flight requests
      clinicRequests.delete(clinicId);
    }
  })();

  // Store in-flight request
  clinicRequests.set(clinicId, requestPromise);

  return requestPromise;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    mfaEnabled: false,
    mfaVerified: false,
    lastActivity: Date.now(),
    sessionExpiresAt: null,
    protectedActivityCount: 0,
  });

  // Ref to track last activity update time for debouncing
  const lastActivityUpdateRef = useRef<number>(0);
  const protectedActivityCountRef = useRef<number>(0);

  // Fetch user profile with clinic data (simple version - load separately)
  // ✅ OPTIMIZED: Uses cache and request deduplication to prevent duplicate requests
  const fetchProfile = useCallback(async (userId: string): Promise<ProfileWithClinic | null> => {
    console.log('🔍 Fetching profile for user:', userId);

    // Check cache first
    const cached = await getCachedProfile(userId);
    if (cached !== null) {
      console.log('✅ Profile loaded from cache');
      return cached;
    }

    // Check if request is already in-flight (deduplication)
    const inFlightRequest = profileRequests.get(userId);
    if (inFlightRequest) {
      console.log('⏳ Profile request already in-flight, waiting...', userId);
      return inFlightRequest;
    }

    // Create new request
    const requestPromise = (async () => {
      try {
        // Add timeout to prevent hanging
        const profilePromise = supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        const timeoutPromise = new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Profile fetch timeout after 5 seconds')), 5000)
        );

        const result = await Promise.race<ProfileQueryResult | null>([profilePromise, timeoutPromise]);

        if (!result) {
          console.warn('⚠️  Profile query timed out for user:', userId);
          return null;
        }
        
        if (result.error) {
          console.error('❌ Error fetching profile:', result.error);
          return null;
        }

        if (!result.data) {
          console.warn('⚠️  Profile query returned no data for user:', userId);
          return null;
        }

        const data = result.data;

        // Don't fetch clinic during initial load - load it asynchronously later
        // This prevents blocking on RLS policies
        const clinic = null;

        const profile = {
          ...data,
          clinic: clinic || null
        } as ProfileWithClinic & { mfa_enabled?: boolean };

        // Cache the profile
        setCachedProfile(userId, profile);

        console.log('✅ Profile fetched successfully:', {
          id: data.id,
          email: data.email,
          clinic_id: data.clinic_id,
          has_clinic: !!clinic
        });

        return profile;
      } catch (err) {
        console.error('❌ Error fetching profile (timeout or error):', err);
        // Return null to allow app to continue - user can still use app without profile
        return null;
      } finally {
        // Remove from in-flight requests
        profileRequests.delete(userId);
      }
    })();

    // Store in-flight request
    profileRequests.set(userId, requestPromise);

    return requestPromise;
  }, []);

  // Sign out - defined early for use in useEffect
  const signOut = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    await supabase.auth.signOut();
    
    // Clear caches on sign out
    profileCache.clear();
    clinicCache.clear();
    profileRequests.clear();
    clinicRequests.clear();
    
    // Clear local recordings on logout
    try {
      await clearAllLocalRecordings();
      clearSessionKey();
      console.log('[AuthContext] Local recordings and session key cleared on logout');
    } catch (error) {
      console.error('[AuthContext] Error clearing local recordings:', error);
      // Don't throw - cleanup failure shouldn't prevent logout
    }
    
    setState({
      user: null,
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      mfaEnabled: false,
      mfaVerified: false,
      lastActivity: Date.now(),
      sessionExpiresAt: null,
      protectedActivityCount: 0,
    });
    protectedActivityCountRef.current = 0;
  }, []);

  // Update last activity timestamp - defined early for use in useEffect
  const updateActivity = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastActivity: Date.now(),
      sessionExpiresAt: Date.now() + SESSION_TIMEOUT,
    }));
  }, []);

  const startProtectedActivity = useCallback(() => {
    let released = false;
    const now = Date.now();
    protectedActivityCountRef.current += 1;

    setState(prev => ({
      ...prev,
      protectedActivityCount: prev.protectedActivityCount + 1,
      lastActivity: now,
      sessionExpiresAt: now + SESSION_TIMEOUT,
    }));

    return () => {
      if (released) return;
      released = true;
      protectedActivityCountRef.current = Math.max(0, protectedActivityCountRef.current - 1);

      setState(prev => ({
        ...prev,
        protectedActivityCount: Math.max(0, prev.protectedActivityCount - 1),
      }));
    };
  }, []);

  // Session timeout monitoring
  useEffect(() => {
    if (!state.isAuthenticated || !state.session) {
      return;
    }

    const checkTimeout = () => {
      const now = Date.now();

      if (protectedActivityCountRef.current > 0) {
        // Keep session alive during protected background activity.
        setState(prev => {
          if (now - prev.lastActivity < ACTIVITY_DEBOUNCE) {
            return prev;
          }
          return {
            ...prev,
            lastActivity: now,
            sessionExpiresAt: now + SESSION_TIMEOUT,
          };
        });
        return;
      }

      const timeSinceActivity = now - state.lastActivity;

      if (timeSinceActivity >= SESSION_TIMEOUT) {
        // Auto logout
        signOut();
      }
    };

    const interval = setInterval(checkTimeout, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.session, state.lastActivity, signOut]);

  // Track user activity with debouncing to prevent excessive state updates
  useEffect(() => {
    if (!state.isAuthenticated) {
      return;
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const handleActivity = () => {
      const now = Date.now();
      // Only update if enough time has passed since last update (debounce)
      if (now - lastActivityUpdateRef.current >= ACTIVITY_DEBOUNCE) {
        lastActivityUpdateRef.current = now;
        updateActivity();
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [state.isAuthenticated, updateActivity]);

  // Initialize auth state
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    let authCompletedViaEvent = false;
    
    // Get initial session with timeout
    const initAuth = async () => {
      // Check if Supabase is properly configured
      if (!isSupabaseConfigured) {
        console.error('❌ Supabase not configured - check environment variables');
        if (isMounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
        return;
      }

      try {
        console.log('🔐 Initializing auth...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Error getting session:', error.message);
          if (isMounted) {
            setState(prev => ({ ...prev, isLoading: false }));
          }
          return;
        }
        
        if (session?.user && isMounted) {
          console.log('✅ Session found, fetching profile...');
          const profile = await fetchProfile(session.user.id);
          const now = Date.now();
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
            mfaEnabled: hasMfaEnabled(profile),
            mfaVerified: false,
            lastActivity: now,
            sessionExpiresAt: now + SESSION_TIMEOUT,
            protectedActivityCount: 0,
          });
          console.log('✅ Auth initialized successfully');
          
          // Load clinic asynchronously after profile is loaded (non-blocking)
          // ✅ OPTIMIZED: Uses cache to prevent duplicate requests
          if (profile?.clinic_id) {
            (async () => {
              try {
                // Check cache first
                const cachedClinic = await getCachedClinic(profile.clinic_id);
                if (cachedClinic && isMounted) {
                  setState(prev => ({
                    ...prev,
                    profile: prev.profile ? { ...prev.profile, clinic: cachedClinic } : null
                  }));
                  console.log('✅ Clinic loaded from cache');
                  return;
                }

                const clinicData = await loadClinicWithCache(profile.clinic_id);
                if (clinicData && isMounted) {
                  setState(prev => ({
                    ...prev,
                    profile: prev.profile ? { ...prev.profile, clinic: clinicData } : null
                  }));
                }
              } catch (err) {
                console.warn('⚠️  Error loading clinic asynchronously:', err);
              }
            })();
          }
        } else if (isMounted) {
          console.log('ℹ️  No session found, user not authenticated');
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (isMounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };
    
    // Set a timeout to prevent infinite loading
    // But only if we haven't already authenticated via onAuthStateChange
    timeoutId = setTimeout(() => {
      if (isMounted && !authCompletedViaEvent) {
        console.warn('⚠️  Auth initialization timeout - setting isLoading to false');
        setState(prev => {
          // Only set loading to false if we're still loading and not authenticated
          if (prev.isLoading && !prev.isAuthenticated) {
            return { ...prev, isLoading: false };
          }
          return prev;
        });
      }
    }, 15000); // 15 second timeout (increased for slow connections)
    
    initAuth().finally(() => {
      // Clear timeout if initAuth completes (even if it fails)
      if (!authCompletedViaEvent && timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        console.log(`🔄 Auth state change: ${event}`, session?.user?.email || 'no user');
        
        if (event === 'SIGNED_IN' && session?.user) {
          // Mark that auth was completed via event (so timeout won't interfere)
          authCompletedViaEvent = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // This may be called after signIn already updated state, but it's safe to update again
          // It ensures state is consistent even if signIn didn't complete
          console.log('🔄 SIGNED_IN event, updating state...');
          
          // Set authenticated state immediately (don't wait for profile)
          const now = Date.now();
          if (isMounted) {
            setState({
              user: session.user,
              profile: null, // Will be updated when profile loads
              session,
              isLoading: false,
              isAuthenticated: true,
              mfaEnabled: false,
              mfaVerified: false,
              lastActivity: now,
              sessionExpiresAt: now + SESSION_TIMEOUT,
              protectedActivityCount: 0,
            });
            console.log('✅ User authenticated (profile loading in background)');
          }
          
          // Fetch profile in background (non-blocking)
          fetchProfile(session.user.id).then(profile => {
            if (profile && isMounted) {
              setState(prev => ({
                ...prev,
                profile,
                mfaEnabled: hasMfaEnabled(profile),
              }));
              console.log('✅ Profile loaded and updated');
              
              // Load clinic asynchronously after profile is loaded (non-blocking)
              if (profile?.clinic_id) {
                (async () => {
                  try {
                    const clinicData = await loadClinicWithCache(profile.clinic_id);
                    if (clinicData && isMounted) {
                      setState(prev => ({
                        ...prev,
                        profile: prev.profile ? { ...prev.profile, clinic: clinicData } : null
                      }));
                    }
                  } catch (err) {
                    console.warn('⚠️  Error loading clinic asynchronously:', err);
                  }
                })();
              }
            }
          }).catch(error => {
            console.error('❌ Error in SIGNED_IN handler:', error);
            // Even if profile fetch fails, user is already authenticated
            // No need to update state again - it was already set above
          });
        } else if (event === 'SIGNED_OUT') {
          // Clear module-level caches to prevent stale data on re-login
          // (signOut() clears them too, but SIGNED_OUT can fire from session expiry)
          profileCache.clear();
          clinicCache.clear();
          profileRequests.clear();
          clinicRequests.clear();

          setState({
            user: null,
            profile: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
            mfaEnabled: false,
            mfaVerified: false,
            lastActivity: Date.now(),
            sessionExpiresAt: null,
            protectedActivityCount: 0,
          });
          protectedActivityCountRef.current = 0;
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setState(prev => ({ ...prev, session }));
        }
      }
    );

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Auto-load clinic when profile has clinic_id but clinic is not loaded
  // ✅ OPTIMIZED: Uses cache to prevent duplicate requests
  useEffect(() => {
    if (!state.profile?.clinic_id || state.profile.clinic) {
      return; // No clinic_id or clinic already loaded
    }

    // Load clinic asynchronously
    (async () => {
      try {
        // Check cache first
        const cachedClinic = await getCachedClinic(state.profile.clinic_id);
        if (cachedClinic) {
          setState(prev => ({
            ...prev,
            profile: prev.profile ? { ...prev.profile, clinic: cachedClinic } : null
          }));
          console.log('✅ Clinic auto-loaded from cache');
          return;
        }

        const clinicData = await loadClinicWithCache(state.profile.clinic_id);
        if (clinicData) {
          setState(prev => ({
            ...prev,
            profile: prev.profile ? { ...prev.profile, clinic: clinicData } : null
          }));
        }
      } catch (err) {
        console.warn('⚠️  Error auto-loading clinic:', err);
      }
    })();
  }, [state.profile?.clinic_id, state.profile?.clinic]);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ Sign in error:', error.message);
        setState(prev => ({ ...prev, isLoading: false }));
        return { error };
      }

      // Successfully signed in - update state immediately (don't wait for profile)
      if (data?.session?.user) {
        console.log('✅ Sign in successful, authenticating user...');
        
        // Authenticate user immediately with session (don't wait for profile)
        const now = Date.now();
        setState({
          user: data.session.user,
          profile: null, // Will be updated when profile loads
          session: data.session,
          isLoading: false,
          isAuthenticated: true,
          mfaEnabled: false,
          mfaVerified: false,
          lastActivity: now,
          sessionExpiresAt: now + SESSION_TIMEOUT,
          protectedActivityCount: 0,
        });
        console.log('✅ User authenticated (profile loading in background)');
        
        // Fetch profile in background (non-blocking)
        fetchProfile(data.session.user.id).then(profile => {
          if (profile) {
            setState(prev => ({
              ...prev,
              profile,
              mfaEnabled: hasMfaEnabled(profile),
            }));
            console.log('✅ Profile loaded in background');
            
            // Load clinic asynchronously after profile is loaded (non-blocking)
            if (profile?.clinic_id) {
              (async () => {
                try {
                  const clinicData = await loadClinicWithCache(profile.clinic_id);
                  if (clinicData) {
                    setState(prev => ({
                      ...prev,
                      profile: prev.profile ? { ...prev.profile, clinic: clinicData } : null
                    }));
                  }
                } catch (err) {
                  console.warn('⚠️  Error loading clinic asynchronously:', err);
                }
              })();
            }
          }
        }).catch(err => {
          console.warn('⚠️  Background profile fetch failed:', err);
          // User is already authenticated, so this is not critical
        });
      } else {
        console.warn('⚠️  Sign in succeeded but no session data');
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return { error: null };
    } catch (err) {
      console.error('❌ Unexpected sign in error:', err);
      setState(prev => ({ ...prev, isLoading: false }));
      return { error: err as Error };
    }
  }, [fetchProfile]);

  // Sign up new user
  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      return { error };
    }

    return { error: null };
  }, []);

  // Request password reset (sends email with reset link)
  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('❌ Password reset error:', error.message);
        return { error };
      }

      console.log('✅ Password reset email sent to:', email);
      return { error: null };
    } catch (err) {
      console.error('❌ Unexpected password reset error:', err);
      return { error: err as Error };
    }
  }, []);

  // Update password (after clicking reset link)
  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('❌ Update password error:', error.message);
        return { error };
      }

      console.log('✅ Password updated successfully');
      return { error: null };
    } catch (err) {
      console.error('❌ Unexpected update password error:', err);
      return { error: err as Error };
    }
  }, []);

  // MFA: Enable MFA for current user
  const enableMFA = useCallback(async () => {
    if (!state.user) {
      return { error: new Error('User not authenticated') };
    }

    try {
      // Start MFA enrollment using Supabase Auth
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });

      if (error) {
        return { error };
      }

      return {
        error: null,
        data: {
          qrCode: data.qr_code || '',
          secret: data.secret || '',
        },
      };
    } catch (err) {
      return { error: err as Error };
    }
  }, [state.user]);

  // MFA: Verify MFA code
  const verifyMFA = useCallback(async (code: string) => {
    if (!state.user) {
      return { error: new Error('User not authenticated') };
    }

    try {
      // Get the actual factor ID from enrolled TOTP factors
      const { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        return { error: listError };
      }
      const totpFactor = factorsData?.totp?.[0];
      if (!totpFactor) {
        return { error: new Error('No TOTP factor enrolled. Please enroll MFA first.') };
      }

      // Create a challenge for the factor
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) {
        return { error: challengeError };
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code,
      });

      if (error) {
        return { error };
      }

      // Update profile to mark MFA as enabled
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          mfa_enabled: true,
          mfa_enabled_at: new Date().toISOString(),
        })
        .eq('id', state.user.id);

      if (updateError) {
        return { error: updateError };
      }

      setState(prev => ({
        ...prev,
        mfaEnabled: true,
        mfaVerified: true,
      }));

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, [state.user]);

  // MFA: Disable MFA
  const disableMFA = useCallback(async () => {
    if (!state.user) {
      return { error: new Error('User not authenticated') };
    }

    try {
      // Unenroll all MFA factors
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();

      if (listError) {
        return { error: listError };
      }

      // Unenroll each factor
      for (const factor of factors.totp || []) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          mfa_enabled: false,
          mfa_enabled_at: null,
        })
        .eq('id', state.user.id);

      if (updateError) {
        return { error: updateError };
      }

      setState(prev => ({
        ...prev,
        mfaEnabled: false,
        mfaVerified: false,
      }));

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, [state.user]);

  // Refresh profile data and clinic
  // Always clears cache to ensure fresh data is fetched (important after onboarding)
  // Returns the refreshed profile so callers can verify the data before navigation
  const refreshProfile = useCallback(async (): Promise<ProfileWithClinic | null> => {
    if (!state.user) {
      return null;
    }

    // Clear profile cache to force fresh data fetch
    profileCache.delete(state.user.id);

    const profile = await fetchProfile(state.user.id);
    setState(prev => ({ ...prev, profile }));

    // Load clinic if profile has clinic_id
    if (profile?.clinic_id) {
      try {
        // Clear clinic cache to ensure fresh data after onboarding
        clinicCache.delete(profile.clinic_id);
        const clinicData = await loadClinicWithCache(profile.clinic_id);
        if (clinicData) {
          const profileWithClinic = { ...profile, clinic: clinicData };
          setState(prev => ({
            ...prev,
            profile: profileWithClinic
          }));
          return profileWithClinic;
        }
      } catch (err) {
        console.warn('⚠️  Error loading clinic in refreshProfile:', err);
      }
    }

    return profile;
  }, [state.user, fetchProfile]);

  const value: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    resetPassword,
    updatePassword,
    enableMFA,
    verifyMFA,
    disableMFA,
    updateActivity,
    startProtectedActivity,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
