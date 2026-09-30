# Aegis Design System

Source: `ui-ux-pro-max --design-system` ("devops incident response ops console", density 8, motion 3, variance 4), then filtered through CLAUDE.md §4.

**Kept from the skill:** dense dashboard layout, semantic status colours (operational / degraded / incident), "live" labels only when backed by a fresh timestamp with a visible stale state, no hidden error states, visible focus, reduced-motion support.

**Rejected:** OLED dark theme, Inter/Inter, text glow, GSAP scroll reveals, landing-page section pattern. These are the generic tells CLAUDE.md bans. This is a tool an on-call engineer uses at 3 AM, not a marketing page.

---

## Tokens

```css
:root {
  /* base */
  --bg: #f6f3ee;
  --surface: #fbf9f6;
  --surface-sunken: #efeae2;   /* log wells, code blocks */
  --border: #e3ddd3;
  --text: #24211d;
  --text-muted: #6f675d;

  /* single accent */
  --accent: #3f5d4e;
  --accent-contrast: #fbf9f6;

  /* status (semantic only, never decoration) */
  --ok: #3f6f52;
  --warn: #9a6a14;
  --danger: #a4463a;
  --info: #4a5a6a;

  --radius: 6px;
  --shadow: 0 1px 2px rgb(36 33 29 / 0.06);
}
```

Status colour is never the only signal: always pair it with a word ("Degraded", "Down") or an icon.

## Type

| Role | Font | Size / weight |
|---|---|---|
| UI text, headings | IBM Plex Sans | 14px base in console, 16px in report; headings 600 |
| Logs, IDs, commit SHAs, metrics | IBM Plex Mono | 13px, minimum 12px |

- `font-variant-numeric: tabular-nums` on every number column and metric.
- Heading scale: 20 / 16 / 14. No hero-sized type anywhere in the app.

## Spacing & shape

- 4px scale: 4, 8, 12, 16, 24, 32. Nothing off-scale.
- One radius (`--radius`), one shadow (`--shadow`), 1px `--border` lines separate regions. No cards-inside-cards.

## Layout

- **App shell:** narrow left rail (Incidents, Fault Lab, Benchmark, Audit log) + top bar showing `payflow-prod (simulated)`, the on-call engineer, and system status.
- **Incident view (the demo screen):** asymmetric three-column layout.
  - Left (240px): incident list with severity and age.
  - Centre (fluid): the reasoning trace, a vertical timeline of steps.
  - Right (320px): service health with small error-rate and latency sparklines, hypothesis board with confidence bars, and the approval card when one is pending.
- Dense where the engineer works (trace, logs); quiet everywhere else.

## Motion (Motion library, `motion/react`)

- Wrap the app in `<MotionConfig reducedMotion="user">`.
- New trace step: opacity 0→1, y 4→0, 180ms ease-out.
- Confidence bar change: `scaleX` with transform-origin left, 200ms. Never animate width.
- Approval card and modal enter/exit via `AnimatePresence`, 200ms.
- Hypothesis re-rank: `layout` prop, tight spring (stiffness 500, damping 40).
- **No pulsing "live" dots, no infinite loops.** "Live" is shown as text with a timestamp: `Live · updated 2s ago`. After 10s it turns into `Stale · last update 14s ago` in `--warn`.

## Components

- Buttons: primary is solid `--accent`, secondary is a 1px border, destructive is `--danger` text with a confirm modal. No gradients.
- Toasts: `sonner`, top-right.
- Confirmation: custom modal only. Never `alert()` / `confirm()` / `prompt()`.
- Icons: `lucide-react`, 16px, stroke 1.75.
- 21st.dev components are allowed as building blocks only, restyled to these tokens, and listed in the README.

## Copy

Write it the way an SRE writes it: specific, short, calm.

- Empty: "No open incidents. Break something in the Fault Lab to see Aegis work."
- Error: "Couldn't reach the metrics store. Showing data from 12s ago."
- Approval: "Roll back payment-service from v2.14.0 to v2.13.2? Error rate is 38% and started 40s after this deploy."
- Never: "Oops!", "Something went wrong", "Empower", "Seamless", emoji.

## Pre-delivery check (every screen)

- [ ] Loading, empty and error states exist
- [ ] Keyboard reachable, visible focus ring
- [ ] Contrast 4.5:1 for text
- [ ] Works at 1280px and 1440px (desktop tool; 375px must not break but is not optimised)
- [ ] Passes the "not AI-made" checklist in CLAUDE.md
