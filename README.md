# reb

A tool for tools analysis: evidence-backed analysis of SaaS products, driven by your AI agent.
See [docs/SPEC.md](docs/SPEC.md) for what reb is and [docs/ROADMAP.md](docs/ROADMAP.md) for progress.

## Run it locally

You need [Node.js](https://nodejs.org/) 22.12 or newer. Check with `node --version`.

```sh
npm ci                     # install dependencies (once, about a minute)
npm run build              # compile TypeScript into dist/
node dist/cli.js --help    # list reb commands
node dist/cli.js --version # print the version
```

## Use reb with your AI agent

reb works with Claude Code, Cursor, Codex and Gemini CLI. From the reb folder:

```sh
npm ci && npm run build      # once
node dist/cli.js setup       # shows what it will change, asks "Apply these changes? [y/N]"
node dist/cli.js doctor      # checklist: every line should have a tick
```

Setup registers the reb MCP server in each agent it finds, installs the handbook skill, and backs up
every config file it edits (next to the file, named `*.reb-backup-<date>`). Running it again changes
nothing. Restart your agent, then ask it: `Analyse example.com; reports: feature`.
`node dist/cli.js update` refreshes the registration and handbook after you pull a newer reb.

## Checks

```sh
npm test           # run the tests
npm run lint       # lint and formatting checks
npm run typecheck  # TypeScript type check
npm run format     # fix formatting automatically
```

GitHub Actions runs lint, type check, tests and build on every pull request.
