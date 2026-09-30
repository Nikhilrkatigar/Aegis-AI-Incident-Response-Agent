import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover hover:border-accent-hover border border-accent',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken',
  danger: 'bg-surface text-danger border border-line hover:bg-danger-soft',
  ghost: 'text-muted hover:text-ink hover:bg-sunken border border-transparent',
};

export function Button({ variant = 'secondary', size = 'md', busy = false, icon: Icon, children, className = '', ...props }) {
  const sizing = size === 'sm' ? 'h-7 px-2.5 text-[13px] gap-1.5' : 'h-9 px-3.5 gap-2';
  return (
    <button
      type="button"
      disabled={busy || props.disabled}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-card font-medium transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : Icon && <Icon size={15} strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  );
}
