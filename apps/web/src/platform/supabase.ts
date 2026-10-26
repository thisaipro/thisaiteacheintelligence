import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export function supabaseConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL && (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY));
}

export function getSupabase() {
  if (!supabaseConfigured()) throw new Error('Sign-in is not configured. Please contact your administrator.');
  return client ??= createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
  );
}

/** getSession refreshes expiring tokens; the API verifies the bearer independently. */
export async function sessionHeaders(): Promise<Record<string, string>> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function currentUserId() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}
