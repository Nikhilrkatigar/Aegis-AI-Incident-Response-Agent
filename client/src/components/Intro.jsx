import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

// How long each card stays before the next one replaces it (ms).
const HOLD = { welcome: 2700, presents: 3700, title: 2300 };
const ORDER = ['welcome', 'presents', 'title', 'done'];
const EASE = [0.22, 1, 0.36, 1];
const LETTER_GAP = 70; // ms between letters starting to write

// Script text written letter by letter, like the iPhone "hello" screen.
// Each line: { text, y, size, color?, start? } where start is ms before its first letter.
function Written({ label, height, lines }) {
  return (
    <motion.svg
      viewBox={`0 0 900 ${height}`}
      className="w-[min(88vw,820px)] h-auto"
      role="img"
      aria-label={label}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
      transition={{ duration: 0.45, ease: 'easeIn' }}
    >
      {lines.map(({ text, y, size, color = 'var(--color-ink)', start = 0 }) => (
        <text key={text} x="450" y={y} textAnchor="middle" fontFamily="var(--font-script)" fontSize={size} fill={color} stroke={color} strokeWidth="1.2">
          {[...text].map((ch, i) => (
            <tspan key={i} className="intro-letter" style={{ animationDelay: `${start + i * LETTER_GAP}ms` }}>{ch}</tspan>
          ))}
        </text>
      ))}
    </motion.svg>
  );
}

const Greeting = () => <Written label="Welcome, Judge" height={200} lines={[{ text: 'Welcome, Judge', y: 135, size: 132 }]} />;

const Presents = () => (
  <Written
    label="Team Endgame presents"
    height={280}
    lines={[
      { text: 'Team Endgame', y: 130, size: 120 },
      { text: 'presents', y: 235, size: 72, color: 'var(--color-muted)', start: 12 * LETTER_GAP + 300 },
    ]}
  />
);

function Title() {
  return (
    <motion.div
      key="title"
      className="flex flex-col items-center text-center px-6"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.span
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="size-14 grid place-items-center rounded-card bg-accent-soft text-accent"
      >
        <ShieldCheck size={28} strokeWidth={1.75} aria-hidden />
      </motion.span>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.15, ease: EASE }}
        className="mt-5 text-[56px] leading-none font-semibold tracking-tight text-ink"
      >
        Aegis
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease: EASE }}
        className="mt-3 text-[17px] text-muted"
      >
        the AI incident response agent
      </motion.p>
    </motion.div>
  );
}

// Plays on every full page load (visit or refresh), not on in-app navigation. Skip or Esc ends it early.
export function Intro() {
  const [phase, setPhase] = useState('loading');

  useEffect(() => {
    if (phase !== 'loading') return;
    // Wait for the script font so the greeting isn't traced in a fallback face (capped at 3s for slow phones).
    const timeout = new Promise((r) => setTimeout(r, 3000));
    Promise.race([document.fonts.load('132px "Great Vibes"'), timeout]).finally(() => setPhase('welcome'));
  }, [phase]);

  useEffect(() => {
    if (!HOLD[phase]) return;
    const id = setTimeout(() => setPhase(ORDER[ORDER.indexOf(phase) + 1]), HOLD[phase]);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') return;
    const onKey = (e) => e.key === 'Escape' && setPhase('done');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="intro"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome"
          className="fixed inset-0 z-[100] bg-bg grid place-items-center"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <AnimatePresence mode="wait">
            {phase === 'welcome' && <Greeting key="welcome" />}
            {phase === 'presents' && <Presents key="presents" />}
            {phase === 'title' && <Title />}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setPhase('done')}
            className="absolute bottom-6 right-6 h-8 px-3 rounded-card text-[13px] text-muted hover:text-ink hover:bg-sunken cursor-pointer transition-colors"
          >
            Skip intro
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
