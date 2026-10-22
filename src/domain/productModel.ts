import type { CapturedScreen } from "./capture.js";
import { nodeIdFor } from "./node.js";
import type { NodeType } from "./links.js";

/**
 * The feature model (ROADMAP "Deep feature extraction"): what an analyst works out by using a
 * product, inferred from the captured screens. From the screens' addresses, headings, menus, form
 * fields, table columns, status values, buttons, tabs, charts and notices it works out:
 *
 * - the modules (main menu areas) and the features in each;
 * - the entities (data objects) with their attributes, attribute types, required fields, states
 *   and relations to other entities;
 * - what users can do with each entity (create, edit, search, filter, move between stages ...);
 * - how data is reused: which screens, entities and reports use each entity;
 * - the likely logic behind each feature, questions to confirm by using it, and acceptance criteria;
 * - business rules (required fields, limits, plan locks, stage flows) and roles;
 * - non-functional requirements the screens point to (performance, security, privacy, audit ...).
 *
 * Everything here is an inference from what the screens show, so every node made from it is
 * labelled inferred until the analyst confirms it. It is pure: no files, no browser.
 */

export const ATTRIBUTE_TYPES = [
  "text",
  "long text",
  "email",
  "phone",
  "url",
  "number",
  "money",
  "percent",
  "date",
  "boolean",
  "choice",
  "state",
  "tags",
  "file",
  "reference",
  "user",
  "identifier",
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const OPERATIONS = [
  "list",
  "view",
  "create",
  "edit",
  "delete",
  "search",
  "filter",
  "sort",
  "views",
  "bulk",
  "import",
  "export",
  "assign",
  "comment",
  "attach",
  "duplicate",
  "send",
  "move",
] as const;
export type Operation = (typeof OPERATIONS)[number];

export const FEATURE_KINDS = [
  "record_management",
  "workflow",
  "analytics",
  "automation",
  "communication",
  "collaboration",
  "user_management",
  "billing",
  "integrations",
  "settings",
  "customization",
  "content",
  "search",
  "other",
] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** Categories of non-functional requirements (ISO 25010 in plain words, plus configurability). */
export const NFR_CATEGORIES = [
  "performance",
  "scalability",
  "availability",
  "security",
  "privacy",
  "auditability",
  "usability",
  "accessibility",
  "interoperability",
  "portability",
  "localisation",
  "configurability",
  "maintainability",
  "compliance",
] as const;
export type NfrCategory = (typeof NFR_CATEGORIES)[number];

export interface Attribute {
  name: string;
  type: AttributeType;
  required: boolean;
  /** Choices or states seen for it. */
  options: string[];
  /** For a reference: the entity it points to. */
  refers_to?: string;
  /** Screen ids it was seen on. */
  seen_on: string[];
}

export interface Relation {
  /** Entity name. */
  to: string;
  /** belongs_to: this entity points to one `to`; has_many: one of this has many `to`. */
  kind: "belongs_to" | "has_many" | "linked";
  via: string;
}

export interface Entity {
  id: string;
  name: string;
  plural: string;
  screens: string[];
  attributes: Attribute[];
  states: string[];
  state_field?: string;
  relations: Relation[];
  operations: Operation[];
  /** Implied by other screens (for example User, from owner fields) rather than shown itself. */
  implied: boolean;
}

export interface Feature {
  id: string;
  name: string;
  kind: FeatureKind;
  module: string;
  screens: string[];
  entities: string[];
  operations: Operation[];
  summary: string;
  /** How it probably works: the logic behind it, as reasoned guesses. */
  logic: string[];
  /** How its data is reused elsewhere in the product. */
  data_use: string[];
  /** What to check by using it, to confirm or correct the guesses. */
  questions: string[];
  acceptance: string[];
}

export interface Module {
  id: string;
  name: string;
  screens: string[];
}

export interface Rule {
  id: string;
  name: string;
  kind: "limit" | "validation" | "permission" | "workflow" | "billing";
  text: string;
  /** Node ids it governs. */
  governs: string[];
  screens: string[];
}

export interface Nfr {
  id: string;
  name: string;
  category: NfrCategory;
  priority: "must" | "should" | "could";
  statement: string;
  /** What on the screens points to it; for a baseline, why products of this kind need it. */
  why: string;
  basis: "seen" | "baseline";
  screens: string[];
}

export interface ProductModel {
  modules: Module[];
  entities: Entity[];
  features: Feature[];
  rules: Rule[];
  roles: Array<{ id: string; name: string; screens: string[] }>;
  nfrs: Nfr[];
  /** Feature id per screen id: what each screen shows. */
  screen_features: Record<string, string[]>;
}

// ---------------------------------------------------------------------------------------------
// Words

/** Path parts that never name an entity. */
const GENERIC = new Set(
  (
    "app apps home index view views list lists all detail details overview new edit create objects " +
    "object records record lightning o r page pages s crm workspace workspaces w u my me en beta v1 " +
    "v2 v3 main default board boards table grid kanban tab tabs manage management p portal ui web " +
    "admin console org orgs team-space space spaces"
  ).split(" "),
);

/** Screen words per feature kind, tried in order. */
const KIND_WORDS: Array<{ kind: FeatureKind; words: RegExp }> = [
  {
    kind: "billing",
    words: /\b(billing|subscriptions?|pricing|plans?|usage|quotas?|seats?|invoices? history)\b/i,
  },
  {
    kind: "user_management",
    words: /\b(team|members?|users?|roles?|permissions?|access|invites?)\b/i,
  },
  {
    kind: "integrations",
    words:
      /\b(integrations?|marketplace|connected apps|app store|webhooks?|api keys?|developers?|connections?)\b/i,
  },
  {
    kind: "customization",
    words:
      /\b(properties|custom (fields?|objects?)|fields|schema|object settings|record types?|layouts?)\b/i,
  },
  {
    kind: "automation",
    words:
      /\b(workflows?|automations?|sequences?|rules?|triggers?|playbooks?|zaps?|flows?|bots?|scheduler|recipes?)\b/i,
  },
  {
    kind: "analytics",
    words:
      /\b(dashboards?|reports?|reporting|analytics|insights|forecasts?|charts?|metrics|kpis?|goals?)\b/i,
  },
  {
    kind: "communication",
    words:
      /\b(inbox|conversations?|messages?|emails?|chat|calls?|meetings?|notifications?|campaigns?|broadcasts?)\b/i,
  },
  {
    kind: "collaboration",
    words: /\b(comments?|mentions?|activity|activities|timeline|feed|notes?)\b/i,
  },
  {
    kind: "content",
    words: /\b(templates?|documents?|docs|files|knowledge base|articles?|snippets?|wiki|pages?)\b/i,
  },
  {
    kind: "settings",
    words: /\b(settings|preferences|configuration|profile|account settings|general)\b/i,
  },
];

const OP_WORDS: Array<{ op: Operation; words: RegExp }> = [
  { op: "create", words: /^(\+\s*)?(new|create|add)\b|^\+$/i },
  { op: "edit", words: /\b(edit|update|save|rename)\b/i },
  { op: "delete", words: /\b(delete|remove|archive|trash)\b/i },
  { op: "import", words: /\bimport\b/i },
  { op: "export", words: /\b(export|download)\b/i },
  { op: "assign", words: /\b(assign|reassign|change owner)\b/i },
  { op: "comment", words: /\b(comment|add note|log (activity|call|email|meeting))\b/i },
  { op: "attach", words: /\b(attach|upload)\b/i },
  { op: "duplicate", words: /\b(duplicate|clone|copy)\b/i },
  { op: "send", words: /\b(send|share|email)\b/i },
  {
    op: "move",
    words: /\b(move|convert|mark as|change (stage|status)|close (deal|won|lost)|qualify)\b/i,
  },
  { op: "filter", words: /^filters?\b|\badd filter\b/i },
  { op: "sort", words: /^sort\b/i },
];

/** State names that usually end a record's life. */
const END_STATE =
  /\b(closed|won|lost|done|complete(d)?|cancel+ed|paid|resolved|archived|rejected|unqualified|churned|declined|shipped|delivered)\b/i;

const STATE_NAME = /\b(status|stage|state|phase|lifecycle|pipeline stage)\b/i;
const USER_NAME =
  /\b(owner|assignee|assigned( to)?|created by|modified by|updated by|rep|sales rep|agent|manager|author|reporter)\b/i;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const title = (s: string) =>
  s
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** "companies" -> "company", "statuses" -> "status", "deals" -> "deal". */
export function singular(word: string): string {
  const w = word.trim();
  if (/ies$/i.test(w) && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/i.test(w)) return w.slice(0, -2);
  if (/[^s]s$/i.test(w) && !/(us|is|ss)$/i.test(w)) return w.slice(0, -1);
  return w;
}

/** "company" -> "companies", "deal" -> "deals". */
export function plural(word: string): string {
  const w = word.trim();
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(w)) return w + "es";
  return w + "s";
}

/** The comparable key of a name: lowercase singular words. "Sales Deals" -> "sales deal". */
export const entityKey = (name: string) => {
  const parts = words(name).split(" ").filter(Boolean);
  if (!parts.length) return "";
  parts[parts.length - 1] = singular(parts[parts.length - 1]!);
  return parts.join(" ");
};

const uniq = <T>(items: T[]) => [...new Set(items)];
const list = (items: string[], max = 6) =>
  items.length <= max
    ? items.join(", ")
    : `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
const safeId = (type: NodeType, name: string) => {
  try {
    return nodeIdFor(type, name);
  } catch {
    return `${type}-unnamed`;
  }
};

/** Path parts of a screen pattern that may name something: not ids, not generic, no digits. */
function meaningfulParts(pattern: string): string[] {
  return pattern
    .split("/")
    .filter(Boolean)
    .filter((p) => p !== ":id" && !/\d/.test(p) && !GENERIC.has(p.toLowerCase()) && p.length > 1);
}

const textOf = (s: CapturedScreen) =>
  [s.pattern.replace(/[/:_-]+/g, " "), s.title, s.name, ...s.headings, ...s.breadcrumbs].join(" ");

/** The feature kind a screen's words suggest, or null for a plain record screen. */
export function screenKind(s: CapturedScreen): FeatureKind | null {
  // The address and main heading decide first; secondary headings only when those say nothing.
  const main = [s.pattern.replace(/[/:_-]+/g, " "), s.name, s.headings[0] ?? ""].join(" ");
  for (const { kind, words: re } of KIND_WORDS) if (re.test(main)) return kind;
  if (s.charts > 0) return "analytics";
  for (const { kind, words: re } of KIND_WORDS) if (re.test(textOf(s))) return kind;
  return null;
}

const isDetail = (s: CapturedScreen) => s.pattern.split("/").includes(":id");
const isList = (s: CapturedScreen) =>
  !isDetail(s) && (s.columns.length >= 2 || s.controls.includes("pagination"));
const isForm = (s: CapturedScreen) =>
  s.form_fields.filter((f) => f.kind !== "search" && !/search/i.test(f.label)).length >= 2;

/** A short heading that can name an entity list: "Contacts", "Open deals" (1 to 3 words, no digits). */
const nounHeading = (h: string | undefined) =>
  !!h && /^[A-Za-z][A-Za-z &'-]{1,40}$/.test(h.trim()) && h.trim().split(/\s+/).length <= 3;

/** The entity a screen is about, or null. */
function entityNameOf(s: CapturedScreen): string | null {
  const kind = screenKind(s);
  if (kind && kind !== "collaboration" && kind !== "content") return null;
  const parts = meaningfulParts(s.pattern);
  if (isDetail(s)) {
    // The last meaningful part before the last id: /deals/:id -> deal; /contacts/:id/record/:id -> contact.
    const segs = s.pattern.split("/").filter(Boolean);
    const last = segs.lastIndexOf(":id");
    const before = segs
      .slice(0, last)
      .filter((p) => p !== ":id" && !/\d/.test(p) && !GENERIC.has(p.toLowerCase()) && p.length > 1);
    const seg = before[before.length - 1];
    return seg ? title(singular(seg)) : null;
  }
  if (!isList(s) && !isForm(s)) return null;
  const seg = parts[parts.length - 1];
  const heading = s.headings[0]?.trim() ?? "";
  // A one-word list heading ("Contacts") names the entity best; otherwise the address does.
  if (isList(s) && nounHeading(heading) && (!seg || !heading.includes(" ")))
    return title(singular(heading));
  if (seg) return title(singular(seg));
  return nounHeading(heading) ? title(singular(heading)) : null;
}

/** The type of an attribute, from its input kind, choices and name. */
export function attributeType(
  name: string,
  kind: string,
  options: string[],
  entityKeys: Set<string>,
): { type: AttributeType; refers_to?: string } {
  const n = name.toLowerCase();
  const k = kind.toLowerCase();
  if (STATE_NAME.test(n)) return { type: "state" };
  if (USER_NAME.test(n)) return { type: "user" };
  const key = entityKey(name);
  if (entityKeys.has(key)) return { type: "reference", refers_to: key };
  // "Associated company", "Primary contact": the last word names another entity.
  const lastWord = key.split(" ").pop() ?? "";
  if (lastWord && entityKeys.has(lastWord) && key.split(" ").length <= 3)
    return { type: "reference", refers_to: lastWord };
  const byKind: Record<string, AttributeType> = {
    email: "email",
    tel: "phone",
    url: "url",
    number: "number",
    range: "number",
    date: "date",
    "datetime-local": "date",
    time: "date",
    month: "date",
    checkbox: "boolean",
    file: "file",
    textarea: "long text",
  };
  if (byKind[k]) return { type: byKind[k]! };
  if (/e-?mail/.test(n)) return { type: "email" };
  if (/\b(phone|mobile|tel|fax)\b/.test(n)) return { type: "phone" };
  if (/\b(url|website|link|domain)\b/.test(n)) return { type: "url" };
  if (
    /\b(amount|price|total|revenue|value|cost|budget|mrr|arr|balance|fee|salary|deal size)\b/.test(
      n,
    )
  )
    return { type: "money" };
  if (/(%|\bpercent|\brate\b|\bprobability\b|\bscore\b)/.test(n)) return { type: "percent" };
  if (
    /\b(date|created|updated|modified|due|deadline|time|last|next|when|at|on|since|until)\b/.test(n)
  )
    return { type: "date" };
  if (/\b(count|qty|quantity|number of|age|size|employees|seats)\b/.test(n))
    return { type: "number" };
  if (/\b(tags?|labels?|keywords?)\b/.test(n)) return { type: "tags" };
  if (/\b(id|no|number|code|ref|reference|key|sku)\b|^#/.test(n)) return { type: "identifier" };
  if (/\b(description|notes?|comments?|body|message|summary|details)\b/.test(n))
    return { type: "long text" };
  if (/\b(attachment|file|image|photo|avatar|logo)\b/.test(n)) return { type: "file" };
  if (k === "select" || k === "radio" || options.length) return { type: "choice" };
  return { type: "text" };
}

/** Column headers that are controls, not attributes. */
const NOT_ATTRIBUTE = /^(actions?|select|select all|options|more|menu|#|\.\.\.|edit|delete|)$/i;

function operationsOf(screens: CapturedScreen[]): Operation[] {
  const ops = new Set<Operation>();
  for (const s of screens) {
    if (isList(s)) ops.add("list");
    if (isDetail(s)) ops.add("view");
    for (const b of s.buttons)
      for (const { op, words: re } of OP_WORDS) if (re.test(b.trim())) ops.add(op);
    for (const c of s.controls) {
      if (c === "search" || c === "filter" || c === "sort" || c === "views") ops.add(c);
      if (c === "bulk_select") ops.add("bulk");
    }
    if (isForm(s) && /\b(new|create|add)\b/i.test(s.pattern + " " + s.name)) ops.add("create");
    if (isForm(s) && /\bedit\b/i.test(s.pattern)) ops.add("edit");
  }
  return OPERATIONS.filter((o) => ops.has(o));
}

// ---------------------------------------------------------------------------------------------
// The model

/** Infers the feature model from the captured screens. */
export function inferProductModel(screens: CapturedScreen[]): ProductModel {
  // 1. Entities and the screens about each.
  const byKey = new Map<string, { name: string; screens: CapturedScreen[] }>();
  for (const s of screens) {
    const name = entityNameOf(s);
    if (!name) continue;
    const key = entityKey(name);
    if (!key) continue;
    const e = byKey.get(key) ?? { name, screens: [] };
    e.screens.push(s);
    byKey.set(key, e);
  }
  const keys = new Set(byKey.keys());
  const userish = screens.some(
    (s) =>
      s.columns.some((c) => USER_NAME.test(c)) ||
      s.form_fields.some((f) => USER_NAME.test(f.label)),
  );
  const teamScreens = screens.filter((s) => screenKind(s) === "user_management");
  if ((userish || teamScreens.length) && !keys.has("user")) keys.add("user");

  const entities: Entity[] = [];
  for (const [key, { name, screens: own }] of byKey) {
    const attrs = new Map<string, Attribute>();
    const add = (
      label: string,
      kind: string,
      required: boolean,
      options: string[],
      screen: string,
    ) => {
      const clean = label.replace(/\s*\*$/, "").trim();
      if (!clean || NOT_ATTRIBUTE.test(clean) || /search/i.test(clean) || clean.length > 50) return;
      const k = clean.toLowerCase();
      const others = new Set([...keys].filter((x) => x !== key));
      const typed = attributeType(clean, kind, options, others);
      const prev = attrs.get(k);
      if (prev) {
        prev.required ||= required;
        prev.options = uniq([...prev.options, ...options]);
        if (!prev.seen_on.includes(screen)) prev.seen_on.push(screen);
        if (prev.type === "text" && typed.type !== "text") Object.assign(prev, typed);
        return;
      }
      attrs.set(k, { name: clean, ...typed, required, options: [...options], seen_on: [screen] });
    };
    for (const s of own) {
      for (const c of s.columns) {
        const values = s.values.find((v) => v.column === c)?.values ?? [];
        add(c, values.length ? "select" : "", false, values, s.id);
      }
      for (const f of s.form_fields)
        add(f.label, f.kind, f.required || /\*$/.test(f.label), f.options, s.id);
    }
    const attributes = [...attrs.values()];
    const stateAttr = attributes.find((a) => a.type === "state" && a.options.length >= 2);
    const relations: Relation[] = [];
    for (const a of attributes) {
      if (a.type === "reference" && a.refers_to) {
        relations.push({ to: a.refers_to, kind: "belongs_to", via: a.name });
      }
      if (a.type === "user") relations.push({ to: "user", kind: "belongs_to", via: a.name });
    }
    for (const s of own.filter(isDetail)) {
      for (const label of [...s.tabs, ...s.headings.slice(1)]) {
        const k = entityKey(label.replace(/\s*\(\d+\)$/, ""));
        if (k && k !== key && keys.has(k) && !relations.some((r) => r.to === k)) {
          relations.push({
            to: k,
            kind: "has_many",
            via: `"${label}" section on the ${name} page`,
          });
        }
      }
    }
    entities.push({
      id: safeId("data_object", name),
      name,
      plural: plural(name),
      screens: own.map((s) => s.id),
      attributes,
      states: stateAttr?.options ?? [],
      state_field: stateAttr?.name,
      relations: dedupeRelations(relations),
      operations: operationsOf(own),
      implied: false,
    });
  }
  // Screens of one entity linking to another entity's screens: a link between them.
  const entityOfScreen = new Map<string, string>();
  for (const e of entities) for (const id of e.screens) entityOfScreen.set(id, entityKey(e.name));
  for (const e of entities) {
    const key = entityKey(e.name);
    for (const s of screens.filter((x) => e.screens.includes(x.id) && isDetail(x))) {
      for (const to of s.links_to) {
        const other = entityOfScreen.get(to);
        if (other && other !== key && !e.relations.some((r) => r.to === other)) {
          e.relations.push({ to: other, kind: "linked", via: `links from the ${e.name} page` });
        }
      }
    }
  }
  if (keys.has("user") && !byKey.has("user")) {
    const team = teamScreens[0];
    const attributes: Attribute[] = (team?.columns ?? ["Name", "Email", "Role"])
      .filter((c) => !NOT_ATTRIBUTE.test(c))
      .map((c) => {
        const values = team?.values.find((v) => v.column === c)?.values ?? [];
        const typed = attributeType(c, values.length ? "select" : "", values, new Set());
        return {
          name: c,
          ...typed,
          required: false,
          options: values,
          seen_on: team ? [team.id] : [],
        };
      });
    entities.push({
      id: safeId("data_object", "User"),
      name: "User",
      plural: "Users",
      screens: teamScreens.map((s) => s.id),
      attributes,
      states: [],
      relations: [],
      operations: operationsOf(teamScreens),
      implied: true,
    });
  }
  const entityByKey = new Map(entities.map((e) => [entityKey(e.name), e]));
  for (const e of entities) e.relations = e.relations.filter((r) => entityByKey.has(r.to));

  // 2. Modules: the main menu when there is one, else the first part of each address.
  const navCount = new Map<string, number>();
  for (const s of screens) for (const n of uniq(s.nav)) navCount.set(n, (navCount.get(n) ?? 0) + 1);
  const menu = [...navCount]
    .filter(([n, c]) => c >= Math.max(1, Math.ceil(screens.length / 2)) && n.length <= 30)
    .map(([n]) => n);
  const moduleOf = (s: CapturedScreen): string => {
    const parts = meaningfulParts(s.pattern);
    const first = parts[0];
    if (!first || /^(dashboard|home|overview)$/i.test(first)) return "Home";
    const hit = menu.find(
      (m) => entityKey(m) === entityKey(first) || entityKey(m) === entityKey(s.name),
    );
    return hit ?? title(first);
  };
  const modules = new Map<string, Module>();
  for (const s of screens) {
    const name = moduleOf(s);
    const m = modules.get(name) ?? { id: safeId("module", name), name, screens: [] };
    m.screens.push(s.id);
    modules.set(name, m);
  }

  // 3. Features.
  const features: Feature[] = [];
  const screenFeatures: Record<string, string[]> = {};
  const addFeature = (f: Omit<Feature, "id">) => {
    const id = safeId("feature", f.name);
    const existing = features.find((x) => x.id === id);
    if (existing) {
      existing.screens = uniq([...existing.screens, ...f.screens]);
      existing.entities = uniq([...existing.entities, ...f.entities]);
      existing.operations = OPERATIONS.filter(
        (o) => existing.operations.includes(o) || f.operations.includes(o),
      );
      return existing;
    }
    const feature = { id, ...f };
    features.push(feature);
    return feature;
  };
  const screenById = new Map(screens.map((s) => [s.id, s]));
  const moduleOfScreens = (ids: string[]) => {
    const first = ids.map((id) => screenById.get(id)).find(Boolean);
    return first ? moduleOf(first) : "Home";
  };

  for (const e of entities) {
    // Users are covered by the team and user management feature.
    if (e.implied) continue;
    addFeature({
      name: `${e.name} management`,
      kind: e.implied ? "user_management" : "record_management",
      module: moduleOfScreens(e.screens),
      screens: e.screens,
      entities: [e.id],
      operations: e.operations,
      summary: `Keep ${e.plural.toLowerCase()} as records${
        e.attributes.length
          ? ` with ${list(
              e.attributes.map((a) => a.name),
              5,
            )}`
          : ""
      }${e.operations.length ? `; users can ${list(e.operations.map(opWords), 8)}` : ""}.`,
      ...entityLogic(e, entities),
    });
    if (e.states.length >= 2) {
      addFeature({
        name: `${e.name} ${/stage/i.test(e.state_field ?? "") ? "pipeline" : "lifecycle"}`,
        kind: "workflow",
        module: moduleOfScreens(e.screens),
        screens: e.screens,
        entities: [e.id],
        operations: e.operations.filter((o) => o === "move" || o === "edit"),
        summary: `${e.plural} move through ${e.states.join(" → ")} (${e.state_field}).`,
        ...stateLogic(e),
      });
    }
  }

  // Screens that are features of their own (dashboards, automation, settings ...), one per kind and area.
  for (const s of screens) {
    const kind = screenKind(s);
    if (!kind) continue;
    // A record's own page (often named after the record) is part of its record feature.
    if (
      isDetail(s) ||
      (entityOfScreen.has(s.id) && (kind === "collaboration" || kind === "content"))
    )
      continue;
    const area = meaningfulParts(s.pattern)[0] ?? s.name;
    const name = featureName(kind, s, area);
    const mentioned = entities
      .filter((e) => mentions(textOf(s) + " " + s.columns.join(" "), e))
      .map((e) => e.id);
    addFeature({
      name,
      kind,
      module: moduleOf(s),
      screens: [s.id],
      entities: mentioned,
      operations: operationsOf([s]),
      summary: kindSummary(
        kind,
        s,
        mentioned.map((id) => entities.find((e) => e.id === id)!.plural),
      ),
      ...kindLogic(
        kind,
        s,
        mentioned.map((id) => entities.find((e) => e.id === id)!),
      ),
    });
  }
  // Global search, when most screens offer it.
  const searchScreens = screens.filter((s) => s.controls.includes("search"));
  if (screens.length >= 3 && searchScreens.length >= Math.ceil(screens.length / 2)) {
    addFeature({
      name: "Search",
      kind: "search",
      module: "Home",
      screens: searchScreens.map((s) => s.id),
      entities: entities.map((e) => e.id),
      operations: ["search"],
      summary: "Search across records from most screens.",
      logic: [
        `Search probably covers ${list(entities.map((e) => e.plural.toLowerCase()))} and matches names, emails and other text attributes; a rebuild needs a search index that updates when records change.`,
      ],
      data_use: ["Reads the main text attributes of every searchable entity."],
      questions: [
        "Which record types does search return, and does it match partial words and typos?",
        "Does search respect permissions (do members see only records they may see)?",
      ],
      acceptance: ["Typing part of a record's name finds it within a second."],
    });
  }
  for (const f of features) for (const id of f.screens) (screenFeatures[id] ??= []).push(f.id);

  // 4. Data reuse, added to each record feature now that all features are known.
  for (const e of entities) {
    const f = features.find((x) => x.kind === "record_management" && x.entities.includes(e.id));
    if (!f) continue;
    const key = entityKey(e.name);
    const referencedBy = entities.filter((o) =>
      o.relations.some((r) => r.to === key && r.kind !== "has_many"),
    );
    const holds = e.relations
      .filter((r) => r.kind === "has_many")
      .map((r) => entityByKey.get(r.to)!.plural);
    const usedIn = features.filter(
      (x) => x.id !== f.id && x.kind !== "workflow" && x.entities.includes(e.id),
    );
    const elsewhere = screens.filter(
      (s) => !e.screens.includes(s.id) && s.columns.some((c) => entityKey(c) === key),
    );
    if (referencedBy.length)
      f.data_use.push(
        `Other records point to it: ${referencedBy.map((o) => `${o.name} (${o.relations.find((r) => r.to === key)!.via})`).join(", ")}. Deleting or merging a ${e.name.toLowerCase()} must update or block them.`,
      );
    if (holds.length)
      f.data_use.push(`A ${e.name.toLowerCase()} page gathers its related ${list(holds)}.`);
    if (elsewhere.length)
      f.data_use.push(
        `Shown as a column on ${list(elsewhere.map((s) => s.name))}, so its name is reused as a label elsewhere.`,
      );
    if (usedIn.length) f.data_use.push(`Used by ${list(usedIn.map((x) => x.name))}.`);
    if (!f.data_use.length)
      f.data_use.push(
        "No reuse seen on the captured screens; check reports, automation and search.",
      );
  }

  // 5. Rules, roles and non-functional requirements.
  const rules = inferRules(screens, entities, features);
  const roles = inferRoles(screens);
  if (roles.length) {
    rules.push({
      id: safeId("business_rule", "Access depends on the user's role"),
      name: "Access depends on the user's role",
      kind: "permission",
      text: `Users have a role (${roles.map((r) => r.name).join(", ")}) that decides what they can see and change.`,
      governs: features.filter((f) => f.kind === "user_management").map((f) => f.id),
      screens: uniq(roles.flatMap((r) => r.screens)),
    });
  }
  const nfrs = inferNfrs(screens, entities, features, roles.length > 0);
  return {
    modules: [...modules.values()],
    entities,
    features,
    rules,
    roles,
    nfrs,
    screen_features: screenFeatures,
  };
}

function dedupeRelations(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  return relations.filter((r) => !seen.has(r.to + r.kind) && seen.add(r.to + r.kind));
}

const mentions = (text: string, e: Entity) => {
  const t = ` ${words(text)} `;
  return t.includes(` ${words(e.name)} `) || t.includes(` ${words(e.plural)} `);
};

function opWords(op: Operation): string {
  const w: Record<Operation, string> = {
    list: "list",
    view: "open",
    create: "create",
    edit: "edit",
    delete: "delete",
    search: "search",
    filter: "filter",
    sort: "sort",
    views: "save views",
    bulk: "act on many at once",
    import: "import",
    export: "export",
    assign: "assign",
    comment: "comment",
    attach: "attach files",
    duplicate: "duplicate",
    send: "send",
    move: "move to another stage",
  };
  return w[op];
}

function featureName(kind: FeatureKind, s: CapturedScreen, area: string): string {
  const base = s.name && s.name.length <= 40 && !/\d{3,}/.test(s.name) ? s.name : title(area);
  const generic: Partial<Record<FeatureKind, string>> = {
    billing: "Billing and plans",
    user_management: "Team and user management",
    integrations: "Integrations",
    customization: "Custom fields and data model settings",
  };
  return generic[kind] ?? base;
}

function kindSummary(kind: FeatureKind, s: CapturedScreen, about: string[]): string {
  const on = about.length ? ` about ${list(about.map((a) => a.toLowerCase()))}` : "";
  const map: Record<FeatureKind, string> = {
    record_management: `Manage records${on}.`,
    workflow: `Move records through stages${on}.`,
    analytics: `Dashboards and reports${on}${s.charts ? ` (${s.charts} chart${s.charts === 1 ? "" : "s"} seen)` : ""}.`,
    automation: `Automate work${on}: things that happen by themselves when something changes.`,
    communication: `Send and receive messages${on}.`,
    collaboration: `Work together${on}: activity, notes and comments.`,
    user_management: "Invite people, give them roles and manage seats.",
    billing: "See the plan, usage and limits, and change the subscription.",
    integrations: "Connect outside tools and the developer API.",
    settings: "Settings that change how the product behaves for the account or the user.",
    customization: "Change the data model: add fields (properties), choices and record types.",
    content: `Create and reuse content${on}.`,
    search: "Search across records.",
    other: `${s.name}.`,
  };
  return map[kind];
}

/** Logic, data use, questions and acceptance for a record feature. */
function entityLogic(e: Entity, all: Entity[]) {
  const logic: string[] = [];
  const questions: string[] = [];
  const acceptance: string[] = [];
  const lower = e.name.toLowerCase();
  const required = e.attributes.filter((a) => a.required).map((a) => a.name);
  const nameOf = (key: string) => all.find((x) => entityKey(x.name) === key)?.name ?? title(key);
  if (e.attributes.length) {
    const typed = e.attributes
      .filter((a) => a.type !== "text")
      .map(
        (a) => `${a.name} (${a.type === "reference" ? `link to ${nameOf(a.refers_to!)}` : a.type})`,
      );
    logic.push(
      `Each ${lower} is a record with ${e.attributes.length} attribute${e.attributes.length === 1 ? "" : "s"}${typed.length ? `, among them ${list(typed, 8)}` : ""}.`,
    );
  }
  if (required.length) {
    logic.push(
      `${list(required)} ${required.length === 1 ? "is" : "are"} required, so saving checks ${required.length === 1 ? "it" : "them"} first.`,
    );
    acceptance.push(`Saving a ${lower} without ${list(required)} is refused with a clear message.`);
  }
  for (const r of e.relations) {
    if (r.kind === "belongs_to") {
      logic.push(
        r.to === "user"
          ? `"${r.via}" assigns each ${lower} to a user: this enables "my ${e.plural.toLowerCase()}" views, per-person reports and notifications to the owner.`
          : `"${r.via}" links each ${lower} to one ${nameOf(r.to).toLowerCase()} (many ${e.plural.toLowerCase()} per ${nameOf(r.to).toLowerCase()}).`,
      );
    } else if (r.kind === "has_many") {
      logic.push(`One ${lower} has many ${plural(nameOf(r.to)).toLowerCase()} (${r.via}).`);
    } else {
      logic.push(`${e.plural} are linked to ${plural(nameOf(r.to)).toLowerCase()} (${r.via}).`);
    }
  }
  const money = e.attributes.find((a) => a.type === "money");
  const date = e.attributes.find((a) => a.type === "date");
  if (money && e.states.length) {
    logic.push(
      `With ${money.name} and ${e.state_field}, totals per stage (and, with ${date?.name ?? "a date"}, per period) are likely calculated for forecasts and reports.`,
    );
  }
  if (e.operations.includes("list")) {
    const cols = e.attributes
      .filter((a) => a.seen_on.some((id) => e.screens.includes(id)))
      .slice(0, 6);
    acceptance.push(
      `The ${e.plural.toLowerCase()} list shows ${list(cols.map((a) => a.name))}${e.operations.includes("sort") ? " and can be sorted by each column" : ""}.`,
    );
  }
  if (e.operations.some((o) => o === "search" || o === "filter")) {
    acceptance.push(
      `The list can be ${[e.operations.includes("search") && "searched", e.operations.includes("filter") && "filtered"].filter(Boolean).join(" and ")}, and the result updates without reloading.`,
    );
    logic.push("Filtering and search run on the server, because lists are paged.");
  }
  if (e.operations.includes("views"))
    logic.push(
      "Saved views store a filter, the columns shown and the sort, per user or shared with the team.",
    );
  if (e.operations.includes("create"))
    acceptance.push(`A user can create a ${lower}; it then appears in the list and can be opened.`);
  if (e.operations.includes("view")) {
    const related = e.relations
      .filter((r) => r.kind === "has_many")
      .map((r) => plural(nameOf(r.to)).toLowerCase());
    acceptance.push(
      `Opening a ${lower} shows its details${related.length ? ` and its related ${list(related)}` : ""}.`,
    );
  }
  if (e.operations.includes("edit"))
    acceptance.push(
      `A user can change a ${lower}'s details and the change is saved and shown at once.`,
    );
  if (e.operations.includes("delete"))
    acceptance.push(`A user can delete or archive a ${lower}, after confirming.`);
  if (e.operations.includes("import"))
    acceptance.push(`${e.plural} can be imported from a file, with columns matched to attributes.`);
  if (e.operations.includes("export")) acceptance.push(`${e.plural} can be exported to a file.`);
  if (e.operations.includes("bulk"))
    acceptance.push(`Several ${e.plural.toLowerCase()} can be selected and changed at once.`);
  questions.push(
    `Create a ${lower}: which fields are required, which are filled in automatically (dates, owner, number), and which have default values?`,
    `Change a ${lower}: is the change recorded in a history or activity list, and does anyone get notified?`,
    `Delete a ${lower}: is it archived or gone, and what happens to records linked to it?`,
    `Are there duplicate checks (same name or email) when creating or importing ${e.plural.toLowerCase()}?`,
    `Who can see and edit ${e.plural.toLowerCase()} created by someone else?`,
    `Is there a limit on the number of ${e.plural.toLowerCase()} or attributes on your plan?`,
  );
  if (e.attributes.some((a) => a.type === "choice" || a.type === "state"))
    questions.push("Can an admin change the choices of the drop-down fields (custom properties)?");
  return { logic, data_use: [] as string[], questions, acceptance };
}

function stateLogic(e: Entity) {
  const lower = e.name.toLowerCase();
  const states = e.states;
  const ends = states.filter((x) => END_STATE.test(x));
  return {
    logic: [
      `A ${lower} has one ${e.state_field} at a time: ${states.join(", ")}. A rebuild needs a state machine: the allowed moves, who may make them, and what each move triggers.`,
      `The order ${states.join(" → ")} suggests a ${/stage/i.test(e.state_field ?? "") ? "pipeline (often shown as a board with one column per stage)" : "lifecycle"}${ends.length ? `; ${list(ends)} ${ends.length === 1 ? "is a likely end state" : "are likely end states"} that close the record` : ""}.`,
      `Moving a ${lower} probably stores when it entered each state, which powers time-in-stage, conversion and win-rate reports.`,
    ],
    data_use: [
      `${e.state_field} values are reused to group lists and boards, to filter, to drive reports (counts and totals per stage) and as automation triggers.`,
    ],
    questions: [
      `Can a ${lower} skip states or move backwards? Are some moves blocked until fields are filled in?`,
      `Can an admin rename, add or reorder the states, or have more than one pipeline?`,
      `What happens automatically when a ${lower} reaches ${ends[0] ?? states[states.length - 1]}?`,
    ],
    acceptance: [
      `A ${lower} can be moved between ${states.join(", ")}, and its ${e.state_field} shows the new value everywhere.`,
      `Lists and reports can be grouped and filtered by ${e.state_field}.`,
    ],
  };
}

function kindLogic(kind: FeatureKind, s: CapturedScreen, about: Entity[]) {
  const names = about.map((e) => e.plural.toLowerCase());
  const on = names.length ? list(names) : "the records";
  const out = {
    logic: [] as string[],
    data_use: [] as string[],
    questions: [] as string[],
    acceptance: [] as string[],
  };
  switch (kind) {
    case "analytics":
      out.logic.push(
        `Charts and reports are aggregates (count, sum, average) of ${on}, grouped by fields such as stage, owner or date, over a chosen period.`,
        "A rebuild needs a reporting query layer over the same records (or a copy kept for analytics), with filters and date ranges.",
      );
      out.data_use.push(
        `Reads ${on} and their numeric, date and state attributes; writes nothing.`,
      );
      out.questions.push(
        "Which numbers are shown, and how is each calculated (what is counted, summed, over which dates)?",
        "Can users build their own reports (choose data, grouping and chart type) and save or share them?",
        "How fresh are the numbers: live, or refreshed every few minutes?",
      );
      out.acceptance.push("Each chart shows the same totals as the matching filtered list.");
      break;
    case "automation":
      out.logic.push(
        `Automation follows "when <trigger> and <conditions>, do <actions>" over ${on}: triggers are record events (created, field changed, stage reached, date reached) or schedules.`,
        "A rebuild needs an event bus from record changes, a rule engine for conditions, a queue for actions (update field, create task, send email, call webhook) and a run history.",
      );
      out.data_use.push(`Listens to changes in ${on} and writes back to them.`);
      out.questions.push(
        "Which triggers, conditions and actions are offered?",
        "Is there a run history with errors, and are there limits per plan?",
        "Can an automation run on existing records, or only on new events?",
      );
      out.acceptance.push(
        "An automation runs within a minute of its trigger and its run appears in the history.",
      );
      break;
    case "communication":
      out.logic.push(
        `Messages are records linked to ${on}; sending goes through an outside email, chat or phone service, and replies are matched back to the right record.`,
      );
      out.data_use.push(`Adds activity to ${on}, which shows on their timelines and in reports.`);
      out.questions.push(
        "Are messages linked to records automatically (by email address), and is opening or clicking tracked?",
        "Are there templates, scheduling and limits on how many can be sent?",
      );
      out.acceptance.push("A sent message appears on the timeline of the record it was sent to.");
      break;
    case "collaboration":
      out.logic.push(
        `Activity, notes and comments are records linked to ${on}, in time order, with the user who made them.`,
      );
      out.data_use.push('Feeds record timelines and "last activity" dates.');
      out.questions.push(
        "Can people be @mentioned, and do they get notified?",
        "Can notes be edited or deleted, and by whom?",
      );
      out.acceptance.push(
        "A new note shows at the top of the record's timeline with its author and time.",
      );
      break;
    case "user_management":
      out.logic.push(
        "Users belong to one account (workspace) and have a role; inviting sends an email link that creates the user on first sign-in.",
        "Seats are likely counted against the plan.",
      );
      out.data_use.push(
        "Users are reused as owners and assignees of records, and as the author of every change.",
      );
      out.questions.push(
        "Which roles exist, and what can each role do (see, edit, delete, export, manage settings)?",
        "Can access be limited to a team or to own records?",
      );
      out.acceptance.push(
        "An admin can invite a person with a role, and that person sees only what the role allows.",
      );
      break;
    case "billing":
      out.logic.push(
        "The account has a plan; features and limits (seats, records, usage) are checked against it, and upgrading unlocks them at once.",
      );
      out.data_use.push("Plan and usage counters are read by every feature that has a limit.");
      out.questions.push(
        "What exactly is limited on each plan, and what happens at the limit (blocked, warned, charged)?",
      );
      out.acceptance.push("Going over a plan limit shows a clear message and an upgrade path.");
      break;
    case "integrations":
      out.logic.push(
        "Each integration stores a connection (an OAuth token or API key) per account and syncs records both ways or on events; the public API and webhooks expose the same records.",
      );
      out.data_use.push(`Reads and writes ${on} through connectors and the API.`);
      out.questions.push(
        "Which tools connect, which data syncs, in which direction and how often?",
        "How are sync conflicts and errors shown?",
      );
      out.acceptance.push(
        "A connected tool's records appear in the product, and changes sync within the stated time.",
      );
      break;
    case "customization":
      out.logic.push(
        "Admins can add fields (properties) and choices, so the data model is not fixed: a rebuild needs metadata-driven fields (a field definition table and values stored per record, or a flexible column type).",
        "Every list, form, filter, report and import must read field definitions instead of hard-coded columns.",
      );
      out.data_use.push(
        "Field definitions are used by forms, lists, filters, reports, imports and the API.",
      );
      out.questions.push(
        "Which field types can be added, and can fields be required, unique or calculated?",
        "Can admins add whole new record types (custom objects)?",
      );
      out.acceptance.push(
        "A new field added by an admin appears on the record form, in list columns and in filters.",
      );
      break;
    case "settings":
      out.logic.push(
        "Settings are stored per account or per user and read by the features they change.",
      );
      out.questions.push(
        "Which settings are per account and which per user, and who may change them?",
      );
      break;
    case "content":
      out.logic.push(
        `Content items (templates, documents) are stored once and reused in ${on}, often with placeholders filled from record fields.`,
      );
      out.data_use.push("Templates are reused wherever messages or documents are created.");
      out.questions.push(
        "Can content use placeholders from record fields, and is there version history?",
      );
      break;
    default:
      break;
  }
  if (s.notices.length) out.questions.push(`What does "${s.notices[0]}" mean for each plan?`);
  return out;
}

function inferRules(screens: CapturedScreen[], entities: Entity[], features: Feature[]): Rule[] {
  const rules: Rule[] = [];
  const add = (r: Omit<Rule, "id">) => {
    const id = safeId("business_rule", r.name);
    if (!rules.some((x) => x.id === id)) rules.push({ id, ...r });
  };
  for (const e of entities) {
    const required = e.attributes.filter((a) => a.required).map((a) => a.name);
    if (required.length) {
      add({
        name: `${e.name} required fields`,
        kind: "validation",
        text: `A ${e.name.toLowerCase()} cannot be saved without ${list(required)}.`,
        governs: [e.id],
        screens: e.screens,
      });
    }
    if (e.states.length >= 2) {
      const field = e.state_field ?? "state";
      add({
        name: entityKey(field).startsWith(entityKey(e.name))
          ? `${field} flow`
          : `${e.name} ${field.toLowerCase()} flow`,
        kind: "workflow",
        text: `A ${e.name.toLowerCase()} moves through ${e.states.join(" → ")}.`,
        governs: [e.id],
        screens: e.screens,
      });
    }
  }
  for (const s of screens) {
    for (const n of s.notices) {
      const limit = /\b(\d+)\s*(of|\/)\s*(\d+)\b|\blimit|quota|remaining|maximum|max\b/i.test(n);
      const billing = /\b(upgrade|trial|plan|premium|pro|enterprise|locked|available on)\b/i.test(
        n,
      );
      if (!limit && !billing) continue;
      add({
        name: `${s.name} ${limit ? "usage limit" : "plan lock"}`,
        kind: limit ? "limit" : "billing",
        text: `The ${s.name} screen says: "${n}".`,
        governs: features.filter((f) => f.screens.includes(s.id)).map((f) => f.id),
        screens: [s.id],
      });
    }
  }
  return rules;
}

function inferRoles(screens: CapturedScreen[]) {
  const found = new Map<string, string[]>();
  for (const s of screens) {
    const from = [
      ...s.values
        .filter((v) => /\b(role|permission|access)/i.test(v.column))
        .flatMap((v) => v.values),
      ...s.form_fields
        .filter((f) => /\b(role|permission|access)/i.test(f.label))
        .flatMap((f) => f.options),
    ];
    for (const r of from) {
      const name = title(r);
      if (name.length > 30) continue;
      found.set(name, uniq([...(found.get(name) ?? []), s.id]));
    }
  }
  return [...found].map(([name, ids]) => ({ id: safeId("user_role", name), name, screens: ids }));
}

function inferNfrs(
  screens: CapturedScreen[],
  entities: Entity[],
  features: Feature[],
  roles: boolean,
): Nfr[] {
  const out: Nfr[] = [];
  const add = (n: Omit<Nfr, "id">) => {
    const id = safeId("requirement", `${n.category} ${n.name}`);
    if (!out.some((x) => x.id === id)) out.push({ id, ...n });
  };
  const ids = (pred: (s: CapturedScreen) => boolean) => screens.filter(pred).map((s) => s.id);
  const anyText = (re: RegExp) =>
    ids((s) => re.test([textOf(s), ...s.buttons, ...s.fields, ...s.nav, ...s.notices].join(" ")));
  const ofKind = (k: FeatureKind) => features.filter((f) => f.kind === k);

  const paged = ids((s) => s.controls.includes("pagination") || s.controls.includes("filter"));
  if (paged.length) {
    add({
      name: "Fast lists at scale",
      category: "performance",
      priority: "must",
      statement:
        "Record lists page, sort, search and filter on the server; the first page shows in under 2 seconds with 100,000 records in an account (suggested target).",
      why: `Paged or filtered lists on ${paged.length} screen${paged.length === 1 ? "" : "s"}.`,
      basis: "seen",
      screens: paged,
    });
  }
  const charts = ofKind("analytics");
  if (charts.length) {
    add({
      name: "Fast reports",
      category: "performance",
      priority: "should",
      statement:
        "Dashboards and reports over a year of records render in under 5 seconds; heavy reports may use pre-computed totals (suggested target).",
      why: `Dashboards or reports: ${list(charts.map((f) => f.name))}.`,
      basis: "seen",
      screens: charts.flatMap((f) => f.screens),
    });
  }
  const tenancy = anyText(/\b(billing|plans?|seats?|usage|workspaces?|subscriptions?|quotas?)\b/i);
  add({
    name: "Account isolation and plan limits",
    category: "scalability",
    priority: "must",
    statement:
      "Each customer account (workspace) is fully isolated from the others; usage (seats, records, sends) is counted against the account's plan limits.",
    why: tenancy.length
      ? `Plans, usage, seats or workspaces appear on ${tenancy.length} screen${tenancy.length === 1 ? "" : "s"}.`
      : "A multi-customer web product needs account isolation.",
    basis: tenancy.length ? "seen" : "baseline",
    screens: tenancy,
  });
  if (roles || ofKind("user_management").length) {
    add({
      name: "Role-based access",
      category: "security",
      priority: "must",
      statement:
        "Every screen, record and action checks the user's role on the server; admins manage members and roles; denied actions are hidden or refused.",
      why: "Team, role or permission screens were captured.",
      basis: "seen",
      screens: ofKind("user_management").flatMap((f) => f.screens),
    });
  }
  const auth = anyText(
    /\b(sso|single sign-on|saml|two-factor|2fa|mfa|authenticator|password|security)\b/i,
  );
  add({
    name: "Secure sign-in",
    category: "security",
    priority: "must",
    statement: auth.length
      ? "Sign-in supports the methods seen in security settings (for example single sign-on and two-factor), with session expiry, hashed passwords and HTTPS everywhere."
      : "Secure sign-in with session expiry, hashed passwords, HTTPS everywhere and protection against brute force.",
    why: auth.length
      ? "Security or sign-in settings were captured."
      : "Every product with accounts needs it.",
    basis: auth.length ? "seen" : "baseline",
    screens: auth,
  });
  const personal = entities.filter((e) =>
    e.attributes.some((a) => a.type === "email" || a.type === "phone"),
  );
  if (personal.length) {
    add({
      name: "Personal data protection",
      category: "privacy",
      priority: "must",
      statement: `Personal data in ${list(personal.map((e) => e.plural.toLowerCase()))} (emails, phone numbers) is encrypted at rest, access is limited by role, and a person's data can be exported or deleted on request (GDPR, CCPA).`,
      why: `${list(personal.map((e) => e.name))} hold${personal.length === 1 ? "s" : ""} emails or phone numbers.`,
      basis: "seen",
      screens: personal.flatMap((e) => e.screens),
    });
  }
  const audit = anyText(/\b(activity|activities|timeline|history|audit|log|changes)\b/i);
  add({
    name: "Change history",
    category: "auditability",
    priority: audit.length ? "must" : "should",
    statement:
      "Changes to records and settings are kept in a history showing who changed what, from which value to which, and when.",
    why: audit.length
      ? `Activity, history or log appears on ${audit.length} screen${audit.length === 1 ? "" : "s"}.`
      : "Business records need a trail of changes.",
    basis: audit.length ? "seen" : "baseline",
    screens: audit,
  });
  const views = ids((s) => s.controls.includes("views") || s.controls.includes("bulk_select"));
  if (views.length) {
    add({
      name: "Saved views and bulk actions",
      category: "usability",
      priority: "should",
      statement:
        "Users save list views (filters, columns, sort) and act on many records at once; the product remembers each user's last view.",
      why: `Saved views or bulk selection on ${views.length} screen${views.length === 1 ? "" : "s"}.`,
      basis: "seen",
      screens: views,
    });
  }
  add({
    name: "Accessible interface",
    category: "accessibility",
    priority: "should",
    statement:
      "The interface meets WCAG 2.1 AA: keyboard use, screen-reader labels, enough contrast.",
    why: "Expected of business software, and often required by larger customers.",
    basis: "baseline",
    screens: [],
  });
  const integrations = ofKind("integrations");
  if (integrations.length) {
    add({
      name: "Public API, webhooks and connectors",
      category: "interoperability",
      priority: "must",
      statement:
        "The main records are available through a documented public API and webhooks, and connectors sync with outside tools; API calls are rate-limited per account.",
      why: `Integration or developer screens: ${list(integrations.flatMap((f) => f.screens.map((id) => screens.find((s) => s.id === id)?.name ?? id)))}.`,
      basis: "seen",
      screens: integrations.flatMap((f) => f.screens),
    });
  }
  const io = entities.filter(
    (e) => e.operations.includes("import") || e.operations.includes("export"),
  );
  if (io.length) {
    add({
      name: "Import and export",
      category: "portability",
      priority: "should",
      statement: `${list(io.map((e) => e.plural))} can be imported from and exported to CSV or Excel, with column matching and an error report.`,
      why: "Import or export actions were seen.",
      basis: "seen",
      screens: io.flatMap((e) => e.screens),
    });
  }
  const locale = anyText(/\b(language|time ?zone|currency|locale|date format|region)\b/i);
  if (locale.length) {
    add({
      name: "Languages, time zones and currencies",
      category: "localisation",
      priority: "should",
      statement:
        "Users choose language, time zone and currency; dates, numbers and amounts show in the user's format and are stored in a neutral form (UTC, minor units).",
      why: "Language, time zone or currency settings were captured.",
      basis: "seen",
      screens: locale,
    });
  }
  const custom = ofKind("customization");
  if (custom.length) {
    add({
      name: "Configurable data model",
      category: "configurability",
      priority: "must",
      statement:
        "Admins add fields, choices and record types without code; forms, lists, filters, reports, imports and the API all follow the field definitions.",
      why: "Property or custom field settings were captured.",
      basis: "seen",
      screens: custom.flatMap((f) => f.screens),
    });
  }
  const live = ofKind("communication").length + ofKind("automation").length;
  if (live) {
    add({
      name: "Background jobs and near real-time updates",
      category: "availability",
      priority: "should",
      statement:
        "Sending, syncing and automation run as background jobs with retries; users see new messages and status changes within seconds.",
      why: "Messaging or automation features were captured.",
      basis: "seen",
      screens: [...ofKind("communication"), ...ofKind("automation")].flatMap((f) => f.screens),
    });
  }
  add({
    name: "Uptime and backups",
    category: "availability",
    priority: "should",
    statement:
      "Available 99.9% of each month, with daily backups, a tested restore and a public status page.",
    why: "Customers run their daily work in it.",
    basis: "baseline",
    screens: [],
  });
  add({
    name: "Safe, frequent releases",
    category: "maintainability",
    priority: "could",
    statement:
      "Modules are separated as in this model (one per menu area), with automated tests and database migrations, so features ship without downtime.",
    why: "A product of this size changes often.",
    basis: "baseline",
    screens: [],
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Notes

/** The feature model as Markdown: the knowledge an analyst writes up after using every feature. */
export function featureModelNotes(input: {
  product: string;
  session: string;
  model: ProductModel;
  screens: CapturedScreen[];
  evidence: Record<string, string>;
}): string {
  const { model, screens } = input;
  // A record's own page is named after the record (often a person), so call it "<Entity> page".
  const nameOf = new Map(screens.map((s) => [s.id, isDetail(s) ? s.pattern : s.name]));
  for (const e of model.entities) {
    for (const id of e.screens) {
      const s = screens.find((x) => x.id === id);
      if (s && isDetail(s)) nameOf.set(id, `${e.name} page`);
    }
  }
  const cite = (ids: string[]) => {
    const e = uniq(ids.map((id) => input.evidence[id]).filter((x): x is string => !!x));
    return e.length ? ` [${e.join(", ")}]` : "";
  };
  const entityName = (key: string) =>
    model.entities.find((e) => entityKey(e.name) === key)?.name ?? title(key);
  const out = [
    `# Feature model: ${input.product} (from capture ${input.session})`,
    "",
    `reb read ${screens.length} captured screens and worked out the product's modules, features, data ` +
      "model, rules and requirements, the way an analyst does after using every feature. Everything " +
      "below is **inferred** from the screens: confirm each part by looking at the screenshot and " +
      "using the feature, then raise the node's label to observed (or correct it). E- ids are the " +
      "screenshots each part comes from.",
    "",
    `Found: ${model.modules.length} modules, ${model.features.length} features, ${model.entities.length} entities, ` +
      `${model.rules.length} business rules, ${model.roles.length} roles, ${model.nfrs.length} non-functional requirements.`,
    "",
    "## Modules and features",
    "",
  ];
  for (const m of model.modules) {
    const fs = model.features.filter((f) => f.module === m.name);
    out.push(`- **${m.name}** [${m.id}]${cite(m.screens)}`);
    for (const f of fs) out.push(`  - ${f.name} (${f.kind.replace(/_/g, " ")}) [${f.id}]`);
  }
  out.push("", "## Data model", "");
  for (const e of model.entities) {
    out.push(
      `### ${e.name} [${e.id}]${e.implied ? " (implied by owner or team fields)" : ""}${cite(e.screens)}`,
      "",
    );
    if (e.attributes.length) {
      out.push(
        "| Attribute | Type | Required | Choices or states | Seen on |",
        "| --- | --- | --- | --- | --- |",
      );
      for (const a of e.attributes) {
        const type = a.type === "reference" ? `link to ${entityName(a.refers_to!)}` : a.type;
        out.push(
          `| ${a.name} | ${type} | ${a.required ? "yes" : ""} | ${a.options.join(", ")} | ${a.seen_on.map((id) => nameOf.get(id) ?? id).join(", ")} |`,
        );
      }
      out.push("");
    }
    if (e.states.length) out.push(`- States (${e.state_field}): ${e.states.join(" → ")}`);
    for (const r of e.relations) {
      const how =
        r.kind === "belongs_to"
          ? "belongs to one"
          : r.kind === "has_many"
            ? "has many"
            : "is linked to";
      out.push(
        `- ${how} ${r.kind === "has_many" ? plural(entityName(r.to)) : entityName(r.to)} (${r.via})`,
      );
    }
    if (e.operations.length) out.push(`- Users can: ${e.operations.map(opWords).join(", ")}`);
    out.push("");
  }
  const er = ["```mermaid", "erDiagram"];
  const drawn = new Set<string>();
  const ent = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  for (const e of model.entities) {
    er.push(`  ${ent(e.name)} {`);
    for (const a of e.attributes.slice(0, 15)) {
      er.push(
        `    ${a.type.replace(/[^a-z]+/g, "_")} ${a.name.replace(/[^A-Za-z0-9]+/g, "_") || "field"}`,
      );
    }
    if (!e.attributes.length) er.push("    identifier id");
    er.push("  }");
    for (const r of e.relations) {
      const to = ent(entityName(r.to));
      const pair = [ent(e.name), to].sort().join(" ");
      if (drawn.has(pair)) continue;
      drawn.add(pair);
      if (r.kind === "belongs_to")
        er.push(`  ${to} ||--o{ ${ent(e.name)} : "${r.via.replace(/"/g, "'")}"`);
      else if (r.kind === "has_many") er.push(`  ${ent(e.name)} ||--o{ ${to} : has`);
      else er.push(`  ${ent(e.name)} }o--o{ ${to} : linked`);
    }
  }
  er.push("```");
  out.push("Entity relationship diagram:", "", ...er, "");
  out.push("## Features in depth", "");
  for (const f of model.features) {
    out.push(`### ${f.name} [${f.id}]`, "", `${f.summary}${cite(f.screens)}`, "");
    out.push(
      `- Module: ${f.module}; kind: ${f.kind.replace(/_/g, " ")}; screens: ${f.screens.map((id) => nameOf.get(id) ?? id).join(", ")}`,
    );
    if (f.operations.length) out.push(`- Users can: ${f.operations.map(opWords).join(", ")}`);
    if (f.logic.length) out.push("", "How it probably works:", "", ...f.logic.map((l) => `- ${l}`));
    if (f.data_use.length)
      out.push("", "How its data is reused:", "", ...f.data_use.map((l) => `- ${l}`));
    if (f.acceptance.length)
      out.push("", "Acceptance criteria (draft):", "", ...f.acceptance.map((l) => `- ${l}`));
    if (f.questions.length)
      out.push("", "Check by using it:", "", ...f.questions.map((l) => `- [ ] ${l}`));
    out.push("");
  }
  out.push("## Business rules", "");
  if (!model.rules.length) out.push("- None seen on the captured screens.");
  for (const r of model.rules)
    out.push(`- **${r.name}** (${r.kind}) [${r.id}]: ${r.text}${cite(r.screens)}`);
  out.push("", "## Roles", "");
  if (!model.roles.length)
    out.push("- No role names seen. Open the team or permission settings by hand if you can.");
  for (const r of model.roles) out.push(`- ${r.name} [${r.id}]${cite(r.screens)}`);
  out.push("", "## Non-functional requirements", "");
  out.push(
    "| Category | Requirement | Priority | Why | Basis |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const n of model.nfrs) {
    out.push(
      `| ${n.category} | **${n.name}** [${n.id}]: ${n.statement} | ${n.priority} | ${n.why}${cite(n.screens)} | ${n.basis} |`,
    );
  }
  out.push(
    "",
    "## Next steps",
    "",
    '1. Work through the "Check by using it" boxes above in the product (a test account is best), and note what you find in the inbox.',
    "2. Correct the nodes reb made (`reb kb show <id>`): attribute types, states, relations, logic. Raise a node's label to observed only when you saw it yourself.",
    "3. Write the requirements report: `reb report requirements` (functional and non-functional requirements, data model, feature logic).",
    "",
  );
  return out.join("\n");
}
