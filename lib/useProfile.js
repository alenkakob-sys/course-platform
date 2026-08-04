import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabaseClient';

// Повертає { loading, session, profile }. Якщо requireAuth і сесії немає,
// автоматично перенаправляє на /login.
export function useProfile({ requireAuth = true } = {}) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, session: null, profile: null });

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) setState({ loading: false, session: null, profile: null });
        if (requireAuth) router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', session.user.id)
        .single();
      if (active) setState({ loading: false, session, profile });
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && requireAuth) {
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, [requireAuth, router]);

  return state;
}
