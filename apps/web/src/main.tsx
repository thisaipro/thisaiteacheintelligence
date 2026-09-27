/* Standalone host shell. In thisai_fe the feature mounts inside the existing
   router and QueryClientProvider; only the <Route> line below is needed there. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TeacherAssessmentRoutes } from './features/teacher-assessment';
import { DevAccountBar } from './platform/DevAccountBar';

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        {import.meta.env.DEV && <DevAccountBar />}
        <Routes>
          <Route path="/teacher-assessment/*" element={<TeacherAssessmentRoutes />} />
          <Route path="*" element={<Navigate to="/teacher-assessment" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
