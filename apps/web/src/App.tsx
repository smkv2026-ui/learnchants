import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Spinner, Toaster } from '@/components/ui';
import { UserLayout } from '@/components/layout/UserLayout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { LoginPage, SignupPage, ResetPage } from '@/pages/AuthPages';

const PlaylistPage = lazy(() => import('@/pages/PlaylistPage'));
const VersePage = lazy(() => import('@/pages/VersePage'));
const PaymentPage = lazy(() => import('@/pages/PaymentPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
// The admin portal is a separate lazily-loaded bundle with no links from user screens.
const AdminApp = lazy(() => import('@/admin/AdminApp'));

export function PageFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-primary" role="status" aria-label="Loading">
      <Spinner size={32} />
    </div>
  );
}

export function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <>
      <Suspense fallback={<PageFallback />}>
        {isAdmin ? (
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
          </Routes>
        ) : (
          <UserLayout>
            <AnimatePresence mode="wait">
              <Suspense fallback={<PageFallback />} key={location.pathname}>
                <Routes location={location}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/reset" element={<ResetPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/p/:pid" element={<PlaylistPage />} />
                  <Route path="/p/:pid/n/:nid" element={<PlaylistPage />} />
                  <Route path="/p/:pid/v/:vid" element={<RequireAuth><VersePage /></RequireAuth>} />
                  <Route path="/p/:pid/pay" element={<RequireAuth><PaymentPage /></RequireAuth>} />
                  <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
                  <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
                  <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                  <Route path="/home" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </AnimatePresence>
          </UserLayout>
        )}
      </Suspense>
      <Toaster />
    </>
  );
}
