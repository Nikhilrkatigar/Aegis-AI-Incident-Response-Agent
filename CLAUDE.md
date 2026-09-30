# CLAUDE.md — 24° SHIFT Hackathon Build Guide

Read this fully before writing any code. Follow it for every task in this repo.

---

## 0. Project Snapshot (FILL THIS IN FIRST)

- **Project name:** Aegis (working name)
- **Problem statement:** DevOps Copilot, the AI Incident Response Agent. Build an agent system that investigates a software problem, collects information from different tools (logs, service status, recent changes, past incidents), identifies the likely cause with reasoning, suggests or performs a safe action with human approval when risky, checks whether the fix worked, and produces a short incident report. Demo: a simulated incident (we create our own logs and data) handled end to end, from first alert to final report.
- **One-line pitch:** An incident response agent that investigates across logs, deploys, metrics and past incidents, acts safely with human approval, verifies its own fix, and proves its accuracy with a benchmark against a rule-based baseline.
- **Target user:** An on-call engineer at a company running a payment platform.
- **The ONE demo moment:** Alert fires (500 errors in payment service) → agent shows hypotheses and evidence live → new evidence arrives mid-investigation and it re-plans → asks approval for rollback → verifies recovery → generates the incident report.
- **Team:** Nik builds all code solo. Teammate owns pitch, docs (`TECHNICAL.md`, `ARCHITECTURE.md`, `CODE_EXPLAINED.md`, `QA_PREP.md`), demo script, and test scenarios.
- **Scope order (solo, 19 hours):** build 8 core fault scenarios first, then the remaining 4 only if time allows. Concept document promises 12 scenarios, so the benchmark must cover at least 8 honestly.
- **Concept document:** `CONCEPT.md` was submitted for Round 1. Build to match it and do not drift.
- **Deadline and submission:** see Section 0A (hard deadline 8:00 AM on 1 Oct 2026, no extensions)
- **Domain chosen:** Technology & Cybersecurity (DevOps Copilot)

If any field above is still a placeholder, ask me before building. Do not guess the problem.

---

## 0A. Event Facts (from the organizer handbook)

**Theme: Agentic AI.** Build an AI system that understands situations, makes decisions, takes actions, and adapts to changing information.

**Domains (pick one):** Enterprise & Business Operations · Technology & Cybersecurity · Personal Productivity & Lifestyle · Public Safety, Agriculture & Emergency Response.

### Timeline (30 Sept – 1 Oct 2026, online)

| Time | What happens |
|---|---|
| 30 Sept, 10:00 AM | Inauguration |
| 11:00–11:30 AM | Problem statements announced |
| 11:30 AM–1:00 PM | **Round 1 – Ideation.** Submit the concept document. Only ~40–50% of teams advance |
| 1:15 PM → **8:00 AM (1 Oct)** | **Round 2 – Development.** Hard deadline. Late = disqualified, no extensions |
| 8:00–10:00 AM | Round 2 evaluation (repo is frozen, do not touch it) |
| 10:00 AM | Round 2 results |
| 10:30 AM–12:30 PM | **Round 3 – Live presentation** for shortlisted teams. Three winners total |

**Our internal deadlines:** code freeze at **6:30 AM**, final submission by **7:15 AM**. The repo cannot be modified after submission, so the buffer is not optional.

### Round 1 concept document (`docs/CONCEPT.md`)

Must contain: Project Title · Problem Statement · Proposed Solution · Key Features · Technology Stack · Domain · Architecture Diagram · External Datasets/Sources (if any). Write it tight and specific, because a weak concept cuts us before we build anything.

### Round 2 submission checklist

- [ ] GitHub repository link (final version, pushed before the deadline)
- [ ] Source code
- [ ] Technical documentation → `docs/TECHNICAL.md`
- [ ] Setup guide → `README.md` (someone must be able to run it from scratch)
- [ ] Architecture overview → `docs/ARCHITECTURE.md` with a diagram
- [ ] Code explanation → `docs/CODE_EXPLAINED.md` (what each module does and why)
- [ ] **Deployed link** (optional but earns extra evaluation points, so do it)

### Judging criteria, and what each means for how we build

| Criterion | What we must show |
|---|---|
| Problem Understanding | A specific user, a specific pain, evidence it is real |
| Core Functionality | The main flow works end to end, live, with no faking |
| **Genuine Reasoning** | Visible decision-making, not a prompt wrapper (see below) |
| **Follow-up / Edge Case Handling** | Graceful behavior when data is missing, conflicting, or tools fail |
| Originality | A sharp, non-obvious angle. "Chat with your PDF" style ideas lose |
| Code & Documentation | Clean repo, the docs above, meaningful commits |
| Clarity | A pitch a judge can repeat back in one sentence |

### Agentic AI requirements (this is what separates us from chatbot demos)

1. **Real agent loop:** observe → reason/plan → act through tools → observe the result → adapt. A single LLM call behind a chat box is NOT an agent and will score poorly on "Genuine Reasoning".
2. **Real tools with real effects:** API calls, database writes, notifications, file operations. Tool results must feed back into the agent's next decision.
3. **Visible reasoning:** show a decision log in the UI (what it observed, what it chose, why, what alternatives it rejected, confidence). Persist every step to MongoDB (`agent_runs` collection) so judges can inspect it.
4. **Adaptation is the demo moment:** build a way to inject a NEW event or data mid-run, and show the agent re-plan visibly. This directly proves "adapts to changing information".
5. **Edge cases prepared in advance:** keep five scripted edge inputs ready (missing data, conflicting data, a tool failure, an ambiguous request, an out-of-scope request) and make sure each is handled gracefully. Judges will ask follow-ups live.
6. **Guardrails:** hard cap on agent steps, timeouts on every tool call, Zod-validated structured outputs, and human approval before any irreversible action.
7. **Cost control:** we pay for our own API usage. Cap steps, cache repeated calls, and use a cheaper model for simple steps.

---

## 1. Hackathon Rules (non-negotiable)

- All work must be **original and created during the hackathon**.
- **Never clone or copy an existing GitHub repo as a starting point.** Do not paste in templates, boilerplates, or old projects.
- Official CLI scaffolds (`npm create vite@latest`, `npm init`, `npx express-generator`-style tools) are fine. Cloned starter repos are not.
- Third-party npm packages, public datasets, and synthetic data are allowed. LLM assistance is allowed.
- Commit early and often with meaningful messages so history shows the work happened during the event. Never squash the whole project into one commit.
- API keys and credits are ours to arrange. Never hardcode keys. Never commit `.env`.

---

## 2. Stack (fixed, do not change)

**MERN only. No plain HTML/CSS/JS projects.**

| Layer | Choice |
|---|---|
| Frontend | React (Vite) + React Router + Tailwind CSS |
| Backend | Node.js + Express |
| Database | MongoDB (Atlas) + Mongoose |
| Validation | Zod (both sides where useful) |
| Auth (only if the idea needs it) | JWT in httpOnly cookie |
| Notifications | `sonner` or `react-hot-toast` |
| Animation | Motion (`npm i motion`, import from `motion/react`; the library formerly called Framer Motion) |
| Components | shadcn/ui-style primitives, sourced via the 21st.dev MCP (see Section 4A) |
| HTTP client | Axios with a single configured instance |

Folder layout:

```
/client   → React frontend (Part 1)
/server   → Express + MongoDB backend (Part 2)
/docs     → PLAN.md, DEMO_SCRIPT.md, ARCHITECTURE.md
```

Build order: complete the frontend part fully, then the backend part fully. Do not leave either half stubbed.

---

## 3. Code Delivery Rules

- **Deliver full working files, never snippets** or "rest of code here" placeholders.
- Every file you write must be complete and runnable as-is.
- After writing code, **run it** (install, start, hit the endpoint or load the page) and confirm it works before saying it is done. If you could not run it, say so plainly.
- If something is uncertain or you are guessing, say "I'm not sure" instead of faking confidence.
- Do not add features I did not ask for. Do not refactor working code during the hackathon.

---

## 4. UI Rules (strict)

**No browser popups. Ever.**
- Never use `alert()`, `confirm()`, or `prompt()`.
- Use **toast notifications** on the **right side of the screen** (top-right) for success, error, and info.
- Use a custom in-app **confirmation modal component** for destructive actions.
- Do not rely on localhost or dev-server popups.

**Design must look professional and minimal, never "AI generated".**

Avoid:
- Neon cyan/mint or purple accents on near-black backgrounds
- Glow shadows, glassmorphism overload, gradient-clipped text
- Emoji as icons, generic hero sections with floating blobs

Use:
- A restrained **warm-neutral base** with **one muted accent**
- Real typographic hierarchy (one display font + one text font, max)
- Generous whitespace, consistent 4/8px spacing scale, subtle 1px borders
- `lucide-react` icons

Starter tokens (adjust the accent to fit the product, keep it muted):

```css
:root {
  --bg: #f6f3ee;
  --surface: #fbf9f6;
  --border: #e3ddd3;
  --text: #24211d;
  --text-muted: #6f675d;
  --accent: #3f5d4e;        /* single muted accent */
  --accent-contrast: #fbf9f6;
  --danger: #a4463a;
}
```

Every screen needs: a loading state, an empty state, and an error state. A demo that shows a blank white flash or raw error text loses points.

---

## 4A. Skills & Tooling — check first, install if missing, then use

Before any UI work, verify each tool below. If one is missing, **install it yourself, tell me what you installed, then use it.** If an install fails, say so plainly and continue with the fallback. Never silently skip a tool.

| Tool | Purpose | How to check | Install |
|---|---|---|---|
| **ponytail** | Minimal, necessary code. Questions whether code needs to exist at all | `/ponytail` command exists, or `.claude/skills/ponytail/` | `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail`. Alternative: `npx -y skills add DietrichGebert/ponytail --skill ponytail --agent claude-code` |
| **ui-ux-pro-max** | Design system: palette, typography, UX rules, anti-patterns. Needs Python 3 | `.claude/skills/ui-ux-pro-max/` exists | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`. Alternative: `npm install -g ui-ux-pro-max-cli && uipro init --ai claude` |
| **21st.dev MCP** (formerly Magic MCP) | Search and generate React/Tailwind components | `claude mcp list` shows `21st` or `magic` | `npx @21st-dev/cli@latest init --client claude`. Needs a free API key from 21st.dev/mcp. If the CLI fails: `claude mcp add magic -s user -- npx -y @21st-dev/magic@latest API_KEY=<key>`. Never commit the key |
| **Motion** | Animation | `motion` in `client/package.json` | `cd client && npm i motion` |
| **shadcn/ui base** | Only if pulled components need it | `client/components.json` exists | `npx shadcn@latest init` |

If I have not given you the 21st.dev API key yet, ask me for it once, then continue. Do not wait on it: build with plain Tailwind components meanwhile.

### How to use them together (in this order)

1. **ponytail is on for all logic code** (API routes, hooks, utilities, data handling). Simplest thing that works. It never overrides validation, security, or accessibility, and it does not mean a lazy UI. UI polish is where we spend effort.
2. **Run ui-ux-pro-max once, at the start**, for this product's domain. Save the result to `docs/DESIGN_SYSTEM.md` (palette, type pairing, spacing, radius, motion rules). Every screen follows that file.
3. **Our rules beat the skill's output.** If the generated system suggests neon accents, purple on dark, glow shadows, glassmorphism, or gradient text, reject it and use the warm-neutral, single muted accent approach from Section 4.
4. **Use the 21st.dev MCP for building blocks** (inputs, tables, command palette, dialogs, tabs, empty states). Then **restyle every component to our tokens** so nothing looks pasted from a gallery. Do not drop in full landing-page templates or whole pre-built pages wholesale, because the hackathon requires original work. Keep a list of which components came from where in the README.
5. **Motion adds meaning, not decoration.**

### Motion rules

- Purpose only: state changes, entering/leaving elements, layout reordering, and feedback on actions.
- Durations 150–250 ms for UI, ease-out curves. Springs only for layout and drag, tuned tight with no cartoon bounce.
- Animate `opacity` and `transform` only. Never animate width/height/top/left.
- Stagger list reveals on first load only, not on every re-render.
- Wrap the app in `<MotionConfig reducedMotion="user">` so `prefers-reduced-motion` is respected.
- No infinite decorative loops, no parallax gimmicks, no page-load fireworks.
- Use `AnimatePresence` for toasts, modals, and route transitions so exits are smooth too.

### The "not AI-made" checklist (review every screen against this)

Avoid these tells:
- A centered hero with "Welcome to X", a gradient headline, and two buttons
- A symmetric three-column grid of identical cards, each with an icon in a coloured circle, a title, and one line of filler
- Default Inter + purple/blue gradient + rounded-2xl everywhere
- Emoji as bullets or icons, lorem ipsum, vague copy like "Empower your workflow"
- Heavy drop shadows, gradient buttons, every element animated

Do this instead:
- **Domain-specific copy and real seeded data** (real names, units, timestamps, numbers). Specific beats polished-but-generic.
- **Information hierarchy first:** dense where users work, quiet everywhere else. Asymmetric layouts are fine.
- **One radius token, one shadow token, one spacing scale**, used consistently.
- Tabular numerals for figures, aligned columns, sensible truncation, visible keyboard focus states.
- Human microcopy in errors and empty states ("No incidents yet. Import a log file to start." not "Oops! Something went wrong").
- Every empty state offers the next action.

### Engineering craft bar (what a senior engineer's repo looks like)

- Small, single-purpose components and functions with clear names. No dead code, no leftover `console.log`, no commented-out blocks.
- Consistent folder structure and naming across client and server.
- Error boundaries on the client, central error handling on the server.
- A README a stranger can follow in 5 minutes: what it does, how to run it, architecture diagram, screenshots.
- Meaningful commit history.
- Before calling any screen done, look at it critically: does it look like a real product a team shipped, or like a generated demo? If the latter, fix it.

---

## 5. Backend Standards (security-minded by default)

- `helmet`, `cors` (explicit origin from env), `express-rate-limit`, `express-mongo-sanitize`.
- Validate **every** request body and query with Zod before touching the database.
- Central error-handling middleware returning `{ success: false, message }`. Never leak stack traces.
- Consistent response shape: `{ success: true, data }`.
- Secrets only from environment variables. Provide `.env.example` with every key name (no values).
- `GET /api/health` endpoint for deploy checks.
- Hash passwords with `bcrypt` if auth exists. Never log tokens or passwords.
- Add a **seed script** (`npm run seed`) that loads realistic demo data. A demo on an empty database is a bad demo.

---

## 6. AI / LLM Integration Rules

- Keys come from `.env`. Never expose them to the client. All LLM calls go through the backend.
- Wrap every LLM call with a timeout, one retry, and a **graceful fallback** (cached or precomputed response) so the demo never dies on a rate limit or network hiccup.
- Force structured output (JSON) and validate it with Zod before using it.
- Keep prompts in a single `server/prompts/` folder, not scattered through routes.
- Log latency and token usage during development so we know what the demo costs.

---

## 7. Workflow (how to work with me)

1. **Plan before code.** For any task bigger than one file, write or update `docs/PLAN.md` with the steps, then wait for my go-ahead.
2. **Vertical slices.** Build one complete feature end to end (UI → API → DB) before starting the next. Never build all the UI first with fake data and connect later.
3. **Priority order:** the ONE demo moment first, then supporting features, then polish. If time is running out, cut features, never cut the demo path.
4. **Commit after each working slice** with a clear message (`feat: ...`, `fix: ...`).
5. **Deploy early** (first working slice, not the last hour): frontend on Vercel, backend on Render, database on Atlas. Free Render instances sleep, so hit `/api/health` a few minutes before any live demo.
6. **Time-box.** If something takes more than 30 minutes without progress, stop, tell me what is blocking, and propose a simpler alternative.
7. When I report a bug, reproduce it first, find the root cause, then fix. Do not patch symptoms.

---

## 8. Definition of Done (per feature)

- [ ] Works end to end with real (seeded) data
- [ ] Loading, empty, and error states handled
- [ ] Toast feedback on every user action, no browser dialogs
- [ ] No console errors, no hardcoded secrets
- [ ] Committed and deployed

---

## 9. Final-Hours Checklist

- [ ] Fresh deploy tested from a clean browser, not just localhost
- [ ] Seed data loaded on production DB
- [ ] `.env.example` complete, README has setup steps and screenshots
- [ ] `docs/DEMO_SCRIPT.md` written: **problem (20s) → live demo (2 min) → impact numbers (20s) → why this is different (20s)**
- [ ] Backup demo video recorded (screen + voice) in case live demo fails
- [ ] Webcam, mic, and screen share tested for the Google Meet presentation
- [ ] Every team member can explain the architecture and answer judge questions

---

## 9A. Judge Lens (panel of enterprise engineers)

Panel, from their profile blurbs only (their actual scoring style is unknown): a performance test lead (TCS; AWS DevOps, Azure, Databricks), a solution architect (IBM; enterprise data platforms, LLMs, RAG, distributed systems), an SAP enterprise application developer, and a Java/Spring Boot/microservices/Kafka engineer (Deloitte).

What that means for how we build:

- **Architecture and reliability outweigh visual flash.** Cap the time spent on animation and polish. Backend depth and agent correctness come first, UI polish second.
- **Bring evidence, not claims.** Run a small load test (autocannon or k6) and report p50/p95 latency and error rate. Report cost and latency per agent run. Keep an eval set of at least 20 cases with a pass rate.
- **Production habits, visibly:** retries with backoff, idempotent actions, timeouts, structured logs, health checks, an audit trail of every agent action.
- **If we use RAG:** be ready to explain chunking, retrieval choice, grounding and citations, and how hallucination is measured. Never claim fine-tuning unless we actually did it.
- **No architecture for show.** Do not add Kafka or microservices to impress. Build a clean modular monolith, and explain in `docs/ARCHITECTURE.md` how it would scale (queue, event stream, partitioning) as future scope.
- **Business-process realism:** workflows should mirror real enterprise practice (roles, approvals, audit trail, exception handling). These judges will notice fake ones.
- **Prepare for hard Q&A:** write `docs/QA_PREP.md` with at least 15 tough questions (scaling, failure modes, data privacy, evaluation, cost, why an agent instead of a script) and rehearse the answers.

---

## 10. What Judges Reward (keep this in mind on every decision)

1. A **sharp, real problem** with a specific user, not a vague "platform for X".
2. A **working live demo** over a long feature list.
3. **Clear impact**: a number, a before/after, a concrete outcome.
4. **Technical depth in one place** (a genuinely clever core), not shallow breadth.
5. **Polish and confidence** in the pitch.

When in doubt, choose the option that makes the demo more reliable and the story sharper.
