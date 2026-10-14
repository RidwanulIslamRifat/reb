import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** Report types reb can produce (SPEC 1, 11); the last five are v2. */
export const REPORT_TYPES = [
  "business",
  "feature",
  "market",
  "build",
  "due_diligence",
  "risk",
  "strategy",
  "technical",
  "rebuild",
] as const;
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
 * Each front-matter value is written as JSON, which is also valid YAML; it is read back as YAML,
 * so hand edits without quotes work too.
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
- **category**: b2b-saas, developer-tool, marketplace, consumer-app, ai-tool, ecommerce, fintech,
  service-business or general-business.
- **reports**: any of "business", "feature", "market", "build", "due_diligence", "risk",
  "strategy", "technical", "rebuild".
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
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]!);
  } catch (error) {
    throw new Error(`the values are not valid YAML (${(error as Error).message.split("\n")[0]})`, {
      cause: error,
    });
  }
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new Error('the values must be "name: value" lines');
  }
  // An empty value ("deadline:") means "not set", so the default applies.
  const raw = Object.fromEntries(
    Object.entries((parsed ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v ?? undefined]),
  );
  const result = BriefSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return { brief: result.data, notes: match[2]! };
}

/**
 * Warnings about a brief that is still mostly empty, shown by create_plan and run_audit.
 * They do not stop the work: reb can plan from the category and reports alone.
 */
export function briefWarnings(brief: Brief, notes: string): string[] {
  const warnings: string[] = [];
  const untouched = notes.trim() === "" || notes.trim() === DEFAULT_BRIEF_NOTES.trim();
  if (untouched && !brief.plan_tier && !brief.deadline && brief.focus_questions.length === 0) {
    warnings.push(
      "brief.md is still empty: only the template text, with no focus questions, plan_tier, deadline or notes. " +
        "Fill it in so the plan and the audit match what you want to know.",
    );
  } else if (brief.focus_questions.length === 0) {
    warnings.push(
      "brief.md has no focus questions, so the plan has no focus tasks and the audit cannot check your own questions. " +
        'Add them to focus_questions, for example ["Who is the main buyer?"].',
    );
  }
  return warnings;
}
