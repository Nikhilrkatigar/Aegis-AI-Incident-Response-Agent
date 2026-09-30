import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// public/theme.js sets the starting theme before paint; this only flips and remembers it.
export function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const next = theme === 'dark' ? 'light' : 'dark';
  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('aegis.theme', next); } catch { /* per-viewer convenience only */ }
    setTheme(next);
  };
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`size-8 grid place-items-center rounded-card text-muted hover:text-ink hover:bg-sunken cursor-pointer transition-colors ${className}`}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
