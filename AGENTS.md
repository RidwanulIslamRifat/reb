# Rules for coding agents working on reb

## Who you are working for
The owner is a business analyst, not a programmer. Explain every change in plain language.
Never assume they can debug code. If something needs their decision, ask one clear question
with a recommended option.

## Source of truth
- docs/SPEC.md defines the product. docs/ROADMAP.md defines the order of work.
- If a request conflicts with SPEC.md, stop and say so before writing code.
- Keep docs/ROADMAP.md up to date: tick finished items, add discovered follow-ups.

## How to work
1. One milestone or one fix per branch and pull request. Never push to main directly.
2. Before coding, write a short plan in the pull request description: files to add or change, tests.
3. Keep the architecture layers from SPEC.md section 4. Business logic never lives in the CLI or MCP layer.
4. Write or update tests for every change. Run the full test suite and lint before saying you are done.
5. Prefer small, readable code over clever code. Add comments only where intent is not obvious.
6. Do not add a dependency without saying why in the pull request.
7. Never commit secrets, API keys, personal data, real HAR files or run folders.

## Safety boundaries (from SPEC.md section 2)
reb never logs in to products, never calls private APIs, never replays requests, never scrapes,
never automates clicks. Do not build features that do any of these, even if asked in passing;
point to the spec instead.

## When you finish a task, reply with
- What changed, in 3 to 6 plain sentences.
- How the owner can check it themselves: exact commands to copy, and what they should see.
- Test results (passed / failed counts).
- Anything left undone or uncertain.

## Commands
- Install: npm ci
- Test: npm test
- Lint: npm run lint
- Build: npm run build
- Try the CLI locally: node dist/cli.js --help
