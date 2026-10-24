# reb roadmap (v1 and v2)

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
- [x] TypeScript project on Node.js 22+, ES modules, MIT license (SPEC 13).
- [x] Package name `@rifat/reb` in `package.json`, with the command name `reb`.
- [x] Folder layout for every layer in SPEC 4, each with a short README saying what belongs there.
- [x] Lint rule that blocks imports pointing the wrong way between layers (for example domain importing storage).
- [x] `reb` CLI entry point with `--help` and `--version`, listing the planned commands
      (`new, plan, kb, evidence, audit, report, dashboard, doctor, update, setup, mcp`) as "not yet available".
- [x] Shared error type that always carries "what went wrong" and "how to fix it" (SPEC 14).
- [x] GitHub Actions workflow: install, lint, test, build on every pull request.
- [x] `.gitignore` that excludes runs, HAR files, `.env`, `dist/`, `node_modules/`.

Follow-ups found in M1
- [x] Replace placeholder commands with real ones as each milestone lands (M2: new, plan; added list, log;
      M3: kb, evidence; M4: setup, update, doctor, mcp; M5: evidence read-page, stack, har; M6: audit,
      plan create, plan gate, plan replan; M7: evidence test-plan, dataset, import, rea; M9: report). Done.
- [ ] TypeScript is pinned to 6.0 because typescript-eslint does not yet support TypeScript 7; upgrade when it does.

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
- [x] Domain schemas (zod): brief, plan, task, task status, decision, event, role log entry (SPEC 6.1).
- [x] Storage for the run folder layout in SPEC 5, with runs root from `REB_HOME` (default `~/reb/runs`).
- [x] Safe writes: write to a temporary file then rename, so a crash never leaves half a file.
- [x] Workflows: `create_run`, `get_brief`, `update_brief`, `list_runs`, `get_plan`, `next_task`,
      `update_task_status`, and a basic `save_plan` that copies the old plan to `plan/history/plan-v<N>.json`
      and bumps the version (never edits in place).
- [x] `next_task` returns the first pending task whose `depends_on` are all done.
- [x] Automatic event log: every workflow call appends one line to `logs/events.jsonl`, with secrets redacted.
- [x] `log_role_work` workflow writing to `logs/roles/<role>.md`; plan changes write a line to `logs/decisions.md`.
- [x] CLI: `reb new <domain>`, `reb list`, `reb plan show`, `reb plan next`, `reb plan set-status <task> <status>`,
      `reb plan save <file> --reason <why>`, `reb log tail`, `reb log role <role> <summary>`.

Follow-ups found in M2
- [ ] `list_runs` works on no single run, so it writes no event (each run has its own events file).
      Decide in M4 whether a runs-root log is wanted. `reb log tail` (reading the log) is also not logged.
- [ ] A task status change is a plan change, so it also makes a new plan version (SPEC 6.1 "every change").
      If this makes history too long, M6 could group status changes; needs an owner decision.
- [x] Two plan saves at the very same moment could race; add the M3 file lock to `save_plan` too. (Done in M3.)
- [x] brief.md values are written as JSON (valid YAML); switch to the M3 YAML reader when it is added. (Done in M3:
      brief.md is now read as YAML, so values typed without quotes also work.)

Files and folders
- `src/domain/brief.ts`, `plan.ts`, `event.ts`, `run.ts`
- `src/storage/runFolder.ts`, `atomicWrite.ts`, `jsonl.ts`, `planFiles.ts`, `briefFile.ts`
- `src/workflows/context.ts`, `runs.ts`, `plan.ts`, `logging.ts`, `logs.ts`, `redact.ts`
- `src/adapters/cli/output.ts`, `commands/new.ts`, `list.ts`, `plan.ts`, `log.ts`
- `tests/fixtures/plan-sample.json`

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
3. `REB_HOME=./tmp-runs node dist/cli.js plan save tests/fixtures/plan-sample.json --reason "first plan"`,
   then `... plan set-status t1 done`, then `... plan show`: t1 shows `[done]`, the plan is v2, and
   `plan/history/plan-v1.json` holds the old version. `... log tail` lists every call.
4. Delete `tmp-runs` when done.

---

## M3 Evidence and knowledge graph
Goal: findings can be recorded with sources and labels, and linked into a validated graph.

Deliverables
- [x] Domain schemas: source record (S-NNN), evidence record (E-NNN), node front matter, 13 node types,
      12 link types with allowed from/to pairs (SPEC 6.2, 6.3).
- [x] Evidence workflows: `record_source`, `record_evidence`, `list_evidence`. IDs assigned by reb, never by the caller.
      Corrections are new records linking to the old one.
- [x] Graph workflows: `upsert_node`, `link_nodes`, `get_node`, `query_graph`, `build_graph`
      (writes `kb/graph.json` and `kb/stats.json`), `validate_graph`.
- [x] Validation report: broken links, features without evidence, numbers without a dated source,
      inferred claims labelled observed, duplicate names, links of a wrong type pair.
- [x] CLI: `reb evidence add|list`, `reb kb add|link|show|query|build|validate`.

Added in M3
- [x] `reb evidence source <url>` records a source; `--file` hashes a saved copy, `--sha256` takes a hash.
- [x] `reb kb stats` builds graph.json and stats.json and prints the counts.
- [x] `--run` also takes a path to a run folder (for example `tests/fixtures/kb-sample`), not only a run name.
- [x] Extra validation rule `bad_node_file`: a node file that cannot be read, or whose name differs from its id.
- [x] New dependency `yaml` (ROADMAP decision 22) for node front matter and brief.md.

Follow-ups found in M3
- [ ] "Numbers without a dated source" treats any digit in a finding as a number (also "version 2").
      Observed findings are exempt because their own date counts. Refine if it gives false alarms.
- [ ] "Label stronger than evidence" only checks nodes that have evidence; features without any are caught
      by "features without evidence". Other node types without evidence are not flagged yet.
- [ ] There is no command to remove a link or a node yet; edit or delete the file in `kb/nodes/` by hand.
- [ ] `record_evidence` accepts a subject node that does not exist yet (with a warning), so research can
      come before the graph; `validate_graph` reports it as a broken link until the node is created.
- [x] M4: expose the M3 workflows as MCP tools with the SPEC 9 names. (Done in M4.)

Files and folders
- `src/domain/evidence.ts`, `node.ts`, `links.ts`, `validation.ts`, `graph.ts`
- `src/storage/ledger.ts`, `nodeFiles.ts`, `lock.ts`
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
- [x] MCP server (`reb mcp`, stdio) exposing every workflow from M2 and M3 with the SPEC 9 names.
      Thin adapter only: same workflow functions the CLI uses.
- [x] Handbook skill: main skill file that turns "Analyse <domain>; reports: <list>" into the workflow,
      plus the 11 role prompt files with their allowed tool lists (SPEC 7). Sub-agent delegation when the host supports it.
- [x] `reb setup`: detect Claude Code, Cursor, Codex, Gemini CLI; show the exact changes; ask for approval;
      back up each config file before editing; register the MCP server; install the handbook. Safe to re-run.
- [x] `reb doctor`: Node version, MCP registration per agent, runs root writable, REA present (optional).
- [x] `reb update`: refresh the package and registrations.

Added in M4
- [x] Handbook references: `handbook/references/evidence-protocol.md` and `graph-format.md`.
- [x] `next_task` also returns the task's `role_prompt` and `role_tools` from the handbook (SPEC 7).
- [x] MCP tool `save_plan` (the M2 workflow) so the planner role can write plans until `create_plan` lands in M6.
- [x] The MCP server sends SKILL.md as its instructions, so agents without skill support still get the workflow.
- [x] `reb setup --agent <ids>`, `--dry-run`, `--yes`, `--command auto|npx|local`. "auto" registers this local copy
      (`node <path>/dist/cli.js mcp`) unless reb was started by npx; that way it works before reb is on npm.
- [x] Skill folders follow REA: `~/.claude/skills/reb` for Claude Code, shared `~/.agents/skills/reb` for the others.
      Changed handbook files are backed up to `~/reb/backups/<date>/` (not next to the skill, where an agent
      would load the copy as a second skill).
- [x] New dependency `@modelcontextprotocol/sdk` (named in SPEC 13).

Follow-ups found in M4
- [ ] Error fix hints name CLI commands (for example "reb kb add"); over MCP they could name the tool instead.
- [ ] `reb update` prints the `npm install -g @rifat/reb@latest` command instead of running it (decision 18 says
      run it after asking). Revisit in M10 when the package is on npm.
- [ ] After the npm release (M10), switch registrations to npx: `reb update --command npx`.
- [ ] Codex config is edited line by line (only reb's own table) instead of with a TOML library; a reb table
      written in an unusual TOML form is rewritten.
- [ ] M2 follow-up still open: should `list_runs` (which works on no single run) write to a runs-root log?

Files and folders
- `src/adapters/mcp/server.ts`, `src/adapters/mcp/tools/*.ts`
- `src/workflows/setup.ts`, `doctor.ts`, `update.ts`, `handbook.ts`
- `src/sources/agents/` (one small adapter per supported agent: where its config lives and how to register)
- `src/storage/handbook.ts`, `hostFiles.ts`; `src/domain/handbook.ts`, `registration.ts`
- `src/adapters/cli/commands/setup.ts` (setup, update, doctor, mcp)
- `handbook/SKILL.md`, `handbook/roles/<role>.md` (11 files), `handbook/references/*.md`
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
- [x] `read_public_page`: one public URL per call; obey robots.txt; no login, no forms, no crawling;
      returns readable text and records a source (S-NNN) with `content_sha256`.
- [x] `detect_tech_stack`: from one public page's HTML and response headers, using a small signature list in the repo.
- [x] `summarize_har`: group requests by endpoint pattern, detect polling and streaming, strip cookies,
      auth headers, tokens and API keys before anything is written to disk.
- [x] CLI equivalents: `reb evidence read-page <url>`, `reb evidence stack <url>`, `reb evidence har <file>`.
- [x] Clear refusals: "robots.txt disallows this page", "this page needs a login", "file is not a HAR".

Added in M5
- [x] Desk researcher and market researcher role prompts rewritten with an ordered source checklist each
      (SPEC 9 Sources); tech observer uses `detect_tech_stack` and `summarize_har`.
- [x] SKILL.md and the evidence protocol tell agents to read pages with `read_public_page` and never open a
      refused page with another tool.
- [x] Politeness (decision 12): user agent `reb/<version>`, robots.txt checked again on every redirect,
      1 second between reads of the same site, a warning from 100 sources in a run.
- [x] Also refused: private and local addresses (localhost, 10.x, 192.168.x ...), addresses with a password
      in them, PDFs and other files that are not web pages, 401/403 answers and redirects to /login.
- [x] Pages with little text get a limitation saying they probably need JavaScript and a screenshot (decision 11).
- [x] `detect_tech_stack` records the page as a source too, so its findings can be cited.
- [x] `summarize_har` works without a run (then nothing is logged); with a run it logs only the file name.
- [x] No new dependency: the HTML-to-text reader and robots.txt parser are small hand-written files.

Follow-ups found in M5
- [ ] reb reads the web with Node's built-in fetch, which ignores proxy settings. Users behind a company proxy
      cannot read pages yet; add proxy support if an owner needs it.
- [ ] The private-address check looks at the address as typed; a public name that points to a private
      address is not caught. Low risk on a personal computer; revisit before any shared use.
- [ ] Login detection is a rule of thumb (a password field on a short page). A public sign-up page is
      refused as a login page; a login page with lots of text could slip through.
- [ ] The 100-page warning counts all sources in the run, including ones recorded by hand.
- [x] A HAR summary is not saved to disk; M7 `import_inbox` will save the redacted summary as evidence. (Done in M7.)
- [ ] Asset file names with a hash (for example `app.4f9c2b.js`) show as `:id` in HAR summaries.
- [ ] Live pages are never used in tests; the owner check below is the only real-internet check.

Files and folders
- `src/sources/web.ts`, `publicPage.ts`, `robots.ts`, `techStack.ts`, `techSignatures.json`, `har.ts`
- `src/workflows/research.ts`; `appendSource` shared with `record_source` in `src/workflows/evidence.ts`
- `src/adapters/mcp/tools/research.ts`; CLI commands in `src/adapters/cli/commands/evidence.ts`
- `handbook/roles/desk_researcher.md`, `market_researcher.md`, `tech_observer.md`
- `tests/fixtures/har/` (synthetic HAR files only, with fake secrets planted for the redaction tests)
- `tests/fixtures/pages/` (saved sample HTML and a `site.json` fake site; tests never hit the real internet)

Tests
- robots.txt allow and disallow cases.
- Redaction: no planted fake secret appears anywhere in the output or the event log.
- Endpoint grouping (`/users/123` and `/users/456` become `/users/:id`), polling and streaming detection.
- Tech detection finds the expected tools in sample pages.

How the owner checks it
1. `node dist/cli.js evidence har tests/fixtures/har/sample.har`
2. You should see a short table of endpoint patterns with counts, and the word `[REDACTED]` where the fake
   token was. Searching the output for `FAKE-SECRET` should find nothing.
3. Optional, real internet: `REB_HOME=./tmp-runs node dist/cli.js new example.com`, then
   `REB_HOME=./tmp-runs node dist/cli.js evidence read-page https://example.com/` prints
   "Recorded S-001" and the page text; `... evidence stack https://example.com/` lists tools found.
   Delete `tmp-runs` when done.

---

## M6 Planner and auditor
Goal: reb builds a plan from the brief, checks each task, audits the result and re-plans with reasons.

Deliverables
- [x] Pipeline templates: `b2b-saas`, `developer-tool`, `marketplace`, `consumer-app`, `ai-tool` (SPEC 8).
- [x] `create_plan`: picks a pipeline from `brief.category`, adapts it to requested reports and focus questions.
- [x] `check_gate`: evaluates code-checkable `done_when` rules (node counts, required links, evidence present)
      and returns the rest as a checklist.
- [x] Report specs (data only): for each report type, its sections and the node types each section needs.
      Used by the auditor now and by the report templates in M9.
- [x] `run_audit`: compares graph and drafts with focus questions and report specs; writes
      `logs/audits/audit-<N>.md` with numbered gaps, severity (blocking, major, minor) and a suggested task each.
- [x] `apply_replan`: add, split, reorder, drop tasks; versions the plan; one line per change in `decisions.md`
      citing the audit item.
- [x] Stop rule: no blocking gaps, or 3 re-plan rounds; remaining gaps become question nodes.
- [x] CLI: `reb plan create`, `reb plan gate <task>`, `reb audit`, `reb plan replan`.
- [x] Handbook updated: planner and auditor roles call these tools.

Added in M6
- [x] Pipeline task ids are short names (`company`, `pricing`, `features` ...). A task can be limited to some
      reports, and the report task is copied once per requested report (`report-business`, `report-feature`).
      When a task is left out, tasks that waited on it wait on its own dependencies instead.
- [x] One task per focus question (`focus-1` ...), answered in `notes/focus-<n>.md`. reb guesses the role and
      the node types from the question's words (for example "pricing" -> desk_researcher, pricing_tier).
- [x] `done_when` rules code can check use fixed wording: "at least N <type> nodes", "every <type> node has
      evidence", "every <type> node has a <link> link", "at least N sources", "validate_graph is clean",
      "validate_graph has no <rule> problems", "file <path> exists", "the latest audit is acted on".
      Anything else comes back from `check_gate` as a checklist item. `check_gate` never changes the plan.
- [x] Audit gaps are grouped (one gap per node type and per validation rule) and listed most severe first.
      Next to `audit-<N>.md`, reb writes `audit-<N>.json` (the same gaps as data, and which plan version
      re-planned it), used to count re-plan rounds.
- [x] `apply_replan` without changes adds the suggested task of every blocking and major gap. Every re-plan
      round also adds a re-audit task (`audit-r<N>`) after the new tasks, and pending report tasks wait for it,
      so the loop audits again before reports are written.
- [x] Stop rule question nodes are named `question-audit-<N>-gap-<n>`, label unknown.
- [x] Owner test fixes: re-plan does not add a task for a gap that a pending or running task already covers
      (same node type, same focus-answer file, or the same validation clean-up); `decisions.md` says which task
      covers it, and a re-plan that changes nothing is not counted as a round. `force` adds it anyway.
- [x] One shared role table (`src/domain/nodeRoles.ts`) for pipelines, focus tasks and audit suggestions;
      reading a pipeline fails when a task's role disagrees with it. Integrations now go to desk_researcher.
- [x] `reb plan create` and `reb audit` warn when brief.md is still empty or has no focus questions.
- [x] `reb plan replan` says which minor gaps are not turned into tasks.
- [x] `reb plan show` on a run without a plan now points to `reb plan create`. `save_plan` stays for custom plans.

Follow-ups found in M6
- [ ] A task whose dependency is set to `dropped` with `reb plan set-status` never starts (only `apply_replan`'s
      drop moves the waiting tasks on). For example, skipping the user's own session (walkthrough) stalls the
      plan. Decide whether a dropped dependency should count as finished.
- [ ] The audit counts nodes and evidence; it does not judge whether the content is good. Since M9,
      `render_report` checks that every claim in a report draft cites existing ids; quality is still not judged.
- [ ] Focus-question hints work on English words only.
- [ ] Question nodes made by the stop rule have no `about` link; the kb_curator adds them by hand.

Files and folders
- `pipelines/*.json` (5 files)
- `src/domain/pipeline.ts`, `reportSpec.ts`, `audit.ts`
- `reports/specs/*.json` (business, feature, market, build)
- `src/workflows/createPlan.ts`, `gate.ts`, `audit.ts`, `replan.ts`
- Also: `src/domain/gate.ts` (done_when rules), `replan.ts` (re-plan changes); `src/workflows/specs.ts`
  (loads pipelines and report specs); `src/storage/packageFiles.ts`, `auditFiles.ts`;
  `src/adapters/cli/commands/audit.ts`; handbook `SKILL.md`, `roles/planner.md`, `roles/auditor.md`
- Tests: `tests/domain/pipeline.test.ts`, `gate.test.ts`, `tests/workflows/plannerAuditor.test.ts`
  (fixture graphs are built in the test with `addNodes` in `tests/helpers.ts`)

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
- [x] `make_test_plan`: a step-by-step checklist for the human, built from the graph's journeys and open questions,
      saying what to capture (screenshot, note, optional HAR).
- [x] `make_test_dataset`: clearly fake sample data (CSV or JSON) the human can type or upload by hand. Never real personal data.
- [x] `import_inbox`: reads `evidence/inbox/session-NN/` (screenshots, notes, HAR) and creates evidence records
      labelled observed, linked to nodes where the note says so; HAR goes through `summarize_har` redaction.
- [x] Walkthrough coach and tech observer roles updated to use these tools.
- [x] CLI: `reb evidence test-plan`, `reb evidence dataset`, `reb evidence import <session>`.

Added in M7
- [x] Test plan file: `notes/test-plan-session-NN.md`. It picks the next session (the latest empty inbox folder,
      or a new one) and creates the empty inbox folder. Journeys list their features in `uses` order, with the
      persona that `does` them; features `gated_by` a pricing tier get "if it is locked, screenshot only the lock
      message". Features outside any journey without observed evidence get an extra step.
- [x] Dataset is category-aware (b2b-saas, developer-tool, marketplace, consumer-app, ai-tool; unknown falls back to
      b2b-saas with a warning) plus one table per `data_object` node. Files go to `notes/test-data/`. Every value is
      checked against a pattern list (Test/Example names, example.com, +1 555 01xx phones ...) before writing.
- [x] Inbox linking rules: a note bullet starts with `[node-id]` (a second tag becomes a link); a screenshot is named
      `<node-id>--<n>.png` or is mentioned in a note bullet. Items naming no node go to `--subject`, else to the
      only product node, else they are skipped with the reason. Unknown file types are listed as skipped.
- [x] Each inbox file becomes a source record (path + sha256) and each item one evidence record citing it.
      Re-import is detected from those records, so a second import adds only new items (for example a new note bullet).
- [x] HAR import: the summary is made and redacted in memory, then checked against every cookie, auth header and
      secret query value in the raw file; if any is still there, reb stops and writes nothing. Only the redacted
      summary is stored, in `evidence/imports/session-NN/<file>.summary.json`. The raw file stays in the inbox
      (decision 10) with a warning until `--delete-har` / `delete_raw_har` removes it.
- [x] `summarize_har` also gives the slowest request per endpoint (`max_ms`), next to the average.
- [x] Event-log redaction also removes secret-looking query values in addresses (`?session_id=...`, `&auth_code=...`).
- [x] Optional REA bridge (owner request, changes decision 14): `record_rea_result` tool and `reb evidence rea`.
      The tech observer may use REA's passive tools (`inspect_web_network_capture`, `inspect_web_page`,
      `analyze_web_bundle`) when REA is installed and store their results; any other REA tool name is refused,
      above all browser-driving ones. Results are redacted and saved in `evidence/rea/`; labels are capped
      (capture: observed, page: documented, bundle: inferred). Role files get an `optional_tools` list
      (REA passive tools only) and `next_task` returns it with a note.
- [x] `tests/fixtures/run-sample/`: a small fake run with a graph and `evidence/inbox/session-01/` (screenshot, notes,
      synthetic HAR with fake secrets). M9 extends it for reports.

Follow-ups found in M7
- [ ] reb never calls REA itself; it trusts the agent's word about which REA tool produced a result. A check that
      REA is really installed (as `reb doctor` does) could be added to `record_rea_result` if needed.
- [ ] Two imports of the same session at the very same moment could both record an item (no lock around the
      whole import). Unlikely with one human; add a lock if it happens.
- [ ] Screenshots are not looked at by reb; the finding is the file name plus the note that mentions it.
      The agent can look at the image and add a more precise `record_evidence`.
- [ ] Features above the user's plan tier are not checked on import; a note about one is still labelled observed
      (the human did see the lock screen). The auditor could flag it.

Files and folders
- `src/workflows/handsOn.ts`, `src/workflows/rea.ts`, `src/storage/inbox.ts`
- `src/domain/inbox.ts`, `testPlan.ts`, `dataset.ts`, `rea.ts`
- `src/adapters/mcp/tools/handsOn.ts`; CLI commands in `src/adapters/cli/commands/evidence.ts`
- `tests/fixtures/run-sample/` (with `evidence/inbox/session-01/`: fake screenshot, notes file, synthetic HAR)
- `handbook/roles/walkthrough_coach.md`, `tech_observer.md`, `handbook/SKILL.md`, `references/evidence-protocol.md`

Tests
- Test plan covers every journey node and every open question node.
- Dataset contains only synthetic values (checked against a pattern list).
- Import creates one evidence record per item, labels them observed, and never copies raw HAR secrets
  (every file in the run folder except the raw HAR is searched for the planted `FAKE-SECRET` values).
- Importing the same session twice does not create duplicates.
- REA bridge refuses non-passive tools, redacts results and caps labels.

How the owner checks it
1. `npm run build && node dist/cli.js evidence import session-01 --run tests/fixtures/run-sample --dry-run`
2. You should see "Would import 4 items: 1 screenshot, 2 notes, 1 HAR", each marked observed, the node each one
   goes to, and "Dry run: nothing was imported." No evidence is written (only the call's line in the run's
   `logs/events.jsonl`, which git ignores).
3. `node dist/cli.js evidence test-plan --run tests/fixtures/run-sample` prints a 4-step checklist
   ("Journey: Export notes", "Question: Which export formats are offered?" ...) and saves it in the fixture's
   `notes/` folder; `node dist/cli.js evidence dataset --run tests/fixtures/run-sample` lists fake CSV files.
   Both write into the fixture's `notes/` folder (ignored by git); delete it afterwards if you like.

---

## M8 Dashboard
Goal: a local, read-only web page to look at a run.

Deliverables
- [x] `reb dashboard` serves on localhost only (127.0.0.1) and opens the browser; `open_dashboard` MCP tool does the same.
- [x] Pages: runs list; plan board by status with version history and diff; knowledge graph (zoom, drag,
      filter by type and label, search, node card with evidence, highlight path between two nodes);
      evidence ledger table; logs timeline; reports viewer (SPEC 10).
- [x] Read-only: no page can change files.
- [x] Built into the package so users need nothing extra.

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
1. `npm run build`, then `node dist/cli.js dashboard --run tests/fixtures/dashboard-sample`
2. Your browser opens a page. Click "Knowledge graph": you should see dots and lines; click one dot and a card
   with its evidence appears. Click "Plan" to see tasks in columns. Press Ctrl+C in the terminal to stop.

Notes from building it
- The owner check uses a new fixture, `tests/fixtures/dashboard-sample/` (a fuller made-up Acme Notes run with
  11 plan versions, a ledger, logs, an audit and a sample report), because `run-sample` has no plan, ledger or logs.
- The CLI and MCP adapters do not import the dashboard (SPEC 4): `src/cli.ts` hands the dashboard starter to them.
- The browser smoke test needs Chromium (`npx playwright-core install chromium`); CI installs it. Without one,
  `npm test` skips only that file and says so.
- Follow-up: the graph uses one automatic layout; very large graphs (hundreds of nodes) may need a faster layout
  or grouping. Revisit after real runs.

---

## M9 Reports
Goal: turn the graph into the four requested reports with citations.

Deliverables
- [x] Templates in `reports/templates/`: business, feature, market, build. The M6 report specs moved into the
      templates' front matter (each section: id, title, what it is about, the node types it needs), so
      `run_audit` and `render_report` read the same file; `reports/specs/` is gone (changes decision 17).
- [x] `render_report`: Markdown always, Word (.docx) optional; every claim cites node ids or E-/S- ids;
      each report ends with sources and open questions.
- [x] Citation check: render fails with a clear list if a claim has no citation or cites a missing id.
- [x] Report writer role updated; CLI `reb report <type> [--docx]`.

Notes from building it
- The report_writer writes a draft in `notes/report-<type>.md` (summary, then `## <section title>` blocks).
  `render_report` checks every claim in it (each paragraph, list item and table row) and refuses with line
  numbers when one has no citation, cites an id that does not exist, or uses a heading that is not a section.
- Under each section the report lists the graph's nodes of the types the section needs, with label, links and
  each evidence finding, all cited. Corrected evidence is replaced by its correction. Section needs the graph
  does not meet are listed under "Open questions", next to question nodes and nodes labelled unknown.
- Sources lists every S- record cited directly or behind a cited E- record; evidence from files (hands-on
  sessions) is listed below it.
- The Word file is written with a small built-in writer (`src/storage/docxWriter.ts`, Node's own zlib), so no
  new dependency. It keeps headings, lists, tables, bold and italic.
- The fixture is a new `tests/fixtures/report-sample/` instead of `run-sample/`: run-sample's ledger is
  deliberately ignored by git because the M7 owner checks import into it, and the M7 tests rely on its
  small graph.
- Follow-up: the report task's `done_when` lines about citations are still a checklist item for the agent;
  `check_gate` could run the citation check on the rendered report.
- Follow-up: `reb report` renders one report per call; a `--all` option for every report in the brief may help.

Files and folders
- `reports/templates/*.md`
- `src/domain/report.ts` (rendering, draft sections, citation check), `src/domain/reportSpec.ts` (template format)
- `src/workflows/renderReport.ts`, `src/storage/docxWriter.ts`, `src/storage/reportFiles.ts`
- `src/adapters/cli/commands/report.ts`, `src/adapters/mcp/tools/reports.ts`, handbook `roles/report_writer.md`
- `tests/fixtures/report-sample/` (complete enough to render every report)
- Tests: `tests/domain/report.test.ts`, `tests/workflows/reports.test.ts`

Tests
- Each report type renders from the fixture run; every section present.
- Missing citation and broken citation are caught.
- Sources and open questions sections list the right items.
- .docx file opens (valid zip with document part) and contains the same headings.

How the owner checks it
1. `npm run build`, then `node dist/cli.js report feature --docx --run tests/fixtures/report-sample`
2. Open `tests/fixtures/report-sample/reports/feature.docx` in Word: headings, citations like `[E-003]`
   and a "Sources" and "Open questions" section at the end.

---

## M10 Release
Goal: anyone can install reb with one command and use it end to end.

Deliverables
- [~] Published to npm as `@ridwanul/reb` (command still `reb`); `npx @ridwanul/reb setup` works from npm.
      Everything is ready; the owner publishes by creating a GitHub release (docs/RELEASING.md).
- [x] End-to-end test: new run, plan, evidence, graph, audit, re-plan, report, using fixtures only.
- [x] Safety review against SPEC 2: no login, no private API calls, no replay, no scraping, no click automation, no telemetry.
- [x] README: install, daily use, terminal commands, where files live, privacy statement.
- [~] CHANGELOG, version 1.0.0, GitHub release, npm publish from GitHub Actions. CHANGELOG, 1.0.0 and the
      release workflow are done; the GitHub release itself is the owner's step.
- [x] CI runs on Linux, macOS and Windows.

Added in M10
- [x] README rewritten for a non-technical reader: what reb is, one-line install, first analysis in 5 steps,
      what each report contains, safety boundaries, FAQ.
- [x] `examples/tidyhive-example-2026-10-14/`: a complete made-up run (fictional Tidyhive), with a README.
- [x] `docs/RELEASING.md`: npm account, token, the `NPM_TOKEN` GitHub secret, and each release step.
- [x] `.gitattributes` keeps LF line endings, so tests and formatting behave the same on Windows.

Notes from building it
- The end-to-end test (`tests/e2e/fullRun.test.ts`) runs the whole analysis through the CLI in-process with
  its own runs folder, so it needs no build and no internet. Setting `REB_E2E_KEEP=<folder>` keeps the
  finished run; that is how `examples/` was made. `tests/examples.test.ts` checks the example stays valid.
- Safety review result: the only network call is `src/sources/web.ts` (plain GET, no cookies, redirects not
  followed, robots.txt checked by the caller); the only program started is the person's browser for the
  dashboard; no browser automation, no telemetry. `tests/safety.test.ts` keeps it that way.
- The package test (`tests/e2e/package.test.ts`) needs `npm run build` first and is skipped without it, so CI
  now builds before testing. `CHANGELOG.md` was added to the package files.
- Lint and type check run once (on Linux); the build and tests run on all three systems.
- The release workflow refuses to publish when the release tag is not `v` + the package.json version, and
  runs every check before `npm publish --provenance`.

Follow-ups found in M10
- [x] The npm user `rifat` belongs to someone else, so the package is renamed to `@ridwanul/reb` (the owner's
      npm username), changing decision 1. Fix branch M10-fix-package-name.
- [ ] After the first release: switch the workflow to npm trusted publishing (no stored token).
- [ ] After the first release: the M4 follow-ups about `reb update` and `--command npx` above.

Files and folders
- `README.md`, `CHANGELOG.md`, `docs/USER_GUIDE.md`, `docs/RELEASING.md`, `examples/`
- `.github/workflows/release.yml`, `.github/workflows/ci.yml` (three operating systems), `.gitattributes`
- `tests/e2e/fullRun.test.ts`, `tests/e2e/package.test.ts`, `tests/safety.test.ts`, `tests/examples.test.ts`

Tests
- Full end-to-end test passes on all three operating systems.
- Packed package (`npm pack`) contains `dist/`, handbook, pipelines, templates, built dashboard, and no tests or fixtures.

How the owner checks it
1. Before publishing: `npm ci`, `npm run build`, then
   `node dist/cli.js dashboard --run examples/tidyhive-example-2026-10-14` shows the sample analysis.
2. After the first release (docs/RELEASING.md), on any computer with Node.js 22:
   `npx @ridwanul/reb --version` then `npx @ridwanul/reb doctor`
3. You should see version 1.0.0 and a checklist. Then ask your AI agent: "Analyse example.com; reports: feature"
   and confirm it starts by creating a run and a plan.

---

## v2: any business, audit-grade reports (M11 to M16)

Goal (from the owner's gap analysis, 2026-10-14): analyse any business or tool the way a business
analyst, product manager or audit firm would: features, customers, business model, market,
condition, growth, threats and risks, scope, technology, and enough product detail to rebuild it,
in official-style reports. docs/SPEC.md was rewritten as v2 first.

The owner asked for all of v2 on one branch, `new-integration`, to test together, instead of one
branch per milestone (AGENTS.md rule 1). Each milestone is its own commit on that branch. Not merged
to main yet.

### M11 Business-depth graph
- [x] SPEC v2: any business, new node and link types, the _provided_ label, new roles, reports and pipelines.
- [x] 21 node types and 23 link types (graph-format.md lists them all; a test checks it stays complete).
- [x] Typed front-matter fields per type (`src/domain/nodeFields.ts`), set with `upsert_node` `fields`
      or `reb kb add --field key=value`; `validate_graph` reports missing or invalid ones (`bad_field`).
- [x] `stale_metric`: a metric more than 18 months older than the newest evidence.
- [x] Label _provided_ (observed > provided > documented > inferred > unknown).
- [x] Roles financial_analyst, strategy_analyst, risk_analyst, with handbook prompts.

### M12 Frameworks
- [x] `get_framework` / `reb kb framework`: 21 views drawn from the graph, each citing node and E-/S- ids.
- [x] Risk score = likelihood x impact (1 to 9), rated high (6+), medium (3+), low; heat map.
- [x] Report sections can show views (`views:` in the template front matter).
- [x] Dashboard Frameworks page.

### M13 Audit-grade reports
- [x] One frame for every report: Report details with an overall confidence score, Executive summary,
      Scope and methodology, sections, Limitations and disclaimer, Sources, Open questions.
- [x] Templates: due_diligence, risk, strategy, technical, rebuild.
- [x] Word copy with title page, table of contents and page numbers; print-ready HTML copy (`--html`).
- [x] report_writer prompt and the skill description cover any business.

### M14 Rebuild-level product spec
- [x] Screen, user_role, business_rule, api_endpoint nodes; acceptance criteria on features; fields and
      states on data objects.
- [x] Rebuild report with sitemap, permission matrix, data model (with a Mermaid diagram), user stories,
      business rules and public API views.
- [x] The hands-on checklist asks for screens, roles and rules when a rebuild report is wanted.

### M15 Sources and provided documents
- [x] `handbook/references/source-playbook.md`: which public pages answer which question.
- [x] `import_inbox` takes the `provided` folder (documents, screenshots, notes) as _provided_ evidence.

### M16 Beyond SaaS and over time
- [x] Categories ecommerce, fintech, service-business, general-business: pipelines and sample data.
- [x] v2 tasks in every pipeline, kept only for the reports that need them (v1 plans unchanged);
      fintech always checks regulation and risks.
- [x] Focus questions about risk, regulation, money, growth, leaders, strategy, rebuild and geography
      go to the matching role.
- [x] `compare_runs` / `reb compare`: same product over time, or two competitors; writes
      `reports/compare-<other>.md`.
- [x] End-to-end test `tests/e2e/v2Run.test.ts` and sample run `examples/ledgerly-example-2026-10-14`.

### Capture (owner request, 2026-10-15)
- [x] `reb capture [url]`: after a yes and the person's own login, opens the product's safe links in a
      visible browser, screenshots each screen, adds screen nodes with navigation and observed evidence,
      and writes a sitemap with suggested nodes per screen (decision 23).
- [x] Tests: link rules, a fake-browser workflow test, and a real headless browser against a local
      product that proves no sign-out, delete, form submit or API request is made.

### Deep feature extraction (owner request, 2026-10-22)
Goal: from a capture, reb works out every feature the way an analyst does after using the product
(what data it stores, how the data is reused, the logic behind each feature) and writes a functional
and non-functional requirements report a development team can build from.
- [x] Capture reads more of each screen: field kinds, required marks and drop-down choices; values of
      kind columns (Status, Stage, Type, Role); the main menu; tabs; charts; list controls (search,
      filter, sort, pagination, bulk select, saved views); notices (limits, plan locks). People's names
      in choices and other columns are left out; nothing typed into a field is read.
- [x] Feature model (`domain/productModel.ts`): modules, entities with attributes, types, required
      fields, states and relations, operations per entity, features of 13 kinds (records, pipelines,
      dashboards, automation, messaging, team, billing, integrations, custom fields ...), each with its
      likely logic, data reuse, acceptance criteria and questions to check by hand; business rules,
      roles and non-functional requirements.
- [x] `analyse_capture` / `reb analyse [session]` (also run by `reb capture`): writes
      `notes/feature-model-<session>.md` and inferred nodes with evidence linking the screenshots;
      never changes nodes the analyst already has.
- [x] New node type `requirement` (functional or non_functional, statement, category, priority) and
      link `specifies`; feature fields `logic`, `data_use`, `priority`.
- [x] Framework views `feature_logic`, `requirements` (FR-001 ...) and `nfr` (NFR-001 ...), and the
      new report type `requirements` (functional and non-functional requirements specification).
- [x] Pipeline task `feature-model` for the rebuild and requirements reports.
- [x] Tests: the model on a made-up CRM, the workflow, the CLI, and the real browser reading field
      kinds, choices and status values.

Follow-ups found in deep feature extraction
- [ ] The model reads labels and layout only; the agent still has to look at each screenshot to catch
      what labels miss (charts' meaning, board views, empty states). A vision step could help.
- [ ] Entity names come from addresses and headings; products with opaque addresses (ids only) give
      weaker entity names. Merging or renaming entities by hand needs a `reb kb rename` command.
- [ ] Non-functional targets (2 s lists, 99.9% uptime) are suggested starting points, not measured.

### UX and visual design for a pixel-level rebuild (owner request, 2026-10-24)
Goal: the rebuild and requirements reports describe how the product looks and feels, not only what
it does, so a team can build a look-alike clone (decision 24).
- [x] SPEC 2.3 and 15: reb may measure the visual design (layout, sizes, colours, fonts, spacing,
      corner radius, shadows, components and their visible states); it still never copies code,
      logos, icons, illustrations or content.
- [x] Node types `design_token` (category, value, usage) and `ux_pattern` (kind, anatomy, variants,
      states, behaviour), link `appears_on`; screen fields `layout`, `regions`, `components`,
      `states`, `viewport`.
- [x] Capture measures each screen's computed styles, regions and components (passive, no clicks)
      and covers email addresses and phone numbers in the screenshots.
- [x] `analyse_capture` turns the measurements into observed design tokens and UX patterns.
- [x] Framework views `design_system` and `ux_spec`; new sections in the rebuild and requirements
      reports.
- [x] Tests: the design model, the views, the real browser measuring a styled page and masking emails.

Follow-ups found in the UX layer
- [ ] Hover, focus, pressed states, open menus and dialogs need interaction, which capture never
      does; today the person adds screenshots of them by hand.
- [ ] Only one window width (1440 px) is measured; a second, narrow capture would give breakpoints.
- [ ] Icons are counted and sized, never copied; a clone picks its own icon set.

Follow-ups found in v2
- [ ] A content-quality reviewer role: the audit counts nodes but does not judge how good they are.
- [ ] Jobs-to-be-done view, and charts (risk heat map, metrics over time) in the Word and HTML copies.
- [ ] Numbered headings in the Word copy.
- [ ] Reading text out of provided PDFs and spreadsheets (today reb records the file and its caption only).
- [ ] Release v2 as 2.0.0 after the owner has tested the branch (the report layout changed, so it is a
      MAJOR version under the CHANGELOG rules).

How the owner checks it
1. `git fetch && git checkout new-integration`, then `npm ci`, `npm run build`.
2. `npm test`: every test passes (one more is skipped only when the build is missing).
3. `node dist/cli.js dashboard --run examples/ledgerly-example-2026-10-14`: open the Frameworks and
   Reports tabs; you should see a SWOT, a risk register and the due diligence report.
4. Open `examples/ledgerly-example-2026-10-14/reports/due_diligence.html` in a browser and print it
   to PDF.
5. Ask your agent: "Analyse example.com as general-business; reports: due_diligence, risk" and check
   the plan has condition, risks and findings tasks.

---

## Decisions on spec questions and gaps

The owner approved these on 2026-10-13: item 1 as chosen by the owner, all others as recommended.
They are binding for the milestones they name unless the owner changes them.

1. **npm package name (affects M1, M4, M10).** SPEC 13 allows a scoped name if "reb" is taken.
   *Decided:* the package is `@rifat/reb`; the command name stays `reb`. Install is `npx @rifat/reb setup`.
   Publishing needs an npm account or organisation called `rifat` (to check before M10).
   *Changed in M10:* the npm user `rifat` is someone else's, so the package is `@ridwanul/reb` (the owner's npm
   username). Install is `npx @ridwanul/reb setup`. Earlier mentions of `@rifat/reb` in this file are history.

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
    *Changed by the owner in M7:* the bridge is built now, limited to REA's passive tools
    (`inspect_web_network_capture`, `inspect_web_page`, `analyze_web_bundle`) used by the tech_observer when REA is
    installed; results are stored as evidence with `record_rea_result`. REA tools that drive a browser are never used.

15. **"plan tier" in the brief (M2).** Unclear whether it is reb's plan or the product's pricing plan.
    *Decided:* it is the product's pricing plan the analyst has access to (for example "Free trial"); features above it
    can only be documented or inferred, never observed.

16. **What `make_test_dataset` produces (M7).** Not described. *Decided:* small, obviously fake data files (names like
    "Test User 01", example.com emails) for the human to enter by hand; never real personal data.

17. **Audit needs report sections before reports exist (M6 vs M9).** SPEC 11 puts section needs in the report templates,
    but the auditor comes first. *Decided:* keep section needs as data files in `reports/specs/` in M6; M9 templates read them.
    *Changed in M9:* the needs moved into the templates' front matter as SPEC 11 says, and `reports/specs/` was removed.

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

23. **Automatic screenshots of the product (v2).** The owner asked for a browser that browses the
    product and takes screenshots after the person logs in, which SPEC 2.3 forbade. *Decided by the
    owner on 2026-10-15 ("Auto-browse"):* allow it as an opt-in exception, `reb capture`, with these
    limits: a yes in a terminal first; a visible browser with a fresh profile; the person logs in;
    reb only opens same-site links (no query strings, record ids collapsed to one screen, 1.5 s
    apart, 25 screens and 3 links deep by default); never sign-out, delete, pay, export, confirm or
    similar links, private APIs, files or other sites; never clicks, types, submits or downloads;
    dialogs dismissed; the login is forgotten when the window closes. Emails and long numbers are
    masked in the saved labels. `playwright-core` moves to the runtime dependencies for this and is
    loaded only when capture runs. `tests/safety.test.ts` checks the browser file never clicks or types.

24. **Visual design for a clone (v2).** SPEC 2.3 said rebuild knowledge "never copies code, assets
    or content", which read as "no design". The owner wants a pixel-level clone. *Decided by the
    owner on 2026-10-24 ("Pixel-level clone"):* reb measures the look (layout, sizes, colours, fonts,
    spacing, corner radius, shadows, components and their visible states) from computed styles and
    screenshots; it still never copies code, logos, icons, illustrations or content. Capture also
    covers email addresses and phone numbers in screenshots.
