import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function TextField(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={fid} className="label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fid}
        aria-invalid={!!error || undefined}
        aria-describedby={error || hint ? `${fid}-desc` : undefined}
        className={cn('input', error && '!border-danger/70')}
        {...rest}
      />
      {(error || hint) && (
        <p id={`${fid}-desc`} className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-muted')}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function TextArea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={fid} className="label">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fid}
        aria-invalid={!!error || undefined}
        className={cn('input min-h-[96px] resize-y', error && '!border-danger/70')}
        {...rest}
      />
      {(error || hint) && <p className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-muted')}>{error || hint}</p>}
    </div>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50',
          checked ? 'bg-gold-sheen' : 'bg-ink/15',
        )}
      >
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </div>
  );
}
