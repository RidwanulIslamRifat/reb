# dashboard

Local, read-only web view of run folders, served by `reb dashboard` on 127.0.0.1 (SPEC 10).
May import `workflows`, `storage` and `domain`.

- `server.ts`: a tiny HTTP server. Answers only this computer (127.0.0.1, and a Host header naming it),
  only GET and HEAD. `/api/...` returns JSON from the read-only views in `workflows/dashboard.ts`;
  every other address serves the built web app.
- `launch.ts`: starts one server per process and opens the browser. `src/cli.ts` passes it to the CLI
  and MCP adapters, which never import this folder.
- `app/`: the web app (Vite + React + Cytoscape.js). `npm run build` puts it in `dist/dashboard/public`.
