import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import {
  listEvidence,
  recordEvidence,
  recordSourceFromFile,
  recordSource,
} from "../../../workflows/evidence.js";
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
}
