import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import {
  buildGraph,
  getNode,
  linkNodes,
  queryGraph,
  upsertNode,
} from "../../../workflows/graph.js";
import { validateGraph } from "../../../workflows/validate.js";
import { getFramework } from "../../../workflows/frameworks.js";
import { FRAMEWORKS } from "../../../domain/frameworks.js";
import { RebError } from "../../../domain/errors.js";
import { TYPE_FIELDS } from "../../../domain/nodeFields.js";
import { line, noteRun, type CliIo } from "../output.js";

type RunOption = { run?: string };
const RUN_HELP = "run name or folder (default: the most recently changed)";

export function registerKb(program: Command, io: CliIo): void {
  const kb = program.command("kb").description("Work with the knowledge graph");
  const ctx = () => createContext("cli", io.env);

  kb.command("add")
    .description("Create or update a node (kb/nodes/<id>.md)")
    .argument("<type>", "node type, for example feature")
    .argument("<name...>", "the node's name, for example CSV export")
    .requiredOption("--label <label>", "observed, provided, documented, inferred or unknown")
    .option("--id <id>", "node id (default: <type>-<name in kebab case>)")
    .option(
      "--field <key=value>",
      "a typed field, for example --field likelihood=high (repeat for more; a=x,y makes a list)",
      (value: string, all: string[] = []) => [...all, value],
    )
    .option("--run <name>", RUN_HELP)
    .action(
      async (
        type: string,
        name: string[],
        options: RunOption & { label: string; id?: string; field?: string[] },
      ) => {
        const { field, ...rest } = options;
        const result = await upsertNode(ctx(), {
          ...rest,
          type,
          name: name.join(" "),
          ...(field?.length ? { fields: parseFieldOptions(field) } : {}),
        });
        noteRun(io, result);
        const id = result.node.meta.id;
        line(
          io,
          `${result.created ? "Created" : "Updated"} node ${id} (${result.paths.node(id)}).`,
        );
        for (const warning of result.warnings) line(io, `Note: ${warning}`);
      },
    );

  kb.command("framework")
    .description("Show an analysis framework drawn from the graph (SWOT, risk register, ...)")
    .argument("<name>", FRAMEWORKS.join(", "))
    .option("--run <name>", RUN_HELP)
    .action(async (name: string, options: RunOption) => {
      const result = await getFramework(ctx(), { ...options, framework: name });
      noteRun(io, result);
      line(io, `# ${result.title}`);
      line(io, "");
      line(io, result.about);
      line(io, "");
      line(io, result.markdown);
    });

  kb.command("link")
    .description("Link two nodes, or a node to an E-/S- id with the evidence link")
    .argument("<from>", "node id the link starts at")
    .argument("<type>", "link type, for example has, uses, evidence")
    .argument("<to>", "node id or E-/S- id")
    .option("--run <name>", RUN_HELP)
    .action(async (from: string, type: string, to: string, options: RunOption) => {
      const result = await linkNodes(ctx(), { ...options, from, type, to });
      noteRun(io, result);
      line(
        io,
        result.changed
          ? `Linked ${from} ${type} ${to}.`
          : `${from} already ${type} ${to}. Nothing changed.`,
      );
    });

  kb.command("show")
    .description("Show one node with its links and evidence")
    .argument("<id>", "node id")
    .option("--run <name>", RUN_HELP)
    .action(async (id: string, options: RunOption) => {
      const result = await getNode(ctx(), { ...options, id });
      noteRun(io, result);
      const { meta } = result.node;
      line(io, `${meta.id}  ${meta.name}  (${meta.type}, ${meta.label})`);
      line(io, "Links out:");
      if (result.outgoing.length === 0) line(io, "  none");
      for (const l of result.outgoing) {
        line(
          io,
          `  ${l.type} ${l.to}${l.name ? `  ${l.name}` : ""}${l.exists ? "" : "  (missing)"}`,
        );
      }
      line(io, "Links in:");
      if (result.incoming.length === 0) line(io, "  none");
      for (const l of result.incoming) line(io, `  ${l.from} ${l.type}  (${l.name})`);
      line(io, "Evidence:");
      if (result.evidence.length === 0) line(io, "  none");
      for (const r of result.evidence) {
        const tail = r.corrected_by ? `  [corrected by ${r.corrected_by}]` : "";
        line(
          io,
          r.kind === "source"
            ? `  ${r.id}  ${r.title}  ${r.url}${tail}`
            : `  ${r.id}  ${r.confidence}  "${r.finding}"${tail}`,
        );
      }
    });

  kb.command("query")
    .description("Find nodes by type, label, text or link")
    .option("--type <type>", "only nodes of this type")
    .option("--label <label>", "only nodes with this label")
    .option("--text <text>", "only nodes whose id or name contains this text")
    .option("--linked-to <id>", "only nodes linked to or from this node")
    .option("--run <name>", RUN_HELP)
    .action(
      async (
        options: RunOption & { type?: string; label?: string; text?: string; linkedTo?: string },
      ) => {
        const { linkedTo, ...rest } = options;
        const result = await queryGraph(ctx(), { ...rest, linked_to: linkedTo });
        noteRun(io, result);
        if (result.nodes.length === 0) line(io, "No nodes match.");
        for (const m of result.nodes) line(io, `${m.id}  ${m.name}  (${m.type}, ${m.label})`);
      },
    );

  kb.command("build")
    .description("Write kb/graph.json and kb/stats.json")
    .option("--run <name>", RUN_HELP)
    .action(async (options: RunOption) => {
      const result = await buildGraph(ctx(), options);
      noteRun(io, result);
      for (const file of result.files) line(io, `Wrote ${file}`);
    });

  kb.command("stats")
    .description("Write kb/graph.json and kb/stats.json, then show the counts")
    .option("--run <name>", RUN_HELP)
    .action(async (options: RunOption) => {
      const { stats, ...result } = await buildGraph(ctx(), options);
      noteRun(io, result);
      const nonZero = (counts: Record<string, number>) =>
        Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k} ${n}`)
          .join(", ") || "none";
      line(io, `Nodes: ${stats.nodes.total} (${nonZero(stats.nodes.by_type)})`);
      line(io, `Labels: ${nonZero(stats.nodes_by_label)}`);
      line(io, `Links: ${stats.links.total} (${nonZero(stats.links.by_type)})`);
      line(
        io,
        `Ledger: ${stats.ledger.evidence} evidence, ${stats.ledger.sources} sources, ${stats.ledger.corrected} corrected`,
      );
      line(
        io,
        `Features with evidence: ${stats.features_with_evidence} of ${stats.features_total}`,
      );
      line(
        io,
        `Problems: ${stats.problems.total}${stats.problems.total ? ' (see "reb kb validate")' : ""}`,
      );
    });

  kb.command("validate")
    .description("Check the graph and ledger for problems")
    .option("--run <name>", RUN_HELP)
    .action(async (options: RunOption) => {
      const result = await validateGraph(ctx(), options);
      noteRun(io, result);
      result.problems.forEach((p, i) => {
        line(io, `${i + 1}. [${p.rule}] ${p.message}`);
        line(io, `   Fix: ${p.fix}`);
      });
      const count = result.problems.length;
      line(
        io,
        count === 0 ? "No problems found." : `${count} problem${count === 1 ? "" : "s"} found.`,
      );
    });
}

/**
 * --field key=value options as fields: "likelihood=high" -> { likelihood: "high" };
 * "investors=Acme Ventures,Beta Capital" -> a list; "key=" removes the field.
 */
export function parseFieldOptions(options: string[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const option of options) {
    const at = option.indexOf("=");
    if (at < 1) {
      throw new RebError(
        `"--field ${option}" is not key=value.`,
        "Write it like --field likelihood=high.",
      );
    }
    const key = option.slice(0, at).trim();
    const value = option.slice(at + 1).trim();
    const listy = LIST_FIELDS.has(key);
    fields[key] = value === "" ? null : listy ? value.split(",").map((v) => v.trim()) : value;
  }
  return fields;
}

/** Typed fields that hold a list of text. */
const LIST_FIELDS = new Set(
  Object.values(TYPE_FIELDS).flatMap((list) =>
    list!.filter((f) => f.kind === "list").map((f) => f.name),
  ),
);
