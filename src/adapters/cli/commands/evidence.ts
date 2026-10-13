import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import {
  listEvidence,
  recordEvidence,
  recordSourceFromFile,
  recordSource,
} from "../../../workflows/evidence.js";
import { importInbox, makeTestDataset, makeTestPlan } from "../../../workflows/handsOn.js";
import { recordReaResultFromFile } from "../../../workflows/rea.js";
import { detectTechStack, readPublicPage, summarizeHarFile } from "../../../workflows/research.js";
import { line, noteRun, type CliIo } from "../output.js";

type RunOption = { run?: string };
const collect = (value: string, list: string[]) => [...list, value];

export function registerEvidence(program: Command, io: CliIo): void {
  const evidence = program.command("evidence").description("Record and list evidence and sources");
  const ctx = () => createContext("cli", io.env);

  evidence
    .command("add")
    .description("Record a finding as a new evidence record (E-NNN)")
    .argument("<finding...>", "what was found, in plain language")
    .requiredOption("--subject <node>", "node the finding is about, for example feature-sso")
    .requiredOption("--role <role>", "role that found it, for example desk_researcher")
    .requiredOption("--source <where>", "url, file path or source id (S-NNN)")
    .requiredOption("--confidence <label>", "observed, documented, inferred or unknown")
    .requiredOption("--operation <what>", "how it was found, for example read_public_page")
    .option("--limitation <text>", "a limit of this finding (repeat for more)", collect, [])
    .option("--link <id>", "a related node or E-/S- id (repeat for more)", collect, [])
    .option("--corrects <id>", "evidence id this record corrects, for example E-003")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(
      async (
        finding: string[],
        options: RunOption & {
          subject: string;
          role: string;
          source: string;
          confidence: string;
          operation: string;
          limitation: string[];
          link: string[];
          corrects?: string;
        },
      ) => {
        const { limitation, link, ...rest } = options;
        const result = await recordEvidence(ctx(), {
          ...rest,
          finding: finding.join(" "),
          limitations: limitation,
          links: link,
        });
        noteRun(io, result);
        const corrects = result.record.corrects ? ` (corrects ${result.record.corrects})` : "";
        line(io, `Recorded ${result.record.id} about ${result.record.subject}${corrects}.`);
        for (const warning of result.warnings) line(io, `Note: ${warning}`);
      },
    );

  evidence
    .command("source")
    .description("Record a source (S-NNN) with the sha256 of what was read")
    .argument("<url>", "where the source is")
    .requiredOption("--title <title>", "the page or document title")
    .option("--publisher <name>", "who published it")
    .option("--published <date>", "publication date, for example 2026-09-01")
    .option("--file <path>", "saved copy of the page; reb stores only its sha256")
    .option("--sha256 <hex>", "the content's sha256, when there is no saved copy")
    .option("--corrects <id>", "source id this record corrects, for example S-002")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(
      async (
        url: string,
        options: RunOption & {
          title: string;
          publisher?: string;
          published?: string;
          file?: string;
          sha256?: string;
          corrects?: string;
        },
      ) => {
        const { file, sha256, ...rest } = options;
        const result = file
          ? await recordSourceFromFile(ctx(), { ...rest, url, file })
          : await recordSource(ctx(), { ...rest, url, content_sha256: sha256 });
        noteRun(io, result);
        line(io, `Recorded ${result.record.id}: ${result.record.title} (${result.record.url}).`);
      },
    );

  evidence
    .command("list")
    .description("List the evidence ledger, oldest first")
    .option("--subject <node>", "only evidence about this node")
    .option("--kind <kind>", "only source or evidence records")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(async (options: RunOption & { subject?: string; kind?: string }) => {
      const kind =
        options.kind === "source" || options.kind === "evidence" ? options.kind : undefined;
      const result = await listEvidence(ctx(), { ...options, kind });
      noteRun(io, result);
      if (result.records.length === 0) line(io, "No records yet.");
      for (const r of result.records) {
        const tail = r.corrected_by ? `  [corrected by ${r.corrected_by}]` : "";
        if (r.kind === "source") {
          const date = r.published ? `published ${r.published}` : "no publication date";
          line(io, `${r.id}  ${r.title}  ${r.url}  (${date})${tail}`);
        } else {
          line(
            io,
            `${r.id}  ${r.confidence}  ${r.subject}  "${r.finding}"  (source ${r.source})${tail}`,
          );
        }
      }
    });

  evidence
    .command("read-page")
    .description("Read one public page, print its text and record it as a source (S-NNN)")
    .argument("<url>", "full public address, for example https://example.com/pricing")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(async (url: string, options: RunOption) => {
      const result = await readPublicPage(ctx(), { ...options, url, max_chars: Infinity });
      noteRun(io, result);
      line(io, `Recorded ${result.source.id}: ${result.source.title} (${result.source.url}).`);
      line(io, `Read at ${result.source.read_at}, sha256 ${result.source.content_sha256}.`);
      for (const limit of result.limitations) line(io, `Limitation: ${limit}`);
      for (const warning of result.warnings) line(io, `Warning: ${warning}`);
      line(io);
      line(io, result.text || "(no text)");
    });

  evidence
    .command("stack")
    .description("Guess the tools one public page uses, from its HTML and headers")
    .argument("<url>", "full public address, usually the home page")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(async (url: string, options: RunOption) => {
      const result = await detectTechStack(ctx(), { ...options, url });
      noteRun(io, result);
      line(io, `Recorded ${result.source.id}: ${result.source.title} (${result.source.url}).`);
      if (result.technologies.length === 0) line(io, "No known tools found on this page.");
      for (const t of result.technologies) {
        line(io, `${t.name}  (${t.category}, ${t.confidence})  ${t.clues.join("; ")}`);
      }
      for (const warning of result.warnings) line(io, `Warning: ${warning}`);
    });

  evidence
    .command("har")
    .description("Summarise a saved HAR file; secrets are stripped first")
    .argument("<file>", "path to the .har file")
    .option("--run <name>", "run to log this call in (default: the most recently changed, if any)")
    .action(async (file: string, options: RunOption) => {
      const result = await summarizeHarFile(ctx(), { ...options, file });
      if ("slug" in result) noteRun(io, result);
      const { summary } = result;
      line(
        io,
        `${summary.requests} requests to ${summary.hosts.join(", ")} over ${summary.duration_seconds} s.`,
      );
      line(io);
      line(io, "COUNT  KIND   AVG/MAX MS   ENDPOINT");
      for (const e of summary.endpoints) {
        const query = e.query_params.length ? `?${e.query_params.join("&")}` : "";
        const extra = [
          e.polling ? `polling every ${e.polling.every_seconds} s` : "",
          e.streaming ?? "",
        ].filter(Boolean);
        line(
          io,
          `${String(e.count).padStart(5)}  ${e.kind.padEnd(5)}  ${`${e.avg_ms}/${e.max_ms}`.padEnd(11)}  ` +
            `${e.method} ${e.host}${e.pattern}${query}` +
            (extra.length ? `  [${extra.join(", ")}]` : ""),
        );
      }
      const r = summary.removed;
      line(io);
      line(
        io,
        `Stripped and not kept: ${r.cookies} cookies, ${r.auth_headers} auth headers, ` +
          `${r.secret_query_values} secret query values, ${r.request_bodies} request bodies, ` +
          `${r.response_bodies} response bodies.`,
      );
      if ("note" in result) line(io, `Note: ${result.note}`);
    });

  evidence
    .command("test-plan")
    .description("Make a checklist for your own session in the product (what to do and capture)")
    .option(
      "--session <name>",
      "inbox session, for example session-02 (default: the next free one)",
    )
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(async (options: RunOption & { session?: string }) => {
      const result = await makeTestPlan(ctx(), options);
      noteRun(io, result);
      line(
        io,
        `Test plan for ${result.session}: ${result.steps.length} steps, saved to ${result.file}.`,
      );
      line(io, `Save your screenshots and notes into ${result.inbox}/`);
      for (const step of result.steps) {
        line(io);
        line(io, `${step.n}. ${step.title}`);
        for (const d of step.do) line(io, `   [ ] ${d}`);
        for (const c of step.capture) line(io, `   capture ${c.kind}: ${c.as}`);
      }
      for (const warning of result.warnings) line(io, `Note: ${warning}`);
    });

  evidence
    .command("dataset")
    .description("Make clearly fake sample data to type or upload in your own session")
    .option("--format <format>", "csv or json", "csv")
    .option("--rows <n>", "rows per table (1 to 50)", "5")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(async (options: RunOption & { format: string; rows: string }) => {
      const result = await makeTestDataset(ctx(), {
        run: options.run,
        format: options.format as "csv" | "json",
        rows: Number(options.rows),
      });
      noteRun(io, result);
      line(io, `Fake sample data for a ${result.category} product:`);
      for (const [i, table] of result.tables.entries()) {
        line(io, `  ${result.files[i]}  (${table.rows.length} rows) ${table.description}`);
      }
      line(io, result.note);
      for (const warning of result.warnings) line(io, `Note: ${warning}`);
    });

  evidence
    .command("import")
    .description(
      "Turn the screenshots, notes and HAR files of an inbox session into observed evidence",
    )
    .argument("<session>", "inbox session folder, for example session-01")
    .option("--subject <node>", "node for items that name none (default: the product node)")
    .option("--dry-run", "only show what would be imported")
    .option("--delete-har", "delete the raw .har files after import (they hold secrets)")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(
      async (
        session: string,
        options: RunOption & { subject?: string; dryRun?: boolean; deleteHar?: boolean },
      ) => {
        const result = await importInbox(ctx(), {
          run: options.run,
          session,
          subject: options.subject,
          dry_run: options.dryRun,
          delete_raw_har: options.deleteHar,
        });
        noteRun(io, result);
        line(io, result.summary);
        for (const item of result.items) {
          const status =
            item.status === "new"
              ? (item.record ?? "new")
              : item.status === "skipped"
                ? `skipped: ${item.reason}`
                : "already imported";
          const subject = item.subject ? ` -> ${item.subject}` : "";
          line(
            io,
            `  ${item.kind.padEnd(10)} ${item.confidence}  ${item.file}${subject}  [${status}]`,
          );
          if (item.status === "new") line(io, `             "${item.finding}"`);
        }
        for (const file of result.deleted) line(io, `Deleted raw HAR ${file}.`);
        if (result.dry_run) line(io, "Dry run: nothing was imported.");
        for (const warning of result.warnings) line(io, `Note: ${warning}`);
      },
    );

  evidence
    .command("rea")
    .description("Store the saved result of a passive REA tool as evidence (optional REA bridge)")
    .argument("<tool>", "inspect_web_network_capture, inspect_web_page or analyze_web_bundle")
    .argument("<result-file>", "JSON or text file holding what the REA tool returned")
    .requiredOption("--subject <node>", "node the finding is about")
    .requiredOption("--source <where>", "what REA looked at: public url or capture file path")
    .requiredOption("--finding <text>", "what the result shows")
    .option("--confidence <label>", "observed, documented, inferred or unknown")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(
      async (
        tool: string,
        resultFile: string,
        options: RunOption & {
          subject: string;
          source: string;
          finding: string;
          confidence?: string;
        },
      ) => {
        const out = await recordReaResultFromFile(ctx(), { ...options, tool, file: resultFile });
        noteRun(io, out);
        line(
          io,
          `Recorded ${out.record.id} about ${out.record.subject} (${out.record.confidence}).`,
        );
        line(io, `Redacted REA result saved to ${out.file}.`);
        for (const warning of out.warnings) line(io, `Note: ${warning}`);
      },
    );
}
