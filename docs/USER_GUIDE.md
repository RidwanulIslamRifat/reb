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
| Get a PDF                           | `Render the risk report as HTML` (then print it to PDF)       |
| Analyse a business, not a product   | `Analyse shop.example as ecommerce; reports: due_diligence`   |
| Use documents the business gave you | `Import the provided documents`                               |
| See a SWOT or risk register         | `Show the SWOT` or `Show the risk register`                   |
| Compare with last time or a rival   | `Compare this run with acme-com-2026-01-10`                   |
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

### Let reb take the screenshots (`reb capture`)

If you have an account, reb can take the screenshots for you:

1. In a terminal: `npx @ridwanul/reb capture https://app.example.com/login` (the address of the
   login page; leave it out to use the brief's address).
2. Read what it will do and type `y`.
3. A browser window opens. Log in yourself, go to the product's main screen, then press Enter in the
   terminal.
4. reb opens the product's own links one at a time and saves a screenshot of each screen. It never
   clicks, types, submits forms, downloads, or opens sign-out, delete, pay, upgrade or export links.
   The window closes when it is done, and the login is forgotten.
5. reb then works out the feature model by itself: every module and feature, the data each one
   stores (entities, fields and their types, states such as deal stages, links between records),
   how that data is reused elsewhere, the likely logic behind each feature, rules, roles and
   non-functional needs. Read it in `notes/feature-model-session-NN.md`. Everything in it is marked
   as an educated guess until you confirm it.
6. Ask your agent to "check the feature model against the screenshots", and work through the
   "Check by using it" boxes for each feature in the product yourself.
7. Get the build-ready report: `npx @ridwanul/reb report requirements --docx` (functional and
   non-functional requirements, numbered, with acceptance criteria, data model and feature logic).

To redo the analysis without opening a browser again: `npx @ridwanul/reb analyse` (add
`--dry-run` to only see the counts).

Options: `--pages 40` (more screens, at most 100), `--depth 2` (fewer clicks away from the start),
`--delay 3000` (wait longer between screens). reb uses Google Chrome or Microsoft Edge; set
`REB_BROWSER` to another Chromium-based browser's path if you have neither.

When a rebuild report is asked for, the checklist also asks you to visit each screen, note the roles
and permissions you can see, and write down limits and error messages, so the rebuild spec is based
on what you saw.

## Documents from the business

If the business handed you documents (a pitch deck, an annual report, a price list, a spreadsheet),
save them in the run's `evidence/inbox/provided/` folder (`.pdf`, `.docx`, `.xlsx`, `.csv`,
`.pptx`, also screenshots and notes) and ask the agent to import them. reb labels them _provided_:
stronger than public statements, but the reports say they were not checked against public sources.

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
| `reb kb framework risk_register`        | Show a framework from the map (swot, pestle, five_forces, ...).          |
| `reb evidence import provided`          | Import documents the business handed over.                               |
| `reb report feature --docx`             | Write the feature report, plus a Word copy.                              |
| `reb report risk --html`                | Write the risk report, plus a web page you can print to PDF.             |
| `reb compare <other-run>`               | Compare two analyses (same product over time, or two competitors).       |
| `reb capture <login-page>`              | After your yes and your own login, screenshot the product's screens.     |
| `reb analyse [session]`                 | Work out features, data model, logic and requirements from a capture.    |
| `reb dashboard`                         | Open the dashboard in your browser (Ctrl+C in the terminal stops it).    |
| `reb log tail`                          | Show the latest activity.                                                |

Every command has its own help, for example `reb plan --help`.

Categories: `b2b-saas`, `developer-tool`, `marketplace`, `consumer-app`, `ai-tool`, `ecommerce`,
`fintech`, `service-business`, `general-business`.
Reports: `business`, `feature`, `market`, `build`, `due_diligence`, `risk`, `strategy`,
`technical`, `rebuild`, `requirements`.

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
evidence/inbox/provided   documents the business handed over
notes/                    the agent's drafts
reports/                  the finished reports (.md, and .docx or .html when asked; compare-*.md)
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
