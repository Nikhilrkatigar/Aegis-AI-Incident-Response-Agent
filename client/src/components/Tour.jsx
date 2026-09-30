import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Compass, Hourglass, X } from 'lucide-react';
import { Button } from './ui/Button';

// Each step spotlights one element (by its data-tour name or a selector) and blurs the rest.
// click: clicking the element moves on. until 'gone': moves on once the element closes.
// wait: shown, without the blur, while the element does not exist yet. quiet: no blur at all.
const STEPS = [
  { title: 'Welcome, judge', body: 'About two minutes. You break PayFlow, Aegis finds the cause, asks you before it acts, and checks the fix worked. Everything is blurred except the one thing to use next.' },
  { target: 'nav-lab', click: true, title: 'Open the Fault Lab', body: 'This is where you break the simulated payment platform. Click Fault Lab.' },
  { target: 'inject-bad_deploy', click: true, title: 'Inject a bad deployment', body: 'Aegis only sees alerts, metrics, logs and change history, never which fault you picked. Click Inject.', wait: 'Open the Fault Lab from the sidebar to continue.' },
  { target: 'open-incident', click: true, title: 'The alert fired', body: 'Monitoring opened an incident and Aegis is already investigating. Open it.', wait: 'Metrics are degrading. The alert fires once the 1-minute average crosses its threshold, usually within 10–70 s.' },
  { target: 'trace', title: 'Reasoning trace', body: 'Every step shows what Aegis checked, what it found and why it chose the next tool. Inject a second fault in the Lab mid-run and it re-plans here.', wait: 'Open the incident from the Incidents page to continue.' },
  { target: 'hypotheses', title: 'Hypotheses', body: 'Each candidate cause with its confidence. They rise and fall as new evidence arrives.', wait: 'Open the incident from the Incidents page to continue.' },
  { selector: '[role="alertdialog"]', until: 'gone', title: 'Your call', body: 'A rollback changes production, so Aegis stops and asks. Approve it, or reject it and tell Aegis what to do instead.', wait: 'Aegis is still investigating. It asks you before it runs any fix.' },
  { target: 'risk-gate', title: 'Verified, not assumed', body: 'After the fix runs, Aegis watches the services and only calls it resolved once the error rate is back under the SLO.', wait: 'Open the incident from the Incidents page to continue.' },
  { target: 'report', click: true, title: 'Incident report', body: 'Timeline, root cause, evidence and follow-ups, written from the trace. Open it.', wait: 'The report is written once verification finishes, usually within 90 s.' },
  { quiet: true, title: 'That is the full loop', body: 'Alert, investigation, your approval, verified fix, report. Benchmark in the sidebar scores all 12 fault scenarios against a rule-based baseline. Guide in the top bar replays this tour.' },
];

const KEY = 'aegis.tour';
const PAD = 6;
const CARD_W = 320;
const CARD_H = 200; // rough height, only used to decide which side has room

// A fresh tab is a fresh judge: the tour starts on the first sign-in of every session.
function readStep() {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === null ? 0 : Number(v);
  } catch {
    return 0;
  }
}

function hole(el) {
  const r = el.getBoundingClientRect();
  const top = Math.max(0, r.top - PAD);
  const left = Math.max(0, r.left - PAD);
  const bottom = Math.min(window.innerHeight, r.bottom + PAD);
  const right = Math.min(window.innerWidth, r.right + PAD);
  return { top, left, bottom, right, width: right - left, height: bottom - top };
}

const same = (a, b) => a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

// Below the spotlight if it fits, then above, then right, then left.
function cardPosition(h) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.min(Math.max(16, h.left), vw - CARD_W - 16);
  const y = Math.min(Math.max(16, h.top), vh - CARD_H - 16);
  if (vh - h.bottom >= CARD_H + 12) return { top: h.bottom + 12, left: x };
  if (h.top >= CARD_H + 12) return { bottom: vh - h.top + 12, left: x };
  if (vw - h.right >= CARD_W + 12) return { top: y, left: h.right + 12 };
  return { top: y, left: Math.max(16, h.left - CARD_W - 12) };
}

const centered = () => ({ top: window.innerHeight / 2 - CARD_H / 2, left: window.innerWidth / 2 - CARD_W / 2 });

export function Tour() {
  const [step, setStep] = useState(readStep); // -1 once finished or skipped
  const [spot, setSpot] = useState(null);
  const seen = useRef(false);
  const s = STEPS[step];
  const selector = s && (s.selector || (s.target && `[data-tour="${s.target}"]`));

  const go = (n) => {
    seen.current = false;
    setSpot(null);
    setStep(n >= 0 && n < STEPS.length ? n : -1);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, String(step));
    } catch { /* storage blocked: the tour just restarts on reload */ }
  }, [step]);

  // Follow the target: it may not exist yet (the alert has not fired), or it moves and resizes.
  useEffect(() => {
    if (!selector) return;
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setSpot(null);
        if (s.until === 'gone' && seen.current) go(step + 1);
        return;
      }
      seen.current = true;
      if (!scrolled) {
        el.scrollIntoView({ block: 'nearest' });
        scrolled = true;
      }
      const next = hole(el);
      setSpot((prev) => (same(prev, next) ? prev : next));
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [step, selector, s]);

  // Using the spotlighted element is how you move on.
  useEffect(() => {
    if (!s?.click) return;
    const onClick = (e) => e.target.closest?.(selector) && go(step + 1);
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [step, selector, s]);

  const waiting = selector && !spot;
  const docked = waiting || s?.quiet;
  const last = step === STEPS.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => go(0)}
        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-card text-[12.5px] text-muted hover:text-ink hover:bg-sunken cursor-pointer transition-colors"
      >
        <Compass size={14} strokeWidth={1.75} aria-hidden />
        Guide
      </button>

      <AnimatePresence>
        {s && !docked && (
          <motion.div key="veil" className="print:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {(spot
              ? [
                  { top: 0, left: 0, right: 0, height: spot.top },
                  { top: spot.bottom, left: 0, right: 0, bottom: 0 },
                  { top: spot.top, left: 0, width: spot.left, height: spot.height },
                  { top: spot.top, left: spot.right, right: 0, height: spot.height },
                ]
              : [{ inset: 0 }]
            ).map((style, i) => (
              <div key={i} aria-hidden className="fixed z-[60] bg-black/25 backdrop-blur-[3px]" style={style} />
            ))}
            {spot && (
              <div
                aria-hidden
                className="fixed z-[60] rounded-card ring-2 ring-accent pointer-events-none"
                style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {s && (
          <motion.div
            key={`${step}-${waiting ? 'wait' : 'show'}`}
            role="dialog"
            aria-labelledby="tour-title"
            aria-live="polite"
            className="fixed z-[61] panel p-4 print:hidden"
            style={{ width: CARD_W, ...(docked ? { right: 16, bottom: 16 } : spot ? cardPosition(spot) : centered()) }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-center justify-between text-[11.5px] text-muted tabular">
              <span>Guide · {step + 1} of {STEPS.length}</span>
              <button type="button" onClick={() => go(-1)} aria-label="End the guide" className="-m-1 p-1 rounded-card hover:text-ink hover:bg-sunken cursor-pointer">
                <X size={14} aria-hidden />
              </button>
            </div>
            <h2 id="tour-title" className="mt-1.5 text-[14.5px] font-semibold">{s.title}</h2>
            <p className="mt-1 text-[13px] text-muted leading-relaxed">
              {waiting ? (
                <span className="flex gap-1.5">
                  <Hourglass size={13} className="mt-1 shrink-0 text-warn" aria-hidden />
                  {s.wait}
                </span>
              ) : s.body}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {step > 0 && <Button size="sm" variant="ghost" onClick={() => go(step - 1)}>Back</Button>}
              <Button size="sm" variant={s.click || waiting ? 'secondary' : 'primary'} className="ml-auto" onClick={() => go(step + 1)}>
                {last ? 'Done' : s.click || waiting ? 'Skip step' : 'Next'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
