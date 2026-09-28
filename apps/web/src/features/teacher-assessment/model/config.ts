/* Build-time mode switch.
   mvp      (default) — no sign-in; the backend runs in the browser and data stays on this device.
   platform           — thisai.pro session + the HTTP API in apps/api (set VITE_TA_MODE=platform). */
export type TaMode = 'mvp' | 'platform';
export const taMode = (): TaMode => (import.meta.env.VITE_TA_MODE === 'platform' ? 'platform' : 'mvp');
export const isMvp = () => taMode() === 'mvp';
