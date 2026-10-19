import type { ReactNode } from 'react';

type Art = 'lotus' | 'diya' | 'scroll' | 'bell';

/** Illustrated empty states (inline SVG so they work offline and theme with currentColor). */
function Illustration({ art }: { art: Art }) {
  const gold = 'url(#es-gold)';
  return (
    <svg viewBox="0 0 160 120" className="h-28 w-40" aria-hidden="true">
      <defs>
        <linearGradient id="es-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#e07b1a" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="60" r="52" fill="currentColor" opacity=".06" />
      <circle cx="80" cy="60" r="40" fill="none" stroke="currentColor" strokeOpacity=".15" strokeDasharray="3 6" />
      {art === 'lotus' && (
        <g fill={gold}>
          <path d="M80 30c10 12 11 30 0 46-11-16-10-34 0-46z" />
          <path d="M80 76c-3-16-12-28-27-34 1 18 12 30 27 34z" opacity=".85" />
          <path d="M80 76c3-16 12-28 27-34-1 18-12 30-27 34z" opacity=".85" />
          <path d="M80 78c-10-7-24-9-35-6 7 10 21 12 35 6zM80 78c10-7 24-9 35-6-7 10-21 12-35 6z" opacity=".7" />
        </g>
      )}
      {art === 'diya' && (
        <g>
          <path d="M80 34c6 8 6 16 0 22-6-6-6-14 0-22z" fill={gold} />
          <path d="M48 66h64c-4 14-16 22-32 22s-28-8-32-22z" fill={gold} opacity=".9" />
          <ellipse cx="80" cy="66" rx="32" ry="5" fill="#7a1530" opacity=".6" />
        </g>
      )}
      {art === 'scroll' && (
        <g>
          <rect x="52" y="30" width="56" height="62" rx="6" fill={gold} opacity=".9" />
          <path d="M62 46h36M62 56h36M62 66h24" stroke="#4a0d1c" strokeWidth="3" strokeLinecap="round" opacity=".6" />
        </g>
      )}
      {art === 'bell' && (
        <g fill={gold}>
          <path d="M80 30c14 0 22 12 22 26v14l8 8H50l8-8V56c0-14 8-26 22-26z" />
          <circle cx="80" cy="86" r="6" />
        </g>
      )}
    </svg>
  );
}

export function EmptyState({
  title,
  message,
  action,
  art = 'lotus',
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  art?: Art;
}) {
  return (
    <div className="glass mx-auto flex max-w-md flex-col items-center rounded-3xl px-6 py-10 text-center text-primary">
      <div className="animate-floaty">
        <Illustration art={art} />
      </div>
      <h3 className="mt-4 text-2xl font-semibold text-ink">{title}</h3>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass mx-auto max-w-md rounded-3xl border-danger/30 p-6 text-center">
      <p className="font-semibold text-danger">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <button className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
