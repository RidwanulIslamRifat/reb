// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Layers from docs/SPEC.md section 4. Dependencies point inward only:
// adapters/dashboard -> workflows -> storage/sources -> domain.
const layer = (name) => [`**/${name}`, `**/${name}/**`];

const fileAccess = {
  paths: ["fs", "fs/promises", "node:fs", "node:fs/promises"].map((name) => ({
    name,
    message: "Only the storage layer touches files (SPEC 4).",
  })),
};

function restrict(folder, forbidden, { noFiles = true } = {}) {
  return {
    files: [`src/${folder}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...(noFiles ? fileAccess : {}),
          patterns: [
            {
              group: forbidden.flatMap(layer),
              message: `The ${folder} layer must not import this layer (SPEC 4: dependencies point inward only).`,
            },
          ],
        },
      ],
    },
  };
}

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "coverage/", "tests/fixtures/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  restrict("domain", ["storage", "sources", "workflows", "adapters", "dashboard", "cli.js"]),
  restrict("storage", ["sources", "workflows", "adapters", "dashboard", "cli.js"], {
    noFiles: false,
  }),
  restrict("sources", ["storage", "workflows", "adapters", "dashboard", "cli.js"]),
  restrict("workflows", ["adapters", "dashboard", "cli.js"]),
  restrict("adapters", ["storage", "sources", "dashboard", "cli.js"]),
  restrict("dashboard", ["sources", "adapters", "cli.js"], { noFiles: false }),
  prettier,
);
