import type { NodeType } from "./links.js";
import type { Role } from "./plan.js";

/**
 * The one table of which role finds nodes of each type. Pipelines (checked when a pipeline file
 * is read), focus-question tasks and audit suggestions all use it, so they never disagree.
 */
export const ROLE_FOR_TYPE: Record<NodeType, Role> = {
  company: "desk_researcher",
  product: "desk_researcher",
  module: "desk_researcher",
  pricing_tier: "desk_researcher",
  // Integrations are listed on public integration pages and docs.
  integration: "desk_researcher",
  feature: "feature_analyst",
  journey: "business_analyst",
  persona: "business_analyst",
  competitor: "market_researcher",
  market_segment: "market_researcher",
  data_object: "architect",
  hypothesis: "architect",
  question: "kb_curator",
};
