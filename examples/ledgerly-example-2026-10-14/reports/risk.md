# Risk assessment: ledgerly.example

What could go wrong for ledgerly.example, how likely and how bad it would be, and what is done about it.

## Report details

| | |
| --- | --- |
| Subject | ledgerly.example (https://ledgerly.example) |
| Report | Risk assessment |
| Analysis run | ledgerly-example-2026-10-14 |
| Date | 2026-10-14 |
| Evidence base | 4 sources, 72 evidence records (0 observed, 1 provided, 54 documented, 17 inferred, 0 unknown) |
| Overall confidence | **Medium** (63 of 100): 24 evidence records behind 24 items shown (24 with evidence), weighted by label, minus 0 points for 0 unmet section needs |

## Scope and methodology

- **Subject**: ledgerly.example, analysed as a fintech business.
- **Focus questions**: "What are the biggest risks?".
- **Sources**: public pages read one at a time (obeying robots.txt), each recorded with its address, date read and a fingerprint of its content; documents the business handed over.
- **Period**: evidence collected from 2026-10-14 to 2026-10-14.
- **Evidence labels**: every finding is labelled **observed** (seen in the analyst's own use of the product), **provided** (from a document the business handed over), **documented** (stated publicly), **inferred** (a reasoned judgement) and **unknown** (not confirmed). Ids in [brackets] cite knowledge-graph items (kb/nodes/<id>.md) and evidence (E-) or source (S-) records (evidence/ledger.jsonl).
- **Boundaries**: normal use only. reb never logs in to the product for the analyst, never calls its private interfaces, never replays or alters requests, never scrapes and never automates clicks.

## Risk register

_Every risk with its likelihood, impact, score and mitigation, highest first, and a heat map._

### Risk register

| # | Risk | Category | Likelihood | Impact | Score | Rating | Mitigation | Threatens | Cites |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | One payment processor | dependency | medium | high | 6 | high | None public | Card payments | [risk-one-payment-processor, E-043] |
| R2 | Price war with bigger rivals | competitive | high | medium | 6 | high | Free plan and niche focus |  | [risk-price-war-with-bigger-rivals, E-045] |
| R3 | Payment regulation changes | regulatory | medium | medium | 4 | medium | Legal page names a compliance lead |  | [risk-payment-regulation-changes, E-044] |
| R4 | Card data breach | security | low | high | 3 | medium | Card data stays with the processor | Ledgerly | [risk-card-data-breach, E-047] |
| R5 | Small-business churn | market | medium | low | 2 | low | Annual plans |  | [risk-small-business-churn, E-046] |

Heat map (risk numbers by impact and likelihood):

| Impact \ Likelihood | Low | Medium | High |
| --- | --- | --- | --- |
| High | R4 | R1 |  |
| Medium |  | R3 | R2 |
| Low |  | R5 |  |

5 risks, 2 rated high [risk-one-payment-processor, risk-price-war-with-bigger-rivals, risk-payment-regulation-changes, risk-card-data-breach, risk-small-business-churn].

## Findings and recommendations

_The conclusions the risks lead to, and what to do about them._

### Key findings

| Rating | Area | Finding | Recommendation | Cites |
| --- | --- | --- | --- | --- |
| High | Operations | **Dependence on one processor** | Add a second processor | [finding-dependence-on-one-processor, E-051] |
| High | Market | **E-invoicing creates demand** | Ship e-invoice formats early | [finding-e-invoicing-creates-demand, E-050] |
| High | Product | **Fast onboarding** | Keep the three-step setup | [finding-fast-onboarding, E-048] |
| Medium | Finance | **Healthy growth signals** | Publish growth figures | [finding-healthy-growth-signals, E-053] |
| Medium | Technology | **No public API** | Publish a read-only API | [finding-no-public-api, E-049] |
| Medium | People | **Small team for a regulated product** | Hire a compliance specialist | [finding-small-team-for-a-regulated-product, E-052] |

### Recommendations

1. **High priority**: Add a second processor (from: Dependence on one processor) [finding-dependence-on-one-processor, E-051]
2. **High priority**: Ship e-invoice formats early (from: E-invoicing creates demand) [finding-e-invoicing-creates-demand, E-050]
3. **High priority**: Keep the three-step setup (from: Fast onboarding) [finding-fast-onboarding, E-048]
4. **Medium priority**: Publish growth figures (from: Healthy growth signals) [finding-healthy-growth-signals, E-053]
5. **Medium priority**: Publish a read-only API (from: No public API) [finding-no-public-api, E-049]
6. **Medium priority**: Hire a compliance specialist (from: Small team for a regulated product) [finding-small-team-for-a-regulated-product, E-052]

## Compliance and regulation

_The laws that apply and the certifications or standards the business claims or holds._

### Compliance and certifications

| Name | Kind | Status | Applies to | Cites |
| --- | --- | --- | --- | --- |
| GDPR | regulation | claimed | Ledgerly Labs | [compliance-gdpr, E-036] |
| PSD2 | regulation | applies | Ledgerly Labs | [compliance-psd2, E-035] |

## External threats

_Trends and competitive forces that could hurt the business._

### PESTLE analysis

| Factor | Trend | Direction | Affects | Cites |
| --- | --- | --- | --- | --- |
| Political | None recorded | | | |
| Economic | Higher interest rates | headwind |  | [trend-higher-interest-rates, E-038] |
| Social | None recorded | | | |
| Technological | AI bookkeeping | tailwind |  | [trend-ai-bookkeeping, E-039] |
| Legal | E-invoicing mandates | tailwind | Ledgerly | [trend-e-invoicing-mandates, E-037] |
| Environmental | None recorded | | | |

### Porter's five forces

| Force | Strength | What drives it | Cites |
| --- | --- | --- | --- |
| Rivalry | high | Many invoicing apps | [force-many-invoicing-apps, E-040] |
| New entrants | not assessed | | |
| Substitutes | medium | Spreadsheets and bank apps | [force-spreadsheets-and-bank-apps, E-042] |
| Buyer power | medium | Easy switching | [force-easy-switching, E-041] |
| Supplier power | not assessed | | |

Overall competitive pressure: **medium** (average of 3 assessed forces) [force-easy-switching, force-many-invoicing-apps, force-spreadsheets-and-bank-apps].

## Dependencies

_Outside services, partners and technologies the business relies on._

### Integrations (1)

- **Xero** (documented): Used by: Bank reconciliation. [integration-xero, E-012]
  - documented: Xero: as read on the public pages. [E-012, S-001]

### Partners (1)

- **Example Bank** (documented): Partner of: Ledgerly Labs. [partner-example-bank, E-025]
  - documented: Example Bank: as read on the public pages. [E-025, S-001]

### Technologies (3)

- **PostgreSQL** (inferred): Category: database. [technology-postgresql, E-055]
  - inferred: PostgreSQL: as read on the public pages. [E-055, S-001]
- **React** (documented): Powers: Ledgerly. Category: frontend. [technology-react, E-054]
  - documented: React: as read on the public pages. [E-054, S-001]
- **Stripe** (documented): Powers: Card payments. Category: payments. [technology-stripe, E-056]
  - documented: Stripe: as read on the public pages. [E-056, S-001]

## Limitations and disclaimer

63% of the evidence behind this report is inferred or unconfirmed; those points are judgements, not facts. This report is based on public information, documents the business provided. It is not an audit opinion, legal advice or investment advice. Facts may have changed since the dates given. Check the cited sources before relying on any single point.

## Sources

- **S-001** Ledgerly home page, Ledgerly Labs. https://ledgerly.example (published 2026-09-01; read 2026-10-14)
- **S-003** Ledgerly legal and compliance, Ledgerly Labs. https://ledgerly.example/legal (published 2026-09-01; read 2026-10-14)

## Open questions

No open questions.
