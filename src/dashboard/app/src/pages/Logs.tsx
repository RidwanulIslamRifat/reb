import { useState } from "react";
import { runPath, type TimelineEntry } from "../api";
import { day, roleName, SEVERITY, toolName } from "../labels";
import { Empty, Loaded, useApi } from "../ui";

const KINDS = {
  plan: { name: "Plan changes", icon: "📋" },
  role: { name: "Work notes", icon: "✍️" },
  audit: { name: "Audits", icon: "🔍" },
  tool: { name: "Every step", icon: "⚙️" },
} as const;
type Kind = keyof typeof KINDS;

export function LogsPage({ slug }: { slug: string }) {
  const state = useApi<{ entries: TimelineEntry[] }>(`${runPath(slug)}/logs`);
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(["plan", "role", "audit", "tool"]));
  const [failedOnly, setFailedOnly] = useState(false);
  return (
    <Loaded state={state}>
      {({ entries }) => {
        if (entries.length === 0) {
          return (
            <Empty title="Nothing has happened yet">
              <p>Every step reb takes for this analysis is listed here, newest first.</p>
            </Empty>
          );
        }
        const shown = entries
          .filter((e) => kinds.has(e.kind))
          .filter((e) => !failedOnly || (e.kind === "tool" && !e.ok))
          .slice()
          .reverse();
        const days: Array<{ day: string; items: TimelineEntry[] }> = [];
        for (const e of shown) {
          const d = day(e.at);
          if (days.at(-1)?.day !== d) days.push({ day: d, items: [] });
          days.at(-1)!.items.push(e);
        }
        const failed = entries.filter((e) => e.kind === "tool" && !e.ok).length;
        return (
          <div className="stack">
            <div className="card row">
              <strong>Show</strong>
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <label key={k} className="check">
                  <input
                    type="checkbox"
                    checked={kinds.has(k)}
                    onChange={() => {
                      const next = new Set(kinds);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      setKinds(next);
                    }}
                  />
                  {KINDS[k].name} ({entries.filter((e) => e.kind === k).length})
                </label>
              ))}
              {failed > 0 && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={failedOnly}
                    onChange={(e) => setFailedOnly(e.target.checked)}
                  />
                  Only steps that went wrong ({failed})
                </label>
              )}
            </div>
            {days.length === 0 && <p className="empty">Nothing matches these filters.</p>}
            {days.map((d) => (
              <section key={d.day} aria-label={d.day}>
                <div className="timeline-day">{d.day}</div>
                <div className="card" style={{ paddingTop: 0, paddingBottom: 0 }}>
                  {d.items.map((e, i) => (
                    <Entry key={i} entry={e} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      }}
    </Loaded>
  );
}

function Entry({ entry: e }: { entry: TimelineEntry }) {
  const time = new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="event">
      <span className="time">{time}</span>
      <span className="icon" aria-hidden="true">
        {KINDS[e.kind].icon}
      </span>
      <div>
        {e.kind === "tool" && (
          <>
            <div className="row">
              <span>{toolName(e.tool)}</span>
              {e.ok ? null : <span className="pill bad">went wrong</span>}
              <span className="muted small">
                via {e.via === "mcp" ? "your AI agent" : "the terminal"}
              </span>
            </div>
            {e.error && (
              <div className="small" style={{ color: "var(--bad)" }}>
                {e.error}
              </div>
            )}
            <ToolArgs args={e.args} />
          </>
        )}
        {e.kind === "plan" && (
          <>
            <div>
              <strong>Plan version {e.plan_version}:</strong> {e.change}
            </div>
            <div className="muted small">Why: {e.reason}</div>
          </>
        )}
        {e.kind === "role" && (
          <>
            <div>
              <strong>{roleName(e.role)}</strong>
              {e.task && <span className="muted small"> · task {e.task}</span>}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{e.summary}</div>
          </>
        )}
        {e.kind === "audit" && (
          <>
            <div>
              <strong>Audit {e.number}</strong>:{" "}
              {e.gaps.length === 0 ? "no gaps found" : `${e.gaps.length} gaps found`}
              {e.stop && (
                <span className="pill good" style={{ marginLeft: "0.5rem" }}>
                  analysis can stop
                </span>
              )}
            </div>
            {e.gaps.length > 0 && (
              <ul className="small">
                {e.gaps.map((g) => (
                  <li key={g.n}>
                    <span
                      className={`pill ${g.severity === "blocking" ? "bad" : g.severity === "major" ? "warn" : ""}`}
                    >
                      {SEVERITY[g.severity] ?? g.severity}
                    </span>{" "}
                    {g.summary}
                  </li>
                ))}
              </ul>
            )}
            {e.stop_reason && <div className="muted small">{e.stop_reason}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function ToolArgs({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return null;
  const show = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  };
  return (
    <details className="small muted">
      <summary>Details</summary>
      <ul>
        {entries.map(([k, v]) => (
          <li key={k}>
            {k.replace(/_/g, " ")}: {show(v)}
          </li>
        ))}
      </ul>
    </details>
  );
}
