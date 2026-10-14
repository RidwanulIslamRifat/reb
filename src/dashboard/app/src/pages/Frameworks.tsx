import { useState } from "react";
import { runPath, type FrameworksView } from "../api";
import { Loaded, Markdown, useApi } from "../ui";

/** Standard analysis frameworks (SWOT, risk register ...) drawn from the run's graph (v2). */
export function FrameworksPage({ slug }: { slug: string }) {
  const state = useApi<FrameworksView>(`${runPath(slug)}/frameworks`);
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <Loaded state={state}>
      {({ frameworks }) => {
        const filled = frameworks.filter((f) => f.count > 0);
        const current =
          frameworks.find((f) => f.framework === chosen) ?? filled[0] ?? frameworks[0]!;
        return (
          <div className="report-layout">
            <nav className="report-list" aria-label="Frameworks">
              {frameworks.map((f) => (
                <button
                  key={f.framework}
                  aria-pressed={f.framework === current.framework}
                  onClick={() => setChosen(f.framework)}
                  className={f.count === 0 ? "muted" : undefined}
                >
                  {f.title}
                  <div className="muted small">
                    {f.count === 0 ? "nothing yet" : `${f.count} item${f.count === 1 ? "" : "s"}`}
                  </div>
                </button>
              ))}
            </nav>
            <article className="card" aria-label="Framework">
              <h2>{current.title}</h2>
              <p className="muted">{current.about}</p>
              <Markdown text={current.markdown} />
            </article>
          </div>
        );
      }}
    </Loaded>
  );
}
