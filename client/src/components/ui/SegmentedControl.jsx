import { useId } from 'react';
import { motion } from 'motion/react';

// Sliding-selection segmented control. Pattern adapted from 21st.dev "Segmented Tabs"
// (micka_design, #26923), rebuilt on motion's layoutId with our tokens.
export function SegmentedControl({ options, value, onChange, label }) {
  const group = useId();
  const onKey = (e) => {
    const i = options.findIndex((o) => o.value === value);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = options[(next + options.length) % options.length];
    onChange(target.value);
    document.getElementById(`${group}-${target.value}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="inline-flex p-0.5 rounded-card bg-sunken border border-line">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            id={`${group}-${o.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative h-6 px-2.5 text-[12.5px] rounded-[5px] cursor-pointer transition-colors duration-150 ${selected ? 'text-ink font-medium' : 'text-muted hover:text-ink'}`}
          >
            {selected && (
              <motion.span
                layoutId={`${group}-thumb`}
                className="absolute inset-0 rounded-[5px] bg-surface shadow-card"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative tabular">
              {o.label}
              {o.count !== undefined && <span className={`ml-1 ${selected ? 'text-muted' : 'text-muted/80'}`}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
