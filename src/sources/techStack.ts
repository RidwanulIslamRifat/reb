import { z } from "zod";
import { tagAttributes } from "./publicPage.js";
import signatureFile from "./techSignatures.json" with { type: "json" };

/** One tool reb can recognise, from src/sources/techSignatures.json (ROADMAP decision 13). */
const SignatureSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  meta: z.record(z.string(), z.string()).optional(),
  html: z.array(z.string()).optional(),
  cookies: z.array(z.string()).optional(),
  implies: z.array(z.string()).optional(),
});
export type Signature = z.infer<typeof SignatureSchema>;

export const SIGNATURES: readonly Signature[] = z
  .object({ signatures: z.array(SignatureSchema) })
  .parse(signatureFile).signatures;

export interface DetectedTech {
  name: string;
  category: string;
  /**
   * documented: the site names the tool itself (a response header or generator tag);
   * inferred: a clue in the HTML (a script address, a class name) or implied by another tool.
   */
  confidence: "documented" | "inferred";
  /** What gave it away, for the evidence record's limitations. */
  clues: string[];
}

export interface PageClues {
  html: string;
  /** Response headers, names in lower case. */
  headers: Record<string, string>;
  cookieNames?: string[];
}

const test = (pattern: string, value: string) => new RegExp(pattern, "i").test(value);

/** Finds the tools a page visibly uses, from its HTML, response headers and cookie names. */
export function detectTech(
  page: PageClues,
  signatures: readonly Signature[] = SIGNATURES,
): DetectedTech[] {
  const metas = tagAttributes(page.html, "meta");
  const found = new Map<string, DetectedTech>();
  for (const sig of signatures) {
    const named: string[] = [];
    const hinted: string[] = [];
    for (const [header, pattern] of Object.entries(sig.headers ?? {})) {
      const value = page.headers[header.toLowerCase()];
      if (value !== undefined && test(pattern, value)) named.push(`header ${header}: ${value}`);
    }
    for (const [name, pattern] of Object.entries(sig.meta ?? {})) {
      const meta = metas.find((m) => m.name?.toLowerCase() === name.toLowerCase());
      if (meta?.content && test(pattern, meta.content)) named.push(`meta ${name}: ${meta.content}`);
    }
    for (const pattern of sig.html ?? []) {
      const match = new RegExp(pattern, "i").exec(page.html);
      if (match) hinted.push(`page HTML contains "${match[0]}"`);
    }
    for (const pattern of sig.cookies ?? []) {
      const cookie = page.cookieNames?.find((c) => test(pattern, c));
      if (cookie) hinted.push(`sets a cookie named ${cookie}`);
    }
    if (named.length + hinted.length === 0) continue;
    found.set(sig.name, {
      name: sig.name,
      category: sig.category,
      confidence: named.length > 0 ? "documented" : "inferred",
      clues: [...named, ...hinted],
    });
  }
  // A tool implied by one that was found (Next.js implies React) is added as inferred.
  for (const sig of signatures) {
    if (!found.has(sig.name)) continue;
    for (const implied of sig.implies ?? []) {
      const target = signatures.find((s) => s.name === implied);
      if (!target || found.has(implied)) continue;
      found.set(implied, {
        name: implied,
        category: target.category,
        confidence: "inferred",
        clues: [`implied by ${sig.name}`],
      });
    }
  }
  return [...found.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}
