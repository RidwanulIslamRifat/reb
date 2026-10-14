/** Shapes of the dashboard's read-only API (src/workflows/dashboard.ts) and a small fetch helper. */

export type Label = "observed" | "provided" | "documented" | "inferred" | "unknown";
export type Status = "pending" | "running" | "needs_human" | "done" | "blocked" | "dropped";

export interface RunSummary {
  slug: string;
  folder: string;
  product: string;
  url: string;
  changed_at: string | null;
  plan_version: number | null;
  tasks: number;
  tasks_done: number;
  brief_problem: string | null;
}

export interface RunDetail extends RunSummary {
  brief: {
    product: string;
    url: string;
    category: string;
    reports: string[];
    focus_questions: string[];
    plan_tier: string;
    deadline: string;
  };
  notes: string;
  counts: { nodes: number; evidence: number; sources: number; reports: number };
}

export interface Task {
  id: string;
  title: string;
  role: string;
  depends_on: string[];
  inputs: string[];
  outputs: string[];
  done_when: string[];
  status: Status;
  added_in: number;
  reason: string;
}

export interface Plan {
  version: number;
  product: string;
  pipeline: string;
  reports: string[];
  tasks: Task[];
}

export interface Decision {
  at: string;
  plan_version: number;
  change: string;
  reason: string;
}

export interface PlanView {
  current_version: number | null;
  versions: number[];
  plan: Plan | null;
  decisions: Decision[];
}

export interface PlanDiffView {
  diff: {
    from: number;
    to: number;
    added: Task[];
    removed: Task[];
    changed: Array<{
      id: string;
      title: string;
      changes: Array<{ field: string; before: unknown; after: unknown }>;
    }>;
    reordered: boolean;
  };
  decisions: Decision[];
}

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  label: Label;
  evidence: number;
}
export interface GraphEdge {
  from: string;
  type: string;
  to: string;
}
export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  problems: number;
  unreadable: Array<{ file: string; reason: string }>;
}

export interface SourceRecord {
  kind: "source";
  id: string;
  url: string;
  title: string;
  publisher: string;
  published?: string;
  read_at: string;
  corrected_by: string | null;
}
export interface EvidenceRecord {
  kind: "evidence";
  id: string;
  role: string;
  subject: string;
  subject_name?: string | null;
  operation: string;
  source: string;
  finding: string;
  confidence: Label;
  limitations: string[];
  links: string[];
  at: string;
  corrected_by: string | null;
}
export type LedgerRecord = SourceRecord | EvidenceRecord;

export interface NodeView {
  node: {
    meta: { id: string; type: string; name: string; label: Label; links: Record<string, string[]> };
    body: string;
  };
  outgoing: Array<{ type: string; to: string; name?: string; exists: boolean }>;
  incoming: Array<{ from: string; type: string; name: string }>;
  evidence: Array<LedgerRecord & { corrected_by?: string }>;
}

export interface PathView {
  found: boolean;
  nodes: string[];
  edges: GraphEdge[];
}

export type TimelineEntry =
  | {
      kind: "tool";
      at: string;
      tool: string;
      via: string;
      ok: boolean;
      error?: string;
      args: Record<string, unknown>;
    }
  | { kind: "plan"; at: string; plan_version: number; change: string; reason: string }
  | { kind: "role"; at: string; role: string; task?: string; summary: string }
  | {
      kind: "audit";
      at: string;
      number: number;
      gaps: Array<{ n: number; severity: string; summary: string }>;
      stop: boolean;
      stop_reason: string;
    };

export interface ReportsView {
  folder: string;
  reports: Array<{ name: string; format: "markdown" | "word" | "web" }>;
}

export interface FrameworkView {
  framework: string;
  title: string;
  about: string;
  markdown: string;
  count: number;
}

export interface FrameworksView {
  frameworks: FrameworkView[];
}

/** A problem the server explained, with what to do about it. */
export class ApiError extends Error {
  constructor(
    readonly problem: string,
    readonly fix: string,
  ) {
    super(problem);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`);
  } catch {
    throw new ApiError(
      "The dashboard cannot reach reb.",
      'The "reb dashboard" command may have stopped. Start it again in your terminal.',
    );
  }
  const data = (await res.json().catch(() => null)) as
    (T & { problem?: string; fix?: string }) | null;
  if (!res.ok || data === null) {
    throw new ApiError(data?.problem ?? "Something went wrong.", data?.fix ?? "Reload the page.");
  }
  return data;
}

export const runPath = (slug: string) => `/runs/${encodeURIComponent(slug)}`;
