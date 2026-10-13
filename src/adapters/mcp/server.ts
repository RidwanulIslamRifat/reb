import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContext } from "../../workflows/context.js";
import { getSkillBody } from "../../workflows/handbook.js";
import { registerTools, type ToolDef } from "./tools/common.js";
import { evidenceTools } from "./tools/evidence.js";
import { graphTools } from "./tools/graph.js";
import { handsOnTools } from "./tools/handsOn.js";
import { logTools } from "./tools/logs.js";
import { planTools } from "./tools/plan.js";
import { researchTools } from "./tools/research.js";
import { runTools } from "./tools/runs.js";

/** Every MCP tool reb offers so far, with its SPEC 9 name. */
export const TOOLS: readonly ToolDef[] = [
  ...runTools,
  ...planTools,
  ...evidenceTools,
  ...graphTools,
  ...researchTools,
  ...handsOnTools,
  ...logTools,
];

/**
 * The reb MCP server: a thin adapter over the same workflows the CLI uses (SPEC 2.6).
 * Every call is logged to the run's logs/events.jsonl with via "mcp".
 */
export async function createMcpServer(version: string, env = process.env): Promise<McpServer> {
  const server = new McpServer({ name: "reb", version }, { instructions: await getSkillBody() });
  registerTools(server, createContext("mcp", env), TOOLS);
  return server;
}

/** `reb mcp`: serve over stdio until the agent closes the connection. */
export async function startMcpServer(version: string): Promise<void> {
  const server = await createMcpServer(version);
  await server.connect(new StdioServerTransport());
}
