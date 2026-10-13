import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** M10: what `npm pack` would put in the published package. Needs `npm run build` first. */
const built = existsSync("dist/cli.js") && existsSync("dist/dashboard/public/index.html");
if (!built) console.warn("Skipping the package contents test: run `npm run build` first.");

describe.skipIf(!built)("published package", () => {
  it("holds the CLI, dashboard, handbook, pipelines and templates, and no tests or fixtures", () => {
    const [pack] = JSON.parse(
      execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8" }),
    ) as Array<{ files: Array<{ path: string }> }>;
    const files = pack!.files.map((f) => f.path.replace(/\\/g, "/"));
    for (const path of [
      "package.json",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "dist/cli.js",
      "dist/dashboard/public/index.html",
      "handbook/SKILL.md",
      "pipelines/b2b-saas.json",
      "reports/templates/feature.md",
    ]) {
      expect(files, path).toContain(path);
    }
    expect(files.some((f) => f.startsWith("handbook/roles/"))).toBe(true);
    const unwanted = files.filter((f) =>
      /^(tests|examples|src|docs|\.github)\/|\.test\.|fixtures|\.har$|\.env/.test(f),
    );
    expect(unwanted).toEqual([]);
  });
});
