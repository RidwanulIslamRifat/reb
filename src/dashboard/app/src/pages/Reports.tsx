import { useState } from "react";
import { runPath, type ReportsView } from "../api";
import { humanize } from "../labels";
import { Empty, Loaded, Markdown, useApi } from "../ui";

const REPORT_NAMES: Record<string, string> = {
  business: "Business analysis",
  feature: "Feature report",
  market: "Market analysis",
  build: "Build-it assessment",
  due_diligence: "Business condition and due diligence",
  risk: "Risk assessment",
  strategy: "Strategy and growth outlook",
  technical: "Technical capability assessment",
  rebuild: "Product rebuild specification",
  requirements: "Functional and non-functional requirements",
};
const reportTitle = (file: string) => {
  const base = file.replace(/\.(md|docx|html)$/, "");
  return REPORT_NAMES[base] ?? humanize(base);
};

export function ReportsPage({ slug }: { slug: string }) {
  const state = useApi<ReportsView>(`${runPath(slug)}/reports`);
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <Loaded state={state}>
      {({ reports, folder }) => {
        const markdown = reports.filter((r) => r.format === "markdown");
        const word = reports.filter((r) => r.format !== "markdown");
        if (markdown.length === 0) {
          return (
            <Empty title="No reports yet">
              <p>When your agent writes the reports you asked for, you can read them here.</p>
              {word.length > 0 && (
                <p className="small">
                  Word files: {word.map((w) => w.name).join(", ")} in {folder}
                </p>
              )}
            </Empty>
          );
        }
        const current = chosen ?? markdown[0]!.name;
        return (
          <div className="report-layout">
            <nav className="report-list" aria-label="Reports">
              {markdown.map((r) => (
                <button
                  key={r.name}
                  aria-pressed={r.name === current}
                  onClick={() => setChosen(r.name)}
                >
                  {reportTitle(r.name)}
                  <div className="muted small">{r.name}</div>
                </button>
              ))}
              {word.length > 0 && (
                <p className="muted small">
                  Word and web copies ({word.map((w) => w.name).join(", ")}) are in {folder}
                </p>
              )}
            </nav>
            <ReportText slug={slug} name={current} />
          </div>
        );
      }}
    </Loaded>
  );
}

function ReportText({ slug, name }: { slug: string; name: string }) {
  const state = useApi<{ text: string }>(`${runPath(slug)}/reports/${encodeURIComponent(name)}`);
  return (
    <article className="card" aria-label="Report">
      <Loaded state={state}>{({ text }) => <Markdown text={text} />}</Loaded>
    </article>
  );
}
