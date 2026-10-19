import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 text-sm text-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.to && !last ? (
                <Link to={c.to} className="rounded-md px-1.5 py-1 transition hover:bg-ink/5 hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'px-1.5 font-semibold text-ink' : 'px-1.5'}>
                  {c.label}
                </span>
              )}
              {!last && <Icon name="chevron-right" size={14} className="opacity-50" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
