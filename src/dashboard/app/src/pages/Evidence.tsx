import { useMemo, useState } from "react";
import {
  runPath,
  type EvidenceRecord,
  type Label,
  type LedgerRecord,
  type SourceRecord,
} from "../api";
import { LABEL, LABELS, roleName, when } from "../labels";
import { Empty, LabelBadge, Loaded, safeHref, useApi } from "../ui";

export function EvidencePage({ slug }: { slug: string }) {
  const state = useApi<{ records: LedgerRecord[] }>(`${runPath(slug)}/evidence`);
  return (
    <Loaded state={state}>
      {({ records }) =>
        records.length === 0 ? (
          <Empty title="No evidence yet">
            <p>
              Every fact reb finds is written down here with where it came from and how sure it is.
            </p>
          </Empty>
        ) : (
          <Ledger records={records} />
        )
      }
    </Loaded>
  );
}

function Ledger({ records }: { records: LedgerRecord[] }) {
  const [view, setView] = useState<"findings" | "sources">("findings");
  const [label, setLabel] = useState<Label | "">("");
  const [text, setText] = useState("");
  const [hideReplaced, setHideReplaced] = useState(false);
  const findings = records.filter((r): r is EvidenceRecord => r.kind === "evidence");
  const sources = records.filter((r): r is SourceRecord => r.kind === "source");
  const sourceTitle = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const q = text.trim().toLowerCase();
  const shownFindings = findings
    .filter((r) => !label || r.confidence === label)
    .filter((r) => !hideReplaced || !r.corrected_by)
    .filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q))
    .reverse();
  const shownSources = sources
    .filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q))
    .reverse();

  return (
    <div className="stack">
      <div className="card row">
        <div className="row" role="group" aria-label="What to show">
          <button
            className={view === "findings" ? "primary" : ""}
            onClick={() => setView("findings")}
          >
            Findings ({findings.length})
          </button>
          <button
            className={view === "sources" ? "primary" : ""}
            onClick={() => setView("sources")}
          >
            Sources ({sources.length})
          </button>
        </div>
        <input
          type="search"
          placeholder="Search the evidence…"
          aria-label="Search the evidence"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {view === "findings" && (
          <>
            <select
              aria-label="How sure"
              value={label}
              onChange={(e) => setLabel(e.target.value as Label | "")}
            >
              <option value="">Any certainty</option>
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {LABEL[l].name}
                </option>
              ))}
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={hideReplaced}
                onChange={(e) => setHideReplaced(e.target.checked)}
              />
              Hide replaced findings
            </label>
          </>
        )}
      </div>
      <p className="muted small">
        Newest first. Nothing in this list is ever deleted: a correction is a new line that replaces
        an older one, and the older one is shown crossed out.
      </p>
      {view === "findings" ? (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>About</th>
                <th>Finding</th>
                <th>How sure</th>
                <th>Where from</th>
                <th>Who and when</th>
              </tr>
            </thead>
            <tbody>
              {shownFindings.map((r) => {
                const src = sourceTitle.get(r.source);
                return (
                  <tr key={r.id} className={r.corrected_by ? "replaced" : ""}>
                    <td>
                      <strong>{r.id}</strong>
                      {r.corrected_by && <div className="small">replaced by {r.corrected_by}</div>}
                    </td>
                    <td>{r.subject_name ?? r.subject}</td>
                    <td className="finding">
                      {r.finding}
                      {r.limitations.length > 0 && (
                        <div className="muted small">Limits: {r.limitations.join("; ")}</div>
                      )}
                    </td>
                    <td>
                      <LabelBadge label={r.confidence} />
                    </td>
                    <td className="small">
                      {src ? (
                        <>
                          {r.source}: {src.title}
                        </>
                      ) : (
                        r.source
                      )}
                    </td>
                    <td className="small muted">
                      {roleName(r.role)}
                      <br />
                      {when(r.at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shownFindings.length === 0 && <p className="empty">Nothing matches these filters.</p>}
        </div>
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Publisher</th>
                <th>Published</th>
                <th>Read on</th>
              </tr>
            </thead>
            <tbody>
              {shownSources.map((s) => {
                const href = safeHref(s.url);
                return (
                  <tr key={s.id} className={s.corrected_by ? "replaced" : ""}>
                    <td>
                      <strong>{s.id}</strong>
                    </td>
                    <td>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer noopener">
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                      <div className="muted small">{s.url}</div>
                    </td>
                    <td>{s.publisher || <span className="muted">unknown</span>}</td>
                    <td>{s.published ?? <span className="muted">no date</span>}</td>
                    <td className="small muted">{when(s.read_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
