import { z } from "zod";

/** Report types reb can produce (SPEC 1, 11). */
export const REPORT_TYPES = ["business", "feature", "market", "build"] as const;
export const ReportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof ReportTypeSchema>;

/**
 * The brief (SPEC 5): what is analysed and why.
 * `plan_tier` is the product's pricing plan the analyst has access to (ROADMAP decision 15).
 */
export const BriefSchema = z.object({
  product: z.string().min(1),
  url: z.string().min(1),
  category: z.string().default(""),
  reports: z.array(ReportTypeSchema).default([]),
  focus_questions: z.array(z.string().min(1)).default([]),
  plan_tier: z.string().default(""),
  deadline: z.string().default(""),
});
export type Brief = z.infer<typeof BriefSchema>;

/** Fields a caller may change with update_brief. */
export const BriefUpdateSchema = BriefSchema.partial();
export type BriefUpdate = z.infer<typeof BriefUpdateSchema>;

const BRIEF_KEYS = Object.keys(BriefSchema.shape) as (keyof Brief)[];

/**
 * brief.md = front matter + guidance for the analyst.
 * Each front-matter value is written as JSON, which is also valid YAML, so later
 * milestones can read it with a YAML library without changing the format.
 */
export function renderBrief(brief: Brief, notes = DEFAULT_BRIEF_NOTES): string {
  const lines = BRIEF_KEYS.map((key) => `${key}: ${JSON.stringify(brief[key])}`);
  return `---\n${lines.join("\n")}\n---\n${notes}`;
}

export const DEFAULT_BRIEF_NOTES = `
# Brief

Edit the values between the \`---\` lines, keeping the quotes and square brackets.

- **product**: the product's name or domain.
- **url**: the product's public home page.
- **category**: b2b-saas, developer-tool, marketplace, consumer-app or ai-tool.
- **reports**: any of "business", "feature", "market", "build".
- **focus_questions**: what you most want answered, for example ["Who is the main buyer?"].
- **plan_tier**: the product's pricing plan you can use yourself, for example "Free trial".
  Features above it can only be documented or inferred, never observed.
- **deadline**: when you need the analysis, for example "2026-11-01".

Write anything else you want the analysis to know below this line.
`;

/** Reads brief.md. Throws a plain Error with a reason; the caller adds the file path. */
export function parseBrief(text: string): { brief: Brief; notes: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("the --- lines around the values at the top are missing");
  const raw: Record<string, unknown> = {};
  for (const line of match[1]!.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`line "${line}" is not "name: value"`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    try {
      raw[key] = value === "" ? undefined : JSON.parse(value);
    } catch {
      throw new Error(`the value of "${key}" needs quotes, for example ${key}: "text"`);
    }
  }
  const result = BriefSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return { brief: result.data, notes: match[2]! };
}
