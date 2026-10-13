import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { RebError } from "../../../domain/errors.js";
import type { Context } from "../../../workflows/context.js";

/** The optional `run` argument every run-level tool takes (ROADMAP decision 3). */
export const runArg = z
  .string()
  .optional()
  .describe(
    "Run name returned by create_run or list_runs (or a path to a run folder). " +
      "Leave out to use the most recently changed run.",
  );

/** One MCP tool: its SPEC 9 name, a description for the agent, zod input fields and the workflow call. */
export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  input: Shape;
  call: (ctx: Context, args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>;
}

export function tool<Shape extends z.ZodRawShape>(def: ToolDef<Shape>): ToolDef {
  return def as unknown as ToolDef;
}

/**
 * Turns a workflow result into what the agent sees: `paths` becomes `run_folder`, and when no run
 * was named, a note says which run was used.
 */
export function present(result: unknown): unknown {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return result;
  const { paths, defaulted, ...rest } = result as Record<string, unknown> & {
    paths?: { dir?: string };
    defaulted?: boolean;
  };
  return {
    ...(defaulted && "slug" in rest
      ? {
          note: `Using run ${String(rest.slug)} (the most recently changed). Pass "run" to pick another.`,
        }
      : {}),
    ...rest,
    ...(paths?.dir ? { run_folder: paths.dir } : {}),
  };
}

/** Expected reb errors go back to the agent as a tool error with "Problem" and "Fix" lines. */
async function respond(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = present(await work());
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    if (error instanceof RebError) {
      return { isError: true, content: [{ type: "text", text: error.format() }] };
    }
    throw error;
  }
}

export function registerTools(server: McpServer, ctx: Context, defs: readonly ToolDef[]): void {
  for (const def of defs) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.input },
      (args: Record<string, unknown>) => respond(() => def.call(ctx, args as never)),
    );
  }
}
