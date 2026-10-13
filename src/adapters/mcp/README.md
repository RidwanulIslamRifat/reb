# adapters/mcp

The MCP server for AI agents (`reb mcp`, stdio). A thin layer that calls the same workflows as the CLI.
No business logic. May import `workflows` and `domain`.

- `server.ts` builds the server: its instructions are the handbook's SKILL.md, and it registers every tool.
- `tools/*.ts` one file per group (runs, plan, evidence, graph, logs). Each tool has its SPEC 9 name,
  a description written for the agent, and zod-validated inputs. `save_plan` is an extra tool the planner
  uses until `create_plan` arrives in M6.
- Results go back as JSON; `paths` becomes `run_folder`. Expected errors come back as tool errors with
  "Problem" and "Fix" lines. Every call is logged to the run's `logs/events.jsonl` with `via: "mcp"`.
