import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { Button, Icon, IconButton, cn, type IconName } from '@/components/ui';
import { InstallBanner, OfflineBanner } from './Banners';
import { Logo } from './Logo';


const NAV: { to: string; label: string; icon: IconName; auth?: boolean }[] = [
  { to: '/', label: 'Learn', icon: 'home' },
  { to: '/dashboard', label: 'Progress', icon: 'chart', auth: true },
  { to: '/notifications', label: 'Inbox', icon: 'bell', auth: true },
  { to: '/profile', label: 'Profile', icon: 'user', auth: true },
];

export function UserLayout({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const { theme, toggleTheme } = useUi();
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const onAuthPage = ['/login', '/signup', '/reset'].includes(useLocation().pathname);
  const items = NAV.filter((n) => !n.auth || user);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2">
        Skip to content
      </a>
      <OfflineBanner />
      <header className="sticky top-0 z-30 border-b hairline bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Learn Chants home">
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cn('relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition', isActive ? 'bg-primary/15 text-primary' : 'text-muted hover:text-ink')
                }
              >
                <Icon name={n.icon} size={16} />
                {n.label}
                {n.to === '/notifications' && unread > 0 && (
                  <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-5 text-white">{unread}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme} />
            {user ? (
              <Link to="/notifications" className="relative md:hidden" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <span className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5">
                  <Icon name="bell" />
                </span>
                {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-bg" />}
              </Link>
            ) : onAuthPage ? null : (
              <Button size="sm" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="hidden border-t hairline py-6 text-center text-xs text-muted sm:block">
        <p>
          Learn Chants · <Link className="hover:text-ink" to="/privacy">Privacy</Link>
        </p>
      </footer>

      {/* Mobile bottom navigation: large thumb-friendly targets */}
      {user && (
        <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 safe-bottom md:hidden">
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {items.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    cn('relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted')
                  }
                >
                  <Icon name={n.icon} size={22} />
                  {n.label}
                  {n.to === '/notifications' && unread > 0 && (
                    <span className="absolute right-1/4 top-2 h-2.5 w-2.5 rounded-full bg-danger" />
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <InstallBanner />
    </div>
  );
}
