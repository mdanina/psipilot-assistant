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

  // Fetch user profile with clinic data
  const fetchProfile = useCallback(async (userId: string): Promise<ProfileWithClinic | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        clinic:clinics(*)
      `)
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error.message);
      return null;
    }

    const profile = data as ProfileWithClinic & { mfa_enabled?: boolean };
    
    // Don't update state here - it will be updated in the calling useEffect
    // This prevents infinite loops

    return profile;
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

  // Update last activity timestamp - defined early for use in useEffect
  const updateActivity = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastActivity: Date.now(),
      sessionExpiresAt: Date.now() + SESSION_TIMEOUT,
    }));
  }, []);

  // Session timeout monitoring
  useEffect(() => {
    if (!state.isAuthenticated || !state.session) {
      return;
    }

    const checkTimeout = () => {
      const now = Date.now();
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
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth initialization timeout - setting isLoading to false');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }, 5000); // 5 second timeout for faster feedback
    
    initAuth().finally(() => {
      clearTimeout(timeoutId);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        console.log(`🔄 Auth state change: ${event}`, session?.user?.email || 'no user');
        
        if (event === 'SIGNED_IN' && session?.user) {
          // This may be called after signIn already updated state, but it's safe to update again
          // It ensures state is consistent even if signIn didn't complete
          console.log('🔄 SIGNED_IN event, updating state...');
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
          console.log('✅ State updated from SIGNED_IN event');
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
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ Sign in error:', error.message);
        setState(prev => ({ ...prev, isLoading: false }));
        return { error };
      }

      // Successfully signed in - onAuthStateChange will handle profile fetch and state update
      // This prevents duplicate fetchProfile calls
      console.log('✅ Sign in successful, waiting for auth state change...');
      return { error: null };
    } catch (err) {
      console.error('❌ Unexpected sign in error:', err);
      setState(prev => ({ ...prev, isLoading: false }));
      return { error: err as Error };
    }
  }, []);

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

  const value: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    enableMFA,
    verifyMFA,
    disableMFA,
    updateActivity,
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
