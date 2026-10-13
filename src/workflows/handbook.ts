import { RebError } from "../domain/errors.js";
import { parseRoleFile, splitFrontMatter, type RoleFile } from "../domain/handbook.js";
import { listHandbookFiles, readHandbookFile } from "../storage/handbook.js";

async function requireFile(relative: string): Promise<string> {
  const text = await readHandbookFile(relative);
  if (text === null) {
    throw new RebError(
      `The handbook file handbook/${relative} is missing from this copy of reb.`,
      "Reinstall reb (npx @ridwanul/reb setup), or restore the file from the reb repository.",
    );
  }
  return text;
}

/** One role's prompt file (SPEC 7): its allowed tools and instructions. */
export async function getRoleFile(role: string): Promise<RoleFile> {
  const text = await requireFile(`roles/${role}.md`);
  try {
    return parseRoleFile(text);
  } catch (error) {
    throw new RebError(
      `The handbook file handbook/roles/${role}.md cannot be read: ${(error as Error).message.split("\n")[0]}.`,
      "Fix its front matter (role, description, tools), or reinstall reb.",
    );
  }
}

/** The main skill text without its front matter; the MCP server sends it as its instructions. */
export async function getSkillBody(): Promise<string> {
  return splitFrontMatter(await requireFile("SKILL.md")).body.trim();
}

/** Every handbook file setup installs, as { path relative to handbook/, text }. */
export async function handbookBundle(): Promise<Array<{ path: string; text: string }>> {
  const files = await listHandbookFiles();
  return Promise.all(files.map(async (path) => ({ path, text: await requireFile(path) })));
}
