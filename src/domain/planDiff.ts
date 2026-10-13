import type { Plan, Task } from "./plan.js";

/** One field of a task that differs between two plan versions. */
export interface FieldChange {
  field: keyof Task;
  before: unknown;
  after: unknown;
}

/** What changed from plan version `from` to version `to` (for the dashboard's plan history). */
export interface PlanDiff {
  from: number;
  to: number;
  added: Task[];
  removed: Task[];
  changed: Array<{ id: string; title: string; changes: FieldChange[] }>;
  /** True when the tasks both versions share are listed in a different order. */
  reordered: boolean;
}

const FIELDS: Array<keyof Task> = [
  "title",
  "role",
  "status",
  "depends_on",
  "inputs",
  "outputs",
  "done_when",
  "reason",
  "added_in",
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffPlans(older: Plan, newer: Plan): PlanDiff {
  const before = new Map(older.tasks.map((t) => [t.id, t]));
  const after = new Map(newer.tasks.map((t) => [t.id, t]));
  const changed = newer.tasks.flatMap((task) => {
    const old = before.get(task.id);
    if (!old) return [];
    const changes = FIELDS.filter((f) => !same(old[f], task[f])).map((field) => ({
      field,
      before: old[field],
      after: task[field],
    }));
    return changes.length ? [{ id: task.id, title: task.title, changes }] : [];
  });
  const sharedOld = older.tasks.filter((t) => after.has(t.id)).map((t) => t.id);
  const sharedNew = newer.tasks.filter((t) => before.has(t.id)).map((t) => t.id);
  return {
    from: older.version,
    to: newer.version,
    added: newer.tasks.filter((t) => !before.has(t.id)),
    removed: older.tasks.filter((t) => !after.has(t.id)),
    changed,
    reordered: !same(sharedOld, sharedNew),
  };
}
