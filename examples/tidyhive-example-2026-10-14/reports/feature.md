# Feature report: tidyhive.example

What tidyhive.example does: its modules, features, main journeys and what each plan includes.

## Report details

| | |
| --- | --- |
| Subject | tidyhive.example (https://tidyhive.example) |
| Report | Feature report |
| Analysis run | tidyhive-example-2026-10-14 |
| Date | 2026-10-14 |
| Evidence base | 4 sources, 15 evidence records (0 observed, 0 provided, 15 documented, 0 inferred, 0 unknown) |
| Overall confidence | **High** (85 of 100): 14 evidence records behind 14 items shown (14 with evidence), weighted by label, minus 0 points for 0 unmet section needs |

## Executive summary

Tidyhive is a shared task board for small teams [product-tidyhive, E-002], made by Tidyhive Labs
[company-tidyhive-labs, E-001].

## Scope and methodology

- **Subject**: tidyhive.example, analysed as a b2b-saas business.
- **Sources**: public pages read one at a time (obeying robots.txt), each recorded with its address, date read and a fingerprint of its content.
- **Period**: evidence collected from 2026-10-14 to 2026-10-14.
- **Evidence labels**: every finding is labelled **observed** (seen in the analyst's own use of the product), **provided** (from a document the business handed over), **documented** (stated publicly), **inferred** (a reasoned judgement) and **unknown** (not confirmed). Ids in [brackets] cite knowledge-graph items (kb/nodes/<id>.md) and evidence (E-) or source (S-) records (evidence/ledger.jsonl).
- **Boundaries**: normal use only. reb never logs in to the product for the analyst, never calls its private interfaces, never replays or alters requests, never scrapes and never automates clicks.

## Product and modules

_The product and how it is split into modules._

The product has two modules: Boards for everyday work and Admin for workspace owners
[module-boards, module-admin].

### Product (1)

- **Tidyhive** (documented): Has: Boards, Admin. Made by: Tidyhive Labs. [product-tidyhive, E-002]
  - documented: Tidyhive is a shared task board for small teams. [E-002, S-001]

### Modules (2)

- **Admin** (documented): Has: Single sign-on, Audit log. Part of: Tidyhive. [module-admin, E-004]
  - documented: The help center has an Admin section for workspace owners. [E-004, S-004]
- **Boards** (documented): Has: Kanban board, Recurring tasks, CSV export. Part of: Tidyhive. [module-boards, E-003]
  - documented: The home page groups the board features under Boards. [E-003, S-001]

## Features

_What the product can do, with how sure we are of each feature._

- Boards hold the core work: a kanban board, recurring tasks and CSV export [feature-kanban-board,
  feature-recurring-tasks, feature-csv-export].
- Single sign-on and the audit log are Team plan features [feature-single-sign-on, E-008, E-009].

### Features (5)

- **Audit log** (documented): Available on: Team. Part of: Admin. [feature-audit-log, E-009]
  - documented: An audit log of workspace changes is listed on the Team plan. [E-009, S-002]
- **CSV export** (documented): Part of: Boards. [feature-csv-export, E-007]
  - documented: A board can be exported as a CSV file. [E-007, S-004]
- **Kanban board** (documented): Connects to: Slack. Part of: Boards. Used in: Set up a board. [feature-kanban-board, E-005]
  - documented: Tasks move between columns on a board. [E-005, S-001]
- **Recurring tasks** (documented): Part of: Boards. [feature-recurring-tasks, E-006]
  - documented: A task can repeat daily, weekly or monthly. [E-006, S-004]
- **Single sign-on** (documented): Available on: Team. Part of: Admin. [feature-single-sign-on, E-008]
  - documented: Single sign-on is listed on the Team plan only. [E-008, S-002]

## Key journeys

_The main tasks people do with the product, step by step._

A team lead sets up a board and then invites teammates [persona-team-lead, journey-set-up-a-board,
journey-invite-a-teammate].

### Journeys (2)

- **Invite a teammate** (documented): Done by: Team lead. [journey-invite-a-teammate, E-015]
  - documented: Teammates are invited by email from the Admin module. [E-015, S-004]
- **Set up a board** (documented): Steps, in order: Kanban board. Done by: Team lead. [journey-set-up-a-board, E-014]
  - documented: The guide's first steps: create a board, add columns, add tasks. [E-014, S-004]

### Personas (1)

- **Team lead** (documented): Does: Set up a board, Invite a teammate. [persona-team-lead, E-013]
  - documented: The getting-started guide is written for a team lead. [E-013, S-004]

## What each plan includes

_Which features each plan unlocks._

Free is for up to 3 people; Team adds single sign-on and the audit log [pricing_tier-free, E-010,
pricing_tier-team, E-011].

### Plans (2)

- **Free** (documented):  [pricing_tier-free, E-010]
  - documented: Free costs nothing, for up to 3 people. [E-010, S-002]
- **Team** (documented): Unlocks: Audit log, Single sign-on. [pricing_tier-team, E-011]
  - documented: Team costs 6 USD per person per month. [E-011, S-002]

## Integrations

_Other tools the product connects to._

Slack is the only integration found so far [integration-slack, E-012].

### Integrations (1)

- **Slack** (documented): Used by: Kanban board. [integration-slack, E-012]
  - documented: Board changes can be posted to a Slack channel. [E-012, S-003]

## Limitations and disclaimer

0% of the evidence behind this report is inferred or unconfirmed; those points are judgements, not facts. This report is based on public information. It is not an audit opinion, legal advice or investment advice. Facts may have changed since the dates given. Check the cited sources before relying on any single point.

## Sources

- **S-001** Tidyhive home page, Tidyhive Labs. https://tidyhive.example (published 2026-09-01; read 2026-10-14)
- **S-002** Tidyhive pricing, Tidyhive Labs. https://tidyhive.example/pricing (published 2026-09-01; read 2026-10-14)
- **S-003** Tidyhive integrations, Tidyhive Labs. https://tidyhive.example/integrations (published 2026-09-01; read 2026-10-14)
- **S-004** Tidyhive help center, Tidyhive Labs. https://help.tidyhive.example (published 2026-09-01; read 2026-10-14)

## Open questions

No open questions.
