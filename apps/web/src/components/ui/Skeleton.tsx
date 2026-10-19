import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-xl bg-ink/[.06]',
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-ink/[.07] after:to-transparent after:content-['']",
        className,
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="glass rounded-3xl p-4" role="status" aria-label="Loading">
      <Skeleton className="mb-4 h-40 w-full rounded-2xl" />
      <Skeleton className="mb-2 h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="glass flex items-center gap-3 rounded-2xl p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
