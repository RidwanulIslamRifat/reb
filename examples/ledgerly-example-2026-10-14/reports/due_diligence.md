# Business condition and due diligence: ledgerly.example

The condition of ledgerly.example's business as an investor, acquirer or audit team would assess it: company,
business model, traction, market, risks and technology, with rated findings and recommendations.

## Report details

| | |
| --- | --- |
| Subject | ledgerly.example (https://ledgerly.example) |
| Report | Business condition and due diligence |
| Analysis run | ledgerly-example-2026-10-14 |
| Date | 2026-10-14 |
| Evidence base | 4 sources, 72 evidence records (0 observed, 1 provided, 54 documented, 17 inferred, 0 unknown) |
| Overall confidence | **Medium** (74 of 100): 37 evidence records behind 36 items shown (36 with evidence), weighted by label, minus 0 points for 0 unmet section needs |

## Executive summary

Ledgerly is a small, growing invoicing and payments company for freelancers in the EU
[company-ledgerly-labs, metric-customers-mid-2026]. Its strengths are fast onboarding and clear
growth signals [finding-fast-onboarding, signal-hiring-engineers]; its biggest risk is depending on
one payment processor [risk-one-payment-processor].

## Scope and methodology

- **Subject**: ledgerly.example, analysed as a fintech business.
- **Focus questions**: "What are the biggest risks?".
- **Sources**: public pages read one at a time (obeying robots.txt), each recorded with its address, date read and a fingerprint of its content; documents the business handed over.
- **Period**: evidence collected from 2026-10-14 to 2026-10-14.
- **Evidence labels**: every finding is labelled **observed** (seen in the analyst's own use of the product), **provided** (from a document the business handed over), **documented** (stated publicly), **inferred** (a reasoned judgement) and **unknown** (not confirmed). Ids in [brackets] cite knowledge-graph items (kb/nodes/<id>.md) and evidence (E-) or source (S-) records (evidence/ledger.jsonl).
- **Boundaries**: normal use only. reb never logs in to the product for the analyst, never calls its private interfaces, never replays or alters requests, never scrapes and never automates clicks.

## Key findings and recommendations

_The most important conclusions about the business, rated, with what to do about each._

The most urgent step is a second payment processor [finding-dependence-on-one-processor].

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

## Company and leadership

_Who the company is, who leads it and where it operates._

### Leadership

- **Test Founder**, CEO and co-founder at Ledgerly Labs [leader-test-founder, E-031]

### Company (1)

- **Ledgerly Labs** (documented): Makes: Ledgerly. Earns from: Pro subscription, Card payment fees. Incurs: Payment processing. Sells through: Self-serve sign-up. Partners with: Example Bank. Raised: Seed round. Complies with: PSD2, GDPR. Operates in: European Union. Measured by: Employees mid 2026. Led by: Test Founder. Affected by: Many invoicing apps, Hiring engineers. [company-ledgerly-labs, E-001]
  - documented: Ledgerly Labs: as read on the public pages. [E-001, S-001]

### Product (1)

- **Ledgerly** (documented): Has: Invoicing, Payments. Delivers: Get paid in one click, No more chasing late payers. Exposes: List invoices. Made by: Ledgerly Labs. Bought by: Example Studio. Measured by: Customers mid 2026. Built with: React. Threatened by: Card data breach. Findings about it: Fast onboarding. Affected by: E-invoicing mandates. [product-ledgerly, E-002, E-072]
  - documented: Ledgerly: as read on the public pages. [E-002, S-001]
  - provided: Document pitch-deck.pdf about Ledgerly, provided by the business. Limits: From a document the business handed over; not checked against public sources. [E-072, S-004]

### Geographies (1)

- **European Union** (documented): Home to: Ledgerly Labs. [geography-european-union, E-034]
  - documented: European Union: as read on the public pages. [E-034, S-001]

## Business model

_What the business promises, to whom, how it reaches them and how it makes money._

### Business model canvas

**Customer segments**

- Freelancers and small agencies [market_segment-freelancers-and-small-agencies, E-016]
- Example Studio [customer-example-studio, E-026]
- Freelancer [persona-freelancer, E-013]

**Value propositions**

- Get paid in one click [value_proposition-get-paid-in-one-click, E-019]
- No more chasing late payers [value_proposition-no-more-chasing-late-payers, E-020]

**Channels**

- Self-serve sign-up (self serve) [channel-self-serve-sign-up, E-023]

**Customer relationships (main journeys)**

- Chase a late invoice [journey-chase-a-late-invoice, E-015]
- Get paid [journey-get-paid, E-014]

**Revenue streams**

- Card payment fees (transaction fee) [revenue_stream-card-payment-fees, E-022]
- Pro subscription (subscription) [revenue_stream-pro-subscription, E-021]

**Key resources**

- PostgreSQL [technology-postgresql, E-055]
- React [technology-react, E-054]
- Stripe [technology-stripe, E-056]
- Client [data_object-client, E-068]
- Invoice [data_object-invoice, E-067]
- Payment [data_object-payment, E-069]

**Key activities (product areas)**

- Invoicing [module-invoicing, E-003]
- Payments [module-payments, E-004]

**Key partners**

- Example Bank [partner-example-bank, E-025]
- Xero [integration-xero, E-012]

**Cost structure**

- Payment processing [cost_driver-payment-processing, E-024]

## Traction and financial condition

_Dated numbers on size and growth, funding history and recent signals._

### Key metrics

| Metric | Kind | Value | As of | Measures | Cites |
| --- | --- | --- | --- | --- | --- |
| Customers mid 2026 | customers | 4000 | 2026-06 | Ledgerly | [metric-customers-mid-2026, E-027] |
| Employees mid 2026 | employees | 35 | 2026-06 | Ledgerly Labs | [metric-employees-mid-2026, E-028] |

### Funding history

| Date | Round | Amount | Investors | Cites |
| --- | --- | --- | --- | --- |
| 2025-03 | Seed | USD 3M |  | [funding_round-seed-round, E-030] |

### Growth signals

| Date | Signal | Kind | Direction | Cites |
| --- | --- | --- | --- | --- |
| 2026-08 | Hiring engineers | hiring | positive | [signal-hiring-engineers, E-032] |
| 2026-05 | Card payments launch | launch | positive | [signal-card-payments-launch, E-033] |

2 positive and 0 negative signals of 2 [signal-hiring-engineers, signal-card-payments-launch].

## Market and competition

_The market the business plays in, its size, and how competitors compare._

### Market size

| Measure | Value | As of | Market | Cites |
| --- | --- | --- | --- | --- |
| TAM (total addressable market) | 12B USD | 2026 | Invoicing software market | [metric-invoicing-software-market, E-029] |

### Competitor feature matrix

| Feature | Billbird | Paypad | Cites |
| --- | --- | --- | --- |
| Bank reconciliation |  |  | [feature-bank-reconciliation, E-009] |
| Card payments |  |  | [feature-card-payments, E-008] |
| Payment reminders |  |  | [feature-payment-reminders, E-007] |
| Recurring invoices |  |  | [feature-recurring-invoices, E-006] |
| Send invoice | yes |  | [feature-send-invoice, E-005] |

"yes" means the competitor also offers the feature; an empty cell means no evidence was recorded, not that it is missing [competitor-billbird, competitor-paypad].

### Market segments (1)

- **Freelancers and small agencies** (documented): Includes: Freelancer. Contested by: Billbird, Paypad. [market_segment-freelancers-and-small-agencies, E-016]
  - documented: Freelancers and small agencies: as read on the public pages. [E-016, S-001]

## Risks and compliance

_The risk register, and the laws and certifications that apply._

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

### Compliance and certifications

| Name | Kind | Status | Applies to | Cites |
| --- | --- | --- | --- | --- |
| GDPR | regulation | claimed | Ledgerly Labs | [compliance-gdpr, E-036] |
| PSD2 | regulation | applies | Ledgerly Labs | [compliance-psd2, E-035] |

## Technology and operations

_What the product is built with and what it depends on._

### Technology stack

| Part of the stack | Technology | Label | Powers | Cites |
| --- | --- | --- | --- | --- |
| Frontend | React | documented | Ledgerly | [technology-react, E-054] |
| Database | PostgreSQL | inferred |  | [technology-postgresql, E-055] |
| Payments | Stripe | documented | Card payments | [technology-stripe, E-056] |

### Integrations (1)

- **Xero** (documented): Used by: Bank reconciliation. [integration-xero, E-012]
  - documented: Xero: as read on the public pages. [E-012, S-001]

## Limitations and disclaimer

The main limits of the evidence behind this report:

- From a document the business handed over; not checked against public sources. (1 record)

32% of the evidence behind this report is inferred or unconfirmed; those points are judgements, not facts. This report is based on public information, documents the business provided. It is not an audit opinion, legal advice or investment advice. Facts may have changed since the dates given. Check the cited sources before relying on any single point.

## Sources

- **S-001** Ledgerly home page, Ledgerly Labs. https://ledgerly.example (published 2026-09-01; read 2026-10-14)
- **S-003** Ledgerly legal and compliance, Ledgerly Labs. https://ledgerly.example/legal (published 2026-09-01; read 2026-10-14)
- **S-004** Document pitch-deck.pdf (provided), the analysed business (provided document). evidence/inbox/provided/pitch-deck.pdf (read 2026-10-14)

## Open questions

No open questions.
