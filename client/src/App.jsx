import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { LiveProvider } from './lib/live';
import { AuthProvider, useAuth } from './lib/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Shell } from './components/Shell';
import { Intro } from './components/Intro';
import IncidentsPage from './pages/IncidentsPage';
import ReportPage from './pages/ReportPage';
import LabPage from './pages/LabPage';
import AuditPage from './pages/AuditPage';
import LoginPage from './pages/LoginPage';
import BenchmarkPage from './pages/BenchmarkPage';

// Everything except the login page needs a session. Incident data and the live stream
// only load once someone is signed in.
function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return (
    <LiveProvider>
      <Outlet />
    </LiveProvider>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<Shell />}>
                  <Route index element={<Navigate to="/incidents" replace />} />
                  <Route path="incidents" element={<IncidentsPage />} />
                  <Route path="incidents/:id" element={<IncidentsPage />} />
                  <Route path="incidents/:id/report" element={<ReportPage />} />
                  <Route path="lab" element={<LabPage />} />
                  <Route path="benchmark" element={<BenchmarkPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="*" element={<Navigate to="/incidents" replace />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
      <Intro />
      <Toaster
        position="top-right"
        offset={{ top: 68, right: 16 }}
        toastOptions={{ style: { fontFamily: 'var(--font-sans)', borderRadius: 6, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)' } }}
      />
    </MotionConfig>
  );
}
