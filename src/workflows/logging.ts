import { EventSchema, formatDecision, type RebEvent } from "../domain/event.js";
import { appendJsonLine, appendText } from "../storage/jsonl.js";
import type { RunPaths } from "../storage/runFolder.js";
import type { Context } from "./context.js";
import { redact } from "./redact.js";

export interface RunRef {
  slug: string;
  paths: RunPaths;
}

/**
 * Runs one workflow call and appends exactly one line about it to logs/events.jsonl,
 * whether it succeeded or failed (SPEC 9). Arguments are redacted before they are written.
 */
export async function logged<T>(
  ctx: Context,
  tool: string,
  run: RunRef,
  args: Record<string, unknown>,
  work: () => Promise<T>,
): Promise<T> {
  const started = ctx.now();
  let error: unknown;
  try {
    return await work();
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await appendEvent(run.paths, {
      at: started.toISOString(),
      tool,
      via: ctx.via,
      run: run.slug,
      args: redact(args),
      ok: error === undefined,
      ...(error === undefined
        ? {}
        : { error: redact(error instanceof Error ? error.message : String(error)) }),
      duration_ms: Math.max(0, ctx.now().getTime() - started.getTime()),
    });
  }
}

async function appendEvent(paths: RunPaths, event: RebEvent): Promise<void> {
  await appendJsonLine(paths.events, EventSchema.parse(event));
}

/** Adds one line to logs/decisions.md. */
export async function appendDecision(
  ctx: Context,
  paths: RunPaths,
  planVersion: number,
  change: string,
  reason: string,
): Promise<void> {
  const text = formatDecision({
    at: ctx.now().toISOString(),
    plan_version: planVersion,
    change,
    reason,
  });
  await appendText(paths.decisions, text);
}

/** A call's arguments without `run`, for the event log (the run is already on every event). */
export function argsOf<T extends { run?: string }>(input: T): Omit<T, "run"> {
  const { run: _ignored, ...rest } = input;
  void _ignored;
  return rest;
}
