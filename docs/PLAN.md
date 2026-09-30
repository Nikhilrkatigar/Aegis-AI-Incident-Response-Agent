# Aegis Build Plan (Round 2)

Window: 1:15 PM 30 Sep → code freeze **6:30 AM**, submit by **7:15 AM** 1 Oct.
Builds to match CONCEPT.md plus the Round 1 doc additions (alert coordinator, action locks, scoped tokens, log compaction).

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Shape | Modular monolith: `/client` (React) + `/server` (Express). PayFlow is a module inside the server, mounted at `/payflow` with its own admin API | One deploy, and it's reliable to demo. The executor still calls PayFlow over HTTP with a token, so the security boundary is real. ARCHITECTURE.md explains how it splits out at scale |
| PayFlow | A simulator. A 1s tick generates requests for gateway / payment / auth; the active faults shape latency, errors and log lines; everything is written to MongoDB | Faults are injected live and the agent is never told which one it is. Actions really change the simulator state, so the verifier sees a real recovery or a real failure |
| Agent | Claude tool-use loop. `claude-sonnet-5` does the reasoning, `claude-haiku-4-5` summarises oversized log output. 15-step cap, 8s timeout per tool, every step Zod-validated | Real agent loop; the cheaper model is used for the cheap work |
| Baseline = fallback | One rule-based diagnoser, reused as the LLM fallback and as the benchmark baseline | Written once, used twice |
| Live trace | SSE `/api/incidents/:id/stream` | One direction, no socket library needed |
| Locks | `locks` collection: unique index on `resource` plus a TTL `expiresAt`, taken with an atomic `findOneAndUpdate` upsert | No Redis to run; the lock expires if a run crashes |
| Tokens | Short-lived JWT (5 min, single-use `jti`, bound to action + target), verified by PayFlow's admin API | The IAM story from the Round 1 doc |
| Auth | None. Approver picked from an on-call roster in the top bar and recorded in the audit log | Add JWT login only if time remains |
| Build order | Vertical slices (CLAUDE.md §7), not all frontend then all backend (§2) | §2 and §7 conflict. Slices mean something works at every hour |

## Data (MongoDB)

`incidents`, `agent_runs` (every step: observation, hypotheses + confidence, tool, why, rejected alternatives, tokens, latency), `telemetry` (logs + per-minute metrics, TTL 24h), `deploys`, `actions` (idempotency key, token jti, result), `locks`, `incident_memory` (past reports), `benchmark_runs`, `audit_log`.

## Scenarios

Core 8 (must work): bad deploy (DB pool config), DB connection exhaustion, memory leak, slow downstream (auth), expired certificate, misconfiguration, credential-stuffing attack, misleading alert.
Stretch 4: disk full, cache failure, dependency outage, traffic surge.
Eval set: each scenario × 3 noise seeds = 24 cases (≥20, per the judge lens).

## Slices and time boxes

| # | Time | Slice | Done when |
|---|---|---|---|
| 0 | 1:15–2:00 | Setup: `git init`, move CONCEPT.md into docs/, Vite + Tailwind client, Express server with helmet/cors/rate-limit/sanitize/Zod/error handler, `/api/health`, Atlas connection, `.env.example`, first deploy of the empty shell | Health endpoint is live on Render and the shell is live on Vercel |
| 1 | 2:00–5:30 | **The demo moment:** PayFlow sim + bad-deploy fault → alert coordinator → agent loop with 5 read-only tools → SSE trace → risk gate → approval → executor (token + lock) → verifier → report into incident memory | Break it in the Fault Lab, watch it diagnose, approve the rollback, see recovery and the report. Plain UI is fine |
| 2 | 5:30–8:00 | Remaining 7 core scenarios, log compaction, rule-based baseline/fallback, **mid-run evidence injection** + visible re-plan, alert correlation | All 8 are diagnosable, and injecting new evidence changes the plan on screen |
| 3 | 8:00–11:00 | UI pass: design system, 21st.dev building blocks, Motion, report page, audit log, loading/empty/error states everywhere | Every screen passes the checklist in DESIGN_SYSTEM.md |
| 4 | 11:00–1:00 | Benchmark harness (agent vs baseline: root-cause accuracy, time to diagnosis, wrong-action rate, cost per run) + page, run the 24-case eval, autocannon load test (p50/p95) | Real numbers saved and shown on screen |
| 5 | 1:00–3:00 | The 5 scripted edge cases (missing data, conflicting data, tool failure, ambiguous alert, out-of-scope request), prompt-injection flagging, human-rejects path, fix-didn't-work path; production deploy + seed | Each edge case is shown gracefully on the deployed app |
| 6 | 3:00–5:00 | README with screenshots, TECHNICAL.md, CODE_EXPLAINED.md review; stretch scenarios only if everything above is green | A stranger can run it in 5 minutes |
| 7 | 5:00–6:30 | Buffer: bug fixes only, fresh-browser test of the deploy, backup demo video | **Freeze 6:30** |

Commit after every working slice (`feat: ...`). Deploy from slice 0 onwards, never at the end.

## Adithya in parallel (no code needed)

- Now: write realistic log lines and a deploy history for each of the 8 scenarios, including what a real engineer would check. These make the simulator believable.
- By slice 2: `docs/DEMO_SCRIPT.md` (problem 20s → demo 2 min → numbers 20s → why different 20s).
- By slice 4: `docs/QA_PREP.md` with 15+ hard questions (scaling, failure modes, cost, "why an agent not a script", concurrency, IAM, hallucination), plus `docs/ARCHITECTURE.md`.
- Slice 6: `docs/TECHNICAL.md`, `docs/CODE_EXPLAINED.md` from the code, then rehearse.

## Needed from Nikhil before slice 0

1. `ANTHROPIC_API_KEY`
2. MongoDB Atlas connection string (free M0 cluster, network access 0.0.0.0/0 for Render)
3. 21st.dev API key (21st.dev/mcp); not blocking, I'll start with plain Tailwind
4. An empty GitHub repo URL (or confirm I should create it with `gh`)
5. Vercel and Render accounts linked to that GitHub
