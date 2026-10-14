import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import { createRun } from "../../../workflows/runs.js";
import { line, type CliIo } from "../output.js";

export function registerNew(program: Command, io: CliIo): void {
  program
    .command("new")
    .description("Create a run for a product domain")
    .argument("<domain>", "the product's domain, for example example.com")
    .option(
      "--category <category>",
      "b2b-saas, developer-tool, marketplace, consumer-app, ai-tool, ecommerce, fintech, service-business or general-business",
    )
    .option("--reports <list>", "comma-separated: business, feature, market, build")
    .action(async (domain: string, options: { category?: string; reports?: string }) => {
      const reports = options.reports
        ?.split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      const run = await createRun(createContext("cli", io.env), {
        domain,
        ...(options.category ? { category: options.category } : {}),
        ...(reports ? { reports: reports } : {}),
      });
      line(io, `Created run ${run.slug}`);
      line(io, `Folder: ${run.paths.dir}`);
      line(io, `Next: open ${run.paths.brief} and fill in the brief.`);
    });
}
