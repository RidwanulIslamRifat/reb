import { marked, Renderer } from "marked";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, getJson, type Label } from "./api";
import { LABEL } from "./labels";

/** Loads one API address; reloads when `path` changes. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({
    loading: true,
  });
  useEffect(() => {
    if (path === null) {
      setState({ loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    getJson<T>(path).then(
      (data) => live && setState({ data, loading: false }),
      (error: unknown) =>
        live &&
        setState({
          loading: false,
          error:
            error instanceof ApiError ? error : new ApiError(String(error), "Reload the page."),
        }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  return state;
}

/** Shows loading, an explained error, or the content. */
export function Loaded<T>({
  state,
  children,
}: {
  state: { data?: T; error?: ApiError; loading: boolean };
  children: (data: T) => ReactNode;
}) {
  if (state.error) return <Problem error={state.error} />;
  if (state.data === undefined) return <p className="muted">Loading…</p>;
  return <>{children(state.data)}</>;
}

export function Problem({ error }: { error: ApiError }) {
  return (
    <div className="notice bad" role="alert">
      <strong>{error.problem}</strong>
      <div>What to do: {error.fix}</div>
    </div>
  );
}

const LABEL_CLASS: Record<Label, string> = {
  observed: "good",
  provided: "good",
  documented: "info",
  inferred: "warn",
  unknown: "",
};

/** An evidence label in words, with its meaning on hover. */
export function LabelBadge({ label }: { label: Label }) {
  const l = LABEL[label] ?? { name: label, hint: "" };
  return (
    <span className={`pill ${LABEL_CLASS[label] ?? ""}`} title={l.hint}>
      {l.name}
    </span>
  );
}

/** Only web and mail links are clickable; anything else (for example javascript:) is not. */
export function safeHref(url: string | undefined): string | null {
  return url && /^(https?:|mailto:)/i.test(url) ? url : null;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Markdown renderer that shows any raw HTML as text, so a file can never run code in the page. */
const renderer = new Renderer();
renderer.html = ({ text }) => escapeHtml(text);
renderer.link = function ({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens);
  const safe = /^(https?:|mailto:|#)/i.test(href) ? href : null;
  if (!safe) return text;
  const t = title ? ` title="${escapeHtml(title)}"` : "";
  return `<a href="${escapeHtml(safe)}"${t} target="_blank" rel="noreferrer noopener">${text}</a>`;
};
renderer.image = ({ text }) => escapeHtml(`[image: ${text}]`);

export function Markdown({ text }: { text: string }) {
  const html = useMemo(
    () => marked.parse(text, { renderer, async: false, gfm: true }) as string,
    [text],
  );
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
