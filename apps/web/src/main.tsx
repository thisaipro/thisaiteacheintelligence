/* Standalone host shell. In thisai_fe the feature mounts inside the existing
   router and QueryClientProvider; only the <Route> line below is needed there. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TeacherAssessmentRoutes } from './features/teacher-assessment';
import { DevAccountBar } from './platform/DevAccountBar';
import { taMode } from './features/teacher-assessment/model/config';
import { SupabaseSessionSync } from './platform/SupabaseSessionSync';
import { getSupabase, supabaseConfigured } from './platform/supabase';
import { clearPageCache, persistPageCache, restorePageCache } from './platform/pageCache';

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

async function start() {
  if (taMode() === 'supabase' && supabaseConfigured()) {
    try {
      const { data } = await getSupabase().auth.getSession();
      if (data.session) {
        const project = import.meta.env.VITE_SUPABASE_URL;
        restorePageCache(qc, project, data.session.user.id);
        persistPageCache(qc, project, data.session.user.id);
      } else clearPageCache();
    } catch { clearPageCache(); }
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <SupabaseSessionSync />
          {import.meta.env.DEV && taMode() === 'platform' && <DevAccountBar />}
          <Routes>
            <Route path="/teacher-assessment/*" element={<TeacherAssessmentRoutes />} />
            <Route path="*" element={<Navigate to="/teacher-assessment" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void start();
