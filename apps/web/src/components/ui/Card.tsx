import { useRef, type HTMLAttributes, type MouseEvent } from 'react';
import { cn } from './cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-3xl shadow-card', className)} {...rest} />;
}

/** Card with a subtle 3D tilt that follows the pointer (disabled for reduced motion / touch). */
export function TiltCard({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-2px)`;
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={cn(
        'glass group relative overflow-hidden rounded-3xl shadow-card transition-transform duration-200 will-change-transform',
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-100",
        'before:bg-[radial-gradient(400px_circle_at_var(--mx,50%)_var(--my,50%),rgb(var(--primary)/.14),transparent_40%)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
