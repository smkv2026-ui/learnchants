import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { api, errorMessage } from '@/lib/api';
import { isAdminRole, useAuth } from '@/stores/auth';
import { toast, useUi } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { usePendingCounts } from '../hooks';
import { Button, Icon, IconButton, Spinner, cn, type IconName } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, role, ready, logout } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-primary">
        <Spinner size={32} />
      </div>
    );
  }
  if (!user) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAdminRole(role)) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="glass max-w-md rounded-3xl p-8 text-center">
          <Icon name="shield" size={40} className="mx-auto text-danger" />
          <h1 className="mt-3 text-3xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted">This account does not have admin access.</p>
          <Button className="mt-6" variant="secondary" onClick={() => void logout()}>Sign out</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}


function DriveBanner() {
  const uid = useAuth((s) => s.user?.uid);
  const settings = useDoc<{ driveStatus?: string }>(uid ? doc(db, 'adminSettings', uid) : null);
  const [busy, setBusy] = useState(false);
  if (settings.data?.driveStatus !== 'needs_reconnect') return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-center gap-3 bg-danger/15 px-4 py-2 text-sm">
      <Icon name="alert" size={16} className="text-danger" />
      Google Drive access has expired. Uploads and learner playback for your playlists are paused.
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api.driveAuthUrl({});
            if (res.url) window.location.href = res.url;
          } catch (err) {
            toast.error(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        Reconnect Drive
      </Button>
    </div>
  );
}

const NAV: { to: string; label: string; icon: IconName; badge?: 'reviews' | 'payments' }[] = [
  { to: '/admin', label: 'Dashboard', icon: 'chart' },
  { to: '/admin/playlists', label: 'Playlists', icon: 'list' },
  { to: '/admin/reviews', label: 'Reviews', icon: 'inbox', badge: 'reviews' },
  { to: '/admin/payments', label: 'Payments', icon: 'rupee', badge: 'payments' },
  { to: '/admin/learners', label: 'Learners', icon: 'users' },
  { to: '/admin/admins', label: 'Admins', icon: 'shield' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
  { to: '/admin/audit', label: 'Audit log', icon: 'clock' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useUi();
  const counts = usePendingCounts();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/admin'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-ink/5 hover:text-ink')
          }
        >
          <Icon name={n.icon} size={18} />
          <span className="flex-1">{n.label}</span>
          {n.badge && counts[n.badge] > 0 && (
            <span className="rounded-full bg-danger px-2 text-xs font-bold leading-5 text-white">{counts[n.badge]}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-2 border-t hairline pt-4 text-sm">
      <p className="truncate px-3 text-muted" title={user?.email ?? ''}>{user?.email}</p>
      <p className="px-3 text-xs uppercase tracking-wider text-primary">{role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</p>
      <div className="flex gap-1">
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label="Toggle theme" onClick={toggleTheme} />
        <IconButton
          icon="logout"
          label="Sign out"
          onClick={async () => {
            await logout();
            navigate('/admin/login');
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="glass sticky top-0 hidden h-screen flex-col gap-6 rounded-none border-y-0 border-l-0 p-4 lg:flex">
        <Link to="/admin" className="px-2 pt-2">
          <Logo />
          <span className="ml-12 text-xs uppercase tracking-[.3em] text-muted">Teacher portal</span>
        </Link>
        {nav}
        {footer}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b hairline bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
          <IconButton icon="menu" label="Open menu" onClick={() => setOpen(true)} />
          <Logo size={28} />
        </header>
        <DriveBanner />
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10">{children}</main>
      </div>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-elevated p-4"
            >
              <div className="flex items-center justify-between">
                <Logo />
                <IconButton icon="x" label="Close menu" onClick={() => setOpen(false)} />
              </div>
              {nav}
              {footer}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AdminHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
