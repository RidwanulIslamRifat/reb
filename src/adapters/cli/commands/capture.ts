import type { Command } from "commander";
import { CAPTURE_LIMITS } from "../../../domain/capture.js";
import { RebError } from "../../../domain/errors.js";
import { captureProduct } from "../../../workflows/capture.js";
import { createContext } from "../../../workflows/context.js";
import { hostOf, line, noteRun, type CliIo } from "../output.js";

/** What the person agrees to before a browser opens (SPEC 2.3 exception, ROADMAP decision 23). */
export const CAPTURE_CONSENT = [
  "reb capture will:",
  "  1. open a visible browser window with a fresh, empty profile (your own browser and its",
  "     saved passwords and cookies are not used);",
  "  2. wait while YOU log in to the product yourself; reb never sees or stores your password;",
  "  3. then open the product's own links one at a time, slowly, and save a screenshot and the",
  "     visible labels of each screen in this run's evidence inbox;",
  "  4. never click buttons, type, submit forms, download files, or open links that could change",
  "     something (sign out, delete, pay, export, confirm ...), other sites or private APIs;",
  "  5. close the window and forget the login when it is done.",
  "Use a test account with sample data if you can: screenshots show what your account shows.",
  "Only capture a product you are allowed to use this way (check its terms of use).",
];

const number = (value: string) => {
  if (!/^\d+$/.test(value))
    throw new RebError(`"${value}" is not a whole number.`, "Give a number like 25.");
  return Number(value);
};

export function registerCapture(program: Command, io: CliIo): void {
  program
    .command("capture")
    .description(
      "After you agree and log in yourself, open the product's links in a visible browser and screenshot each screen",
    )
    .argument("[url]", "the product's login or start page (default: the brief's url)")
    .option(
      "--pages <n>",
      `most screens to capture (default ${CAPTURE_LIMITS.pages}, at most ${CAPTURE_LIMITS.maxPages})`,
    )
    .option(
      "--depth <n>",
      `how many links away from the first screen (default ${CAPTURE_LIMITS.depth})`,
    )
    .option(
      "--delay <ms>",
      `wait between screens in milliseconds (default ${CAPTURE_LIMITS.delayMs})`,
    )
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(
      async (
        url: string | undefined,
        options: { pages?: string; depth?: string; delay?: string; run?: string },
      ) => {
        const { ask } = hostOf(io);
        for (const text of CAPTURE_CONSENT) line(io, text);
        const answer = (await ask("Start the capture? [y/N] ")).trim().toLowerCase();
        if (answer !== "y" && answer !== "yes") {
          line(io, "Nothing was opened. (reb capture needs a yes typed in a terminal.)");
          return;
        }
        const result = await captureProduct(
          createContext("cli", io.env),
          {
            run: options.run,
            url,
            pages: options.pages === undefined ? undefined : number(options.pages),
            depth: options.depth === undefined ? undefined : number(options.depth),
            delay_ms: options.delay === undefined ? undefined : number(options.delay),
          },
          {
            waitForUser: async (message) => {
              line(io, message);
              await ask("Press Enter when you are logged in... ");
            },
            say: (text) => line(io, text),
          },
        );
        noteRun(io, result);
        line(
          io,
          `Captured ${result.screens.length} screen${result.screens.length === 1 ? "" : "s"} into ` +
            `evidence/inbox/${result.session}/ and added them as screen nodes with ${result.evidence.length} evidence records.`,
        );
        if (result.skipped)
          line(io, `${result.skipped} links were not opened (risky, files or private APIs).`);
        line(io, `Sitemap and what each screen suggests: ${result.notes}`);
        const m = result.feature_model;
        line(
          io,
          `Feature model: ${m.modules} modules, ${m.features} features, ${m.entities} entities, ${m.rules} ` +
            `rules and ${m.requirements} non-functional requirements, in ${m.notes} (added as inferred nodes).`,
        );
        line(
          io,
          'Next: ask your agent to check the feature model against the screenshots, then "reb report requirements".',
        );
      },
    );
}
