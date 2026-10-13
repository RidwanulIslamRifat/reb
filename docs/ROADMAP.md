# reb roadmap (v1)

This file sets the order of work. docs/SPEC.md defines what the product is; this file only splits
it into milestones. One milestone per branch and pull request. Tick items as they are merged and add
follow-ups that are discovered along the way.

Status key: `[ ]` not started, `[~]` in progress, `[x]` done.

Every "How the owner checks it" step assumes a terminal open in the reb folder, and that the
milestone's pull request page on GitHub shows a green check (tests and lint passed in GitHub Actions).
The first time on a new computer, run `npm ci` once (about one minute); after that each check takes
under 2 minutes.

---

## M1 Skeleton
Goal: an empty but correctly shaped project that builds, tests, lints and runs a `reb` command.

Deliverables
- [ ] TypeScript project on Node.js 22+, ES modules, MIT license (SPEC 13).
- [ ] Package name `@rifat/reb` in `package.json`, with the command name `reb`.
- [ ] Folder layout for every layer in SPEC 4, each with a short README saying what belongs there.
- [ ] Lint rule that blocks imports pointing the wrong way between layers (for example domain importing storage).
- [ ] `reb` CLI entry point with `--help` and `--version`, listing the planned commands
      (`new, plan, kb, evidence, audit, report, dashboard, doctor, update, setup, mcp`) as "not yet available".
- [ ] Shared error type that always carries "what went wrong" and "how to fix it" (SPEC 14).
- [ ] GitHub Actions workflow: install, lint, test, build on every pull request.
- [ ] `.gitignore` that excludes runs, HAR files, `.env`, `dist/`, `node_modules/`.

Files and folders
- `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts`
- `src/domain/`, `src/storage/`, `src/sources/`, `src/workflows/`, `src/adapters/cli/`, `src/adapters/mcp/`,
  `src/dashboard/`, `handbook/`, `pipelines/`, `reports/templates/`, `tests/`, `tests/fixtures/`
- `src/cli.ts` (builds to `dist/cli.js`), `src/domain/errors.ts`
- `.github/workflows/ci.yml`

Tests
- CLI prints help and version.
- Error type formats "problem" and "fix" lines.
- Lint fails on a deliberately wrong-direction import (checked by a test fixture).

How the owner checks it
1. `npm run build && node dist/cli.js --help`
2. You should see a list of reb commands. `node dist/cli.js --version` prints `0.1.0` (or similar).

---

## M2 Runs, plans and logs
Goal: reb can create a run folder, store a brief and a versioned plan, and log everything.

Deliverables
- [ ] Domain schemas (zod): brief, plan, task, task status, decision, event, role log entry (SPEC 6.1).
- [ ] Storage for the run folder layout in SPEC 5, with runs root from `REB_HOME` (default `~/reb/runs`).
- [ ] Safe writes: write to a temporary file then rename, so a crash never leaves half a file.
- [ ] Workflows: `create_run`, `get_brief`, `update_brief`, `list_runs`, `get_plan`, `next_task`,
      `update_task_status`, and a basic `save_plan` that copies the old plan to `plan/history/plan-v<N>.json`
      and bumps the version (never edits in place).
- [ ] `next_task` returns the first pending task whose `depends_on` are all done.
- [ ] Automatic event log: every workflow call appends one line to `logs/events.jsonl`, with secrets redacted.
- [ ] `log_role_work` workflow writing to `logs/roles/<role>.md`; plan changes write a line to `logs/decisions.md`.
- [ ] CLI: `reb new <domain>`, `reb plan show`, `reb plan next`, `reb plan set <task> <status>`.

Files and folders
- `src/domain/brief.ts`, `plan.ts`, `event.ts`
- `src/storage/runFolder.ts`, `atomicWrite.ts`, `jsonl.ts`
- `src/workflows/runs.ts`, `plan.ts`, `logging.ts`, `redact.ts`
- `src/adapters/cli/commands/new.ts`, `plan.ts`

Tests
- Creating a run produces exactly the SPEC 5 folders and a valid `brief.md`.
- Saving a plan twice leaves `plan-v1.json` in history and `version: 2` in `plan.json`.
- `next_task` respects dependencies and skips done, dropped and blocked tasks.
- Events log is append-only and redacts Authorization, Cookie, Set-Cookie, tokens and API keys.
- Clear error when `REB_HOME` is not writable or a run does not exist.

How the owner checks it
1. `REB_HOME=./tmp-runs node dist/cli.js new example.com`
2. Open the `tmp-runs` folder: you should see one folder named `example-com-<today>` with `brief.md`,
   `plan/`, `kb/`, `evidence/`, `notes/`, `reports/` and `logs/` inside, and one line in `logs/events.jsonl`.
3. Delete `tmp-runs` when done.

---

## M3 Evidence and knowledge graph
Goal: findings can be recorded with sources and labels, and linked into a validated graph.

Deliverables
- [ ] Domain schemas: source record (S-NNN), evidence record (E-NNN), node front matter, 13 node types,
      12 link types with allowed from/to pairs (SPEC 6.2, 6.3).
- [ ] Evidence workflows: `record_source`, `record_evidence`, `list_evidence`. IDs assigned by reb, never by the caller.
      Corrections are new records linking to the old one.
- [ ] Graph workflows: `upsert_node`, `link_nodes`, `get_node`, `query_graph`, `build_graph`
      (writes `kb/graph.json` and `kb/stats.json`), `validate_graph`.
- [ ] Validation report: broken links, features without evidence, numbers without a dated source,
      inferred claims labelled observed, duplicate names, links of a wrong type pair.
- [ ] CLI: `reb evidence add|list`, `reb kb add|link|show|query|build|validate`.

Files and folders
- `src/domain/evidence.ts`, `node.ts`, `links.ts`
- `src/storage/ledger.ts`, `nodeFiles.ts`
- `src/workflows/evidence.ts`, `graph.ts`, `validate.ts`
- `src/adapters/cli/commands/evidence.ts`, `kb.ts`
- `tests/fixtures/kb-sample/` (small fake product graph with deliberate mistakes)

Tests
- Evidence IDs are sequential and unique even when two records are written at the same time.
- Ledger is never rewritten; a correction adds a line.
- Node files round-trip (read then write gives the same file).
- Each validation rule catches its mistake in the fixture graph and passes on a clean graph.
- `link_nodes` rejects a wrong pair, for example `persona makes feature`.

How the owner checks it
1. `node dist/cli.js kb validate --run tests/fixtures/kb-sample`
2. You should see a numbered list of problems (for example "feature-export has no evidence") and a
   final line with the count. The fixture is built to contain one example of each problem.

---

## M4 MCP server, handbook and setup
Goal: an AI agent can use reb through MCP, guided by the handbook, after one install command.

Deliverables
- [ ] MCP server (`reb mcp`, stdio) exposing every workflow from M2 and M3 with the SPEC 9 names.
      Thin adapter only: same workflow functions the CLI uses.
- [ ] Handbook skill: main skill file that turns "Analyse <domain>; reports: <list>" into the workflow,
      plus the 11 role prompt files with their allowed tool lists (SPEC 7). Sub-agent delegation when the host supports it.
- [ ] `reb setup`: detect Claude Code, Cursor, Codex, Gemini CLI; show the exact changes; ask for approval;
      back up each config file before editing; register the MCP server; install the handbook. Safe to re-run.
- [ ] `reb doctor`: Node version, MCP registration per agent, runs root writable, REA present (optional).
- [ ] `reb update`: refresh the package and registrations.

Files and folders
- `src/adapters/mcp/server.ts`, `src/adapters/mcp/tools/*.ts`
- `src/workflows/setup.ts`, `doctor.ts`, `update.ts`
- `src/sources/agents/` (one small adapter per supported agent: where its config lives and how to register)
- `handbook/SKILL.md`, `handbook/roles/<role>.md` (11 files)
- `tests/fixtures/agent-configs/` (fake config files for each agent)

Tests
- Every MCP tool name in SPEC 9 that exists so far is registered, and each one calls the same workflow as the CLI.
- Setup on fake configs: shows a preview, does nothing without approval, creates a backup, and a second run changes nothing.
- Doctor reports each check as pass or fail with a fix hint.
- Every role file names only tools that exist.

How the owner checks it
1. `node dist/cli.js doctor`
2. You should see a short checklist with a tick or cross per line, and a fix hint next to each cross.
3. Optional: `node dist/cli.js setup` shows a preview and asks "Apply these changes?"; answer `n` and confirm nothing changed.

---

## M5 Research tools
Goal: reb can read public pages, guess the tech stack and summarise a HAR file, safely.

Deliverables
- [ ] `read_public_page`: one public URL per call; obey robots.txt; no login, no forms, no crawling;
      returns readable text and records a source (S-NNN) with `content_sha256`.
- [ ] `detect_tech_stack`: from one public page's HTML and response headers, using a small signature list in the repo.
- [ ] `summarize_har`: group requests by endpoint pattern, detect polling and streaming, strip cookies,
      auth headers, tokens and API keys before anything is written to disk.
- [ ] CLI equivalents: `reb evidence read-page <url>`, `reb evidence stack <url>`, `reb evidence har <file>`.
- [ ] Clear refusals: "robots.txt disallows this page", "this page needs a login", "file is not a HAR".

Files and folders
- `src/sources/publicPage.ts`, `robots.ts`, `techStack.ts`, `techSignatures.json`, `har.ts`
- `src/workflows/research.ts`
- `tests/fixtures/har/` (synthetic HAR files only, with fake secrets planted for the redaction tests)
- `tests/fixtures/pages/` (saved sample HTML; tests never hit the real internet)

Tests
- robots.txt allow and disallow cases.
- Redaction: no planted fake secret appears anywhere in the output or the event log.
- Endpoint grouping (`/users/123` and `/users/456` become `/users/:id`), polling and streaming detection.
- Tech detection finds the expected tools in sample pages.

How the owner checks it
1. `node dist/cli.js evidence har tests/fixtures/har/sample.har`
2. You should see a short table of endpoint patterns with counts, and the word `[REDACTED]` where the fake
   token was. Searching the output for `FAKE-SECRET` should find nothing.

---

## M6 Planner and auditor
Goal: reb builds a plan from the brief, checks each task, audits the result and re-plans with reasons.

Deliverables
- [ ] Pipeline templates: `b2b-saas`, `developer-tool`, `marketplace`, `consumer-app`, `ai-tool` (SPEC 8).
- [ ] `create_plan`: picks a pipeline from `brief.category`, adapts it to requested reports and focus questions.
- [ ] `check_gate`: evaluates code-checkable `done_when` rules (node counts, required links, evidence present)
      and returns the rest as a checklist.
- [ ] Report specs (data only): for each report type, its sections and the node types each section needs.
      Used by the auditor now and by the report templates in M9.
- [ ] `run_audit`: compares graph and drafts with focus questions and report specs; writes
      `logs/audits/audit-<N>.md` with numbered gaps, severity (blocking, major, minor) and a suggested task each.
- [ ] `apply_replan`: add, split, reorder, drop tasks; versions the plan; one line per change in `decisions.md`
      citing the audit item.
- [ ] Stop rule: no blocking gaps, or 3 re-plan rounds; remaining gaps become question nodes.
- [ ] CLI: `reb plan create`, `reb plan gate <task>`, `reb audit`, `reb plan replan`.
- [ ] Handbook updated: planner and auditor roles call these tools.

Files and folders
- `pipelines/*.json` (5 files)
- `src/domain/pipeline.ts`, `reportSpec.ts`, `audit.ts`
- `reports/specs/*.json` (business, feature, market, build)
- `src/workflows/createPlan.ts`, `gate.ts`, `audit.ts`, `replan.ts`

Tests
- Each pipeline file is valid and has no dependency cycles.
- `create_plan` gives different plans for different categories and report lists.
- Gate passes and fails on fixture graphs.
- Audit on a thin fixture graph finds a blocking gap; on a complete one finds none.
- Re-plan writes history, bumps version, logs decisions, and stops after 3 rounds.

How the owner checks it
1. `REB_HOME=./tmp-runs node dist/cli.js new example.com --category b2b-saas --reports business,feature`
2. `REB_HOME=./tmp-runs node dist/cli.js plan create` then `... plan show`
3. You should see a numbered task list with roles and dependencies. `... audit` prints numbered gaps
   with severity, and a new `logs/audits/audit-1.md` file appears.

---

## M7 Hands-on support
Goal: help the human do their own session in the product and turn what they saw into evidence.

Deliverables
- [ ] `make_test_plan`: a step-by-step checklist for the human, built from the graph's journeys and open questions,
      saying what to capture (screenshot, note, optional HAR).
- [ ] `make_test_dataset`: clearly fake sample data (CSV or JSON) the human can type or upload by hand. Never real personal data.
- [ ] `import_inbox`: reads `evidence/inbox/session-NN/` (screenshots, notes, HAR) and creates evidence records
      labelled observed, linked to nodes where the note says so; HAR goes through `summarize_har` redaction.
- [ ] Walkthrough coach and tech observer roles updated to use these tools.
- [ ] CLI: `reb evidence test-plan`, `reb evidence dataset`, `reb evidence import <session>`.

Files and folders
- `src/workflows/handsOn.ts`, `src/storage/inbox.ts`
- `tests/fixtures/inbox/session-01/` (fake screenshot, notes file, synthetic HAR)
- `handbook/roles/walkthrough_coach.md`, `tech_observer.md`

Tests
- Test plan covers every journey node and every open question node.
- Dataset contains only synthetic values (checked against a pattern list).
- Import creates one evidence record per item, labels them observed, and never copies raw HAR secrets.
- Importing the same session twice does not create duplicates.

How the owner checks it
1. `node dist/cli.js evidence import session-01 --run tests/fixtures/run-sample --dry-run`
2. You should see "Would import 3 items: 1 screenshot, 1 note, 1 HAR", each marked observed, and nothing is written
   (`--dry-run` only shows what would happen).

---

## M8 Dashboard
Goal: a local, read-only web page to look at a run.

Deliverables
- [ ] `reb dashboard` serves on localhost only (127.0.0.1) and opens the browser; `open_dashboard` MCP tool does the same.
- [ ] Pages: runs list; plan board by status with version history and diff; knowledge graph (zoom, drag,
      filter by type and label, search, node card with evidence, highlight path between two nodes);
      evidence ledger table; logs timeline; reports viewer (SPEC 10).
- [ ] Read-only: no page can change files.
- [ ] Built into the package so users need nothing extra.

Files and folders
- `src/dashboard/server.ts` (tiny read-only HTTP server over storage)
- `src/dashboard/app/` (Vite + React + Cytoscape.js)
- `tests/dashboard/`

Tests
- Server refuses connections from other machines and refuses any write method (POST, PUT, DELETE).
- API returns run list, plan history and diff, graph, ledger, logs, reports from the fixture run.
- Path highlight finds the shortest path between two fixture nodes.
- Smoke test: each page renders without errors in a headless browser.

How the owner checks it
1. `node dist/cli.js dashboard --run tests/fixtures/run-sample`
2. Your browser opens a page. Click "Knowledge graph": you should see dots and lines; click one dot and a card
   with its evidence appears. Click "Plan" to see tasks in columns. Press Ctrl+C in the terminal to stop.

---

## M9 Reports
Goal: turn the graph into the four requested reports with citations.

Deliverables
- [ ] Templates in `reports/templates/`: business, feature, market, build, using the report specs from M6.
- [ ] `render_report`: Markdown always, Word (.docx) optional; every claim cites node ids or E-/S- ids;
      each report ends with sources and open questions.
- [ ] Citation check: render fails with a clear list if a claim has no citation or cites a missing id.
- [ ] Report writer role updated; CLI `reb report <type> [--docx]`.

Files and folders
- `reports/templates/*.md`
- `src/workflows/renderReport.ts`, `src/storage/docxWriter.ts`
- `tests/fixtures/run-sample/` (complete enough to render every report)

Tests
- Each report type renders from the fixture run; every section present.
- Missing citation and broken citation are caught.
- Sources and open questions sections list the right items.
- .docx file opens (valid zip with document part) and contains the same headings.

How the owner checks it
1. `node dist/cli.js report business --docx --run tests/fixtures/run-sample`
2. Open `tests/fixtures/run-sample/reports/business.docx` in Word: headings, citations like `[E-003]`
   and a "Sources" and "Open questions" section at the end.

---

## M10 Release
Goal: anyone can install reb with one command and use it end to end.

Deliverables
- [ ] Published to npm as `@rifat/reb` (command still `reb`); `npx @rifat/reb setup` works from npm.
- [ ] End-to-end test: new run, plan, evidence, graph, audit, re-plan, report, using fixtures only.
- [ ] Safety review against SPEC 2: no login, no private API calls, no replay, no scraping, no click automation, no telemetry.
- [ ] README: install, daily use, terminal commands, where files live, privacy statement.
- [ ] CHANGELOG, version 1.0.0, GitHub release, npm publish from GitHub Actions.
- [ ] CI runs on Linux, macOS and Windows.

Files and folders
- `README.md`, `CHANGELOG.md`, `docs/USER_GUIDE.md`
- `.github/workflows/release.yml`
- `tests/e2e/`

Tests
- Full end-to-end test passes on all three operating systems.
- Packed package (`npm pack`) contains `dist/`, handbook, pipelines, templates, built dashboard, and no tests or fixtures.

How the owner checks it
1. On any computer with Node.js 22: `npx @rifat/reb --version` then `npx @rifat/reb doctor`
2. You should see version 1.0.0 and a checklist. Then ask your AI agent: "Analyse example.com; reports: feature"
   and confirm it starts by creating a run and a plan.

---

## Decisions on spec questions and gaps

The owner approved these on 2026-10-13: item 1 as chosen by the owner, all others as recommended.
They are binding for the milestones they name unless the owner changes them.

1. **npm package name (affects M1, M4, M10).** SPEC 13 allows a scoped name if "reb" is taken.
   *Decided:* the package is `@rifat/reb`; the command name stays `reb`. Install is `npx @rifat/reb setup`.
   Publishing needs an npm account or organisation called `rifat` (to check before M10).

2. **Command that starts the MCP server (M4).** Not named in the spec. *Decided:* `reb mcp`, using stdio,
   registered in agents as `npx -y @rifat/reb mcp`.

3. **Which run a tool works on (M2, M4).** Tools need to know the run but the spec does not say how.
   *Decided:* every run-level tool takes a `run` (slug); if missing, use the most recently changed run and say so in the reply.

4. **Do CLI calls also go to `events.jsonl`? (M2)** SPEC 9 says "every tool call". *Decided:* yes, CLI and MCP both log,
   with a field saying which one, so behaviour is the same (SPEC 2.6).

5. **Where source records live (M3).** SPEC 6.2 says sources are records but not which file. *Decided:* same
   `evidence/ledger.jsonl`, with a `kind` field (`source` or `evidence`), so there is one append-only ledger.

6. **ID assignment with parallel sub-agents (M3).** Two sub-agents could both take `E-031`. *Decided:* reb assigns IDs
   itself under a short file lock; callers never pick IDs.

7. **Node id format (M3).** Not defined. *Decided:* `<type>-<short-kebab-name>`, for example `feature-sso`, unique per run.

8. **What the node `label` means (M3).** Front matter requires `label`, but it is not said whether it is the evidence label.
   *Decided:* yes, one of observed, documented, inferred, unknown; the validator flags a node labelled stronger than its evidence.

9. **Ordered links (M3).** `uses (journey->feature, ordered)` has no format. *Decided:* the order of the list in front matter is the step order.

10. **Raw HAR files (M5, M7).** SPEC 9 strips secrets "before anything is stored", but the user drops raw HAR files into
    `evidence/inbox/` themselves. *Decided:* reb never copies a raw HAR; after import it warns that the raw file holds
    secrets and offers to delete it. The run folder is local and never committed.

11. **Pages that need JavaScript (M5).** A plain fetch cannot see content drawn by JavaScript, and a headless browser
    gets close to "automation". *Decided:* plain HTTP fetch only; when little text comes back, say so in the source's
    limitations and suggest the human takes a screenshot.

12. **Politeness limits for `read_public_page` (M5).** Not defined. *Decided:* one URL per call, an honest user agent
    `reb/<version>`, at least 1 second between calls to the same site, refuse if robots.txt disallows or cannot be read
    (except "not found", which means allowed), and a warning after 100 pages per run to stay clearly away from scraping.

13. **Tech stack signatures (M5).** No source given; well-known lists have restrictive licences. *Decided:* a small
    hand-written signature file in the repo (around 50 common tools), easy to extend.

14. **REA bridge (M5).** "Optional REA bridge" is not described. *Decided:* in v1 only `doctor` detects whether REA is
    installed; the bridge itself becomes a follow-up after v1.

15. **"plan tier" in the brief (M2).** Unclear whether it is reb's plan or the product's pricing plan.
    *Decided:* it is the product's pricing plan the analyst has access to (for example "Free trial"); features above it
    can only be documented or inferred, never observed.

16. **What `make_test_dataset` produces (M7).** Not described. *Decided:* small, obviously fake data files (names like
    "Test User 01", example.com emails) for the human to enter by hand; never real personal data.

17. **Audit needs report sections before reports exist (M6 vs M9).** SPEC 11 puts section needs in the report templates,
    but the auditor comes first. *Decided:* keep section needs as data files in `reports/specs/` in M6; M9 templates read them.

18. **How `reb update` works with npx (M4).** With npx there is no installed copy to update. *Decided:* registrations
    use `npx -y @rifat/reb@latest`, so update only refreshes the handbook and registrations; if installed globally,
    it also runs `npm install -g @rifat/reb@latest` after asking.

19. **Dashboard port (M8).** Not specified. *Decided:* bind to 127.0.0.1 only, try port 4747, pick a free one if taken, print the address.

20. **Same product analysed twice on one day (M2).** Folder name `<slug>-<YYYY-MM-DD>` would clash. *Decided:* use local
    date and add `-2`, `-3` on clashes.

21. **Supported operating systems (M1, M10).** Not stated. *Decided:* macOS, Linux and Windows; CI tests all three from M10,
    Linux only before that to keep checks fast.

22. **Extra libraries not named in SPEC 13.** Likely needs: a YAML front-matter reader, an HTML-to-readable-text library,
    a robots.txt parser. *Decided:* add each only in the milestone that needs it, with the reason stated in that pull request (AGENTS.md rule 6).
