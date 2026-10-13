import { z } from "zod";
import { RoleSchema } from "./plan.js";

/** Where a workflow call came from (ROADMAP decision 4: CLI and MCP both log). */
export const ViaSchema = z.enum(["cli", "mcp"]);
export type Via = z.infer<typeof ViaSchema>;

/** One line of logs/events.jsonl: one workflow call. `args` are already redacted. */
export const EventSchema = z.object({
  at: z.string(),
  tool: z.string().min(1),
  via: ViaSchema,
  run: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  ok: z.boolean(),
  error: z.string().optional(),
  duration_ms: z.number().min(0),
});
export type RebEvent = z.infer<typeof EventSchema>;

/** One plan change with its reason, written to logs/decisions.md. */
export const DecisionSchema = z.object({
  at: z.string(),
  plan_version: z.number().int().min(1),
  change: z.string().min(1),
  reason: z.string().min(1),
});
export type Decision = z.infer<typeof DecisionSchema>;

/** One entry in logs/roles/<role>.md. */
export const RoleLogEntrySchema = z.object({
  at: z.string(),
  role: RoleSchema,
  task: z.string().optional(),
  summary: z.string().min(1),
});
export type RoleLogEntry = z.infer<typeof RoleLogEntrySchema>;

export function formatDecision(d: Decision): string {
  return `- ${d.at} | plan v${d.plan_version} | ${d.change} | reason: ${d.reason}\n`;
}

export function formatRoleLogEntry(e: RoleLogEntry): string {
  return `## ${e.at}${e.task ? ` (task ${e.task})` : ""}\n\n${e.summary.trim()}\n\n`;
}
