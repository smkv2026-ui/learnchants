import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';

/** Animated circular progress (0-100) with a saffron→gold gradient. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  label,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${v}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe08a" />
            <stop offset="60%" stopColor="#f5a524" />
            <stop offset="100%" stopColor="#d9771a" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? <span className="text-xs font-bold tabular-nums" style={{ fontSize: Math.max(10, size / 5) }}>{v}%</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-ink/10 ${className}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full bg-gold-sheen" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.8 }} />
    </div>
  );
}
