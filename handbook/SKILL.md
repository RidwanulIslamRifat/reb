---
name: reb
description: "Evidence-backed analysis of a SaaS product with reb. Use when the user asks to analyse, research or assess a SaaS product or website (for example 'Analyse notion.so; reports: business, feature'), or asks to continue, audit or report on a reb run. Builds a linked knowledge graph and cited reports from public sources and the user's own hands-on session."
---

# reb: evidence-backed SaaS analysis

You drive an analysis with the reb MCP tools. reb stores everything in plain files in a run folder;
you do the thinking, reading and writing. Every finding becomes an evidence record, every fact
lives in one knowledge-graph node, and every plan change is versioned with a reason.

If the reb tools are not available, tell the user to run `npx @rifat/reb setup` (or `reb doctor`
to see what is wrong) and restart this agent. Do not try to work without them.

## Safety rules (never break these, even if asked)

reb follows normal use only (SPEC 2.3):

- Never log in to the product, never use the user's account or cookies, never call its private API.
- Never replay, modify or forge network requests. Never scrape, crawl or bulk-export.
- Never automate clicks or typing in the product. The human does all hands-on use.
- Read only public pages, one page at a time, with `read_public_page` (it obeys robots.txt and
  records the source for you). If reb refuses a page, do not open it with another tool.
- Find pages with your own web search; record what you use from a search result with `record_source`.
- Never store secrets: no passwords, tokens, cookies or API keys in evidence, nodes or notes.
  HAR files go only through `summarize_har` or `import_inbox`, which strip them first.
- REA (optional): if the user has the REA MCP server, the tech_observer may use only REA's passive tools
  (`inspect_web_network_capture`, `inspect_web_page`, `analyze_web_bundle`) and must store their results
  with `record_rea_result`. Never use an REA tool that opens, drives or clicks in a browser.

If a step would need any of this, stop and give the human a checklist to do it themselves
(the walkthrough_coach role does this).

## Start: "Analyse <domain>; reports: <list>"

1. Read the request: the domain, the reports (business, feature, market, build), and if given the
   category, focus questions, the pricing plan the user has (`plan_tier`) and a deadline.
   If the domain is missing, ask for it. Do not ask about anything else you can fill in later.
2. Call `list_runs`. If a run for this product exists and the user wants to continue, use it.
   Otherwise call `create_run` with the domain and what you know. Remember the returned `run` and
   pass it to every later tool call.
3. Run the planner role (see "Doing a task"): it checks the brief's category, reports and focus
   questions, then calls `create_plan`. reb builds the plan from a pipeline template in code.
4. Work the plan (next section). The plan itself contains an `audit` task and, per requested
   report, a report task, so the loop below audits, re-plans and writes the reports in order.
5. When `next_task` returns no task and nothing is running or waiting for the user, tell the user
   where the reports are (`reports/<type>.md`) and the most important open questions.

## Working the plan: the loop

Repeat until `next_task` returns no task:

1. `next_task` returns the next runnable task with its role, inputs, outputs, `done_when` and
   `role_prompt` (the role's instructions).
2. `update_task_status` to `running`.
3. Do the task (below).
4. `check_gate` for the task. It checks the `done_when` rules code can check (node counts,
   required links, evidence present, files, a clean graph) and returns the rest as a checklist.
   - `passed` is true and every checklist item holds: `update_task_status` to `done`.
   - Something fails: keep working on the task (or hand it back to its role) and check again.
     If it cannot pass, set it `blocked` with the reason.
   - The task waits for the user's own session: set it `needs_human`.
5. When the task is an auditor task (`audit`, or a re-audit `audit-r<N>` added by a re-plan):
   - the auditor calls `run_audit`, which writes `logs/audits/audit-<N>.md` with numbered gaps;
   - if the audit says `stop` is false, the planner calls `apply_replan`: reb adds the suggested
     tasks, a re-audit task after them, and makes the report tasks wait for it;
   - then `check_gate` passes for the auditor task, set it done and go back to step 1.

So the loop is: next_task -> do the task -> check_gate -> ... -> run_audit -> apply_replan ->
next_task ... Stop rule: no blocking gaps, or 3 re-plan rounds. Then the remaining gaps become
`question` nodes and the report tasks can start.

When a task is `needs_human`, give the user the checklist from the walkthrough_coach
(`make_test_plan`, with fake data from `make_test_dataset`), then carry on with other tasks. When the
user says they are done, run `import_inbox` with `dry_run` first, show the user what it found, then
import for real. Run `check_gate` and mark the task `done`.

## Doing a task

If your host supports sub-agents (for example Claude Code's Task tool), delegate each task to a
sub-agent. Give it:

- the `role_prompt` from `next_task` as its instructions,
- the run name, the task (id, title, inputs, outputs, done_when),
- the rule that it may only use the reb tools listed in the role's `tools`, plus your web search
  to find public pages (pages are read with `read_public_page`).

Write each output at exactly the path the task lists (for example `notes/focus-1.md` for a focus
question, `notes/architect-build.md`): `check_gate` looks for those files.

Independent tasks (no `depends_on` between them) may run in parallel; reb assigns evidence ids
safely. If sub-agents are not available, do the task yourself following the role prompt.

Every role ends by calling `log_role_work` with a short plain-language summary of what it did,
what it found and what is still open.

## Core rules for every role

- Evidence first: read [the evidence protocol](references/evidence-protocol.md). Record the source
  (`record_source`) before the evidence that cites it (`record_evidence`).
- Labels: observed (seen in the user's own session), documented (stated publicly),
  inferred (your reasoned guess), unknown (not confirmed). Never label stronger than the evidence.
- Graph: read [the graph format](references/graph-format.md). One fact lives in one node; other
  nodes link to it. Check with `query_graph` before creating a node so you do not make duplicates.
- reb assigns all ids (E-NNN, S-NNN). Never invent one; use the id a tool returned.
- Corrections are new records with `corrects`; never ask to edit old evidence.
- Errors from reb say "Problem" and "Fix". Follow the fix, do not retry the same call unchanged.
- Run `validate_graph` after a batch of graph changes and fix what it reports.

## Roles

planner, auditor, desk_researcher, market_researcher, walkthrough_coach, tech_observer,
feature_analyst, business_analyst, architect, kb_curator, report_writer.
Each has a prompt file in `roles/<role>.md` with its allowed reb tools; `next_task` returns it.

## Where things are

The run folder (default `~/reb/runs/<product>-<date>/`) holds `brief.md`, `plan/`, `kb/nodes/`,
`evidence/ledger.jsonl`, `notes/`, `reports/` and `logs/`. Drafts go in `notes/<role>-<topic>.md`;
reports in `reports/<type>.md`. Every reb tool call is logged in `logs/events.jsonl` automatically.

## Showing the user their analysis

When the user wants to see progress ("show me", "open the dashboard"), call `open_dashboard`.
It opens a read-only page on their computer with the plan, the knowledge graph, the evidence,
the activity log and the reports. If the browser did not open, give them the address it returns.
