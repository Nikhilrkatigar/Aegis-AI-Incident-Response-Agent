# AEGIS
## Your project, explained simply

A friendly guide to what it does, how it works, and how to show it to someone else.

Imagine a little robot detective watching a pretend payment company. When something breaks, it gathers clues, suggests a repair, asks a person before risky changes, and checks whether the repair worked. That is Aegis.

**The whole idea:** Notice trouble. Find the cause. Choose a safe fix. Check the result. Remember what happened.

Prepared from the project files in D:\Games\hack on 30 September 2026.

This guide describes the code present at the time of review. Examples are illustrations, not results from a new live test. No benchmark scores or successful deployments are assumed.

**How to read:** Start with the story. Follow the demo when you want to try it. Use the later chapters when you want to understand the code or explain the project in a presentation.

# Start here
## Your reading map

| Chapter | What you will understand |
| --- | --- |
| 1. The big idea | The problem Aegis tries to solve |
| 2. Meet PayFlow | The five pretend services and their jobs |
| 3. The big picture | How the screen, server, AI and database fit together |
| 4. One incident, from start to finish | A broken release becomes a checked repair |
| 5. The detective's toolbox | Logs, metrics, changes and old incidents |
| 6. How the agent thinks and adapts | Hypotheses, confidence, tools and fallback |
| 7. The safety rules | Approvals, locks and limited action tokens |
| 8. Checking the repair | Recovery, retries, reports and memory |
| 9. Every screen | Where to look and what to click |
| 10. All eight fault scenarios | What can break and what can fix it |
| 11. Difficult situations | Missing clues, rejected actions and wrong fixes |
| 12. The benchmark | How the project compares AI with fixed rules |
| 13. Start the project | Setup, settings and a first demonstration |
| 14. Find your way around the code | The main files and their responsibilities |
| 15. Data and API messages | What is saved and how parts communicate |
| 16. What is built and what is limited | An honest view of the current prototype |
| 17. Explain it in a presentation | A short pitch and common questions |
| 18. Tiny dictionary and source map | Plain meanings and files to inspect |

**Beginner shortcut:** Read chapters 1-4, 9 and 13 first. You do not need to understand every programming word to understand the project.

# 1. The big idea
## A detective for broken software

Imagine a school canteen. One person takes orders, another checks meal cards, and another prepares food. Suddenly, the queue stops moving. The cashier looks slow, but perhaps the card checker is the person who is stuck.

A payment application can have the same problem. Several small parts depend on each other. The part showing an error may not be the part that caused it.

An **incident** is a problem that needs attention, such as customers being unable to pay. An **on-call engineer** is the person responsible for responding when this happens.

Without Aegis, that person might open several screens, read error messages, inspect recent updates, and search old incident notes. Then they have to decide which repair is safest.

Aegis brings those jobs into one workflow. Its intended user is an engineer looking after a payment platform.

| Aegis does this | Think of it like this |
| --- | --- |
| Watches for alerts | Hears the school bell when something is wrong |
| Collects evidence | Looks for footprints and asks witnesses |
| Compares possible causes | Checks which explanation fits the clues |
| Suggests an action | Chooses the repair that matches the cause |
| Applies approval rules | Asks the responsible adult before a risky change |
| Checks recovery | Tests whether the queue is moving again |
| Writes a report | Adds a page to the detective notebook |

**What success means:** Aegis should identify the cause and recover the affected services, or clearly hand the problem to a person when it cannot safely finish. A confident sentence alone is not a successful repair.

The project is a hackathon prototype in the Technology & Cybersecurity domain. It demonstrates an incident response workflow using synthetic operational data.

# 2. Meet PayFlow
## The pretend company Aegis watches

PayFlow is the project's simulated payment platform. It behaves like a small company with five departments. These departments are represented inside the Node.js server; they are not five separately deployed applications.

| Service | Its pretend job | Everyday comparison |
| --- | --- | --- |
| gateway | Receives requests and sends them to the right service | The front desk |
| payment | Handles payment work | The cashier |
| auth | Checks logins and identity tokens | The person checking ID cards |
| payments-db | Represents stored payment and session data | The main record book |
| session-cache | Represents fast access to session information | A small notebook kept close by |

The gateway depends on payment and auth. Payment depends on auth and payments-db. Auth depends on payments-db and session-cache.

This explains why one failure can spread. If the session cache changes its primary machine and auth keeps using the old one, auth can become slow. Payment then waits for auth. Customers see payment errors even though the trouble started elsewhere.

**Two databases to keep separate:** payments-db is a simulated PostgreSQL service in the PayFlow story. MongoDB is the real database used by Aegis to save incidents, actions, investigation steps and other records. Redis is also simulated through session-cache; this demo does not require a separate Redis installation.

The simulator generates made-up requests, timings, errors and logs. Faults change those numbers. Corrective actions change the simulator's state, so later readings can show recovery.

It is like a flight simulator: the exercise is artificial, but the controls and the feedback form a working demonstration. No real customer payments are processed.

Source: server/src/payflow/topology.js and simulator.js.

# 3. The big picture
## Four main pieces working together

[[ARCHITECTURE]]

**The frontend is the screen.** React builds the pages you click. Vite runs the development website and builds the production files. Tailwind styles the interface. Motion adds transitions. Axios carries ordinary requests to the backend.

**The backend is the manager.** Node.js runs the JavaScript server. Express receives requests. It coordinates incidents, enforces approval rules, calls investigation tools, executes allowed actions and verifies the outcome.

**The language model is a reasoning helper.** It can read evidence, choose the next tool and propose a diagnosis. The code controls which tools and actions exist. Available integrations include Anthropic, OpenRouter, Gemini and Groq, depending on configured keys.

**MongoDB is the notebook.** Mongoose defines the shapes of the saved records. Aegis stores incident history here so the browser can display it later.

The whole backend is a **modular monolith**: one server with folders for different jobs. PayFlow lives inside that server. The action executor still uses an HTTP request to the PayFlow admin route, with a signed token.

Live investigation updates reach the browser through **Server-Sent Events**, or SSE. Think of a school announcement speaker: the server can announce a new step without the browser asking each time. Separately, the browser asks for fresh platform health every three seconds.

The actual event route is /api/events. The concept document's per-incident streaming route is an older design idea.

Source: server/src/app.js, routes.js; client/src/App.jsx and lib/live.jsx.

# 4. One incident, from start to finish
## Example: a bad payment release

This is an illustrative walkthrough of the bad_deploy scenario. Exact readings and model decisions can vary.

1. **You inject the fault.** In Fault Lab, choose Bad deployment. The simulator records payment version v2.14.0 with its database connection pool reduced from 50 to 5.
2. **Requests start waiting.** A connection pool is like a set of checkout counters. Closing 45 of 50 counters can leave a long queue. Payment logs start showing connection timeouts and HTTP 500 errors.
3. **Monitoring notices.** The coordinator checks alerts every five seconds, using measurements from the last minute. Related alerts can join one incident instead of opening several separate investigations.
4. **Aegis gathers clues.** It can inspect payment logs, database health, metrics and the release history. Candidate explanations might include a bad release or a database-wide shortage of connections.
5. **It proposes a diagnosis.** The release changed the pool limit, the errors follow the change, and the log messages mention max=5. These facts support a bad deployment diagnosis.
6. **The code checks the action.** Rolling back is classified as high risk, so Aegis waits for human approval even if the diagnosis sounds very confident.
7. **You approve.** Aegis records the decision, takes a lock on payment, creates a limited action token, and asks the PayFlow admin API to roll back.
8. **It watches the result.** A successful action response does not finish the incident. The verifier checks the affected services over the configured window.
9. **It writes the outcome.** If recovery passes, the incident becomes resolved and a report is created. A successful diagnosed incident can also become a searchable memory for later.

**Key lesson:** Aegis must connect evidence to an action and then check the action's effect. Each stage has a different responsibility.

Source: scenarios.js; incidents/lifecycle.js, executor.js and verifier.js.

# 5. The detective's toolbox
## Five ways to gather clues

The model does not receive the name of the injected fault. It receives an incident brief and can request evidence through a small set of tools.

| Tool | Plain explanation | Example question |
| --- | --- | --- |
| check_service_status | A health card for every service | Which parts look sick? |
| query_metrics | Measurements over time | Did auth slow down before payment? |
| search_logs | The services' written messages | What error keeps happening? |
| list_recent_changes | A history of updates and settings changes | What changed near the start? |
| search_past_incidents | Search old incident notes | Have we seen this pattern before? |

A separate tool called **conclude** submits the diagnosis and recommended action. It does not execute the repair.

**Logs are diary entries.** A line might say that a connection timed out. Many repeated entries support a pattern, but a line is still evidence to evaluate, not an instruction to obey.

**Metrics are measurements.** Error rate means how many requests fail. Requests per second measures traffic. CPU and memory show how busy a service is. p95 latency describes a slow end of the response-time distribution: roughly 95 of 100 requests finish within that time. In this simulator, p95 is generated data rather than calculated from real request traces.

**Changes supply timing clues.** A release that happened after the failures started cannot explain why those earlier failures began.

**Old incidents supply useful examples.** Aegis uses MongoDB full-text search and returns up to three matches. This is keyword-based retrieval, not a vector database or model training.

To keep logs manageable, compact.js groups similar messages, keeps counts and a few samples, and flags certain suspicious instruction-like lines. Oversized tool results may be summarized before reaching the investigator.

Source: server/src/agent/catalog.js; telemetry/tools.js and compact.js.

# 6. How the agent thinks and adapts
## Guess, check, update, decide

A **hypothesis** is a possible explanation. If the canteen queue stops, possibilities include a broken till, a slow card checker, or no food left. A good detective checks which explanation matches the evidence.

The investigator is prompted to begin with two to four concrete hypotheses. Tool requests carry updated hypotheses, confidence values and reasons for the check. The interface displays these stated reasons and observations as a trace; it is not a complete recording of the model's private internal reasoning.

The loop is: receive evidence, choose a tool, read its result, update the explanation, and eventually call conclude. Zod checks that the tool arguments and final answer have the allowed structure.

The default limit is **15 model turns per investigation call**. A turn can contain multiple tool calls, so this is not necessarily 15 tools. The default investigation-tool timeout is five seconds. Model requests have their own provider-specific timeouts.

**Confidence is a judgement, not proof.** A displayed 80% means the diagnoser reported 0.8 confidence. The project does not establish that such answers are correct exactly 80% of the time.

While an agent investigation is running, a human note or a correlated alert can be queued for the next model turn. A rejected action or a failed recovery check can also trigger a new investigation. These are the places where Aegis can revise its plan.

If a configured model provider fails, llm.js tries the configured provider chain. Providers without keys are skipped. If no model is available or the agent cannot finish, the incident workflow uses a rule-based diagnoser.

That fallback is a fixed checklist. It is useful for continuity and as a comparison baseline, but it does not perform the same flexible investigation. For example, its first rule blames a sufficiently recent deployment, which can be misleading.

Source: agent/investigator.js, llm.js and baseline.js; prompts/investigator.md.

# 7. The safety rules
## The detective cannot give itself permission

The model recommends an action. A fixed table in the code assigns the risk. This prevents a model from calling a dangerous action low risk just to run it.

| Action group | Current rule |
| --- | --- |
| restart, scale, clear_cache | Low risk in this simulator; automatic only at confidence of at least 0.60 |
| rollback, revert_config, rotate_certificate | High risk; always require human approval |
| block_ips, kill_db_connections, enable_maintenance | High risk; always require human approval |
| A low-risk action below 0.60 confidence | Requires human approval |
| none | Hand to a person; an out-of-scope conclusion closes without action |

These labels describe this prototype's policy. A restart or cache clear can still be disruptive in a real production system.

**A lock is a single repair key.** If two incidents want to change the same service, the resource lock is intended to make one wait. Locks are stored in MongoDB with an expiry. The executor waits up to 60 seconds to acquire one; the workflow normally keeps it through verification.

**An action token is a limited permission slip.** It lasts five minutes and identifies the allowed action, target service, issuer and audience. The admin API checks the token before applying the action. It tracks used token IDs in memory to reject replay during the current server process.

**Idempotency means avoiding the same job twice.** A saved action key includes the incident, attempt, action type and target. An already executed matching action can return its existing result.

**The audit log is the sign-in book.** It records approvals, rejections, actions and other important events.

The on-call name selector is not a login system. Approval names are recorded, but the current application does not authenticate the person behind them. This is a demo workflow, not production access control.

Source: agent/catalog.js; incidents/locks.js and executor.js; payflow/admin.js.

# 8. Checking the repair
## "The button worked" is different from "the problem is fixed"

Suppose you restart a broken toy and its power light comes on. You still need to check whether it moves. Aegis applies the same idea to a repair.

The default verification window is **120 seconds**. It checks every 15 seconds. Recovery requires the last two checks to be healthy for every affected service, including the action target.

For this verifier, healthy means all three conditions hold: error rate below 2%, p95 latency below 800 milliseconds, and failed logins below 100 per minute. Missing measurements do not count as healthy.

| State shown in the app | Meaning |
| --- | --- |
| investigating | Gathering and comparing clues |
| awaiting_approval | Waiting for a person to allow a proposed action |
| executing | Attempting the action |
| verifying | Watching whether service health recovers |
| needs_human | No safe automated action was chosen |
| resolved | Recovery checks passed |
| escalated | Automation handed the problem to the on-call person |
| out_of_scope | The report is outside PayFlow incident response |

If verification fails in agent mode, the investigator can try again. The lifecycle allows up to two fix attempts. In rule-fallback mode, an unsuccessful verified fix is escalated instead of starting another adaptive investigation.

A report includes a summary, root cause, supporting evidence, rejected explanations, actions, approval information, verification, timeline and prevention suggestions. The narrative can use a model, with a deterministic fallback if that fails.

Successful, classified incidents are added to incident memory. This is remembering notes, not retraining the AI model.

**Current limitation:** Reports are generated by the post-verification finish path. Some other endings, such as a rejected fallback action, execution failure, needs_human or out_of_scope, may not produce a report even if the UI suggests reports follow escalation generally.

Source: incidents/verifier.js, alerts.js, lifecycle.js and report.js.

# 9. Every screen
## Where to look and what to click

| Screen | What it is for | What you should notice |
| --- | --- | --- |
| Incidents | Follow a problem from alert to outcome | Incident list, trace, diagnosis, hypotheses, approval card and service health |
| Fault Lab | Create a controlled problem | Eight Inject buttons, three edge-case switches, manual issue form and reset |
| Benchmark | Compare the agent with fixed rules | Batch progress, accuracy, action results, recovery and timing |
| Audit log | Review important recorded events | Who did what, when, and for which incident |
| Incident report | Read the written outcome | Evidence, action, verification, timeline and prevention |

The report is opened from an incident. It is not a separate main navigation item. Its **Print or save PDF** button opens browser printing, where you can choose a PDF destination.

The top bar labels PayFlow as simulated. It shows how recently platform data arrived and lets you select the on-call name. The sidebar displays the configured diagnosis engine or model provider chain.

On the Incidents page, use the left column to choose an incident. Read the center trace in order. Use the right side to inspect hypotheses, current health and any approval request.

An approval opens an in-app confirmation dialog. **Approve and run** sends the decision. Rejecting requires a reason, which the agent can use when considering a different approach.

You can add a note to an open incident. During an active agent investigation it becomes input for a following model turn. At other stages it is recorded; it does not automatically restart the investigation.

**Reset PayFlow is not erase everything.** It clears active faults, scheduled simulator events and chaos switches. It does not delete incidents or wipe all history and service metadata. Recent unhealthy readings can remain in rolling averages briefly.

Source: client/src/pages/ and components/incident/; payflow/simulator.js.

# 10. All eight fault scenarios
## The problems your demo can create

The current scenario registry contains eight cases. The fixes below are the simulator's accepted action-target combinations, not measured guarantees about the AI's recommendations.

| Scenario | Explain it simply | Accepted simulator repair |
| --- | --- | --- |
| Bad deployment | A new payment release shrinks the available database connection pool | Roll back payment |
| Database connection exhaustion | A batch job occupies too many database connections | Kill idle DB sessions on payments-db |
| Memory leak | Auth keeps information until its memory fills up | Restart auth or roll back auth |
| Slow downstream dependency | Auth receives more legitimate work than its workers can handle | Scale auth |
| Expired TLS certificate | The gateway cannot trust payment's expired digital certificate | Rotate payment's certificate |
| Misconfiguration | Payment uses the sandbox address instead of the intended payment-provider address | Revert payment configuration |
| Credential-stuffing attack | Bots repeatedly try leaked login credentials | Block offending IP ranges on auth |
| Misleading alert | Auth uses the old cache primary while a harmless payment release distracts the investigator | Restart auth |

**Why the misleading case matters:** If you hear a crash and then see someone enter the room, that person did not necessarily cause the crash. The project deliberately includes a harmless payment deployment after the cache problem starts. Timing and dependency evidence should help the agent avoid an unnecessary rollback.

The misleading_alert scenario is scored under the diagnosis category **cache_failure**, with **auth** as the root-cause service to repair. Scenario names and diagnosis categories do not always match.

Several faults can be active together because the simulator stores them in a map. This makes more difficult demos possible, but the standard benchmark evaluates one named fault per case.

The original concept mentioned 12 scenarios. Disk full, a separate cache-failure case, dependency outage and traffic surge were stretch ideas. They are not additional selectable scenarios in the current registry, even though some related category names exist.

Source: server/src/payflow/scenarios.js.

# 11. Difficult situations
## What happens when clues are missing or a repair goes wrong?

| Situation | Current behavior or intended test |
| --- | --- |
| Auth logs are missing | The logs_down switch returns no auth log lines plus a missing-data note. The agent should use other evidence. |
| Metrics are too slow | metrics_timeout makes the metrics tool wait six seconds, exceeding the default five-second tool limit. |
| A log tries to boss the AI around | log_injection adds an instruction-like line. Known patterns are flagged and withheld by log compaction. |
| A person rejects a proposal | In agent mode, the reason becomes new evidence. Two rejections cause escalation; fallback mode escalates on rejection. |
| The action executes but health stays poor | Verification fails. The agent can investigate again within the fix-attempt limit. |
| A tool or provider fails | Tool errors go back as evidence; providers can fail over; the incident can fall back to fixed rules. |
| A vague manual report arrives | The agent is instructed to gather evidence and admit uncertainty. A safe outcome can be needs_human. |
| A report is outside PayFlow operations | The agent is instructed to conclude out_of_scope with no action. The fixed-rule fallback has less nuanced scope handling. |

**A useful distinction:** Code can require a valid action name and can block execution without approval. It cannot guarantee that a model's interpretation of evidence is correct. The benchmark and verification exist to test that difference.

The suspicious-log filter catches specific patterns. It is a demonstration of one protective layer, not proof that every possible prompt injection is defeated.

For a clean beginner demo, start with one fault and leave chaos switches off. After that works, introduce one complication at a time so you can explain why the behavior changes.

If an incident reaches needs_human, the current interface provides evidence and notes, but there is no complete manual incident-resolution workflow implemented in the API.

Source: telemetry/compact.js and tools.js; agent/investigator.js; incidents/lifecycle.js.

# 12. The benchmark
## Giving both diagnosers the same test paper

A **benchmark** is a repeatable set of exercises. Aegis compares two approaches: the tool-using agent and a fixed rule checklist called the baseline.

The benchmark uses eight scenarios and three random seeds: 11, 23 and 37. A seed is a recipe number for repeatable noise in the simulated data.

**8 scenarios x 3 seeds = 24 cases per diagnoser.** Running both produces 48 result records. Each case gets its own PayFlow instance so it does not inject faults into the live dashboard's simulator.

| Measurement | What it means |
| --- | --- |
| Root-cause accuracy | Both the diagnosis category and root-cause service match the expected answer |
| Correct-action rate | The action and target match an accepted repair |
| Wrong-action rate | A non-none action was recommended but is not an accepted repair |
| Recovered rate | The affected services pass the sandbox health check after the action |
| Median diagnosis time | The middle timing value used to summarize typical diagnosis speed |
| Steps, tokens and estimated dollars | How much recorded investigation work the run used |

The harness applies a recommendation directly to the sandbox and advances its clock by 90 seconds. It checks a 30-second health window. This is different from the live approval, token, lock and 120-second verification workflow.

**Read the numbers honestly.** No result percentages were measured for this guide. The exercise covers a small, synthetic set with known repairs. It does not prove production reliability, and a zero wrong-action rate alone could hide many failures to diagnose or act.

Cost fields are incomplete estimates. Some adapters return zero cost, and summary/report calls are not all included in the investigator's usage totals. Zero displayed dollars does not establish zero billing.

The baseline deliberately uses simple ordered rules, including a recent-deploy-first rule. Any claimed advantage is relative to this particular baseline.

Source: server/src/benchmark/run.js and agent/baseline.js.

# 13. Start the project
## Setup and a first demonstration

You need Node.js with npm and an accessible MongoDB database. The installed Vite package declares Node ^20.19.0 or >=22.12.0; use a version compatible with that requirement. The server alone declares >=20.

**Windows launcher:** From the project folder, run start.bat. It creates missing .env files from the examples, installs missing dependencies, looks for MongoDB Community under Program Files, and starts local MongoDB on port 27018 when it can. It then starts the API and frontend and opens the browser. This describes the launcher; it was not run to prepare this guide.

| Address or setting | Purpose |
| --- | --- |
| http://localhost:5173 | The development website |
| http://localhost:4000/api/health | Backend health and provider status |
| mongodb://127.0.0.1:27018/aegis | Default MongoDB connection |
| server/.env | Database, model keys, verification and server settings |
| client/.env | VITE_API_URL, normally http://localhost:4000/api |

For manual startup, ensure MongoDB is running and create missing .env files from .env.example without overwriting existing settings. Run these commands in separate terminals:

```text
Terminal 1:
cd D:\Games\hack\server
npm install
npm start

Terminal 2:
cd D:\Games\hack\client
npm install
npm run dev
```

No model key is required for rule-only operation. For agent mode, put a valid provider key and an available model ID in server/.env. The example model names are configuration defaults, not verified promises of provider availability. Restart the server after editing its settings. Never put private keys in the client.

**Try it:** Open Fault Lab, inject Bad deployment, switch to Incidents, follow the clues, approve the rollback, and wait for verification and the report. Allow time for fault ramp-up, alert averaging and model calls. The report page can be saved as a PDF.

# 14. Find your way around the code
## Each folder has a job

| Path | Plain-language responsibility |
| --- | --- |
| start.bat | Windows helper that starts the local pieces |
| client/src/App.jsx | Defines website routes and shared providers |
| client/src/components/Shell.jsx | Navigation, on-call selector and model status |
| client/src/pages/ | Incidents, Fault Lab, Benchmark, Audit and Report screens |
| client/src/components/incident/ | Trace, hypotheses, diagnosis, notes and approval controls |
| client/src/lib/api.js, live.jsx | Ordinary API calls, live events and health polling |
| client/src/lib/oncall.jsx, format.js | Selected on-call name and display formatting |
| server/src/index.js, app.js | Startup, MongoDB connection and Express setup |
| server/src/config.js, routes.js | Environment settings and public API endpoints |
| server/src/payflow/ | Simulated services, faults, clock and admin actions |
| server/src/telemetry/ | Evidence readers and repeated-log compression |
| server/src/agent/catalog.js | Allowed tools, action risk and validation schemas |
| server/src/agent/investigator.js | The model-driven investigation loop |
| server/src/agent/llm.js, baseline.js | Provider adapters/failover and fixed-rule diagnosis |
| server/src/incidents/ | Alerts, coordination, lifecycle, actions, locks, verification and reports |
| server/src/models/index.js | MongoDB document structures and indexes |
| server/src/benchmark/run.js | Repeatable sandbox evaluation and scoring |
| server/src/seed.js, scripts/ | Example incident memory and command-line helpers |
| server/prompts/ | Instructions for the investigator and report writer |
| docs/CONCEPT.md, PLAN.md | Original proposal and intended build plan |

**Follow one button:** Fault Lab calls api.post('/lab/faults'). Express routes.js validates it and calls live.inject(). The simulator changes its signals. The coordinator notices the alerts. lifecycle.js starts investigation and manages what happens next.

**Follow one update:** recordStep saves a trace step in MongoDB, emits an event through bus.js, and /api/events sends it to the browser. live.jsx updates React state so the screen can display it.

Start with those two journeys before reading every line of code.

# 15. Data and API messages
## The notebooks and the delivery routes

An API is a set of request-and-response routes between programs. Think of the frontend sending a labelled envelope: "Please show this incident" or "Please record this approval."

| Stored record | What it remembers |
| --- | --- |
| Incident | Status, alerts, diagnosis, proposal, decisions, verification and report |
| AgentStep, in agent_runs | An individual trace entry, tool result or event |
| Action | Target, risk, approval name, duplicate-prevention key and execution result |
| Lock | Which incident temporarily owns the repair lock for a resource |
| IncidentMemory, in incident_memory | Searchable previous incident descriptions and fixes |
| AuditLog, in audit_log | Important operator and system events |
| BenchmarkRun, in benchmark_runs | Expected answer, diagnosis, timing and score for a case |

Raw simulator metrics, logs, changes and events are held in server memory. Metric history is trimmed to 45 minutes; logs are capped at 60,000 lines. Saved trace results can retain selected evidence, but there is no raw telemetry collection in the current models.

| API route | Meaning |
| --- | --- |
| GET /api/health and /api/platform | Check the backend and read platform health |
| GET /api/incidents and /api/incidents/:id | Read the incident list or an incident's details |
| POST /api/incidents | Open an issue manually |
| POST /api/incidents/:id/approve, /reject, /notes | Submit approval, rejection or a note |
| GET /api/lab; POST /api/lab/faults, /reset, /chaos | Read and operate the fault lab |
| GET and POST /api/benchmark | Read results or start an evaluation batch |
| GET /api/audit and /api/events | Read the audit history or subscribe to live events |
| POST /payflow/admin/actions | Apply an allowed simulator action with a signed token |

Normal API success responses wrap their data in { success: true, data: ... }. The PayFlow admin action route uses its own ok/message result shape. Zod validates key inputs; Express middleware provides headers, origin handling, rate limiting and Mongo input sanitization.

Source: models/index.js, routes.js, app.js and payflow/simulator.js.

# 16. What is built and what is limited
## Describe the prototype honestly

**Implemented in the reviewed code:** the React interface, eight simulated faults, alert coordination, investigation tools, model-provider adapters, rule fallback, risk gating, recorded approvals, scoped action tokens, resource locks, recovery checks, reports, searchable memory and a benchmark harness.

**Simulated:** payment processing, PostgreSQL/Redis services, service traffic, deployments, infrastructure measurements and the effects of operational repairs. Aegis itself uses real HTTP requests and real MongoDB records, and configured model calls use external provider APIs.

**Plan versus implementation:** The concept describes 12 scenarios, Claude as the only external reasoning service, and a per-incident event stream. The current code has eight scenarios, several model-provider integrations and one shared /api/events stream. The plan also described database-backed telemetry; the current raw telemetry stays in memory.

**Limits that matter when explaining the demo:**

- There is no authenticated login or role system. Choosing an on-call name records a label, not a verified identity.
- Active model conversations, PayFlow state and used-token replay tracking live in memory. A server restart loses these, although persisted incident records remain. There is no full restart-resume workflow.
- The token is checked against action type and target. It does not bind every action parameter, and the replay guard is not durable across process restarts.
- A fixed five-minute lock lease can expire during a verification window configured longer than that. Distributed production operation would need stronger ownership and renewal handling.
- Successful fixes are matched to predefined simulator action-target pairs. Parameters such as exact IP ranges are not fully validated as real infrastructure effects by the scenario scoring.
- Some terminal paths do not create reports. Benchmark costs and test coverage have the limits explained earlier.

Deployment to Vercel/Render/Atlas, load-test targets and broader evaluation appear in planning documents. This guide does not establish that those activities were completed.

**Possible future work:** authenticated approvals, persistent/resumable workflows, durable action replay protection, real observability integrations, stronger evaluation and additional scenarios. These are extensions, not features to claim as already delivered.

# 17. Explain it in a presentation
## A simple pitch you can say aloud

"Aegis is an AI incident response helper for a simulated payment platform. When errors rise, it investigates logs, metrics, recent changes and past incidents. It recommends a repair, asks for approval for risky actions, checks whether the service recovers, and writes a report. We also built a repeatable benchmark to compare it with a fixed rule checklist."

**A demo story:** Show healthy services. Inject a bad deployment. Explain the connection-pool clue. Show the proposed rollback and approval gate. Approve it, then show verification and the report. Keep time for the default two-minute verification window; the full flow can take several minutes.

| Someone asks | You can answer |
| --- | --- |
| Why use an agent? | It can choose checks and revise its explanation as new evidence arrives. The rule baseline follows a fixed order. |
| Is this just a chatbot? | It is connected to evidence tools and an action workflow. Its recommendations can change the simulator, and the result is checked. |
| Can it do anything it wants? | No. Tools and action names are allowlisted, inputs are checked, and code controls risk and approvals. |
| What if it is wrong? | The verifier can detect a failed recovery. The agent can retry within limits or escalate. |
| Does it learn? | It saves successful incident notes and searches them later. It does not retrain the model. |
| Are these real payments? | No. PayFlow is a simulator used to demonstrate the workflow safely and repeatably. |
| What if there is no API key? | The rule engine can still diagnose incidents, with fewer adaptive capabilities. |
| How accurate is it? | Show an actual completed benchmark batch. Do not quote a score that has not been measured. |
| Is it production-ready? | It is a working prototype design with important limits, including missing authenticated approvals and restart recovery. |

**Remember these three ideas:** Evidence before action. Human control for risky changes. Verification before declaring success.

# 18. Tiny dictionary and source map
## Translate the technical words

| Word | Simple meaning |
| --- | --- |
| Alert / incident | A warning signal / the tracked problem being investigated |
| Root cause / symptom | The underlying reason / the visible sign of trouble |
| Frontend / backend | The screen you use / the server doing the work |
| API / endpoint | A way programs communicate / one particular request address |
| Telemetry | Measurements and messages about how a system behaves |
| Deploy / rollback | Release a software version / return to an earlier version |
| Dependency | Another service a component needs to do its job |
| Hypothesis / confidence | A possible explanation / how sure the diagnoser says it is |
| Agent / tool | A decision-making loop / a limited operation it can request |
| LLM / token | A language model / a unit of model input or output text |
| Action token / JWT | A signed permission credential; different from an LLM token |
| Cache / connection pool | A quick-access store / a reusable group of connections |
| Scale / replica | Add service capacity / one copy of a service |
| p95 / latency | A response-time percentile / how long a response takes |
| SSE / polling | Server-pushed updates / repeatedly asking for fresh data |
| Lock / idempotency | Temporary ownership / avoiding duplicate execution |
| Seed / benchmark | A repeatable randomness recipe / a repeatable evaluation |
| Escalate / audit trail | Hand to a person / a record of important actions |
| Prompt injection | Untrusted text that tries to redirect the AI's behavior |

**Where these explanations came from:** The behavior chapters were checked against server/src/payflow, agent, telemetry, incidents, benchmark, models/index.js and routes.js. Screen descriptions came from client/src/App.jsx, pages, components and lib. Setup came from start.bat, package files, config.js and .env.example. The original intent came from docs/CONCEPT.md and PLAN.md.

The guide was prepared through source inspection. It does not claim a fresh end-to-end app test, a new benchmark result or confirmation of external model availability. The generated document files were checked separately for readable structure and page layout.

**If you only remember one sentence:** Aegis is a detective that gathers clues, follows repair rules, and checks whether the repair actually worked.
