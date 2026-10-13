import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Host } from "../../domain/registration.js";

/** How CLI commands print and ask. Tests pass their own `out`, `env` and the optional fields. */
export interface CliIo {
  out: (text: string) => void;
  env: NodeJS.ProcessEnv;
  /** Asks the person a question and returns their answer ("" when nobody can answer). */
  ask?: (question: string) => Promise<string>;
  /** The person's home folder (default: the real one). */
  home?: string;
  /** Facts about the running reb used to register it with agents. */
  host?: Host;
  nodeVersion?: string;
}

/** Reads one answer from the terminal; with no terminal (for example in a script) the answer is "". */
async function askTerminal(question: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export const defaultIo: CliIo = {
  out: (text) => process.stdout.write(text),
  env: process.env,
};

export function hostOf(io: CliIo) {
  return {
    ask: io.ask ?? askTerminal,
    home: io.home ?? homedir(),
    host: io.host ?? {
      execPath: process.execPath,
      cliPath: resolve(process.argv[1] ?? "dist/cli.js"),
      platform: process.platform,
    },
    nodeVersion: io.nodeVersion ?? process.version,
  };
}

export function line(io: CliIo, text = ""): void {
  io.out(text + "\n");
}

/** Tells the person which run was used when they did not name one (ROADMAP decision 3). */
export function noteRun(io: CliIo, run: { slug: string; defaulted: boolean }): void {
  if (run.defaulted) {
    line(
      io,
      `Using run ${run.slug} (the most recently changed). Add --run <name> to pick another.`,
    );
  }
}
