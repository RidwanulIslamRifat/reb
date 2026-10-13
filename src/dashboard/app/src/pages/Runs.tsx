import type { RunSummary } from "../api";
import { when } from "../labels";
import { Empty, Loaded, useApi } from "../ui";

export function RunsPage() {
  const state = useApi<{ root: string; runs: RunSummary[] }>("/runs");
  return (
    <>
      <h1>Your analyses</h1>
      <p className="muted">
        Each card is one product reb has analysed. Click one to see its plan, knowledge graph,
        evidence, activity and reports.
      </p>
      <Loaded state={state}>
        {({ root, runs }) =>
          runs.length === 0 ? (
            <Empty title="No analyses yet">
              <p>
                Ask your AI agent to “Analyse example.com”, or type <code>reb new example.com</code>{" "}
                in a terminal.
              </p>
              <p className="small">reb looks for analyses in {root}</p>
            </Empty>
          ) : (
            <div className="grid">
              {runs.map((run) => (
                <a
                  key={run.slug}
                  className="card run-card"
                  href={`#/run/${encodeURIComponent(run.slug)}/plan`}
                >
                  <h2>{run.product}</h2>
                  <div className="muted small">{run.slug}</div>
                  {run.brief_problem && (
                    <div className="notice warn small">
                      The brief cannot be read: {run.brief_problem}
                    </div>
                  )}
                  <div style={{ margin: "0.75rem 0 0.35rem" }} className="small">
                    {run.plan_version === null
                      ? "No plan yet"
                      : `${run.tasks_done} of ${run.tasks} tasks done · plan version ${run.plan_version}`}
                  </div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label="Tasks done"
                    aria-valuemin={0}
                    aria-valuemax={run.tasks}
                    aria-valuenow={run.tasks_done}
                  >
                    <span
                      style={{ width: `${run.tasks ? (100 * run.tasks_done) / run.tasks : 0}%` }}
                    />
                  </div>
                  {run.changed_at && (
                    <div className="muted small" style={{ marginTop: "0.5rem" }}>
                      Last change {when(run.changed_at)}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )
        }
      </Loaded>
    </>
  );
}
