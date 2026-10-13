# sources

Adapters for outside inputs: public web page reader, HAR reader, optional REA bridge.
May import `domain` only. Never logs in, calls private APIs, replays requests or scrapes (SPEC 2).

- `agents/` one small adapter per supported AI agent (Claude Code, Cursor, Codex, Gemini CLI): where its
  config and skills folder live, and how to add the reb MCP server to its config text. Pure functions;
  the setup workflow reads and writes the files through `storage`.
- `web.ts` plain HTTP fetch for one page: honest user agent, no cookies sent, cookie values dropped,
  2 MB limit, redirects handed back so robots.txt is checked on every hop.
- `robots.ts` robots.txt reader (RFC 9309). `publicPage.ts` public-address check, HTML to readable text,
  login page detection. `techStack.ts` + `techSignatures.json` (hand-written, easy to extend) for
  detect_tech_stack. `har.ts` HAR summary that keeps no header values, cookies, bodies or query values. Since M7 it also lists every credential value in a HAR (`harSecretValues`)
  so `assertNoSecrets` can prove a summary holds none of them before it is stored.
- The optional REA bridge has no code here: reb never calls REA. The list of REA's passive tools is in
  `domain/rea.ts`; the agent calls them and `workflows/rea.ts` stores the redacted results.
