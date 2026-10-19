import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageFallback } from '@/App';
import { AdminLayout, RequireAdmin } from './components/AdminLayout';
import AdminLoginPage from './pages/AdminLoginPage';
import AcceptInvitePage from './pages/AcceptInvitePage';

const DashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage'));
const PlaylistEditorPage = lazy(() => import('./pages/PlaylistEditorPage'));
const VerseEditorPage = lazy(() => import('./pages/VerseEditorPage'));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'));
const SubmissionReviewPage = lazy(() => import('./pages/SubmissionReviewPage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const LearnersPage = lazy(() => import('./pages/LearnersPage'));
const LearnerDetailPage = lazy(() => import('./pages/LearnerDetailPage'));
const AdminsPage = lazy(() => import('./pages/AdminsPage'));
const SettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));

/** Hidden admin portal: only reachable by typing /admin/login; never linked from learner UI. */
export default function AdminApp() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <Routes>
      <Route path="login" element={<AdminLoginPage />} />
      <Route path="invite/:token" element={<AcceptInvitePage />} />
      <Route
        path="*"
        element={
          <RequireAdmin>
            <AdminLayout>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route index element={<DashboardPage />} />
                  <Route path="playlists" element={<PlaylistsPage />} />
                  <Route path="playlists/:pid" element={<PlaylistEditorPage />} />
                  <Route path="playlists/:pid/verses/new" element={<VerseEditorPage />} />
                  <Route path="playlists/:pid/verses/:vid" element={<VerseEditorPage />} />
                  <Route path="reviews" element={<ReviewQueuePage />} />
                  <Route path="reviews/:sid" element={<SubmissionReviewPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="learners" element={<LearnersPage />} />
                  <Route path="learners/:uid" element={<LearnerDetailPage />} />
                  <Route path="admins" element={<AdminsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </Suspense>
            </AdminLayout>
          </RequireAdmin>
        }
      />
    </Routes>
  );
}
