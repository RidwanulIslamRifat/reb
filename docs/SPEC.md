# reb specification (v2)

v2 widens v1 (SaaS products, four reports) to any business or product, analysed the way a
business analyst, product manager, investor or audit firm would. Everything in v1 still holds;
sections marked **v2** are new.

## 1. Purpose
reb helps one analyst produce a complete, evidence-backed analysis of any business or product
(SaaS first, but also e-commerce, fintech, service businesses and others):
a linked knowledge graph of the product and business, plus requested reports.
The analysis covers what a business analyst, product manager or audit firm needs: features,
customers, business model, market, growth, threats and risks, business scope, company condition,
technical capabilities and tools, and enough product detail that someone could rebuild the product's
behaviour (**v2**). Reports read like official engagement reports: executive summary, scope and
methodology, rated findings, recommendations, limitations and a full evidence trail (**v2**).
It is to business analysis what REA (github.com/morluto/rea) is to reverse engineering:
one install, an MCP server for AI agents, a CLI, a handbook skill, evidence records, logs.

## 2. Principles
1. Simple to use: one install command; daily use is talking to an AI agent in plain language.
2. Evidence first: every finding is an evidence record with source, label and limitations.
   Labels: observed (seen in the user's own session), provided (from a document the analysed
   business handed over itself, for example to an auditor; **v2**), documented (stated publicly),
   inferred (reasoned guess), unknown (not confirmed).
3. Normal use only: reb never logs in, never calls a product's private API, never replays
   or modifies requests, never scrapes or bulk-exports, never automates clicks in the product.
   The human does all hands-on use. One opt-in exception (owner decision 2026-10-15, ROADMAP
   decision 23): `reb capture`, started by the person in a terminal after a yes, opens a visible
   browser with a fresh profile; the person logs in themselves; reb then only opens the product's
   own links one at a time (same site, no query strings, slow, page and depth limits), never
   links that could change something (sign out, delete, pay, export, confirm ...), private APIs,
   files or other sites, and never clicks, types, submits forms or downloads. It saves a
   screenshot and the visible labels of each screen as observed evidence, then forgets the login. "Rebuild" knowledge (v2) describes behaviour seen in normal
   use and public docs, and the visual design measured from it (layout, sizes, colours, fonts,
   spacing, corner radius, shadows, components and their visible states; ROADMAP decision 24), so a
   team can build a look-alike; reb never copies code, logos, icons, illustrations or content.
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
  evidence/inbox/provided/    documents the analysed business handed over (v2)
  notes/                      analysis drafts per role
  reports/<type>.md|.docx|.html
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
  finding, confidence (observed|provided|documented|inferred|unknown), limitations[], links[], at }
Corrections are new records linking to the old one. Sources are records with id "S-NNN",
  url, title, publisher, published (if known), read_at, content_sha256.

### 6.3 Knowledge graph
Node file = YAML front matter + Markdown body.
Required front matter: id, type, name, label. Links are front-matter lists.
Node types (v1): company, product, module, feature, journey, persona, data_object, integration,
  pricing_tier, competitor, market_segment, hypothesis, question.
Node types (v2), by family:
  business model: value_proposition, revenue_stream, cost_driver, channel, partner, customer;
  company condition: metric, funding_round, leader, signal, geography, compliance;
  strategy and risk: finding, risk, trend, force;
  technology and rebuild: technology, screen, user_role, business_rule, api_endpoint, requirement
  (a functional or non-functional requirement for a rebuild);
  design and UX: design_token (one measured colour, text style, spacing, radius, shadow, size,
  breakpoint or transition), ux_pattern (a layout, component, navigation, interaction, feedback or
  state pattern with its anatomy, variants and states).
Link types (from -> to): makes (company->product), has (product->module, module->feature),
  does (persona->journey), uses (journey->feature, ordered), gated_by (feature->pricing_tier),
  reads_writes (feature|api_endpoint->data_object), connects_to (feature->integration),
  also_offers (competitor->feature), belongs_to (persona|customer->market_segment),
  explains (hypothesis->any), evidence (any->E-/S- ids), about (question->any).
v2 links: delivers (product->value_proposition), serves (value_proposition|product->persona|
  market_segment|customer), earns (company|product->revenue_stream), incurs (company->cost_driver),
  sells_through (company|product->channel), partners_with (company->partner), buys (customer->product),
  measures (metric->any), raised (company->funding_round), leads (leader->company),
  complies_with (company|product->compliance), operates_in (company|product->geography),
  competes_in (competitor->market_segment), powers (technology->product|module|feature|integration),
  threatens (risk->any), concerns (finding->any), affects (trend|force|signal->any),
  shows (screen->feature|data_object), navigates_to (screen->screen), can (user_role->feature|screen),
  governs (business_rule->feature|data_object|pricing_tier|user_role), exposes (product|module->api_endpoint),
  relates_to (data_object->data_object), specifies (requirement->any),
  appears_on (design_token|ux_pattern->screen|feature).
Typed fields (v2): some node types carry extra front-matter fields that frameworks and reports read,
  for example risk {category, likelihood, impact, mitigation}, metric {kind, value, unit, as_of},
  finding {rating, area, swot, recommendation}, trend {pestle, direction}, force {force, strength},
  feature {acceptance, logic, data_use, priority}, requirement {kind, statement, category, priority},
  screen {path, layout, regions, components, states, viewport}, design_token {category, value, usage},
  ux_pattern {kind, anatomy, variants, states, behaviour}.
  The full table is in handbook/references/graph-format.md; validation reports missing or unknown values.
Rule: one fact lives in one node; other nodes link to it.
Validation reports: broken links, features without evidence, numbers without a dated source,
  inferred claims stated as observed, duplicate names; v2 adds missing or invalid typed fields
  and metrics older than 18 months.

## 7. Roles (agent-hosted)
Each role = a prompt file in handbook/roles/ + an allowed tool list.
planner, auditor, desk_researcher, market_researcher, walkthrough_coach, tech_observer,
feature_analyst, business_analyst, architect, kb_curator, report_writer;
v2 adds financial_analyst (metrics, funding, leaders, growth signals), strategy_analyst (findings,
SWOT, PESTLE trends, five forces) and risk_analyst (risk register, compliance).
The MCP tool next_task returns the next runnable task with its role prompt, inputs, outputs and
done_when. If the host agent supports sub-agents, the handbook tells it to delegate each task to
a sub-agent with that role prompt; otherwise the host performs the task itself.
Every role ends by calling log_role_work.

## 8. Planner and auditor (code, not prompts)
- Pipelines: templates in pipelines/*.json (b2b-saas, developer-tool, marketplace, consumer-app,
  ai-tool; v2 adds ecommerce, fintech, service-business, general-business). create_plan picks one
  from brief.category and adapts it from the brief.
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
Output: render_report (markdown, docx, print-ready html), open_dashboard.
Analysis (v2): get_framework (swot, pestle, five_forces, business_model_canvas, risk_register,
  findings, metrics, market_size, funding, growth_signals, tech_stack, competitor_matrix, sitemap,
  permission_matrix, data_model, user_stories, business_rules, api, feature_logic, requirements,
  nfr, design_system, ux_spec), compare_runs (what changed between two runs of the same or competing products).
Hands-on (v2): import_inbox also imports evidence/inbox/provided/ as provided evidence.
Capture (v2, CLI only because the person must agree and log in at the keyboard): `reb capture
[url]` writes screenshots and capture-notes.md into a new inbox session, screen nodes with
navigates_to links, observed evidence, evidence/imports/<session>/capture.json and
notes/capture-<session>.md (sitemap, labels per screen, suggested node types). Besides labels it reads
field kinds, required marks and drop-down choices, the values of kind columns (Status, Stage, Type,
Role), the main menu, tabs, charts, list controls and notices; people's names in choices and other
columns are left out, and nothing typed into a field is read. It also measures each screen's visual
design from computed styles (colours, fonts, text styles, spacing, corner radius, shadows, icon sizes,
transitions, regions such as sidebar and top bar, and each kind of component with its variants and
visible states), never reading text, images, icons or code for it, and covers email addresses and
phone numbers in the screenshots.
Feature model: analyse_capture (`reb analyse [session]`, also run at the end of a capture) infers from
the captured screens the modules, features (with likely logic, data reuse, acceptance criteria and
questions to check by hand), entities (attributes, types, required fields, states, relations), business
rules, roles and non-functional requirements, and from the measured design the design tokens and UX
patterns (observed, since they are measurements). It writes notes/feature-model-<session>.md and adds them
as inferred nodes with evidence linking the screenshots; existing nodes are never changed.
Logging: log_role_work. Every tool call is also written to logs/events.jsonl automatically.
Web search is done with the host agent's own search tool; results are recorded via record_source.

## 10. Dashboard (`reb dashboard`, localhost only)
Pages: runs list; plan board (tasks by status) with version history and diff; knowledge graph
(zoom, drag, filter by type and label, search, click a node to see its card and evidence,
highlight path between two nodes); evidence ledger table; logs timeline; reports viewer;
frameworks page (risk register, SWOT, PESTLE, five forces, business model canvas, metrics; v2).
Read-only in v1.

## 11. Reports
Templates in reports/templates/: business, feature, market, build; v2 adds due_diligence
(business condition), risk (risk assessment), strategy (SWOT, PESTLE, five forces, growth outlook),
technical (technical capability assessment), rebuild (product rebuild specification: PRD, screens,
UX specification and design system, roles and permissions, data model, business rules, user stories, API) and requirements (functional and
non-functional requirements specification: feature logic and data reuse, data model, numbered FR and NFR
with acceptance criteria, UX and design requirements).
Each section declares the node types it needs (used by the auditor) and may show framework views.
Every claim cites node ids or E-/S- ids. Every report (v2) has: report details with an overall
confidence rating, an executive summary, scope and methodology, the sections, limitations and
disclaimer, sources and open questions.
Export: Markdown always; Word (.docx, with cover page and table of contents) and print-ready HTML
(save as PDF from the browser) optional.

## 12. Setup, doctor, update
setup: detect agents, preview, approve, back up, register, install handbook; idempotent.
doctor: checks Node version, MCP registration, runs root writable, optional REA presence.
update: updates the package and refreshes registrations.

## 13. Tech stack
TypeScript on Node.js 22+, ES modules. @modelcontextprotocol/sdk for MCP. zod for schemas.
A small CLI library (commander or similar). Dashboard: Vite + React + Cytoscape.js, built into
the package. docx export with a small built-in writer (no dependency). Tests: Vitest. Lint/format: ESLint + Prettier.
GitHub Actions runs tests on every pull request. Published to npm as "reb"; if that name is taken, use a scoped name such as "@<owner>/reb" and keep the command name "reb". License MIT.

## 14. Quality rules
- Expected failures return clear errors that say what went wrong and how to fix it.
- Every workflow has tests; storage and HAR redaction have tests with sample files in tests/fixtures.
- No secrets in logs: redact Authorization, Cookie, Set-Cookie, tokens, API keys.

## 15. Out of scope for v2
Self-driving mode with its own model calls, multi-user collaboration, cloud hosting,
editing from the dashboard, any form of product automation, reading non-public or paywalled
data sources, copying a product's code, logos, icons, illustrations or content (measuring its visual
design is in scope, see 2.3).
