# pipelines

Plan templates per product category, used by `create_plan` to build a run's first plan (SPEC 8):
`b2b-saas`, `developer-tool`, `marketplace`, `consumer-app`, `ai-tool`.

Each file has `id`, `title`, `description`, `focus` (focus-question tasks go after the `after` tasks and
before the `before` tasks) and `tasks`. A task has `id`, `title`, `role`, `depends_on`, `inputs`,
`outputs` and `done_when`, and optionally:

- `reports`: only include the task when one of these reports is requested (left out = always);
- `per_report`: make one copy per requested report, replacing `{report}` in the text.

Write `done_when` in the fixed wording `check_gate` understands (see `src/domain/gate.ts`), for example
"at least 3 competitor nodes" or "every feature node has evidence"; anything else becomes a checklist item.
Tests check that every file is valid and has no dependency cycles.
