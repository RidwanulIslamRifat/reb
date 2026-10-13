import type { Brief } from "./brief.js";
import type { LedgerRecord } from "./evidence.js";
import type { GraphNode } from "./node.js";

/**
 * make_test_plan (SPEC 9 Hands-on): a numbered checklist for the human's own session in the product,
 * built from the graph's journeys and open questions. reb never uses the product itself (SPEC 2.3);
 * the checklist only says what the human does and what to capture into the inbox.
 */

export interface Capture {
  kind: "screenshot" | "note" | "har";
  /** File name to save, or the note line to write, so import_inbox can link it to a node. */
  as: string;
}

export interface TestStep {
  n: number;
  kind: "setup" | "journey" | "question" | "feature";
  title: string;
  do: string[];
  capture: Capture[];
  /** Node ids this step gathers observed evidence for. */
  covers: string[];
}

export interface TestPlan {
  session: string;
  steps: TestStep[];
  warnings: string[];
}

const byName = (a: GraphNode, b: GraphNode) =>
  a.meta.name.localeCompare(b.meta.name) || a.meta.id.localeCompare(b.meta.id);

/** Ids of nodes that already have observed evidence from the user's own session. */
function observedSubjects(records: LedgerRecord[]): Set<string> {
  return new Set(
    records.flatMap((r) =>
      r.kind === "evidence" && r.confidence === "observed" ? [r.subject] : [],
    ),
  );
}

export function buildTestPlan(input: {
  brief: Brief;
  nodes: GraphNode[];
  records: LedgerRecord[];
  session: string;
}): TestPlan {
  const { brief, nodes, records, session } = input;
  const byId = new Map(nodes.map((n) => [n.meta.id, n]));
  const nameOf = (id: string) => byId.get(id)?.meta.name ?? id;
  const inbox = `evidence/inbox/${session}/`;
  const tier = brief.plan_tier || "the plan you have";
  const steps: TestStep[] = [];
  const add = (step: Omit<TestStep, "n">) => steps.push({ n: steps.length + 1, ...step });

  add({
    kind: "setup",
    title: "Before you start",
    do: [
      `Sign in yourself, on ${tier}. reb and your agent never log in or click for you.`,
      'Use only the fake sample data from "reb evidence dataset" (names like "Test User 01", @example.com emails).',
      "Never capture passwords, tokens, payment details or other people's data. Crop or skip such screens.",
      `Save every screenshot and note into ${inbox}`,
      "Optional: record the browser's network traffic (DevTools > Network > Save all as HAR) into the same folder. " +
        "reb strips cookies, auth headers and tokens on import and never keeps the raw file's secrets.",
    ],
    capture: [{ kind: "har", as: "session.har (optional)" }],
    covers: [],
  });

  const journeys = nodes.filter((n) => n.meta.type === "journey").sort(byName);
  const gatedTier = (featureId: string) => byId.get(featureId)?.meta.links.gated_by ?? [];
  const covered = new Set<string>();
  for (const journey of journeys) {
    const id = journey.meta.id;
    const personas = nodes
      .filter((n) => n.meta.links.does?.includes(id))
      .map((n) => n.meta.name)
      .sort();
    const features = journey.meta.links.uses ?? [];
    const doLines = [
      personas.length
        ? `Act as ${personas.join(" or ")} and go through "${journey.meta.name}" from start to end.`
        : `Go through "${journey.meta.name}" from start to end.`,
      ...features.map((f, i) => {
        const tiers = gatedTier(f);
        const gate = tiers.length
          ? ` It may need ${tiers.map(nameOf).join(" or ")}; if it is locked on ${tier}, screenshot only the lock message.`
          : "";
        return `Step ${i + 1}: use "${nameOf(f)}".${gate}`;
      }),
      "Write down anything surprising: extra steps, errors, waiting, upgrade prompts.",
    ];
    add({
      kind: "journey",
      title: `Journey: ${journey.meta.name}`,
      do: doLines,
      capture: [
        ...features.map((f, i) => ({ kind: "screenshot" as const, as: `${f}--${i + 1}.png` })),
        { kind: "screenshot", as: `${id}--end.png` },
        { kind: "note", as: `- [${id}] how it went, in one or two sentences` },
      ],
      covers: [id, ...features],
    });
    covered.add(id);
    for (const f of features) covered.add(f);
  }

  const questions = nodes.filter((n) => n.meta.type === "question").sort(byName);
  for (const question of questions) {
    const id = question.meta.id;
    const about = question.meta.links.about ?? [];
    add({
      kind: "question",
      title: `Question: ${question.meta.name}`,
      do: [
        `Look for the answer in your own session${about.length ? `, around ${about.map(nameOf).join(", ")}` : ""}.`,
        "If you cannot find it, write that down too: it is a useful answer.",
      ],
      capture: [
        { kind: "screenshot", as: `${id}.png (if a screen shows the answer)` },
        { kind: "note", as: `- [${id}] the answer, or "not found"` },
      ],
      covers: [id],
    });
  }

  // Features not in any journey that have no observed evidence yet.
  const observed = observedSubjects(records);
  const loose = nodes
    .filter((n) => n.meta.type === "feature" && !covered.has(n.meta.id) && !observed.has(n.meta.id))
    .sort(byName);
  if (loose.length) {
    add({
      kind: "feature",
      title: "Other features to look at",
      do: loose.map((f) => {
        const tiers = gatedTier(f.meta.id);
        const gate = tiers.length ? ` (may need ${tiers.map(nameOf).join(" or ")})` : "";
        return `Find "${f.meta.name}"${gate} and check it does what the public pages say.`;
      }),
      capture: loose.flatMap((f) => [
        { kind: "screenshot" as const, as: `${f.meta.id}.png` },
        { kind: "note" as const, as: `- [${f.meta.id}] what you saw` },
      ]),
      covers: loose.map((f) => f.meta.id),
    });
  }

  const warnings: string[] = [];
  if (journeys.length === 0 && questions.length === 0) {
    warnings.push(
      "The graph has no journey or question nodes yet, so the checklist is short. " +
        "Map journeys first (feature_analyst role), then make the test plan again.",
    );
  }
  return { session, steps, warnings };
}

/** The checklist as Markdown for notes/test-plan-<session>.md. */
export function renderTestPlan(plan: TestPlan, product: string): string {
  const out = [
    `# Test plan for ${product}, ${plan.session}`,
    "",
    "Do these steps yourself in the product. Save captures into " +
      `\`evidence/inbox/${plan.session}/\`, then ask your agent to import the session ` +
      `(\`reb evidence import ${plan.session}\`).`,
    "",
    "Name screenshots as shown so reb links them to the right node. In a notes file (for example `notes.md`),",
    "write one finding per bullet and start it with the node in square brackets, like `- [feature-export] ...`.",
    "",
  ];
  for (const step of plan.steps) {
    out.push(`## ${step.n}. ${step.title}`, "");
    for (const line of step.do) out.push(`- [ ] ${line}`);
    if (step.capture.length) {
      out.push("", "Capture:");
      for (const c of step.capture) out.push(`- ${c.kind}: \`${c.as}\``);
    }
    out.push("");
  }
  for (const warning of plan.warnings) out.push(`> Note: ${warning}`, "");
  return out.join("\n");
}
