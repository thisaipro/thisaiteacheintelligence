/* Build-time mode switch.
   mvp      (default) — no sign-in; the backend runs in the browser and data stays on this device.
   platform           — thisai.pro session + the HTTP API in apps/api (set VITE_TA_MODE=platform). */
// supabase — email/password sign-in + HTTP API + shared Postgres storage.
export type TaMode = 'mvp' | 'platform' | 'supabase';
export const taMode = (): TaMode => {
  const mode = import.meta.env.VITE_TA_MODE || 'mvp';
  if (mode !== 'mvp' && mode !== 'platform' && mode !== 'supabase') throw new Error('Unknown VITE_TA_MODE');
  return mode;
};
export const isMvp = () => taMode() === 'mvp';
export const isSupabase = () => taMode() === 'supabase';
