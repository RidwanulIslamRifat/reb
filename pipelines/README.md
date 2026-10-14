# pipelines

Plan templates per product category, used by `create_plan` to build a run's first plan (SPEC 8):
`b2b-saas`, `developer-tool`, `marketplace`, `consumer-app`, `ai-tool`, and (v2) `ecommerce`,
`fintech`, `service-business` and `general-business` for businesses that are not software products.

Every pipeline also has the v2 tasks, each kept only when a report that needs it is requested:
`business-canvas` (business_analyst), `condition` (financial_analyst: metrics, funding, leaders,
growth signals), `scope-compliance` (risk_analyst: geography, laws and certifications), `stack`
(tech_observer: technology nodes), `product-spec` (feature_analyst: screens, user roles, business
rules), `environment` (strategy_analyst: PESTLE trends and five forces), `risks` (risk_analyst: the
risk register) and `findings` (strategy_analyst: rated findings with recommendations). The fintech
pipeline always checks regulation and risks.

Each file has `id`, `title`, `description`, `focus` (focus-question tasks go after the `after` tasks and
before the `before` tasks) and `tasks`. A task has `id`, `title`, `role`, `depends_on`, `inputs`,
`outputs` and `done_when`, and optionally:

- `reports`: only include the task when one of these reports is requested (left out = always);
- `per_report`: make one copy per requested report, replacing `{report}` in the text.

Write `done_when` in the fixed wording `check_gate` understands (see `src/domain/gate.ts`), for example
"at least 3 competitor nodes" or "every feature node has evidence"; anything else becomes a checklist item.
Tests check that every file is valid and has no dependency cycles.
