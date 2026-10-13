/** How CLI commands print. Tests pass their own `out` and `env`. */
export interface CliIo {
  out: (text: string) => void;
  env: NodeJS.ProcessEnv;
}

export const defaultIo: CliIo = {
  out: (text) => process.stdout.write(text),
  env: process.env,
};

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
