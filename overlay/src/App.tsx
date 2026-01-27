import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { LoginScreen } from './components/LoginScreen';
import { OverlayPanel } from './components/OverlayPanel';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Проверяем текущую сессию
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
      }
      console.log('Current session:', session ? 'authenticated' : 'not authenticated');
      setSession(session);
      setIsLoading(false);
    });

    // Слушаем изменения авторизации
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session ? 'authenticated' : 'not authenticated');
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background/95">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <OverlayPanel />;
}

export default App;
