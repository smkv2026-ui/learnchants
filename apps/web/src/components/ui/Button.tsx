import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gold-sheen text-on-sheen shadow-glow hover:brightness-110 active:brightness-95 font-semibold',
  secondary: 'glass text-ink hover:bg-white/10',
  ghost: 'text-ink/90 hover:bg-ink/5',
  outline: 'border border-primary/50 text-primary hover:bg-primary/10',
  danger: 'bg-danger/90 text-white hover:bg-danger',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
  xl: 'h-16 px-8 text-lg gap-3 rounded-3xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'xl' ? 26 : size === 'lg' ? 20 : 18;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap transition duration-150 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize - 2} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  className,
  ...rest
}: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }) {
  const dims = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14', xl: 'h-20 w-20' }[size];
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      icon={icon}
      className={cn(dims, '!px-0 !rounded-full', className)}
      {...rest}
    />
  );
}
