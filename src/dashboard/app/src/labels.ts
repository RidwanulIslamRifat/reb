import type { Label, Status } from "./api";

/** Plain-language names for everything reb shows. One place, so wording stays consistent. */

export const STATUS: Record<Status, { name: string; hint: string }> = {
  pending: { name: "To do", hint: "Not started yet" },
  running: { name: "In progress", hint: "Being worked on now" },
  needs_human: { name: "Waiting for you", hint: "Needs you to do something by hand" },
  done: { name: "Done", hint: "Finished and checked" },
  blocked: { name: "Blocked", hint: "Cannot go on until something else is fixed" },
  dropped: { name: "Dropped", hint: "Removed from the plan, kept for the record" },
};
export const STATUS_ORDER: Status[] = [
  "needs_human",
  "running",
  "pending",
  "blocked",
  "done",
  "dropped",
];

export const LABEL: Record<Label, { name: string; hint: string }> = {
  observed: { name: "Seen", hint: "Seen in your own use of the product" },
  provided: { name: "Provided", hint: "From a document the business handed over itself" },
  documented: { name: "Published", hint: "Stated publicly by the company or another source" },
  inferred: { name: "Educated guess", hint: "Reasoned from other facts, not confirmed" },
  unknown: { name: "Not confirmed", hint: "No evidence yet" },
};
export const LABELS: Label[] = ["observed", "provided", "documented", "inferred", "unknown"];

export const ROLE: Record<string, string> = {
  planner: "Planner",
  auditor: "Auditor",
  desk_researcher: "Desk researcher",
  market_researcher: "Market researcher",
  walkthrough_coach: "Walkthrough coach",
  tech_observer: "Tech observer",
  feature_analyst: "Feature analyst",
  business_analyst: "Business analyst",
  architect: "Architect",
  kb_curator: "Knowledge keeper",
  report_writer: "Report writer",
  financial_analyst: "Financial analyst",
  strategy_analyst: "Strategy analyst",
  risk_analyst: "Risk analyst",
};
export const roleName = (role: string) => ROLE[role] ?? humanize(role);

/** Node types, grouped into families. A family shares a colour; each type has its own shape. */
export const NODE_TYPES: Record<string, { name: string; family: string; shape: string }> = {
  company: { name: "Company", family: "business", shape: "round-rectangle" },
  product: { name: "Product", family: "business", shape: "ellipse" },
  module: { name: "Product area", family: "business", shape: "hexagon" },
  feature: { name: "Feature", family: "feature", shape: "ellipse" },
  data_object: { name: "Data", family: "feature", shape: "barrel" },
  integration: { name: "Integration", family: "feature", shape: "diamond" },
  persona: { name: "User type", family: "people", shape: "ellipse" },
  journey: { name: "User journey", family: "people", shape: "round-tag" },
  market_segment: { name: "Market segment", family: "people", shape: "hexagon" },
  pricing_tier: { name: "Pricing plan", family: "money", shape: "round-rectangle" },
  competitor: { name: "Competitor", family: "market", shape: "octagon" },
  hypothesis: { name: "Idea to check", family: "thinking", shape: "round-diamond" },
  question: { name: "Open question", family: "thinking", shape: "round-triangle" },
  value_proposition: { name: "Value promise", family: "money", shape: "star" },
  revenue_stream: { name: "Revenue stream", family: "money", shape: "ellipse" },
  cost_driver: { name: "Cost", family: "money", shape: "triangle" },
  channel: { name: "Sales channel", family: "money", shape: "vee" },
  partner: { name: "Partner", family: "market", shape: "round-rectangle" },
  customer: { name: "Customer", family: "people", shape: "round-rectangle" },
  metric: { name: "Number", family: "condition", shape: "rectangle" },
  funding_round: { name: "Funding round", family: "condition", shape: "round-tag" },
  leader: { name: "Leader", family: "condition", shape: "ellipse" },
  signal: { name: "Growth signal", family: "condition", shape: "triangle" },
  geography: { name: "Region", family: "condition", shape: "hexagon" },
  compliance: { name: "Compliance", family: "risk", shape: "round-rectangle" },
  finding: { name: "Finding", family: "risk", shape: "star" },
  risk: { name: "Risk", family: "risk", shape: "triangle" },
  trend: { name: "Trend", family: "risk", shape: "vee" },
  force: { name: "Market force", family: "risk", shape: "octagon" },
  technology: { name: "Technology", family: "build", shape: "barrel" },
  screen: { name: "Screen", family: "build", shape: "rectangle" },
  user_role: { name: "User role", family: "build", shape: "ellipse" },
  business_rule: { name: "Business rule", family: "build", shape: "diamond" },
  api_endpoint: { name: "API endpoint", family: "build", shape: "round-tag" },
};
export const typeName = (type: string) => NODE_TYPES[type]?.name ?? humanize(type);

export const FAMILIES: Record<string, string> = {
  business: "Company and product",
  feature: "Features and data",
  people: "People and journeys",
  money: "Pricing and business model",
  market: "Competitors and partners",
  thinking: "Ideas and questions",
  condition: "Company condition",
  risk: "Strategy and risk",
  build: "Technology and rebuild",
};

export const LINK: Record<string, string> = {
  makes: "makes",
  has: "has",
  does: "does",
  uses: "uses",
  gated_by: "needs plan",
  reads_writes: "reads or writes",
  connects_to: "connects to",
  also_offers: "also offers",
  belongs_to: "belongs to",
  explains: "explains",
  evidence: "evidence",
  about: "is about",
  delivers: "delivers",
  serves: "serves",
  earns: "earns from",
  incurs: "incurs",
  sells_through: "sells through",
  partners_with: "partners with",
  buys: "buys",
  measures: "measures",
  raised: "raised",
  leads: "leads",
  complies_with: "complies with",
  operates_in: "operates in",
  competes_in: "competes in",
  powers: "powers",
  threatens: "threatens",
  concerns: "concerns",
  affects: "affects",
  shows: "shows",
  navigates_to: "leads to",
  can: "can use",
  governs: "governs",
  exposes: "exposes",
  relates_to: "relates to",
};
export const linkName = (type: string) => LINK[type] ?? humanize(type);

/** What each reb tool call did, in words, for the activity log. */
export const TOOL: Record<string, string> = {
  create_run: "Started the analysis",
  get_brief: "Read the brief",
  update_brief: "Changed the brief",
  list_runs: "Listed analyses",
  create_plan: "Made the first plan",
  save_plan: "Saved a plan",
  get_plan: "Read the plan",
  next_task: "Picked the next task",
  update_task_status: "Changed a task's status",
  check_gate: "Checked a finished task",
  run_audit: "Ran an audit",
  apply_replan: "Changed the plan after an audit",
  record_source: "Saved a source",
  record_evidence: "Recorded a finding",
  list_evidence: "Read the evidence",
  upsert_node: "Added or updated a knowledge item",
  link_nodes: "Linked two knowledge items",
  get_node: "Read a knowledge item",
  query_graph: "Searched the knowledge graph",
  validate_graph: "Checked the knowledge graph",
  build_graph: "Rebuilt the knowledge graph",
  read_public_page: "Read a public web page",
  detect_tech_stack: "Looked at the technology used",
  summarize_har: "Summarised a network recording",
  make_test_plan: "Made a hands-on test plan",
  make_test_dataset: "Made sample test data",
  import_inbox: "Imported your screenshots and notes",
  record_rea_result: "Imported a reverse-engineering result",
  render_report: "Wrote a report",
  get_framework: "Drew an analysis framework",
  compare_runs: "Compared two analyses",
  log_role_work: "Wrote a work note",
};
export const toolName = (tool: string) => TOOL[tool] ?? humanize(tool);

export const SEVERITY: Record<string, string> = {
  blocking: "Must fix",
  major: "Important",
  minor: "Small",
};

export function humanize(text: string): string {
  const s = text.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
