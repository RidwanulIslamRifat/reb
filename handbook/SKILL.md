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
- Read only public pages, one page at a time, with your own web tools. Respect robots.txt.
- Never store secrets: no passwords, tokens, cookies or API keys in evidence, nodes or notes.

If a step would need any of this, stop and give the human a checklist to do it themselves
(the walkthrough_coach role does this).

## Start: "Analyse <domain>; reports: <list>"

1. Read the request: the domain, the reports (business, feature, market, build), and if given the
   category, focus questions, the pricing plan the user has (`plan_tier`) and a deadline.
   If the domain is missing, ask for it. Do not ask about anything else you can fill in later.
2. Call `list_runs`. If a run for this product exists and the user wants to continue, use it.
   Otherwise call `create_run` with the domain and what you know. Remember the returned `run` and
   pass it to every later tool call.
3. Run the planner role (see "Doing a task") to write the first plan with `save_plan`.
4. Work the plan (next section) until no task can start.
5. Run the auditor role. If it finds blocking gaps, the planner adds tasks with `save_plan`
   (the reason cites the audit item) and you continue. Stop after 3 audit rounds; remaining gaps
   become `question` nodes.
6. Run the report_writer role for each requested report, then tell the user where the reports are
   and the most important open questions.

## Working the plan

Repeat:

1. `next_task` returns the next runnable task with its role, inputs, outputs, `done_when` and
   `role_prompt` (the role's instructions). If it returns no task, go to step 5 above.
2. `update_task_status` to `running`.
3. Do the task (below).
4. Check every `done_when` item yourself. Then `update_task_status` to `done`, or to
   `needs_human` (waiting for the user's hands-on session), or `blocked` with a reason.

When a task is `needs_human`, give the user the checklist from the walkthrough_coach, then carry on
with other tasks. When the user says they are done, import what they saw as evidence and mark the
task `done`.

## Doing a task

If your host supports sub-agents (for example Claude Code's Task tool), delegate each task to a
sub-agent. Give it:

- the `role_prompt` from `next_task` as its instructions,
- the run name, the task (id, title, inputs, outputs, done_when),
- the rule that it may only use the reb tools listed in the role's `tools`, plus your web search
  and page reading tools for public pages.

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
