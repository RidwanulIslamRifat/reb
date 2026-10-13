# reb user guide

This guide is for people who use reb. The [README](../README.md) has the short version: what reb
is, how to install it and your first analysis. This page adds daily use, the terminal commands and
where everything is stored.

## Daily use

Most of the time you only talk to your AI agent. Useful things to say:

| You want to                         | Say to your agent                                             |
| ----------------------------------- | ------------------------------------------------------------- |
| Start an analysis                   | `Analyse acme.com; reports: business, feature, market, build` |
| Say what matters most               | `... focus: Who is the main buyer? How is it priced?`         |
| Tell it which plan you can use      | `... I have the Free trial`                                   |
| Pick up where you left off          | `Continue the acme.com analysis`                              |
| See how far it is                   | `Show me the plan` or `Open the dashboard`                    |
| Hand back after your own session    | `I finished the session; the files are in session-01`         |
| Get a Word copy of a report         | `Render the feature report as Word too`                       |
| Check for gaps before the reports   | `Audit the analysis`                                          |

The agent follows reb's handbook, which tells it the order of work and the safety rules.

## Your own hands-on session

reb never uses the product for you. When the plan needs someone to use it:

1. The agent gives you a test plan: what to do and what to capture.
2. It can also make clearly fake sample data for you to type or upload.
3. You use the product normally, then put what you captured in the folder it names, for example
   `~/reb/runs/acme-com-2026-10-13/evidence/inbox/session-01/`:
   - screenshots (`.png`, `.jpg`),
   - notes (`.md` or `.txt`),
   - optional: a HAR file, a recording of the pages your browser loaded (in Chrome: Developer tools,
     Network tab, right-click, "Save all as HAR"). reb removes passwords, cookies, tokens and keys
     before anything is stored.
4. Tell the agent you are done. It imports the files as _observed_ evidence.

## Terminal commands (optional)

You never have to use these; your agent calls the same functions for you. They are handy for
checking things yourself. If reb is installed through npx, put `npx @ridwanul/reb` in front instead of
`reb`, for example `npx @ridwanul/reb list`.

Commands that work on one analysis use the most recently changed one, or the one you name with
`--run <name>`.

| Command                                 | What it does                                                             |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `reb setup`                             | Connect reb to your AI agents (shows a preview and asks first).          |
| `reb doctor`                            | Check the install; every problem comes with a fix.                       |
| `reb update`                            | Refresh reb's connection and handbook in your agents.                    |
| `reb list`                              | List your analyses, newest first.                                        |
| `reb new acme.com --category b2b-saas --reports feature` | Start an analysis by hand.                              |
| `reb plan show`                         | Show the plan and each task's status.                                    |
| `reb plan next`                         | Show the next task that can start.                                       |
| `reb evidence list`                     | List the evidence found so far.                                          |
| `reb kb query --type feature`           | List the features in the knowledge map.                                  |
| `reb kb validate`                       | Check the knowledge map for problems.                                    |
| `reb audit`                             | Check what the reports still need.                                       |
| `reb report feature --docx`             | Write the feature report, plus a Word copy.                              |
| `reb dashboard`                         | Open the dashboard in your browser (Ctrl+C in the terminal stops it).    |
| `reb log tail`                          | Show the latest activity.                                                |

Every command has its own help, for example `reb plan --help`.

Categories: `b2b-saas`, `developer-tool`, `marketplace`, `consumer-app`, `ai-tool`.
Reports: `business`, `feature`, `market`, `build`.

## Where files live

Each analysis is one folder in `~/reb/runs/` (change the place with the `REB_HOME` setting). For
example `~/reb/runs/acme-com-2026-10-13/`:

```text
brief.md                  what you asked for: product, reports, focus questions, your plan, deadline
plan/plan.json            the current plan
plan/history/             every earlier version of the plan
kb/nodes/                 the knowledge map, one small file per thing (feature, price, competitor...)
evidence/ledger.jsonl     every finding and source, one per line, never edited afterwards
evidence/inbox/session-01 your screenshots, notes and HAR files from a hands-on session
notes/                    the agent's drafts
reports/                  the finished reports (.md, and .docx when asked)
logs/events.jsonl         every step reb took, automatically
logs/decisions.md         every plan change and why
logs/roles/               what each role did, in plain words
logs/audits/              each audit: the gaps found and what was done about them
```

`brief.md` is the one file meant for you to edit. Everything else is written by reb; you can read
all of it with any text editor.

Other places reb touches, only during `setup` and `update`:

- your agents' settings files, to register reb (each one backed up first as `*.reb-backup-<date>`);
- the handbook skill: `~/.claude/skills/reb` for Claude Code, `~/.agents/skills/reb` for the others.

## Privacy

reb has no telemetry and no account. It only connects to the internet to read the public pages your
agent asks for, one at a time. Your analyses never leave your computer unless you share them.

## Running reb from the source code

Only needed if you want to try a version that is not on npm yet:

```sh
git clone https://github.com/RidwanulIslamRifat/reb.git
cd reb
npm ci                     # install (once, about a minute)
npm run build              # build
node dist/cli.js setup     # connect this copy to your agents
```

Then use `node dist/cli.js` wherever this guide says `reb`.
