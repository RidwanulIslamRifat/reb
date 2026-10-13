import { useState } from "react";
import { runPath, type Decision, type PlanDiffView, type PlanView, type Task } from "../api";
import { humanize, roleName, STATUS, STATUS_ORDER, when } from "../labels";
import { Empty, Loaded, useApi } from "../ui";

export function PlanPage({ slug }: { slug: string }) {
  const [version, setVersion] = useState<number | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const query = version === null ? "" : `?version=${version}`;
  const state = useApi<PlanView>(`${runPath(slug)}/plan${query}`);
  return (
    <Loaded state={state}>
      {(view) =>
        view.plan === null ? (
          <Empty title="No plan yet">
            <p>Ask your agent to make a plan for this analysis.</p>
          </Empty>
        ) : (
          <PlanBoard
            view={view}
            slug={slug}
            compare={compare}
            onVersion={(v) => {
              setVersion(v === view.current_version ? null : v);
              setCompare(null);
            }}
            onCompare={setCompare}
          />
        )
      }
    </Loaded>
  );
}

function PlanBoard({
  view,
  slug,
  compare,
  onVersion,
  onCompare,
}: {
  view: PlanView;
  slug: string;
  compare: number | null;
  onVersion: (v: number) => void;
  onCompare: (v: number | null) => void;
}) {
  const plan = view.plan!;
  const [selected, setSelected] = useState<string | null>(null);
  const task = plan.tasks.find((t) => t.id === selected) ?? null;
  const isCurrent = plan.version === view.current_version;
  const older = view.versions.filter((v) => v !== plan.version);
  const columns = STATUS_ORDER.filter(
    (s) => s !== "dropped" || plan.tasks.some((t) => t.status === "dropped"),
  );
  const reasons = view.decisions.filter((d) => d.plan_version === plan.version);
  return (
    <div className="stack">
      <div className="card row" style={{ justifyContent: "space-between" }}>
        <label className="row">
          <strong>Plan version</strong>
          <select value={plan.version} onChange={(e) => onVersion(Number(e.target.value))}>
            {view.versions.map((v) => (
              <option key={v} value={v}>
                Version {v}
                {v === view.current_version ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        {older.length > 0 && (
          <label className="row">
            <span>Compare with</span>
            <select
              value={compare ?? ""}
              onChange={(e) => onCompare(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">(choose a version)</option>
              {older.map((v) => (
                <option key={v} value={v}>
                  Version {v}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="muted small">
          {plan.tasks.length} tasks · template: {plan.pipeline || "custom"}
        </span>
      </div>
      {!isCurrent && (
        <div className="notice warn">
          You are looking at an older version of the plan. Pick version {view.current_version} to
          see the current one.
        </div>
      )}
      {reasons.length > 0 && (
        <Reasons title={`Why version ${plan.version} was made`} decisions={reasons} />
      )}
      {compare !== null && <PlanDiff slug={slug} from={compare} to={plan.version} />}
      <div className="board" aria-label="Tasks by status">
        {columns.map((status) => {
          const tasks = plan.tasks.filter((t) => t.status === status);
          return (
            <section key={status} className="column" aria-label={STATUS[status].name}>
              <h3 title={STATUS[status].hint}>
                <span>{STATUS[status].name}</span>
                <span className="muted">{tasks.length}</span>
              </h3>
              {tasks.length === 0 && (
                <div className="muted small" style={{ padding: "0 0.3rem" }}>
                  None
                </div>
              )}
              {tasks.map((t) => (
                <button
                  key={t.id}
                  className="task"
                  aria-pressed={t.id === selected}
                  onClick={() => setSelected(t.id === selected ? null : t.id)}
                >
                  <span className="title">{t.title}</span>
                  <span className="row small muted">
                    <span>{roleName(t.role)}</span>
                    {t.depends_on.length > 0 && (
                      <span>
                        · waits for {t.depends_on.length}{" "}
                        {t.depends_on.length === 1 ? "task" : "tasks"}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      {task && <TaskDetail task={task} tasks={plan.tasks} onSelect={setSelected} />}
    </div>
  );
}

function Reasons({ title, decisions }: { title: string; decisions: Decision[] }) {
  return (
    <details className="card" open={decisions.length <= 4}>
      <summary>
        <strong>{title}</strong> <span className="muted small">({decisions.length} changes)</span>
      </summary>
      <ul>
        {decisions.map((d, i) => (
          <li key={i}>
            {d.change} — <span className="muted">{d.reason}</span>{" "}
            <span className="muted small">({when(d.at)})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function TaskDetail({
  task,
  tasks,
  onSelect,
}: {
  task: Task;
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <h3>{title}</h3>
        <ul>
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="card" aria-label="Task details">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{task.title}</h2>
        <span className="pill">{STATUS[task.status].name}</span>
      </div>
      <p className="muted small">
        Task {task.id} · done by the {roleName(task.role).toLowerCase()} · added in plan version{" "}
        {task.added_in}
        {task.reason && <> · why: {task.reason}</>}
      </p>
      {task.depends_on.length > 0 && (
        <p>
          Starts after:{" "}
          {task.depends_on.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <button className="link" onClick={() => onSelect(id)}>
                {tasks.find((t) => t.id === id)?.title ?? id}
              </button>
            </span>
          ))}
        </p>
      )}
      <div className="grid">
        {list("Finished when", task.done_when)}
        {list("Uses", task.inputs)}
        {list("Produces", task.outputs)}
      </div>
    </section>
  );
}

const show = (value: unknown) =>
  Array.isArray(value)
    ? value.length
      ? value.join(", ")
      : "(none)"
    : value === "" || value === undefined
      ? "(empty)"
      : String(value);

const FIELD: Record<string, string> = {
  status: "Status",
  title: "Title",
  role: "Done by",
  depends_on: "Starts after",
  done_when: "Finished when",
  inputs: "Uses",
  outputs: "Produces",
  reason: "Why",
  added_in: "Added in version",
};

function PlanDiff({ slug, from, to }: { slug: string; from: number; to: number }) {
  const state = useApi<PlanDiffView>(`${runPath(slug)}/plan/diff?from=${from}&to=${to}`);
  return (
    <section className="card" aria-label="Plan changes">
      <h2>
        What changed from version {from} to version {to}
      </h2>
      <Loaded state={state}>
        {({ diff, decisions }) => {
          const nothing = !diff.added.length && !diff.removed.length && !diff.changed.length;
          return (
            <div className="diff-list">
              {nothing && <p className="muted">No task changed.</p>}
              {diff.added.map((t) => (
                <div key={`a${t.id}`} className="diff-add">
                  <strong>Added:</strong> {t.title}{" "}
                  <span className="muted small">({roleName(t.role)})</span>
                  {t.reason && <div className="muted small">Why: {t.reason}</div>}
                </div>
              ))}
              {diff.removed.map((t) => (
                <div key={`r${t.id}`} className="diff-remove">
                  <strong>Removed:</strong> {t.title}
                </div>
              ))}
              {diff.changed.map((c) => (
                <div key={`c${c.id}`} className="diff-change">
                  <strong>Changed:</strong> {c.title}
                  <ul className="small">
                    {c.changes.map((ch) => (
                      <li key={ch.field}>
                        {FIELD[ch.field] ?? humanize(ch.field)}:{" "}
                        <span className="muted">
                          {ch.field === "status"
                            ? STATUS[ch.before as Task["status"]]?.name
                            : show(ch.before)}
                        </span>{" "}
                        →{" "}
                        <strong>
                          {ch.field === "status"
                            ? STATUS[ch.after as Task["status"]]?.name
                            : show(ch.after)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {diff.reordered && <p className="muted small">The order of tasks also changed.</p>}
              {decisions.length > 0 && (
                <Reasons title="Reasons recorded for these changes" decisions={decisions} />
              )}
            </div>
          );
        }}
      </Loaded>
    </section>
  );
}
