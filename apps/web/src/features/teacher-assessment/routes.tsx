/* Mount inside the host router:  <Route path="/teacher-assessment/*" element={<TeacherAssessmentRoutes />} /> */
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { outbox } from './api/outbox';
import { RequireModuleAccess } from './guards/RequireModuleAccess';
import AdminBank from './pages/AdminBank';
import AdminTeacherDetail from './pages/AdminTeacherDetail';
import AdminTeachers from './pages/AdminTeachers';
import Landing from './pages/Landing';
import Profile from './pages/Profile';
import Review from './pages/Review';
import Runner from './pages/Runner';
import Submitted from './pages/Submitted';
import './styles/ported.css';
import './styles/module.css';

const T = ({ children, closed }: { children: React.ReactNode; closed?: boolean }) => <RequireModuleAccess mode="teacher" allowClosedCycle={closed}>{children}</RequireModuleAccess>;
const A = ({ children }: { children: React.ReactNode }) => <RequireModuleAccess mode="admin">{children}</RequireModuleAccess>;

export function TeacherAssessmentRoutes() {
  useEffect(() => outbox.start(), []);
  return (
    <Routes>
      <Route index element={<T><Landing /></T>} />
      <Route path="run" element={<Navigate to="1" replace />} />
      <Route path="run/:index" element={<T><Runner /></T>} />
      <Route path="review" element={<T><Review /></T>} />
      <Route path="submitted" element={<T><Submitted /></T>} />
      <Route path="profile" element={<T closed><Profile /></T>} />
      <Route path="admin" element={<Navigate to="bank" replace />} />
      <Route path="admin/bank" element={<A><AdminBank /></A>} />
      <Route path="admin/teachers" element={<A><AdminTeachers /></A>} />
      <Route path="admin/teachers/:teacherId" element={<A><AdminTeacherDetail /></A>} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}

export default TeacherAssessmentRoutes;
