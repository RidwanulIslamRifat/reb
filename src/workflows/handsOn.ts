import { join } from "node:path";
import { buildDataset, isSyntheticValue, looksReal, toCsv } from "../domain/dataset.js";
import { RebError } from "../domain/errors.js";
import { sha256, type EvidenceRecord, type SourceRecord } from "../domain/evidence.js";
import {
  inboxKind,
  isInboxFolder,
  nodeFromFileName,
  parseNotes,
  PROVIDED_SESSION,
  SESSION_NAME,
  sessionName,
  sessionNumber,
  type InboxKind,
  type NoteEntry,
} from "../domain/inbox.js";
import type { GraphNode } from "../domain/node.js";
import { buildTestPlan, renderTestPlan } from "../domain/testPlan.js";
import {
  assertNoSecrets,
  harSecretValues,
  parseHar,
  summarizeHarEntries,
  type HarSummary,
} from "../sources/har.js";
import {
  deleteInboxFile,
  ensureInboxSession,
  listInboxFiles,
  listInboxFolders,
  readInboxFile,
  runRelative,
  writeRunFile,
} from "../storage/inbox.js";
import { readLedger } from "../storage/ledger.js";
import type { RunPaths } from "../storage/runFolder.js";
import type { Context } from "./context.js";
import { appendEvidence, appendSource } from "./evidence.js";
import { loadGraph } from "./graph.js";
import { argsOf, logged, type RunRef } from "./logging.js";
import { redact, redactText } from "./redact.js";
import { readBrief, resolveRun } from "./runs.js";

/** The session a new test plan is for: the latest empty inbox folder, or the next new one. */
export async function pickSession(paths: RunPaths): Promise<string> {
  const numbers = (await listInboxFolders(paths))
    .map(sessionNumber)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  const latest = numbers.at(-1);
  if (latest === undefined) return sessionName(1);
  const files = await listInboxFiles(paths, sessionName(latest));
  return files && files.length === 0 ? sessionName(latest) : sessionName(latest + 1);
}

function checkSession(session: string): void {
  if (!SESSION_NAME.test(session)) {
    throw new RebError(
      `"${session}" is not a session name.`,
      'Session folders are named like "session-01" inside evidence/inbox/.',
    );
  }
}

/** import_inbox also takes "provided", the folder for documents the business handed over (v2). */
function checkInboxFolder(session: string): void {
  if (!isInboxFolder(session)) {
    throw new RebError(
      `"${session}" is not an inbox folder name.`,
      'Use a session folder like "session-01", or "provided" for documents the business handed over.',
    );
  }
}

/**
 * make_test_plan: a checklist for the human's own session, built from the graph's journeys and
 * question nodes, saying what to capture. Writes notes/test-plan-<session>.md and creates the
 * empty inbox folder evidence/inbox/<session>/ for the captures.
 */
export async function makeTestPlan(ctx: Context, input: { run?: string; session?: string }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "make_test_plan", run, argsOf(input), async () => {
    if (input.session) checkSession(input.session);
    const session = input.session ?? (await pickSession(run.paths));
    const { brief } = await readBrief(run);
    const graph = await loadGraph(run.paths);
    const plan = buildTestPlan({ brief, nodes: graph.nodes, records: graph.records, session });
    const file = join(run.paths.notes, `test-plan-${session}.md`);
    await writeRunFile(file, renderTestPlan(plan, brief.product));
    await ensureInboxSession(run.paths, session);
    return {
      ...run,
      session,
      file: runRelative(run.paths, file),
      inbox: runRelative(run.paths, run.paths.inboxSession(session)),
      steps: plan.steps,
      warnings: plan.warnings,
    };
  });
}

/**
 * make_test_dataset: clearly fake sample data for the brief's category (and the graph's data
 * objects), as CSV or JSON files in notes/test-data/, for the human to type or upload by hand.
 */
export async function makeTestDataset(
  ctx: Context,
  input: { run?: string; format?: "csv" | "json"; rows?: number },
) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "make_test_dataset", run, argsOf(input), async () => {
    const format = input.format ?? "csv";
    if (format !== "csv" && format !== "json") {
      throw new RebError(`"${String(format)}" is not a dataset format.`, "Use csv or json.");
    }
    const { brief } = await readBrief(run);
    const graph = await loadGraph(run.paths);
    const dataObjects = graph.nodes
      .filter((n) => n.meta.type === "data_object")
      .map((n) => ({ id: n.meta.id, name: n.meta.name }));
    const dataset = buildDataset({ category: brief.category, dataObjects, rows: input.rows });
    // A last check: every value must look synthetic and nothing may look like real data.
    for (const table of dataset.tables) {
      for (const value of table.rows.flatMap((r) => Object.values(r))) {
        if (!isSyntheticValue(value) || looksReal(value)) {
          throw new RebError(
            `reb made a sample value that does not look fake enough ("${value}" in ${table.name}).`,
            "Nothing was written. Rename the data_object node to plain words and try again.",
          );
        }
      }
    }
    const files: string[] = [];
    for (const table of dataset.tables) {
      const file = join(run.paths.notes, "test-data", `${table.name}.${format}`);
      await writeRunFile(
        file,
        format === "csv" ? toCsv(table) : JSON.stringify(table.rows, null, 2) + "\n",
      );
      files.push(runRelative(run.paths, file));
    }
    return {
      ...run,
      category: dataset.category,
      format,
      files,
      tables: dataset.tables,
      warnings: dataset.warnings,
      note: "All values are fictional. Type or upload them by hand in your own session; never use real people's data.",
    };
  });
}

export interface InboxItem {
  /** "other" is a file reb does not import (it is listed as skipped). */
  kind: InboxKind | "other";
  file: string;
  /** The node the item is about, or null when nothing names one. */
  subject: string | null;
  finding: string;
  links: string[];
  confidence: "observed" | "provided";
  status: "new" | "already imported" | "skipped";
  reason?: string;
  /** Set after a real import. */
  record?: string;
}

interface PreparedItem extends InboxItem {
  bytes: Uint8Array;
  sha: string;
  entry?: NoteEntry;
  har?: { summary: HarSummary; secrets: string[] };
}

const nodeName = (nodes: GraphNode[], id: string) =>
  nodes.find((n) => n.meta.id === id)?.meta.name ?? id;

function harFinding(name: string, summary: HarSummary): string {
  const api = summary.endpoints.filter((e) => e.kind === "api");
  const polling = api
    .filter((e) => e.polling)
    .map((e) => `${e.method} ${e.pattern} every ${e.polling!.every_seconds} s`);
  const streaming = summary.endpoints
    .filter((e) => e.streaming)
    .map((e) => `${e.streaming} at ${e.pattern}`);
  const slowest = summary.endpoints
    .filter((e) => !e.streaming)
    .sort((a, b) => b.max_ms - a.max_ms)[0];
  return [
    `Network capture ${name}: ${summary.requests} requests to ${summary.hosts.join(", ") || "no hosts"} ` +
      `over ${summary.duration_seconds} s, ${api.length} API endpoint pattern(s).`,
    polling.length ? `Polling: ${polling.join("; ")}.` : "No polling seen.",
    streaming.length ? `Streaming: ${streaming.join("; ")}.` : "No streaming seen.",
    slowest ? `Slowest: ${slowest.method} ${slowest.pattern} (${slowest.max_ms} ms).` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Reads one session folder and works out, for every file and note, what an import would record. */
async function prepareInbox(
  run: RunRef,
  session: string,
  fallback: string | undefined,
  nodes: GraphNode[],
): Promise<PreparedItem[]> {
  const files = await listInboxFiles(run.paths, session);
  if (files === null) {
    throw new RebError(
      `There is no inbox folder evidence/inbox/${session} in this run.`,
      session === PROVIDED_SESSION
        ? "Create the folder evidence/inbox/provided/ in the run folder and save the documents the business gave you there."
        : 'Make a test plan first ("reb evidence test-plan"), which creates it, and save the captures there.',
    );
  }
  const rel = (name: string) => `evidence/inbox/${session}/${name}`;
  // Documents the business handed over are "provided"; the user's own session is "observed".
  const provided = session === PROVIDED_SESSION;
  const confidence = provided ? "provided" : "observed";
  const products = nodes.filter((n) => n.meta.type === "product");
  const defaultSubject = fallback ?? (products.length === 1 ? products[0]!.meta.id : undefined);
  const items: PreparedItem[] = [];
  const captions = new Map<string, NoteEntry>();

  const read = async (name: string) => {
    const bytes = (await readInboxFile(run.paths, session, name)) ?? new Uint8Array();
    return { bytes, sha: sha256(bytes) };
  };

  // Notes first, so a note that names a screenshot can link the screenshot to its node.
  for (const name of files.filter((f) => inboxKind(f) === "note")) {
    const { bytes, sha } = await read(name);
    for (const entry of parseNotes(new TextDecoder().decode(bytes))) {
      for (const f of entry.files) if (entry.nodes[0] && !captions.has(f)) captions.set(f, entry);
      const subject = entry.nodes[0] ?? defaultSubject ?? null;
      items.push({
        kind: "note",
        file: rel(name),
        subject,
        finding: redactText(entry.text),
        links: entry.nodes.slice(1),
        confidence,
        status: "new",
        bytes,
        sha,
        entry,
      });
    }
  }
  for (const name of files) {
    const kind = inboxKind(name);
    if (kind === "note") continue;
    if (kind === null) {
      if (!name.startsWith(".")) {
        items.push({
          kind: "other",
          file: rel(name),
          subject: null,
          finding: "",
          links: [],
          confidence,
          status: "skipped",
          reason:
            "reb imports screenshots (.png, .jpg, .gif, .webp), notes (.md, .txt), .har files and, in " +
            "the provided folder, documents (.pdf, .docx, .xlsx, .csv, .pptx) only",
          bytes: new Uint8Array(),
          sha: "",
        });
      }
      continue;
    }
    const misplaced =
      kind === "document" && !provided
        ? "documents from the business go in evidence/inbox/provided/, not in a session folder"
        : kind === "har" && provided
          ? "network captures come from your own session: put them in a session-NN folder"
          : null;
    if (misplaced) {
      items.push({
        kind,
        file: rel(name),
        subject: null,
        finding: "",
        links: [],
        confidence,
        status: "skipped",
        reason: misplaced,
        bytes: new Uint8Array(),
        sha: "",
      });
      continue;
    }
    const { bytes, sha } = await read(name);
    const caption = captions.get(name);
    const subject = nodeFromFileName(name) ?? caption?.nodes[0] ?? defaultSubject ?? null;
    if (kind === "document") {
      items.push({
        kind,
        file: rel(name),
        subject,
        finding: caption
          ? `Document ${name} provided by the business: ${redactText(caption.text)}`
          : `Document ${name} about ${subject ? nodeName(nodes, subject) : "the business"}, provided by the business.`,
        links: [],
        confidence,
        status: "new",
        bytes,
        sha,
      });
    } else if (kind === "screenshot") {
      items.push({
        kind,
        file: rel(name),
        subject,
        finding: caption
          ? `Screenshot ${name} ${provided ? "provided by the business" : "from the user's own session"}: ${redactText(caption.text)}`
          : `Screenshot ${name} of ${subject ? nodeName(nodes, subject) : "the product"} ${provided ? "provided by the business" : "from the user's own session"}.`,
        links: [],
        confidence,
        status: "new",
        bytes,
        sha,
      });
    } else {
      // Redaction happens here, in memory, before anything from the HAR can be stored.
      let entries: ReturnType<typeof parseHar>;
      try {
        entries = parseHar(new TextDecoder().decode(bytes));
      } catch (error) {
        if (!(error instanceof RebError)) throw error;
        items.push({
          kind,
          file: rel(name),
          subject,
          finding: "",
          links: [],
          confidence,
          status: "skipped",
          reason: error.problem,
          bytes,
          sha,
        });
        continue;
      }
      const summary = redact(summarizeHarEntries(entries));
      items.push({
        kind,
        file: rel(name),
        subject,
        finding: harFinding(name, summary),
        links: [],
        confidence,
        status: "new",
        bytes,
        sha,
        har: { summary, secrets: harSecretValues(entries) },
      });
    }
  }
  for (const item of items) {
    if (item.status === "new" && !item.subject) {
      item.status = "skipped";
      item.reason =
        "nothing names its node: start the note with [node-id], name the file <node-id>--<n>.png, " +
        "or give a default subject";
    }
  }
  return items;
}

/** True when an earlier import already recorded this item (same file content, or same note). */
function alreadyImported(item: PreparedItem, sources: SourceRecord[], evidence: EvidenceRecord[]) {
  const fromFile = new Set(sources.filter((s) => s.url === item.file).map((s) => s.id));
  const sameFile = new Set(
    sources.filter((s) => s.url === item.file && s.content_sha256 === item.sha).map((s) => s.id),
  );
  return evidence.some(
    (e) =>
      e.operation === "import_inbox" &&
      (item.kind === "note"
        ? fromFile.has(e.source) && e.subject === item.subject && e.finding === item.finding
        : sameFile.has(e.source)),
  );
}

/** An item as the caller sees it: without file bytes and in-memory HAR data. */
function publicItem(item: PreparedItem): InboxItem {
  const { kind, file, subject, finding, links, confidence, status, reason, record } = item;
  return { kind, file, subject, finding, links, confidence, status, reason, record };
}

const ROLE_OF: Record<InboxKind, "walkthrough_coach" | "tech_observer" | "desk_researcher"> = {
  screenshot: "walkthrough_coach",
  note: "walkthrough_coach",
  har: "tech_observer",
  document: "desk_researcher",
};

function countLine(items: InboxItem[]): string {
  const count = (kind: InboxKind) => items.filter((i) => i.kind === kind).length;
  const parts = [
    [count("screenshot"), "screenshot"],
    [count("note"), "note"],
    [count("har"), "HAR"],
    [count("document"), "document"],
  ]
    .filter(([n]) => n)
    .map(([n, word]) => `${n} ${word}${n === 1 || word === "HAR" ? "" : "s"}`);
  return parts.join(", ") || "nothing";
}

/**
 * import_inbox: turns one inbox session (screenshots, notes, HAR files the human saved) into
 * evidence records labelled observed, linked to the node each note or file name names.
 * A HAR is summarised and stripped of cookies, auth headers, tokens and query secrets in memory;
 * only that redacted summary is stored (evidence/imports/<session>/), never the raw file.
 * Importing the same session again records only what is new. `dry_run` writes no evidence.
 */
export async function importInbox(
  ctx: Context,
  input: {
    run?: string;
    session: string;
    subject?: string;
    dry_run?: boolean;
    delete_raw_har?: boolean;
  },
) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "import_inbox", run, argsOf(input), async () => {
    checkInboxFolder(input.session);
    const graph = await loadGraph(run.paths);
    const prepared = await prepareInbox(run, input.session, input.subject, graph.nodes);
    const records = await readLedger(run.paths);
    const sources = records.filter((r): r is SourceRecord => r.kind === "source");
    const evidence = records.filter((r): r is EvidenceRecord => r.kind === "evidence");
    for (const item of prepared) {
      if (item.status === "new" && alreadyImported(item, sources, evidence)) {
        item.status = "already imported";
      }
    }
    const warnings: string[] = [];
    const fresh = prepared.filter((i) => i.status === "new");
    const provided = input.session === PROVIDED_SESSION;

    if (!input.dry_run) {
      const sourceFor = new Map<string, string>();
      for (const item of fresh) {
        if (item.har) {
          const text = JSON.stringify(item.har.summary, null, 2) + "\n";
          assertNoSecrets(text, item.har.secrets);
          const name = item.file.split("/").pop()!;
          await writeRunFile(join(run.paths.imports(input.session), `${name}.summary.json`), text);
        }
        const key = `${item.file} ${item.sha}`;
        let sourceId =
          sourceFor.get(key) ??
          sources.find((s) => s.url === item.file && s.content_sha256 === item.sha)?.id;
        if (!sourceId) {
          const name = item.file.split("/").pop()!;
          const what = {
            har: "Network capture",
            note: "Notes",
            screenshot: "Screenshot",
            document: "Document",
          };
          const source = await appendSource(ctx, run, {
            url: item.file,
            title: `${what[item.kind as InboxKind]} ${name} (${input.session})`,
            publisher: provided
              ? "the analysed business (provided document)"
              : "the user's own session",
            content: item.bytes,
          });
          sourceId = source.id;
        }
        sourceFor.set(key, sourceId);
        const limitations = [
          provided
            ? "From a document the business handed over; not checked against public sources."
            : "Seen in the user's own session; one session on one plan tier.",
        ];
        if (item.har) {
          limitations.push(
            `Cookies, auth headers, tokens, bodies and query values were stripped; the redacted summary is ` +
              `evidence/imports/${input.session}/${item.file.split("/").pop()}.summary.json.`,
          );
        }
        const { record, warnings: more } = await appendEvidence(ctx, run, {
          role: provided ? "desk_researcher" : ROLE_OF[item.kind as InboxKind],
          subject: item.subject,
          operation: "import_inbox",
          source: sourceId,
          finding: item.finding,
          confidence: item.confidence,
          limitations,
          links: item.links,
        });
        item.record = record.id;
        warnings.push(...more);
      }
    }

    const hars = prepared.filter((i) => i.kind === "har" && i.status !== "skipped");
    const deleted: string[] = [];
    for (const har of hars) {
      const name = har.file.split("/").pop()!;
      if (input.delete_raw_har && !input.dry_run) {
        await deleteInboxFile(run.paths, input.session, name);
        deleted.push(har.file);
      } else {
        warnings.push(
          `The raw file ${har.file} still holds cookies and tokens. reb never copies it; once imported, ` +
            "delete it (run the import again with delete_raw_har / --delete-har).",
        );
      }
    }

    const items: InboxItem[] = prepared.map(publicItem);
    const wouldWord = input.dry_run ? "Would import" : "Imported";
    return {
      ...run,
      session: input.session,
      dry_run: input.dry_run ?? false,
      summary: `${wouldWord} ${fresh.length} item${fresh.length === 1 ? "" : "s"}: ${countLine(fresh)}.`,
      items,
      deleted,
      warnings: [...new Set(warnings)],
    };
  });
}
