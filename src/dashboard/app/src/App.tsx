import { useEffect, useState } from "react";
import { runPath, type RunDetail } from "./api";
import { EvidencePage } from "./pages/Evidence";
import { GraphPage } from "./pages/Graph";
import { LogsPage } from "./pages/Logs";
import { PlanPage } from "./pages/Plan";
import { ReportsPage } from "./pages/Reports";
import { RunsPage } from "./pages/Runs";
import { Loaded, safeHref, useApi } from "./ui";

/** Pages of one run, in tab order. */
const PAGES = [
  { id: "plan", name: "Plan" },
  { id: "graph", name: "Knowledge graph" },
  { id: "evidence", name: "Evidence" },
  { id: "logs", name: "Activity log" },
  { id: "reports", name: "Reports" },
] as const;
type PageId = (typeof PAGES)[number]["id"];

/** The address after "#": "/" or "/run/<slug>/<page>". */
function useRoute() {
  const read = () => window.location.hash.replace(/^#/, "") || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const parts = route.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "run" && parts[1]) {
    const page = PAGES.find((p) => p.id === parts[2])?.id ?? "plan";
    return { slug: parts[1], page };
  }
  return null;
}

type Theme = "system" | "light" | "dark";

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("reb-theme");
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("reb-theme", theme);
    } catch {
      // Private windows may block storage; the choice then lasts until the page closes.
    }
    window.dispatchEvent(new Event("reb-theme"));
  }, [theme]);
  return [theme, setTheme];
}

export function App() {
  const route = useRoute();
  const [theme, setTheme] = useTheme();
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          reb <small>dashboard</small>
        </a>
        <span className="spacer" />
        <span className="readonly-note">View only: nothing here changes your files.</span>
        <label className="row small">
          <span className="muted">Colours</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            aria-label="Colour theme"
          >
            <option value="system">Match my computer</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <main>{route ? <RunView slug={route.slug} page={route.page} /> : <RunsPage />}</main>
    </>
  );
}

function RunView({ slug, page }: { slug: string; page: PageId }) {
  const run = useApi<RunDetail>(runPath(slug));
  const base = `#/run/${encodeURIComponent(slug)}`;
  return (
    <>
      <div className="crumbs">
        <a href="#/">All analyses</a> › {run.data?.product ?? slug}
      </div>
      <Loaded state={run}>
        {(r) => (
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <h1>{r.product}</h1>
              <div className="muted small">
                {safeHref(r.brief.url) ? (
                  <a href={safeHref(r.brief.url)!} target="_blank" rel="noreferrer noopener">
                    {r.brief.url}
                  </a>
                ) : (
                  r.brief.url
                )}
                {r.brief.reports.length > 0 && (
                  <> · Reports asked for: {r.brief.reports.join(", ")}</>
                )}
                {r.brief.deadline && <> · Due {r.brief.deadline}</>}
              </div>
              {r.brief.focus_questions.length > 0 && (
                <div className="small" style={{ marginTop: "0.4rem" }}>
                  <strong>Questions to answer:</strong> {r.brief.focus_questions.join(" · ")}
                </div>
              )}
            </div>
            <div className="row small muted">
              <span>{r.counts.nodes} knowledge items</span>·
              <span>{r.counts.evidence} findings</span>·<span>{r.counts.sources} sources</span>·
              <span>{r.counts.reports} reports</span>
            </div>
          </div>
        )}
      </Loaded>
      <nav className="tabs" aria-label="Run pages">
        {PAGES.map((p) => (
          <a key={p.id} href={`${base}/${p.id}`} aria-current={p.id === page ? "page" : undefined}>
            {p.name}
          </a>
        ))}
      </nav>
      {page === "plan" && <PlanPage slug={slug} />}
      {page === "graph" && <GraphPage slug={slug} />}
      {page === "evidence" && <EvidencePage slug={slug} />}
      {page === "logs" && <LogsPage slug={slug} />}
      {page === "reports" && <ReportsPage slug={slug} />}
    </>
  );
}
