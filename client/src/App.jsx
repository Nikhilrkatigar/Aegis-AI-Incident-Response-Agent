import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { LiveProvider } from './lib/live';
import { AuthProvider } from './lib/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Shell } from './components/Shell';
import IncidentsPage from './pages/IncidentsPage';
import ReportPage from './pages/ReportPage';
import LabPage from './pages/LabPage';
import AuditPage from './pages/AuditPage';
import LoginPage from './pages/LoginPage';
import BenchmarkPage from './pages/BenchmarkPage';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <AuthProvider>
          <LiveProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Shell />}>
                  <Route index element={<Navigate to="/incidents" replace />} />
                  <Route path="incidents" element={<IncidentsPage />} />
                  <Route path="incidents/:id" element={<IncidentsPage />} />
                  <Route path="incidents/:id/report" element={<ReportPage />} />
                  <Route path="lab" element={<LabPage />} />
                  <Route path="login" element={<LoginPage />} />
                  <Route path="benchmark" element={<BenchmarkPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="*" element={<Navigate to="/incidents" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </LiveProvider>
        </AuthProvider>
      </ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{ style: { fontFamily: 'var(--font-sans)', borderRadius: 6, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)' } }}
      />
    </MotionConfig>
  );
}
