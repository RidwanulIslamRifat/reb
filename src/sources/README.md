# sources

Adapters for outside inputs: public web page reader, HAR reader, optional REA bridge.
May import `domain` only. Never logs in, calls private APIs, replays requests or scrapes (SPEC 2).

- `agents/` one small adapter per supported AI agent (Claude Code, Cursor, Codex, Gemini CLI): where its
  config and skills folder live, and how to add the reb MCP server to its config text. Pure functions;
  the setup workflow reads and writes the files through `storage`.
