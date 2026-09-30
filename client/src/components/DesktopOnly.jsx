import { useSyncExternalStore } from 'react';
import { Copy, Laptop, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

// The console is dense (trace, evidence, approvals side by side); below this width it stops being usable.
const WIDE = '(min-width: 1024px)';
const subscribe = (cb) => {
  const mq = matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isWide = () => matchMedia(WIDE).matches;

export function DesktopOnly({ children }) {
  const wide = useSyncExternalStore(subscribe, isWide);
  if (wide) return children;

  const url = window.location.origin;
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied. Open it on a laptop or desktop.'),
      () => toast.error('Could not copy. Select the link above instead.'),
    );

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-10">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} strokeWidth={2} className="text-accent" aria-hidden />
        <span className="font-semibold tracking-tight text-[16px]">Aegis</span>
        <span className="text-[12.5px] text-muted">by Team Endgame</span>
      </div>

      <span className="mt-10 size-12 grid place-items-center rounded-card bg-accent-soft text-accent">
        <Laptop size={24} strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="mt-5 text-[24px] leading-tight font-semibold tracking-tight">Open Aegis on a laptop or desktop</h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
        Aegis is an incident console: the agent's live trace, evidence and approval controls sit side by side, and they need a
        screen at least 1024&nbsp;px wide. On a phone they would be too cramped to read or approve safely.
      </p>

      <div className="mt-8 panel p-3 flex items-center gap-3">
        <span className="flex-1 min-w-0 font-mono text-[12.5px] text-ink break-all select-all">{url}</span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-card bg-accent text-on-accent text-[13.5px] font-medium cursor-pointer"
        >
          <Copy size={15} strokeWidth={1.75} aria-hidden />
          Copy link
        </button>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">On a tablet, turning it sideways may be enough.</p>
    </main>
  );
}
