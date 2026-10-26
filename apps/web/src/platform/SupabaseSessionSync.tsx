import { useEffect } from 'react';
import { isSupabase } from '../features/teacher-assessment/model/config';
import { getSupabase, supabaseConfigured } from './supabase';
import { clearPageCache } from './pageCache';
import { useQueryClient } from '@tanstack/react-query';
import type { Me } from '@thisai/ta-shared';

/** A sign-out/account change in another tab must also discard this tab's UI. */
export function SupabaseSessionSync() {
  const client = useQueryClient();
  useEffect(() => {
    if (!isSupabase() || !supabaseConfigured()) return;
    let previous: string | null | undefined = client.getQueryData<Me | null>(['me'])?.user_id;
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (_event === 'SIGNED_OUT' || (previous !== undefined && previous !== next)) {
        clearPageCache();
        client.clear();
        window.location.replace('/teacher-assessment');
      }
      previous = next;
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  return null;
}
