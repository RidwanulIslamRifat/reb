# Changelog

All notable changes to reb are listed here, newest first.

reb uses [semantic versioning](https://semver.org/): a version is `MAJOR.MINOR.PATCH`.

- **PATCH** (1.0.0 → 1.0.1): bug fixes only. Nothing you do changes.
- **MINOR** (1.0.0 → 1.1.0): new features. Existing runs, commands and reports keep working.
- **MAJOR** (1.0.0 → 2.0.0): something you rely on changes (a command, a file format, a report layout).
  The entry says what to do.

How a new version is released is described in [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

Nothing yet.

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
