import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { RoleSchema } from "./plan.js";
import { REA_PASSIVE_TOOLS } from "./rea.js";

/** The skill's folder name in each agent, and the `name` in SKILL.md front matter. */
export const SKILL_NAME = "reb";

/** Front matter of handbook/roles/<role>.md: the role and its allowed reb tools (SPEC 7). */
export const RoleFileSchema = z.object({
  role: RoleSchema,
  description: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1),
  /**
   * Tools of the optional REA bridge the role may also use, only when the user has REA installed.
   * Only REA's passive tools can be listed here.
   */
  optional_tools: z.array(z.enum(REA_PASSIVE_TOOLS)).default([]),
});
export type RoleFile = z.infer<typeof RoleFileSchema> & { body: string };

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Splits a Markdown file into its YAML front matter and body. Throws when there is none. */
export function splitFrontMatter(text: string): { data: unknown; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) throw new Error("the --- lines around the front matter at the top are missing");
  return { data: parseYaml(match[1]!), body: match[2]! };
}

export function parseRoleFile(text: string): RoleFile {
  const { data, body } = splitFrontMatter(text);
  return { ...RoleFileSchema.parse(data), body };
}

/** True when a SKILL.md was written by reb (so setup may replace it). */
export function isRebSkill(text: string): boolean {
  try {
    return (splitFrontMatter(text).data as { name?: unknown } | null)?.name === SKILL_NAME;
  } catch {
    return false;
  }
}
