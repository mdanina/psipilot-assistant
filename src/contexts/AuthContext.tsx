import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, ProfileWithClinic } from '@/types';

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
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // MFA methods
  enableMFA: () => Promise<{ error: Error | null; data?: { qrCode: string; secret: string } }>;
  verifyMFA: (code: string) => Promise<{ error: Error | null }>;
  disableMFA: () => Promise<{ error: Error | null }>;
  updateActivity: () => void;
  getLastActivity: () => number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Session timeout constant (15 minutes)
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const SESSION_WARNING_TIME = 2 * 60 * 1000; // 2 minutes before timeout
const ACTIVITY_DEBOUNCE = 5000; // Only update activity every 5 seconds max

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
  });

  // Ref to track last activity update time for debouncing
  const lastActivityUpdateRef = useRef<number>(0);

  // Ref to store lastActivity without triggering re-renders
  const lastActivityRef = useRef<number>(Date.now());

  // Ref to prevent duplicate fetchProfile calls between signIn and onAuthStateChange
  const signInCompletedRef = useRef<boolean>(false);

  // Fetch user profile with clinic data using JOIN (single query)
  const fetchProfile = useCallback(async (userId: string): Promise<ProfileWithClinic | null> => {
    console.log('🔍 Fetching profile for user:', userId);

    try {
      // Use JOIN to fetch profile and clinic in a single query
      const { data, error } = await supabase
        .from('profiles')
        .select('*, clinic:clinics(*)')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ Error fetching profile:', error);
        if ('code' in error) {
          console.error('   Error code:', error.code);
        }
        console.error('   Error message:', error.message);
        return null;
      }

      if (!data) {
        console.warn('⚠️  Profile query returned no data for user:', userId);
        return null;
      }

      console.log('✅ Profile fetched successfully:', {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        clinic_id: data.clinic_id,
        has_clinic: !!data.clinic
      });

      return data as ProfileWithClinic & { mfa_enabled?: boolean };
    } catch (err) {
      console.error('❌ Unexpected error fetching profile:', err);
      return null;
    }
  }, []);

  // Sign out - defined early for use in useEffect
  const signOut = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    await supabase.auth.signOut();
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
    });
  }, []);

  // Update last activity timestamp - uses ref to avoid re-renders
  const updateActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    // Only update state occasionally to sync sessionExpiresAt for UI components that need it
    // This prevents frequent re-renders while still keeping state roughly in sync
  }, []);

  // Get last activity from ref (no re-render)
  const getLastActivity = useCallback(() => {
    return lastActivityRef.current;
  }, []);

  // Session timeout monitoring - uses ref to avoid dependency on state.lastActivity
  useEffect(() => {
    if (!state.isAuthenticated || !state.session) {
      return;
    }

    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;

      if (timeSinceActivity >= SESSION_TIMEOUT) {
        // Auto logout
        signOut();
      }
    };

    const interval = setInterval(checkTimeout, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.session, signOut]);

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
            mfaEnabled: (profile as any)?.mfa_enabled || false,
            mfaVerified: false,
            lastActivity: now,
            sessionExpiresAt: now + SESSION_TIMEOUT,
          });
          console.log('✅ Auth initialized successfully');
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
    }, 10000); // 10 second timeout
    
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

          // Skip if signIn already completed the profile fetch (prevents duplicate calls)
          if (signInCompletedRef.current) {
            console.log('🔄 SIGNED_IN event skipped - signIn already handled');
            signInCompletedRef.current = false; // Reset for next sign in
            return;
          }

          // This handles cases where auth state changed outside of signIn
          // (e.g., session restore, OAuth redirect)
          console.log('🔄 SIGNED_IN event, updating state...');
          try {
            const profile = await fetchProfile(session.user.id);
            const now = Date.now();
            if (isMounted) {
              setState({
                user: session.user,
                profile,
                session,
                isLoading: false,
                isAuthenticated: true,
                mfaEnabled: (profile as any)?.mfa_enabled || false,
                mfaVerified: false,
                lastActivity: now,
                sessionExpiresAt: now + SESSION_TIMEOUT,
              });
              console.log('✅ State updated from SIGNED_IN event');
            }
          } catch (error) {
            console.error('❌ Error in SIGNED_IN handler:', error);
            // Even if profile fetch fails, mark as authenticated
            if (isMounted) {
              const now = Date.now();
              setState({
                user: session.user,
                profile: null,
                session,
                isLoading: false,
                isAuthenticated: true,
                mfaEnabled: false,
                mfaVerified: false,
                lastActivity: now,
                sessionExpiresAt: now + SESSION_TIMEOUT,
              });
              console.log('✅ User authenticated (profile fetch failed)');
            }
          }
        } else if (event === 'SIGNED_OUT') {
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
          });
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

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    signInCompletedRef.current = false;

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

      // Successfully signed in - update state immediately
      // Mark as completed so onAuthStateChange doesn't duplicate the fetchProfile call
      if (data?.session?.user) {
        console.log('✅ Sign in successful, fetching profile...');
        try {
          const profile = await fetchProfile(data.session.user.id);
          const now = Date.now();
          signInCompletedRef.current = true; // Mark before setState to prevent race
          setState({
            user: data.session.user,
            profile,
            session: data.session,
            isLoading: false,
            isAuthenticated: true,
            mfaEnabled: (profile as any)?.mfa_enabled || false,
            mfaVerified: false,
            lastActivity: now,
            sessionExpiresAt: now + SESSION_TIMEOUT,
          });
          console.log('✅ User authenticated successfully');
        } catch (profileError) {
          console.error('❌ Error fetching profile after sign in:', profileError);
          // Even if profile fetch fails, we still have a valid session
          const now = Date.now();
          signInCompletedRef.current = true;
          setState({
            user: data.session.user,
            profile: null,
            session: data.session,
            isLoading: false,
            isAuthenticated: true,
            mfaEnabled: false,
            mfaVerified: false,
            lastActivity: now,
            sessionExpiresAt: now + SESSION_TIMEOUT,
          });
        }
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

    try {
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

      // Success - reset loading state
      setState(prev => ({ ...prev, isLoading: false }));
      return { error: null };
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false }));
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
      const { error } = await supabase.auth.mfa.verify({
        factorId: 'totp', // This should be the actual factor ID from enrollment
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

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (state.user) {
      const profile = await fetchProfile(state.user.id);
      setState(prev => ({ ...prev, profile }));
    }
  }, [state.user, fetchProfile]);

  const value: AuthContextType = useMemo(() => ({
    ...state,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    enableMFA,
    verifyMFA,
    disableMFA,
    updateActivity,
    getLastActivity,
  }), [state, signIn, signUp, signOut, refreshProfile, enableMFA, verifyMFA, disableMFA, updateActivity, getLastActivity]);

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
