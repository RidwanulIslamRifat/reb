# reb specification (v1)

## 1. Purpose
reb helps one analyst produce a complete, evidence-backed analysis of any SaaS product:
a linked knowledge graph of the product and business, plus requested reports
(business analysis, feature report, market analysis, build-it assessment).
It is to SaaS analysis what REA (github.com/morluto/rea) is to reverse engineering:
one install, an MCP server for AI agents, a CLI, a handbook skill, evidence records, logs.

## 2. Principles
1. Simple to use: one install command; daily use is talking to an AI agent in plain language.
2. Evidence first: every finding is an evidence record with source, label and limitations.
   Labels: observed (seen in the user's own session), documented (stated publicly),
   inferred (reasoned guess), unknown (not confirmed).
3. Normal use only: reb never logs in, never calls a product's private API, never replays
   or modifies requests, never scrapes or bulk-exports, never automates clicks in the product.
   The human does all hands-on use.
4. Everything inspectable: plain files on disk, append-only logs, versioned plans.
5. Local-first: data stays on the user's computer. No telemetry.
6. Same behaviour from CLI and MCP: both call the same workflows.

## 3. Usage
- Install: `npx reb setup` detects supported AI agents (Claude Code, Cursor, Codex, Gemini CLI),
  shows the changes it will make, asks for approval, registers the MCP server, installs the handbook,
  and backs up any config file it edits. Re-running it is safe.
- Daily: the user tells their agent "Analyse <domain>; reports: <list>". The handbook drives the rest.
- Terminal (optional): `reb new|plan|kb|evidence|audit|report|dashboard|doctor|update`.

## 4. Architecture (layers; dependencies point inward only)
- domain/: pure types and rules (zod schemas): plan, task, evidence, node, link, report spec. No I/O.
- storage/: reads/writes run folders. The only layer that touches files.
- sources/: adapters for outside inputs: public web page reader, HAR reader, optional REA bridge.
- workflows/: shared use cases: create run, plan, gate, audit, re-plan, record evidence, upsert node,
  build graph, render report.
- adapters/cli and adapters/mcp: thin layers that call workflows. No business logic here.
- dashboard/: local web app (read-only view of run folders) served by `reb dashboard`.
- handbook/: the skill files installed into agents.

## 5. Run folder (one per analysed product)
~~~text
~/reb/runs/<slug>-<YYYY-MM-DD>/
  brief.md                    product, url, category, reports, focus questions, plan tier, deadline
  plan/plan.json              current plan;  plan/history/plan-v<N>.json  every earlier version
  kb/nodes/<id>.md            one file per node;  kb/graph.json, kb/stats.json  generated
  evidence/ledger.jsonl       append-only evidence records
  evidence/inbox/session-NN/  user's screenshots, notes, HAR files
  notes/                      analysis drafts per role
  reports/<type>.md|.docx
  logs/events.jsonl           every tool call (automatic, append-only)
  logs/decisions.md           every plan change with its reason
  logs/roles/<role>.md        each role's plain-language work log
  logs/audits/audit-<N>.md
~~~
The runs root is configurable (REB_HOME).

## 6. Data formats
### 6.1 Plan
plan.json: { version, product, pipeline, reports[], tasks[] }.
Task: { id, title, role, depends_on[], inputs[], outputs[], done_when[], status, added_in, reason }.
status: pending | running | needs_human | done | blocked | dropped.
Every change copies the old file to plan/history and bumps version (never edit in place).

### 6.2 Evidence record (one JSON line)
{ id: "E-031", role, subject (node id), operation, source (url or file path),
  finding, confidence (observed|documented|inferred|unknown), limitations[], links[], at }
Corrections are new records linking to the old one. Sources are records with id "S-NNN",
  url, title, publisher, published (if known), read_at, content_sha256.

### 6.3 Knowledge graph
Node file = YAML front matter + Markdown body.
Required front matter: id, type, name, label. Links are front-matter lists.
Node types: company, product, module, feature, journey, persona, data_object, integration,
  pricing_tier, competitor, market_segment, hypothesis, question.
Link types (from -> to): makes (company->product), has (product->module, module->feature),
  does (persona->journey), uses (journey->feature, ordered), gated_by (feature->pricing_tier),
  reads_writes (feature->data_object), connects_to (feature->integration),
  also_offers (competitor->feature), belongs_to (persona->market_segment),
  explains (hypothesis->feature|data_object), evidence (any->E-/S- ids), about (question->any).
Rule: one fact lives in one node; other nodes link to it.
Validation reports: broken links, features without evidence, numbers without a dated source,
  inferred claims stated as observed, duplicate names.

## 7. Roles (agent-hosted)
Each role = a prompt file in handbook/roles/ + an allowed tool list.
planner, auditor, desk_researcher, market_researcher, walkthrough_coach, tech_observer,
feature_analyst, business_analyst, architect, kb_curator, report_writer.
The MCP tool next_task returns the next runnable task with its role prompt, inputs, outputs and
done_when. If the host agent supports sub-agents, the handbook tells it to delegate each task to
a sub-agent with that role prompt; otherwise the host performs the task itself.
Every role ends by calling log_role_work.

## 8. Planner and auditor (code, not prompts)
- Pipelines: templates in pipelines/*.json (b2b-saas, developer-tool, marketplace, consumer-app,
  ai-tool). create_plan picks one from brief.category and adapts it from the brief.
- Gate: after a task, check_gate evaluates done_when rules that can be checked by code
  (node counts, required links, evidence present) and returns the rest as a checklist.
- Audit: run_audit compares the graph and drafts against the brief's focus questions and the
  requested report specs; returns numbered gaps with severity (blocking|major|minor) and a
  suggested task for each.
- Re-plan: apply_replan adds/splits/reorders/drops tasks, versions the plan, and writes one
  line per change to decisions.md citing the audit item.
- Stop rule: no blocking gaps, or 3 re-plan rounds. Remaining gaps become question nodes.

## 9. MCP tools (all also available as CLI commands)
Run: create_run, get_brief, update_brief, list_runs.
Plan: create_plan, get_plan, next_task, update_task_status, check_gate, run_audit, apply_replan.
Evidence: record_source, record_evidence, list_evidence.
Graph: upsert_node, link_nodes, get_node, query_graph, validate_graph, build_graph.
Sources: read_public_page (fetch a public URL, return readable text, auto-record a source; obey
  robots.txt; no login; no form submission), detect_tech_stack (from public page HTML and headers),
  summarize_har (group requests by endpoint pattern, detect polling/streaming, strip cookies,
  auth headers and tokens before anything is stored).
Hands-on: make_test_plan, make_test_dataset, import_inbox (screenshots, notes, HAR -> evidence).
Output: render_report (markdown and docx), open_dashboard.
Logging: log_role_work. Every tool call is also written to logs/events.jsonl automatically.
Web search is done with the host agent's own search tool; results are recorded via record_source.

## 10. Dashboard (`reb dashboard`, localhost only)
Pages: runs list; plan board (tasks by status) with version history and diff; knowledge graph
(zoom, drag, filter by type and label, search, click a node to see its card and evidence,
highlight path between two nodes); evidence ledger table; logs timeline; reports viewer.
Read-only in v1.

## 11. Reports
Templates in reports/templates/: business, feature, market, build. Each section declares the node
types it needs (used by the auditor). Every claim cites node ids or E-/S- ids. Each report ends
with sources and open questions. Export: Markdown always, Word (.docx) optional.

## 12. Setup, doctor, update
setup: detect agents, preview, approve, back up, register, install handbook; idempotent.
doctor: checks Node version, MCP registration, runs root writable, optional REA presence.
update: updates the package and refreshes registrations.

## 13. Tech stack
TypeScript on Node.js 22+, ES modules. @modelcontextprotocol/sdk for MCP. zod for schemas.
A small CLI library (commander or similar). Dashboard: Vite + React + Cytoscape.js, built into
the package. docx export with the docx npm package. Tests: Vitest. Lint/format: ESLint + Prettier.
GitHub Actions runs tests on every pull request. Published to npm as "reb"; if that name is taken, use a scoped name such as "@<owner>/reb" and keep the command name "reb". License MIT.

## 14. Quality rules
- Expected failures return clear errors that say what went wrong and how to fix it.
- Every workflow has tests; storage and HAR redaction have tests with sample files in tests/fixtures.
- No secrets in logs: redact Authorization, Cookie, Set-Cookie, tokens, API keys.

## 15. Out of scope for v1
Self-driving mode with its own model calls, multi-user collaboration, cloud hosting,
editing from the dashboard, any form of product automation.
