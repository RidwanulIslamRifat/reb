# Examples

## tidyhive-example-2026-10-14: a complete, made-up analysis

**Tidyhive** (`tidyhive.example`) does not exist. It is a fictional shared task board for small
teams, invented to show what a finished reb analysis looks like. Every company, page and number in
this folder is made up; the `.example` web addresses can never belong to a real site.

The analysis asked for one report, the feature report. It went like this:

1. A run was created and the brief filled in (`brief.md`).
2. reb made a 9-task plan for a business software product (`plan/history/plan-v1.json`).
3. The first round of research recorded 4 sources and 11 findings, and built the company, product,
   modules, features and pricing plans into the knowledge map (`kb/nodes/`, `evidence/ledger.jsonl`).
4. The first audit found 3 gaps: no journeys, no persona, no integration
   (`logs/audits/audit-1.md`). The re-plan added a task for each and a second audit, with the reason
   for every change in `logs/decisions.md`.
5. The second round filled the gaps; the second audit found none (`logs/audits/audit-2.md`).
6. The report writer's draft (`notes/report-feature.md`) became the cited report in
   `reports/feature.md` and `reports/feature.docx`.

### Things to open first

- `reports/feature.md`: the finished report. Every line cites a node or evidence id such as `[E-012]`.
- `logs/decisions.md`: every plan change, with its reason.
- `logs/audits/audit-1.md`: what the auditor found missing, and what it suggested.

### See it in the dashboard

From a copy of the reb repository (after `npm ci` and `npm run build`):

```sh
node dist/cli.js dashboard --run examples/tidyhive-example-2026-10-14
```

A page opens in your browser with the plan, the knowledge map, the evidence and the report. Press
Ctrl+C in the terminal to stop it.

### How it was made

The folder is the output of reb's end-to-end test (`tests/e2e/fullRun.test.ts`), which runs this whole
analysis through reb's own commands without touching the internet. To make it again:

```sh
REB_E2E_KEEP=$PWD/examples/new-copy npx vitest run tests/e2e/fullRun.test.ts
```

`tests/examples.test.ts` checks that this example keeps working as reb changes.

## ledgerly-example-2026-10-14: a business-depth analysis with audit-grade reports (v2)

**Ledgerly** (`ledgerly.example`) does not exist either. It is a fictional invoicing and payments
company for freelancers, made up to show what reb v2 adds: analysing a business the way an analyst,
investor or audit team would, not only its features.

The analysis asked for four reports: due diligence, risk, strategy and rebuild.

1. reb made a plan from the **fintech** pipeline, with tasks for the business model, the company's
   condition (metrics, funding, leaders, growth signals), regulation, technology, screens and rules,
   PESTLE and five forces, the risk register and rated findings (`plan/plan.json`).
2. The research recorded typed facts: risks with likelihood, impact and mitigation; findings with a
   rating, SWOT place and recommendation; dated metrics; laws that apply; screens with their paths
   (`kb/nodes/`).
3. A document "handed over by the business" (`evidence/inbox/provided/pitch-deck.pdf`, a fake file)
   was imported and labelled **provided**.
4. The audit found no gaps (`logs/audits/audit-1.md`).
5. reb wrote the four reports (`reports/`), each with report details and an overall confidence
   rating, scope and methodology, framework views (SWOT, risk register, business model canvas ...),
   limitations and a disclaimer, sources and open questions. The due diligence report also has a Word
   copy and a web copy you can print to PDF (`reports/due_diligence.docx`, `reports/due_diligence.html`).
6. The run was compared with a run of a made-up competitor, Billbird
   (`reports/compare-billbird-example-2026-10-14.md`).

### Things to open first

- `reports/due_diligence.html`: open it in your browser; File > Print > Save as PDF gives a clean PDF.
- `reports/risk.md`: the risk register with its heat map.
- `reports/rebuild.md`: screens, roles, data model and user stories for rebuilding the product.

To make it again:

```sh
REB_E2E_KEEP_V2=$PWD/examples/new-copy npx vitest run tests/e2e/v2Run.test.ts
```
