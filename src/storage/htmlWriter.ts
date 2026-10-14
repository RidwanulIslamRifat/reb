import { markdownBlocks, type Block, type Cover } from "./docxWriter.js";

/**
 * Turns a report's Markdown into one self-contained, print-ready HTML file (v2): no scripts and
 * nothing loaded from the internet, so it opens anywhere and "Print to PDF" gives a clean PDF.
 * It understands the same Markdown as the Word writer.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown: **bold**, _italic_, `code` and [text](url) links. */
function inline(text: string): string {
  const pattern =
    /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|(?<![\w])_[^_]+_(?![\w])|(?<![\w*])\*[^*]+\*(?![\w*]))/g;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    out += escapeHtml(text.slice(last, m.index));
    const token = m[0];
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      const href = /^(https?:|mailto:|#|\.{0,2}\/)/.test(link[2]!) ? link[2]! : "#";
      out += `<a href="${escapeHtml(href)}">${escapeHtml(link[1]!)}</a>`;
    } else if (token.startsWith("**")) out += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    else if (token.startsWith("`")) out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else out += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    last = m.index + token.length;
  }
  return out + escapeHtml(text.slice(last));
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function bodyHtml(blocks: Block[]): { html: string; toc: Array<{ id: string; text: string }> } {
  const out: string[] = [];
  const toc: Array<{ id: string; text: string }> = [];
  const used = new Set<string>();
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const b of blocks) {
    if (b.kind !== "bullet") closeList();
    switch (b.kind) {
      case "heading": {
        let id = slugify(b.text) || "section";
        while (used.has(id)) id += "-x";
        used.add(id);
        if (b.level === 2) toc.push({ id, text: b.text });
        out.push(`<h${b.level} id="${id}">${inline(b.text)}</h${b.level}>`);
        break;
      }
      case "paragraph":
        out.push(`<p>${inline(b.text)}</p>`);
        break;
      case "bullet": {
        const kind = b.number ? "ol" : "ul";
        if (list !== kind) {
          closeList();
          out.push(`<${kind}>`);
          list = kind;
        }
        out.push(`<li class="level-${b.level}">${inline(b.text)}</li>`);
        break;
      }
      case "table": {
        const [head, ...rows] = b.rows;
        out.push(
          "<table>" +
            (head
              ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`
              : "") +
            `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>` +
            "</table>",
        );
        break;
      }
      case "code":
        out.push(`<pre><code>${escapeHtml(b.lines.join("\n"))}</code></pre>`);
        break;
    }
  }
  closeList();
  return { html: out.join("\n"), toc };
}

const STYLE = `
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #1f2933; background: #fff;
  max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; font-size: 11pt; }
h1 { font-size: 22pt; } h2 { font-size: 16pt; border-bottom: 1px solid #d0d7de; padding-bottom: .2rem;
  margin-top: 2rem; } h3 { font-size: 13pt; }
table { border-collapse: collapse; width: 100%; margin: .8rem 0; font-size: 10pt; }
th, td { border: 1px solid #b8c0c8; padding: .3rem .5rem; text-align: left; vertical-align: top; }
th { background: #eef1f4; }
code { font-family: Consolas, monospace; font-size: 9.5pt; background: #f3f4f6; padding: 0 .2rem; }
pre { background: #f3f4f6; padding: .6rem; overflow-x: auto; }
pre code { padding: 0; }
li.level-1 { margin-left: 1.5rem; } li.level-2 { margin-left: 3rem; }
a { color: #0b5cad; }
.cover { text-align: center; padding-top: 30vh; min-height: 60vh; }
.cover .title { font-size: 28pt; font-weight: bold; margin-bottom: 1rem; }
.cover .subtitle { font-size: 14pt; color: #555; }
.cover .note { margin-top: 20vh; font-size: 10pt; color: #555; }
nav.toc ol { padding-left: 1.2rem; }
@media print {
  body { margin: 0; max-width: none; }
  .cover, nav.toc { page-break-after: always; break-after: page; }
  h2 { break-after: avoid; } table, pre { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;

/** A self-contained HTML document with the content of a Markdown report and an optional cover. */
export function markdownToHtml(markdown: string, cover?: Cover): string {
  let blocks = markdownBlocks(markdown);
  const first = blocks[0];
  const title = cover?.title ?? (first?.kind === "heading" ? first.text : "Report");
  if (cover && first?.kind === "heading" && first.level === 1) blocks = blocks.slice(1);
  const { html, toc } = bodyHtml(blocks);
  const front = cover
    ? `<section class="cover"><div class="title">${inline(cover.title)}</div>` +
      `<div class="subtitle">${inline(cover.subtitle)}</div><div class="subtitle">${inline(cover.date)}</div>` +
      `<div class="note">${inline(cover.note)}</div></section>\n` +
      `<nav class="toc"><h2>Contents</h2><ol>${toc
        .map((t) => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`)
        .join("")}</ol></nav>\n`
    : "";
  return (
    "<!doctype html>\n" +
    `<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeHtml(title)}</title>\n<style>${STYLE}</style>\n</head>\n<body>\n` +
    front +
    html +
    "\n</body>\n</html>\n"
  );
}
