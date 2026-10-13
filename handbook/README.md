# handbook

The skill files that `reb setup` installs into AI agents. They tell the agent how to drive an analysis.

- `SKILL.md` the main skill: turns "Analyse <domain>; reports: <list>" into the reb workflow.
  The MCP server also sends its text as the server instructions, for agents without skills.
- `roles/<role>.md` one prompt per role in SPEC 7. Front matter: `role`, `description` and `tools`
  (the reb MCP tools the role may use). `next_task` returns the prompt with each task.
- `references/` the evidence protocol and the knowledge-graph format, linked from SKILL.md.

Setup copies these files to `~/.claude/skills/reb/` (Claude Code) and `~/.agents/skills/reb/`
(Cursor, Codex, Gemini CLI). This README is not installed.
