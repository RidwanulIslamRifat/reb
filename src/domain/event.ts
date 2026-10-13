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

/** Reads logs/decisions.md back into decisions. Lines that do not match the format are skipped. */
export function parseDecisions(text: string): Decision[] {
  return text.split("\n").flatMap((line) => {
    const m = /^- (\S+) \| plan v(\d+) \| (.+?) \| reason: (.*)$/.exec(line);
    if (!m) return [];
    return [{ at: m[1]!, plan_version: Number(m[2]), change: m[3]!, reason: m[4]! }];
  });
}

/** Reads logs/roles/<role>.md back into entries (the format formatRoleLogEntry writes). */
export function parseRoleLog(text: string, role: RoleLogEntry["role"]): RoleLogEntry[] {
  const entries: RoleLogEntry[] = [];
  for (const chunk of text.split(/^## /m).slice(1)) {
    const newline = chunk.indexOf("\n");
    const heading = newline === -1 ? chunk : chunk.slice(0, newline);
    const m = /^(\S+)(?: \(task (.+)\))?\s*$/.exec(heading);
    const summary = newline === -1 ? "" : chunk.slice(newline + 1).trim();
    if (!m || !summary) continue;
    entries.push({ at: m[1]!, role, ...(m[2] ? { task: m[2] } : {}), summary });
  }
  return entries;
}
