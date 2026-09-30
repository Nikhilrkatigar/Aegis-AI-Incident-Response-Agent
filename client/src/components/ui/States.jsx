import { AlertTriangle } from 'lucide-react';

export function Skeleton({ className = '' }) {
  return <div className={`rounded bg-sunken ${className}`} aria-hidden />;
}

export function Loading({ label = 'Loading', rows = 3 }) {
  return (
    <div role="status" aria-label={label} className="space-y-2.5 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 2 ? 'w-3/5' : 'w-4/5'}`} />
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-start gap-2 p-6 max-w-sm">
      {Icon && <Icon size={18} strokeWidth={1.75} className="text-muted" aria-hidden />}
      <p className="font-medium">{title}</p>
      {children && <p className="text-muted text-[13px] leading-relaxed">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex items-start gap-2.5 p-4 text-[13px]" role="alert">
      <AlertTriangle size={16} strokeWidth={1.75} className="text-danger mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="text-ink">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-1 text-accent underline underline-offset-2 cursor-pointer">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
