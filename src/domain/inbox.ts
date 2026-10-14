import { NODE_TYPES } from "./links.js";
import { looksLikeNodeId } from "./node.js";

/**
 * Rules for the user's inbox (SPEC 5: evidence/inbox/session-NN/, and v2 evidence/inbox/provided/
 * for documents the analysed business handed over): which files reb imports,
 * how a notes file is split into findings, and how a file or note names the node it is about.
 * Pure rules; the storage layer reads the files.
 */

export const SESSION_NAME = /^session-\d{2,}$/;

/** The inbox folder for documents the analysed business handed over itself (v2). */
export const PROVIDED_SESSION = "provided";

/** True for an inbox folder name import_inbox accepts: session-NN or provided. */
export function isInboxFolder(name: string): boolean {
  return SESSION_NAME.test(name) || name === PROVIDED_SESSION;
}

/** "session-01" for 1. */
export function sessionName(n: number): string {
  return `session-${String(n).padStart(2, "0")}`;
}

/** The number in "session-07", or null for another name. */
export function sessionNumber(name: string): number | null {
  return SESSION_NAME.test(name) ? Number(name.slice("session-".length)) : null;
}

export type InboxKind = "screenshot" | "note" | "har" | "document";

const SCREENSHOT = /\.(png|jpe?g|gif|webp)$/i;
const NOTE = /\.(md|txt)$/i;
const HAR = /\.har$/i;
const DOCUMENT = /\.(pdf|docx?|xlsx?|csv|pptx?|odt|ods)$/i;

/** What kind of inbox item a file is, or null when reb does not import it. */
export function inboxKind(fileName: string): InboxKind | null {
  if (fileName.startsWith(".")) return null;
  if (SCREENSHOT.test(fileName)) return "screenshot";
  if (NOTE.test(fileName)) return "note";
  if (HAR.test(fileName)) return "har";
  if (DOCUMENT.test(fileName)) return "document";
  return null;
}

/** True when `id` looks like a node id and starts with one of the node types. */
export function isTypedNodeId(id: string): boolean {
  return looksLikeNodeId(id) && NODE_TYPES.some((type) => id.startsWith(`${type}-`));
}

/**
 * The node a file name points at: "feature-export--settings.png" or "feature-export.png"
 * name feature-export. Returns null when the name does not start with a node id.
 */
export function nodeFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  const head = base.split("--")[0]!.toLowerCase();
  return isTypedNodeId(head) ? head : null;
}

export interface NoteEntry {
  /** The finding in the user's words, with the [node-id] tags taken out. */
  text: string;
  /** Node ids written in square brackets, in order. The first is the subject. */
  nodes: string[];
  /** Screenshot file names the entry mentions, for example "export.png". */
  files: string[];
}

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TAG = /\[([a-z_]+-[a-z0-9-]+)\]/g;
const FILE_REF = /[\w.-]+\.(?:png|jpe?g|gif|webp|pdf|docx?|xlsx?|csv|pptx?|odt|ods)\b/gi;

/**
 * Splits a notes file into findings. Each bullet ("- ", "* ", "1. ") starts one finding and
 * the lines under it continue it; headings are skipped. A file without bullets is one finding.
 * A finding names its node with a tag like [feature-export].
 */
export function parseNotes(text: string): NoteEntry[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const hasBullets = lines.some((l) => BULLET.test(l));
  const chunks: string[] = [];
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    if (!hasBullets) {
      chunks[0] = `${chunks[0] ?? ""} ${line}`;
    } else if (BULLET.test(line)) {
      chunks.push(line.replace(BULLET, ""));
    } else if (chunks.length && line.trim()) {
      chunks[chunks.length - 1] += ` ${line}`;
    }
  }
  return chunks
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((chunk) => {
      const nodes = [...chunk.matchAll(TAG)].map((m) => m[1]!).filter(isTypedNodeId);
      const text = chunk
        .replace(TAG, (tag, id: string) => (isTypedNodeId(id) ? "" : tag))
        .replace(/\s+/g, " ")
        .replace(/^[\s:–-]+/, "")
        .trim();
      const files = [...new Set([...chunk.matchAll(FILE_REF)].map((m) => m[0]))];
      return { text, nodes: [...new Set(nodes)], files };
    })
    .filter((entry) => entry.text !== "");
}
