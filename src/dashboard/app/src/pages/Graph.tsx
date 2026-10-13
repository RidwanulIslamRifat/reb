import cytoscape, { type Core } from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { getJson, runPath, type GraphView, type Label, type NodeView, type PathView } from "../api";
import { FAMILIES, LABEL, LABELS, linkName, NODE_TYPES, roleName, typeName, when } from "../labels";
import { Empty, LabelBadge, Loaded, Markdown, Problem, safeHref, useApi } from "../ui";
import type { ApiError } from "../api";

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/** Cytoscape needs real colours, so they are read from the CSS theme tokens (and re-read on theme change). */
function graphStyle(): cytoscape.StylesheetJson {
  const family = (f: string) => css(`--fam-${f}`);
  return [
    {
      selector: "node",
      style: {
        label: "data(name)",
        "font-size": 11,
        color: css("--text"),
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-wrap": "ellipsis",
        "text-max-width": "120px",
        "text-background-color": css("--surface"),
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        width: 26,
        height: 26,
        "border-width": 2,
        "border-color": css("--surface"),
        "background-color": (n: cytoscape.NodeSingular) =>
          family(NODE_TYPES[n.data("type") as string]?.family ?? "business"),
        shape: ((n: cytoscape.NodeSingular) =>
          NODE_TYPES[n.data("type") as string]?.shape ?? "ellipse") as never,
      },
    },
    {
      selector: "node[label = 'inferred']",
      style: { "border-style": "dashed", "border-color": css("--text-2") },
    },
    {
      selector: "node[label = 'unknown']",
      style: {
        "border-style": "dotted",
        "border-color": css("--text-2"),
        "background-opacity": 0.55,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": css("--edge"),
        "target-arrow-color": css("--edge"),
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        label: "",
        "font-size": 9,
        color: css("--text-2"),
        "text-rotation": "autorotate",
        "text-background-color": css("--surface"),
        "text-background-opacity": 0.85,
      },
    },
    {
      selector: "node:selected",
      style: { "border-color": css("--accent"), "border-width": 4, "border-style": "solid" },
    },
    {
      selector: "edge.near",
      style: {
        label: "data(name)",
        "line-color": css("--text-2"),
        "target-arrow-color": css("--text-2"),
        width: 2,
      },
    },
    { selector: ".faded", style: { opacity: 0.15 } },
    {
      selector: "node.path",
      style: { "border-color": css("--path"), "border-width": 4, "border-style": "solid" },
    },
    {
      selector: "edge.path",
      style: {
        "line-color": css("--path"),
        "target-arrow-color": css("--path"),
        width: 4,
        label: "data(name)",
        "z-index": 10,
      },
    },
    {
      selector: "node.match",
      style: { "border-color": css("--accent"), "border-width": 4, "border-style": "solid" },
    },
  ];
}

export function GraphPage({ slug }: { slug: string }) {
  const state = useApi<GraphView>(`${runPath(slug)}/graph`);
  return (
    <Loaded state={state}>
      {(graph) =>
        graph.nodes.length === 0 ? (
          <Empty title="The knowledge graph is empty">
            <p>
              As your agent learns about the product, the things it finds appear here as dots linked
              by lines.
            </p>
          </Empty>
        ) : (
          <GraphExplorer slug={slug} graph={graph} />
        )
      }
    </Loaded>
  );
}

function GraphExplorer({ slug, graph }: { slug: string; graph: GraphView }) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const presentTypes = useMemo(
    () => Object.keys(NODE_TYPES).filter((t) => graph.nodes.some((n) => n.type === t)),
    [graph],
  );
  const [types, setTypes] = useState<Set<string>>(() => new Set(presentTypes));
  const [labels, setLabels] = useState<Set<Label>>(() => new Set(LABELS));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [path, setPath] = useState<PathView | null>(null);
  const [pathError, setPathError] = useState<ApiError | null>(null);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const sortedNodes = useMemo(
    () => [...graph.nodes].sort((a, b) => a.name.localeCompare(b.name)),
    [graph],
  );

  // Build the graph once per data load.
  useEffect(() => {
    if (!box.current) return;
    const instance = cytoscape({
      container: box.current,
      elements: [
        ...graph.nodes.map((n) => ({ data: { ...n } })),
        ...graph.edges.map((e, i) => ({
          data: { id: `e${i}`, source: e.from, target: e.to, type: e.type, name: linkName(e.type) },
        })),
      ],
      style: graphStyle(),
      layout: {
        name: "cose",
        animate: false,
        padding: 30,
        nodeRepulsion: () => 14000,
        idealEdgeLength: () => 110,
        nodeOverlap: 20,
      },
      wheelSensitivity: 0.3,
      minZoom: 0.2,
      maxZoom: 3,
    });
    instance.on("tap", "node", (e) => setSelected(e.target.id() as string));
    instance.on("tap", (e) => {
      if (e.target === instance) setSelected(null);
    });
    cy.current = instance;
    const restyle = () => instance.style(graphStyle());
    window.addEventListener("reb-theme", restyle);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", restyle);
    return () => {
      window.removeEventListener("reb-theme", restyle);
      media.removeEventListener("change", restyle);
      instance.destroy();
      cy.current = null;
    };
  }, [graph]);

  // Filters: hide what is filtered out; highlight search matches.
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    const text = search.trim().toLowerCase();
    c.batch(() => {
      c.nodes().forEach((n) => {
        const visible = types.has(n.data("type") as string) && labels.has(n.data("label") as Label);
        n.style("display", visible ? "element" : "none");
        const hit = text !== "" && `${n.data("name")} ${n.id()}`.toLowerCase().includes(text);
        n.toggleClass("match", hit);
      });
    });
  }, [types, labels, search, graph]);

  // Selection: focus on the node and its neighbours.
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    c.batch(() => {
      c.elements().removeClass("faded near");
      c.nodes().unselect();
      if (selected && !path) {
        const node = c.getElementById(selected);
        if (node.nonempty()) {
          node.select();
          const hood = node.closedNeighborhood();
          c.elements().not(hood).addClass("faded");
          node.connectedEdges().addClass("near");
        }
      }
    });
  }, [selected, path, graph]);

  // Path: highlight the chain.
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    c.batch(() => {
      c.elements().removeClass("path");
      if (!path?.found) return;
      const ids = new Set(path.nodes);
      c.nodes()
        .filter((n) => ids.has(n.id()))
        .addClass("path");
      for (const e of path.edges) {
        c.edges()
          .filter(
            (x) =>
              x.data("source") === e.from && x.data("target") === e.to && x.data("type") === e.type,
          )
          .addClass("path");
      }
      c.elements().not(".path").addClass("faded");
      c.fit(c.elements(".path"), 80);
      if (c.zoom() > 1.3)
        c.zoom({ level: 1.3, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } });
    });
  }, [path]);

  const findPath = async () => {
    setPathError(null);
    setPath(null);
    setSelected(null);
    if (!from || !to) return;
    try {
      setPath(
        await getJson<PathView>(
          `${runPath(slug)}/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      );
    } catch (error) {
      setPathError(error as ApiError);
    }
  };

  const matches = search.trim()
    ? graph.nodes.filter((n) =>
        `${n.name} ${n.id}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : [];

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="graph-layout">
      <aside className="card side" aria-label="Filters">
        <label htmlFor="graph-search">
          <h3 style={{ marginTop: 0 }}>Search</h3>
        </label>
        <input
          id="graph-search"
          type="search"
          placeholder="Name of a feature, plan…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%" }}
        />
        {matches.length > 0 && (
          <ul className="link-list small" style={{ marginTop: "0.4rem" }}>
            {matches.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button className="link" onClick={() => setSelected(n.id)}>
                  {n.name}
                </button>{" "}
                <span className="muted">({typeName(n.type)})</span>
              </li>
            ))}
          </ul>
        )}
        {search.trim() && matches.length === 0 && <p className="muted small">Nothing matches.</p>}

        <h3>Show these kinds</h3>
        {Object.entries(FAMILIES).map(([family, familyName]) => {
          const inFamily = presentTypes.filter((t) => NODE_TYPES[t]?.family === family);
          if (!inFamily.length) return null;
          return (
            <div key={family} style={{ marginBottom: "0.35rem" }}>
              <div className="small muted row" style={{ gap: "0.35rem" }}>
                <span className="dot" style={{ background: `var(--fam-${family})` }} />
                {familyName}
              </div>
              {inFamily.map((t) => (
                <label key={t} className="check">
                  <input
                    type="checkbox"
                    checked={types.has(t)}
                    onChange={() => setTypes(toggle(types, t))}
                  />
                  {typeName(t)}{" "}
                  <span className="muted small">
                    ({graph.nodes.filter((n) => n.type === t).length})
                  </span>
                </label>
              ))}
            </div>
          );
        })}

        <h3>How sure we are</h3>
        {LABELS.map((l) => (
          <label
            key={l}
            className="check"
            title={LABEL[l].hint}
            style={{ alignItems: "flex-start" }}
          >
            <input
              type="checkbox"
              checked={labels.has(l)}
              onChange={() => setLabels(toggle(labels, l))}
            />
            <span>
              {LABEL[l].name}
              <span className="muted small" style={{ display: "block" }}>
                {LABEL[l].hint}
              </span>
            </span>
          </label>
        ))}
        <p className="muted small">
          Dashed outline: educated guess. Dotted and faded: not confirmed.
        </p>

        <h3>Find the connection</h3>
        <p className="muted small">
          Pick two items to see the shortest chain of links between them.
        </p>
        <select
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ width: "100%", marginBottom: "0.4rem" }}
        >
          <option value="">From…</option>
          {sortedNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} ({typeName(n.type)})
            </option>
          ))}
        </select>
        <select
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ width: "100%", marginBottom: "0.4rem" }}
        >
          <option value="">To…</option>
          {sortedNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} ({typeName(n.type)})
            </option>
          ))}
        </select>
        <div className="row">
          <button className="primary" onClick={findPath} disabled={!from || !to}>
            Show connection
          </button>
          {path && (
            <button
              onClick={() => {
                setPath(null);
                cy.current?.elements().removeClass("faded");
                cy.current?.fit(undefined, 30);
              }}
            >
              Clear
            </button>
          )}
        </div>
        {pathError && <Problem error={pathError} />}
        {path && !path.found && (
          <p className="notice warn small">These two items are not connected.</p>
        )}
        {path?.found && (
          <ol className="small" aria-label="Connection">
            {path.nodes.map((id, i) => (
              <li key={id}>
                {byId.get(id)?.name ?? id}
                {path.edges[i] && (
                  <span className="muted">
                    {" "}
                    —{" "}
                    {path.edges[i]!.from === id
                      ? linkName(path.edges[i]!.type)
                      : `(${linkName(path.edges[i]!.type)} by)`}{" "}
                    ↓
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </aside>

      <section className="card graph-canvas" aria-label="Knowledge graph picture">
        <div className="graph-tools">
          <button onClick={() => cy.current?.zoom(cy.current.zoom() * 1.2)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => cy.current?.zoom(cy.current.zoom() / 1.2)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => cy.current?.fit(undefined, 30)}>Fit</button>
        </div>
        <div ref={box} className="cy" data-testid="graph" />
      </section>

      <aside aria-label="Selected item">
        {selected ? (
          <NodeCard slug={slug} id={selected} onSelect={setSelected} />
        ) : (
          <div className="card muted">
            <h3>Click a dot</h3>
            <p className="small">
              Each dot is one thing reb learned about the product. Click it to see what it is, what
              it links to, and the evidence behind it. Drag dots to move them; scroll to zoom.
            </p>
            <p className="small">
              {graph.nodes.length} items · {graph.edges.length} links
              {graph.problems > 0 && (
                <> · {graph.problems} things to tidy up (ask your agent to check the graph)</>
              )}
            </p>
          </div>
        )}
        {graph.unreadable.length > 0 && (
          <div className="notice warn small">
            {graph.unreadable.length} knowledge file(s) could not be read:{" "}
            {graph.unreadable.map((b) => b.file).join(", ")}
          </div>
        )}
      </aside>
    </div>
  );
}

/** A node's notes without the "# Name" heading reb writes at the top (the card already shows the name). */
function notesOf(body: string, name: string): string {
  const lines = body.trim().split("\n");
  if (lines[0]?.replace(/^#\s+/, "").trim() === name.trim()) lines.shift();
  return lines.join("\n").trim();
}

function NodeCard({
  slug,
  id,
  onSelect,
}: {
  slug: string;
  id: string;
  onSelect: (id: string) => void;
}) {
  const state = useApi<NodeView>(`${runPath(slug)}/nodes/${encodeURIComponent(id)}`);
  return (
    <div className="card node-card" data-testid="node-card">
      <Loaded state={state}>
        {({ node, outgoing, incoming, evidence }) => {
          const links = outgoing.filter((l) => l.type !== "evidence");
          const findings = evidence.filter((e) => e.kind === "evidence");
          const sources = evidence.filter((e) => e.kind === "source");
          return (
            <>
              <div className="muted small">{typeName(node.meta.type)}</div>
              <h2>{node.meta.name}</h2>
              <div className="row small" style={{ marginBottom: "0.75rem" }}>
                <LabelBadge label={node.meta.label} />
                <code>{node.meta.id}</code>
              </div>
              {notesOf(node.body, node.meta.name) && (
                <details open>
                  <summary className="small muted">Notes</summary>
                  <Markdown text={notesOf(node.body, node.meta.name)} />
                </details>
              )}
              {links.length > 0 && (
                <>
                  <h3>Links to</h3>
                  <ul className="link-list small">
                    {links.map((l, i) => (
                      <li key={i}>
                        {linkName(l.type)}{" "}
                        {l.exists ? (
                          <button className="link" onClick={() => onSelect(l.to)}>
                            {l.name ?? l.to}
                          </button>
                        ) : (
                          <span
                            className="pill bad"
                            title="This link points at something that does not exist"
                          >
                            {l.to} (missing)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {incoming.length > 0 && (
                <>
                  <h3>Linked from</h3>
                  <ul className="link-list small">
                    {incoming.map((l, i) => (
                      <li key={i}>
                        <button className="link" onClick={() => onSelect(l.from)}>
                          {l.name}
                        </button>{" "}
                        {linkName(l.type)} this
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3>Evidence ({findings.length})</h3>
              {findings.length === 0 && (
                <p className="notice warn small">
                  No evidence yet. Treat this item as unconfirmed.
                </p>
              )}
              {findings.map((e) =>
                e.kind === "evidence" ? (
                  <div key={e.id} className="evidence-item small">
                    <div className="row">
                      <strong>{e.id}</strong>
                      <LabelBadge label={e.confidence} />
                      {e.corrected_by && (
                        <span className="pill warn">Replaced by {e.corrected_by}</span>
                      )}
                    </div>
                    <div>{e.finding}</div>
                    <div className="muted">
                      {roleName(e.role)} · {e.operation} · source {e.source} · {when(e.at)}
                    </div>
                    {e.limitations.length > 0 && (
                      <div className="muted">Limits: {e.limitations.join("; ")}</div>
                    )}
                  </div>
                ) : null,
              )}
              {sources.length > 0 && (
                <>
                  <h3>Sources</h3>
                  <ul className="link-list small">
                    {sources.map((s) =>
                      s.kind === "source" ? (
                        <li key={s.id}>
                          <strong>{s.id}</strong>{" "}
                          {safeHref(s.url) ? (
                            <a href={safeHref(s.url)!} target="_blank" rel="noreferrer noopener">
                              {s.title}
                            </a>
                          ) : (
                            s.title
                          )}
                        </li>
                      ) : null,
                    )}
                  </ul>
                </>
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}
