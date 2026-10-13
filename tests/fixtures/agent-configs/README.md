# agent-configs

A fake home folder with config files for each supported agent, as a user might have them before
running `reb setup`. Tests copy `home/` to a temporary folder and run setup and doctor against it.

- `.claude.json` and `.claude/`: Claude Code, with another MCP server already registered.
- `.cursor/mcp.json`: Cursor, with REA registered (doctor reports REA present).
- `.codex/config.toml`: Codex, with another server and a sub-table that must stay untouched.
- `.gemini/settings.json`: Gemini CLI, with no MCP servers yet.
