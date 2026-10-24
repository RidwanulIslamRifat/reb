import { join } from "node:path";
import type { CapturedScreen } from "../domain/capture.js";
import {
  designDetail,
  designNotes,
  inferDesignModel,
  type DesignModel,
} from "../domain/designModel.js";
import { RebError } from "../domain/errors.js";
import type { NodeType } from "../domain/links.js";
import {
  entityKey,
  featureModelNotes,
  inferProductModel,
  type ProductModel,
} from "../domain/productModel.js";
import { readCaptureMaps, writeRunFile } from "../storage/inbox.js";
import type { Context } from "./context.js";
import { appendEvidence } from "./evidence.js";
import { linkNodes, loadGraph, upsertNode } from "./graph.js";
import { logged } from "./logging.js";
import { type RunRef } from "./logging.js";
import { readBrief, resolveRun } from "./runs.js";

/** A screen from capture.json; captures made before the deeper reading lack the newer parts. */
function withDefaults(s: Partial<CapturedScreen> & { id: string }): CapturedScreen {
  return {
    name: s.id,
    url: "",
    pattern: "/",
    depth: 0,
    file: "",
    title: "",
    headings: [],
    buttons: [],
    fields: [],
    columns: [],
    links_to: [],
    hints: [],
    nav: [],
    tabs: [],
    values: [],
    charts: 0,
    controls: [],
    notices: [],
    breadcrumbs: [],
    ...s,
    design: designDetail(s.design),
    // Older captures only have field labels: treat each as a text field.
    form_fields:
      s.form_fields ??
      (s.fields ?? []).map((label) => ({ label, kind: "text", required: false, options: [] })),
  };
}

/**
 * analyse_capture (ROADMAP "Deep feature extraction"): turns the screens of a `reb capture` into
 * the feature model an analyst would write after using every feature: modules, features with their
 * likely logic and data reuse, entities with attributes, states and relations, business rules,
 * roles and non-functional requirements. It writes notes/feature-model-<session>.md and adds the
 * model to the graph as inferred nodes, each with an inferred evidence record that links the
 * screenshots it comes from. Nodes that already exist are never changed (the analyst's work wins);
 * only missing links are added. `dry_run` writes nothing and returns the model.
 */
export async function analyseCapture(
  ctx: Context,
  input: { run?: string; session?: string; dry_run?: boolean },
) {
  const run = await resolveRun(ctx, input.run);
  return logged(
    ctx,
    "analyse_capture",
    run,
    { session: input.session, dry_run: input.dry_run },
    async () => {
      const maps = await readCaptureMaps(run.paths);
      if (!maps.length) {
        throw new RebError(
          "This run has no captured screens yet.",
          'Capture the product first with "reb capture <login-url>", then run this again.',
        );
      }
      const chosen = input.session
        ? maps.find((m) => m.session === input.session)
        : maps[maps.length - 1];
      if (!chosen) {
        throw new RebError(
          `There is no capture in ${input.session}.`,
          `Use one of: ${maps.map((m) => m.session).join(", ")}.`,
        );
      }
      let parsed: { screens?: Array<Partial<CapturedScreen> & { id: string }> };
      try {
        parsed = JSON.parse(chosen.text) as typeof parsed;
      } catch {
        throw new RebError(
          `evidence/imports/${chosen.session}/capture.json cannot be read.`,
          "Capture the product again with reb capture.",
        );
      }
      const screens = (parsed.screens ?? [])
        .filter((s) => s && typeof s.id === "string")
        .map(withDefaults);
      const model = inferProductModel(screens);
      const design = inferDesignModel(screens);
      const session = chosen.session;
      const notes = `notes/feature-model-${session}.md`;
      const graph = await loadGraph(run.paths);
      // The observed screenshot evidence of each screen, so inferred records can link it.
      const shot: Record<string, string> = {};
      for (const r of graph.records) {
        if (
          r.kind === "evidence" &&
          r.subject &&
          screens.some((s) => s.id === r.subject) &&
          !shot[r.subject]
        ) {
          shot[r.subject] = r.id;
        }
      }
      const summary = {
        ...summarise(model),
        tokens: design.tokens.length,
        patterns: design.patterns.length,
      };
      if (input.dry_run) {
        const nothing = {
          created: [] as string[],
          kept: [] as string[],
          links: 0,
          evidence: [] as string[],
        };
        return {
          ...run,
          session,
          notes,
          dry_run: true,
          ...summary,
          ...nothing,
          model: model as ProductModel | undefined,
        };
      }

      const { brief } = await readBrief(run);
      await writeRunFile(
        join(run.paths.dir, ...notes.split("/")),
        featureModelNotes({ product: brief.product, session, model, screens, evidence: shot }) +
          designNotes(design),
      );
      const writer = new GraphWriter(
        ctx,
        run,
        new Set(graph.nodes.map((n) => n.meta.id)),
        shot,
        notes,
      );
      await writeModel(writer, model, graph.nodes.find((n) => n.meta.type === "product")?.meta.id);
      await writeDesign(writer, design);
      return {
        ...run,
        session,
        notes,
        ...summary,
        created: writer.created,
        kept: writer.kept,
        links: writer.links,
        evidence: writer.evidence,
        dry_run: false,
        model: undefined as ProductModel | undefined,
      };
    },
  );
}

function summarise(model: ProductModel) {
  return {
    modules: model.modules.length,
    features: model.features.length,
    entities: model.entities.length,
    rules: model.rules.length,
    roles: model.roles.length,
    requirements: model.nfrs.length,
  };
}

/** Writes inferred nodes and links, keeping every node that already exists as it is. */
class GraphWriter {
  created: string[] = [];
  kept: string[] = [];
  links = 0;
  evidence: string[] = [];
  constructor(
    private ctx: Context,
    private run: RunRef,
    private existing: Set<string>,
    private shot: Record<string, string>,
    private notes: string,
  ) {}

  /** Findings name things in words: a digit in a finding would need a dated source (validate_graph). */
  async node(
    type: NodeType,
    id: string,
    name: string,
    fields: Record<string, unknown>,
    body: string,
    finding: string,
    screens: string[],
    measured = false,
  ) {
    if (this.existing.has(id)) {
      if (!this.kept.includes(id)) this.kept.push(id);
      return;
    }
    await upsertNode(this.ctx, {
      run: this.run.paths.dir,
      type,
      id,
      name,
      label: measured ? "observed" : "inferred",
      fields,
      body,
    });
    this.existing.add(id);
    this.created.push(id);
    const links = [...new Set(screens.map((s) => this.shot[s]).filter((x): x is string => !!x))];
    const { record } = await appendEvidence(this.ctx, this.run, {
      role: "feature_analyst",
      subject: id,
      operation: measured ? "measure_from_capture" : "infer_from_capture",
      source: this.notes,
      finding,
      confidence: measured ? "observed" : "inferred",
      limitations: measured
        ? [
            "Measured from the computed styles of the captured screens at one window size; names such as Primary are reb's reading of where a value is used.",
            "Hover, focus and pressed states need interaction, which capture never does; check them by hand.",
          ]
        : [
            "Inferred from captured screens (labels, fields, columns, buttons), not from using the feature; confirm by hand.",
          ],
      links,
    });
    this.evidence.push(record.id);
    await this.link(id, "evidence", record.id);
  }

  async link(from: string, type: string, to: string) {
    if (!this.existing.has(from) || (!this.existing.has(to) && !/^[ES]-\d+$/.test(to))) return;
    const result = await linkNodes(this.ctx, { run: this.run.paths.dir, from, type, to }).catch(
      () => null,
    );
    if (result?.changed) this.links++;
  }
}

/** Design tokens and UX patterns are measurements of the captured screens, so they are observed. */
async function writeDesign(w: GraphWriter, design: DesignModel) {
  for (const t of design.tokens) {
    await w.node(
      "design_token",
      t.id,
      t.name,
      { category: t.category, value: t.value, usage: t.usage },
      `\n# ${t.name}\n\n\`${t.value}\`: ${t.usage}.\n`,
      `${t.name} (${t.category}) measures ${t.value}: ${t.usage}.`,
      t.screens,
      true,
    );
  }
  for (const p of design.patterns) {
    const fields = {
      kind: p.kind,
      ...(p.anatomy ? { anatomy: p.anatomy } : {}),
      ...(p.variants.length ? { variants: p.variants } : {}),
      ...(p.states.length ? { states: p.states } : {}),
    };
    await w.node(
      "ux_pattern",
      p.id,
      p.name,
      fields,
      `\n# ${p.name}\n\nA ${p.kind} pattern measured on the captured screens.\n` +
        bullets("Variants", p.variants) +
        bullets("States", p.states),
      `${p.name} (${p.kind})${p.anatomy ? `: ${p.anatomy}` : ""}.`,
      p.screens,
      true,
    );
    for (const s of p.screens) await w.link(p.id, "appears_on", s);
  }
}

const bullets = (title: string, items: string[]) =>
  items.length ? `\n## ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}\n` : "";

async function writeModel(w: GraphWriter, model: ProductModel, product?: string) {
  const entityByKey = new Map(model.entities.map((e) => [entityKey(e.name), e]));
  const entityId = (key: string) => entityByKey.get(key)?.id;
  for (const m of model.modules) {
    await w.node(
      "module",
      m.id,
      m.name,
      {},
      `\n# ${m.name}\n\nA main area of the product, inferred from its menu and addresses.\n`,
      `${m.name} is a main area of the product (from the captured menu and addresses).`,
      m.screens,
    );
    if (product) await w.link(product, "has", m.id);
  }
  for (const e of model.entities) {
    const fields = e.attributes.map((a) => ({
      name: a.name,
      type:
        a.type === "reference"
          ? `link to ${entityByKey.get(a.refers_to ?? "")?.name ?? a.refers_to}`
          : a.type,
      required: a.required,
      ...(a.options.length ? { choices: a.options } : {}),
    }));
    const body =
      `\n# ${e.name}\n\nInferred from the captured screens${e.implied ? " (implied by owner, assignee or team fields)" : ""}.\n` +
      bullets(
        "Relations",
        e.relations.map(
          (r) => `${r.kind.replace("_", " ")} ${entityByKey.get(r.to)?.name ?? r.to} (${r.via})`,
        ),
      ) +
      bullets("What users can do", e.operations);
    await w.node(
      "data_object",
      e.id,
      e.name,
      { fields, ...(e.states.length ? { states: e.states } : {}) },
      body,
      `${e.name} is a record type${e.attributes.length ? ` with ${e.attributes.map((a) => a.name).join(", ")}` : ""}${e.states.length ? `; states ${e.states.join(", ")}` : ""}.`,
      e.screens,
    );
  }
  for (const e of model.entities) {
    for (const r of e.relations) {
      const to = entityId(r.to);
      if (to && to !== e.id) await w.link(e.id, "relates_to", to);
    }
  }
  for (const f of model.features) {
    const body =
      `\n# ${f.name}\n\n${f.summary}\n` +
      bullets("Check by using it", f.questions) +
      "\nInferred from the captured screens; the fields logic, data_use and acceptance hold the analysis.\n";
    await w.node(
      "feature",
      f.id,
      f.name,
      {
        acceptance: f.acceptance,
        logic: f.logic,
        data_use: f.data_use,
        priority: f.kind === "settings" || f.kind === "content" ? "should" : "must",
      },
      body,
      `${f.name} is a ${f.kind.replace(/_/g, " ")} feature of the ${f.module} area.`,
      f.screens,
    );
    const m = model.modules.find((x) => x.name === f.module);
    if (m) await w.link(m.id, "has", f.id);
    for (const e of f.entities) await w.link(f.id, "reads_writes", e);
  }
  for (const [screen, features] of Object.entries(model.screen_features)) {
    for (const f of features) await w.link(screen, "shows", f);
  }
  for (const e of model.entities) for (const s of e.screens) await w.link(s, "shows", e.id);
  for (const r of model.rules) {
    await w.node(
      "business_rule",
      r.id,
      r.name,
      { kind: r.kind },
      `\n# ${r.name}\n\n${r.text}\n`,
      `${r.name} is a ${r.kind} rule seen on the captured screens.`,
      r.screens,
    );
    for (const g of r.governs) await w.link(r.id, "governs", g);
  }
  for (const r of model.roles) {
    await w.node(
      "user_role",
      r.id,
      r.name,
      {},
      `\n# ${r.name}\n\nA user role seen on the captured screens.\n`,
      `${r.name} is a user role.`,
      r.screens,
    );
    for (const f of model.features.filter((x) => x.kind === "user_management"))
      await w.link(r.id, "can", f.id);
  }
  for (const n of model.nfrs) {
    await w.node(
      "requirement",
      n.id,
      n.name,
      {
        kind: "non_functional",
        statement: n.statement,
        category: n.category,
        priority: n.priority,
      },
      `\n# ${n.name}\n\n${n.statement}\n\nWhy: ${n.why} (${n.basis === "seen" ? "pointed to by the captured screens" : "baseline for this kind of product"}).\n`,
      `${n.name} is a ${n.category} requirement (${n.basis === "seen" ? "pointed to by the screens" : "baseline"}).`,
      n.screens,
    );
    if (product) await w.link(n.id, "specifies", product);
  }
}
