# reb

**Evidence-backed analysis of any business or product, done with your AI agent.**

reb helps your agent look at a company the way a business analyst, product manager or audit firm
would: its features, customers, business model, market, condition, growth, risks, technology, and
enough product detail to rebuild it.

You tell your AI agent "Analyse example.com; reports: business, risk". reb gives the agent a plan to
follow, a place to write down every finding together with where it came from, a map of how the
product fits together, and a checker that keeps asking "what is still missing?". At the end you get
reports in which every sentence points to its evidence.

reb is free and open source (MIT license). Everything stays on your own computer.

## Contents

- [What reb is](#what-reb-is)
- [Install (one line)](#install-one-line)
- [Your first analysis in 5 steps](#your-first-analysis-in-5-steps)
- [What each report contains](#what-each-report-contains)
- [Safety boundaries](#safety-boundaries)
- [FAQ](#faq)
- [More help](#more-help)

## What reb is

reb is a helper for AI agents such as **Claude Code, Cursor, Codex and Gemini CLI**. It does not
think on its own; your agent does the reading and writing. reb makes sure that work is careful and
checkable:

- **A plan.** reb picks a plan that fits the kind of business (software, e-commerce, fintech,
  services or any other business) and the reports you asked for, then hands the agent one task at a
  time.
- **Evidence.** Every finding is written down with its source and a label that says how sure it is:
  _observed_ (you saw it yourself), _provided_ (from a document the business gave you), _documented_
  (the company says so publicly), _inferred_ (a reasoned guess) or _unknown_.
- **A knowledge map.** Companies, products, features, prices, customers, competitors, revenue
  streams, metrics, funding, leaders, laws, risks, trends, technologies, screens and rules are
  linked together, one fact in one place.
- **Standard frameworks.** SWOT, PESTLE, Porter's five forces, business model canvas, risk register
  with a heat map, market size, user stories, data model and more, drawn from the map.
- **An auditor.** After the research, reb checks what the reports still need, adds tasks for the
  gaps and writes down why. It stops when nothing important is missing, or after 3 rounds.
- **Reports.** Nine reports, from a feature report to due diligence, risk, strategy and a product
  rebuild spec, in Markdown, Word and a print-ready web page, with every claim cited and an overall
  confidence rating.
- **Comparisons.** Compare two analyses: what changed since last time, or what a competitor has that
  this product lacks.
- **A dashboard.** A page in your browser that shows the plan, the map, the evidence, the frameworks
  and the reports.

Everything is plain files in a folder per product, so you can open, read and keep all of it.

## Install (one line)

You need [Node.js](https://nodejs.org/) version 22.12 or newer (choose the "LTS" download). Then
open a terminal and run:

```sh
npx @ridwanul/reb setup
```

reb looks for the AI agents on your computer, shows exactly what it would change, and asks
**"Apply these changes? [y/N]"**. Type `y` and press Enter. It backs up every file before changing
it, and running it again is safe. Restart your AI agent afterwards.

To check that all is well at any time: `npx @ridwanul/reb doctor` (every line should have a tick).

## Your first analysis in 5 steps

1. **Install** reb with the line above and restart your AI agent.
2. **Ask your agent**, in plain language:
   `Analyse example.com; reports: business, feature`
   You can add what you most want to know, for example
   `focus: Who is the main buyer? Which plan do teams pick?`
3. **Let it work.** The agent creates a folder for the product, makes a plan and works through it:
   reading the product's public pages, writing down evidence and building the map. It tells you
   what it is doing as it goes.
4. **Do your own hands-on session when asked.** reb never uses the product for you. When a task
   needs someone to use the product, the agent gives you a short checklist (and fake sample data to
   type in). Use the product normally, save screenshots or notes in the folder it names, and tell
   the agent you are done. It turns them into _observed_ evidence.
5. **Read the reports.** When the plan is finished, the agent tells you where the reports are. To
   look at everything in your browser, ask the agent to "open the dashboard", or run
   `npx @ridwanul/reb dashboard`.

Want to see a finished analysis first? The [examples/](examples/) folder has two complete, made-up
ones, with their reports.

**Have documents from the business?** If the business gave you a pitch deck, annual report or
spreadsheet, save it in the run's `evidence/inbox/provided/` folder and ask the agent to import it.
reb labels it _provided_ and says in the reports that it was not checked against public sources.

## What each report contains

Every report has the same frame, like a professional analysis: **Report details** (with an overall
confidence rating out of 100), an **Executive summary**, **Scope and methodology**, the report's own
sections, **Limitations and disclaimer**, **Sources** (every page and document used, with dates) and
**Open questions** (what could not be confirmed). Every claim cites its evidence, for example
`[E-012]`.

| Report                            | Ask for         | What it covers                                                                                                  |
| --------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| Business analysis                 | `business`      | Company and product; customers and segments; pricing and packaging; competition; risks and assumptions.         |
| Feature report                    | `feature`       | Product and modules; features and how sure we are of each; key journeys; what each plan includes; integrations. |
| Market analysis                   | `market`        | Market segments; competitors; feature comparison; pricing comparison.                                           |
| Build-it assessment               | `build`         | Modules and features a copy would need; data model; integrations; how it is likely built.                       |
| Business condition, due diligence | `due_diligence` | Rated findings and recommendations; leadership; business model canvas; traction, funding; market; risks; tech.  |
| Risk assessment                   | `risk`          | Risk register with likelihood, impact and mitigation, and a heat map; compliance; PESTLE and five forces.       |
| Strategy and growth outlook       | `strategy`      | SWOT; PESTLE; five forces; market size and position; growth signals; strategic recommendations.                 |
| Technical capability assessment   | `technical`     | Technology stack; architecture and data; integrations and public API; security and compliance.                  |
| Product rebuild specification     | `rebuild`       | Features with acceptance criteria; user stories; screens and navigation; roles; data model; business rules.     |

Reports are saved as `reports/<type>.md` in the product's folder, and, when you ask, as a Word file
(with a title page and contents) and a web page you can print to PDF.

## Safety boundaries

reb only ever does what a normal visitor does. It **never**:

- logs in to a product, or uses your account or cookies;
- calls a product's private, behind-the-scenes interfaces (APIs);
- replays, changes or fakes network requests;
- scrapes, crawls or bulk-downloads a site;
- clicks or types in a product for you (you do all hands-on use yourself).

It reads public pages **one at a time**, obeys each site's robots.txt, and says who it is. When you
give it a recording of your own browser session (a HAR file), it removes passwords, cookies, tokens
and keys before anything is saved.

**Privacy:** reb has no telemetry. It sends nothing about you or your analyses anywhere. Your
analyses are stored only on your computer, in `~/reb/runs/` (you can change this place with the
`REB_HOME` setting). The dashboard runs on your computer only and cannot be reached from other
machines.

## FAQ

**Do I need to know how to code?**
No. You talk to your AI agent in plain language. The terminal is needed only for the one-line
install, and optionally to open the dashboard.

**Which AI agents work with reb?**
Claude Code, Cursor, Codex and Gemini CLI. `reb setup` finds the ones you have.

**Does reb cost anything?**
reb is free. Your AI agent may have its own subscription or usage costs.

**Where are my analyses?**
In `~/reb/runs/`, one folder per product, named like `example-com-2026-10-13`. `~` means your home
folder (for example `C:\Users\you` on Windows or `/Users/you` on a Mac).

**Can reb analyse a business that is not software?**
Yes. Choose the category that fits (`ecommerce`, `fintech`, `service-business` or
`general-business`) and ask for the reports you need, for example `due_diligence` or `risk`. Parts
that only apply to software, such as screens, are left out when nobody asks for them.

**Is a due diligence or risk report an audit?**
No. It is a structured, sourced analysis of public information and what you provide, and each report
says so in its disclaimer. It is a good starting point for an analyst, investor or auditor, not a
replacement for their opinion.

**Can I analyse a product I have no account for?**
Yes. reb works from public pages. Anything only visible inside the product is marked _documented_ or
_inferred_ instead of _observed_, or listed as an open question.

**Why did the agent stop and ask me to do something?**
Because a step needs someone to use the product, and reb never does that for you (see
[Safety boundaries](#safety-boundaries)). Follow the checklist, then tell the agent you are done.

**Can I trust the reports?**
Every claim points to its evidence and says how sure it is, so you can check any sentence yourself.
Treat _inferred_ claims as educated guesses.

**How do I update reb?**
Run `npx @ridwanul/reb update`. Your agents are set up to use the newest version automatically.

**How do I remove reb?**
Every file setup changed has a backup next to it, named `*.reb-backup-<date>`. Restore those, or
delete the `reb` entry from your agent's MCP settings. Your analyses in `~/reb/runs/` are yours to
keep or delete.

**Something does not work. What now?**
Run `npx @ridwanul/reb doctor`. Every cross comes with a "Fix:" line telling you what to do. If that
does not help, open an issue on [GitHub](https://github.com/RidwanulIslamRifat/reb/issues).

## More help

- [User guide](docs/USER_GUIDE.md): daily use, every terminal command, where files live.
- [Example analysis](examples/): a complete made-up run to look through.
- [Changelog](CHANGELOG.md): what changed in each version.
- For contributors: [specification](docs/SPEC.md), [roadmap](docs/ROADMAP.md),
  [releasing](docs/RELEASING.md).
