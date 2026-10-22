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
  // v2: business model
  value_proposition: "business_analyst",
  revenue_stream: "business_analyst",
  cost_driver: "business_analyst",
  channel: "business_analyst",
  partner: "business_analyst",
  customer: "business_analyst",
  // v2: company condition
  metric: "financial_analyst",
  funding_round: "financial_analyst",
  leader: "financial_analyst",
  signal: "financial_analyst",
  geography: "desk_researcher",
  compliance: "risk_analyst",
  // v2: strategy and risk
  finding: "strategy_analyst",
  trend: "strategy_analyst",
  force: "strategy_analyst",
  risk: "risk_analyst",
  // v2: technology and rebuild
  technology: "tech_observer",
  api_endpoint: "architect",
  // Screens, roles and rules come from the user's hands-on session and the help docs.
  screen: "feature_analyst",
  user_role: "feature_analyst",
  business_rule: "feature_analyst",
  // Requirements come from the feature model (reb capture, analyse_capture) and the hands-on session.
  requirement: "feature_analyst",
};
