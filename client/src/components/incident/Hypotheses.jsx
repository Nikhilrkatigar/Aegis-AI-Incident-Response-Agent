import { motion } from 'motion/react';
import { pct, CATEGORY_LABEL } from '../../lib/format';

export function Hypotheses({ steps, mode }) {
  const latest = [...steps].reverse().find((s) => s.hypotheses?.length)?.hypotheses;
  if (!latest) {
    return (
      <p className="px-4 py-3 text-[13px] text-muted">
        {mode === 'fallback' ? 'The rule engine checks fixed rules in order and does not weigh hypotheses.' : 'Hypotheses appear here once the agent starts checking tools.'}
      </p>
    );
  }
  const sorted = [...latest].sort((a, b) => (a.status === 'ruled_out') - (b.status === 'ruled_out') || b.confidence - a.confidence);

  return (
    <ul className="px-4 py-3 space-y-3">
      {sorted.map((h) => {
        const out = h.status === 'ruled_out';
        return (
          <motion.li key={h.cause} layout transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
            <div className="flex items-baseline gap-2">
              <p className={`text-[13px] leading-snug flex-1 ${out ? 'text-muted line-through decoration-line' : ''}`}>{h.cause}</p>
              <span className={`text-[12px] tabular ${out ? 'text-muted' : 'text-ink font-medium'}`}>{out ? 'ruled out' : pct(h.confidence)}</span>
            </div>
            <p className="text-[11.5px] text-muted">{CATEGORY_LABEL[h.category] || h.category} · {h.service}</p>
            <div className="mt-1 h-1 rounded-full bg-sunken overflow-hidden">
              <motion.div
                className={`h-full origin-left ${out ? 'bg-line' : h.status === 'supported' ? 'bg-accent' : 'bg-info/60'}`}
                initial={false}
                animate={{ scaleX: out ? 0 : h.confidence }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
