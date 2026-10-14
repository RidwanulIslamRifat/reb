# Changelog

All notable changes to reb are listed here, newest first.

reb uses [semantic versioning](https://semver.org/): a version is `MAJOR.MINOR.PATCH`.

- **PATCH** (1.0.0 → 1.0.1): bug fixes only. Nothing you do changes.
- **MINOR** (1.0.0 → 1.1.0): new features. Existing runs, commands and reports keep working.
- **MAJOR** (1.0.0 → 2.0.0): something you rely on changes (a command, a file format, a report layout).
  The entry says what to do.

How a new version is released is described in [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

reb v2 (branch `new-integration`): from SaaS feature analysis to analysing any business the way a
business analyst, product manager or audit firm would. Existing runs, commands and the four v1
reports keep working; the v1 reports gain the new report frame (see Changed).

### Added

- **Business-depth knowledge map**: 21 new node types (value propositions, revenue streams, cost
  drivers, channels, partners, customers, metrics, funding rounds, leaders, growth signals,
  geographies, compliance, findings, risks, trends, five forces, technologies, screens, user roles,
  business rules, API endpoints) and 23 new link types. Some types carry typed fields (for example
  a risk's likelihood, impact and mitigation), checked by `validate_graph`, which also flags
  metrics older than 18 months.
- **Provided evidence**: documents the business hands over go in `evidence/inbox/provided/` and are
  imported with the new label _provided_.
- **Frameworks** (`get_framework`, `reb kb framework`, and a Frameworks page in the dashboard): SWOT,
  PESTLE, five forces, business model canvas, risk register with heat map, findings,
  recommendations, metrics, market size, funding, growth signals, leadership, compliance, tech
  stack, competitor matrix, sitemap, permission matrix, data model, user stories, business rules,
  public API.
- **Five new reports**: `due_diligence`, `risk`, `strategy`, `technical`, `rebuild`.
- **Print-ready HTML copy** of any report (`--html`), and a Word copy with a title page, table of
  contents and page numbers.
- **Four new categories** with their own plans and sample data: `ecommerce`, `fintech`,
  `service-business`, `general-business`. Every plan gains business-model, company-condition,
  compliance, technology, product-spec, environment, risk and findings tasks, kept only for the
  reports that need them.
- **Three new roles**: financial_analyst, strategy_analyst, risk_analyst; and a source playbook
  in the handbook (which public pages answer which question).
- **Comparisons** (`compare_runs`, `reb compare`): what changed between two runs of the same
  product, or what one competitor has that another lacks.
- The hands-on checklist asks for screens, roles and rules when a rebuild report is wanted.
- A second sample analysis, `examples/ledgerly-example-2026-10-14`.

### Changed

- Every report now opens with Report details (with an overall confidence rating) and Scope and
  methodology, has an Executive summary, and closes with Limitations and disclaimer before Sources
  and Open questions. A report_writer draft may use `## Executive summary` or plain text at the top.
- Focus questions about risk, regulation, money, growth, leaders, strategy, rebuilding and
  geography are routed to the matching role.

## [1.0.0] - 2026-10-13

The first public release. Install with `npx @ridwanul/reb setup`.

### Added

- **Runs, plans and logs**: one folder per analysed product with a brief, a versioned plan, an
  append-only activity log, a decisions log and a work log per role.
- **Evidence and knowledge graph**: evidence records (E-) and sources (S-) with labels observed,
  documented, inferred or unknown; a linked graph of the product and business, one file per node,
  with validation.
- **MCP server, handbook and setup**: `reb setup` registers reb with Claude Code, Cursor, Codex and
  Gemini CLI after showing a preview and asking first, backs up every file it edits, and installs
  the handbook skill. `reb doctor` checks the install; `reb update` refreshes it.
- **Research tools**: read one public page at a time (obeying robots.txt), guess a page's tech stack,
  and summarise a HAR file with cookies, tokens and keys removed before anything is saved.
- **Planner and auditor**: plans built from five pipelines (b2b-saas, developer-tool, marketplace,
  consumer-app, ai-tool), task gates, numbered audits with severities, and re-planning with a reason
  for every change (at most 3 rounds).
- **Hands-on support**: a test plan and clearly fake sample data for your own session in the product,
  and an import that turns your screenshots, notes and HAR files into observed evidence.
- **Dashboard**: `reb dashboard`, a read-only page on your own computer with the plan, the graph,
  the evidence, the activity log and the reports.
- **Reports**: business, feature, market and build reports in Markdown and Word; every claim cites
  its evidence, and each report ends with sources and open questions.
- **Release**: plain-language README and user guide, a made-up sample run in `examples/`, an
  end-to-end test, tests on Linux, macOS and Windows, and publishing to npm from a GitHub release.

[Unreleased]: https://github.com/RidwanulIslamRifat/reb/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/RidwanulIslamRifat/reb/releases/tag/v1.0.0
