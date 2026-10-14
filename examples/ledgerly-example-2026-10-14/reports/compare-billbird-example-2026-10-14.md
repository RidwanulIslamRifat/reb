# Comparison: ledgerly.example and billbird.example

Two different products: **ledgerly.example (ledgerly-example-2026-10-14)** and **billbird.example (billbird-example-2026-10-14)**. Nodes are matched by type and name, so the lists below show what one has and the other does not (as far as each graph knows).

## Size of each analysis

| Node type | ledgerly-example-2026-10-14 | billbird-example-2026-10-14 |
| --- | --- | --- |
| company | 1 | 0 |
| product | 1 | 1 |
| module | 2 | 0 |
| feature | 5 | 2 |
| journey | 2 | 0 |
| persona | 1 | 0 |
| data_object | 3 | 0 |
| integration | 1 | 0 |
| pricing_tier | 2 | 0 |
| competitor | 2 | 0 |
| market_segment | 1 | 0 |
| hypothesis | 1 | 0 |
| value_proposition | 2 | 0 |
| revenue_stream | 2 | 0 |
| cost_driver | 1 | 0 |
| channel | 1 | 0 |
| partner | 1 | 0 |
| customer | 1 | 0 |
| metric | 3 | 0 |
| funding_round | 1 | 0 |
| leader | 1 | 0 |
| signal | 2 | 0 |
| geography | 1 | 0 |
| compliance | 2 | 0 |
| finding | 6 | 0 |
| risk | 5 | 0 |
| trend | 3 | 0 |
| force | 3 | 0 |
| technology | 3 | 0 |
| screen | 5 | 0 |
| user_role | 2 | 0 |
| business_rule | 3 | 0 |
| api_endpoint | 1 | 0 |

Evidence labels: ledgerly-example-2026-10-14: 76% documented, 24% inferred; billbird-example-2026-10-14: 100% documented.

## Metrics side by side

| Metric | ledgerly-example-2026-10-14 | billbird-example-2026-10-14 |
| --- | --- | --- |
| customers | 4000 (2026-06) | (none) |
| employees | 35 (2026-06) | (none) |
| tam | 12B USD (2026) | (none) |

## Only in ledgerly.example (ledgerly-example-2026-10-14)

- **module**: Invoicing [module-invoicing]; Payments [module-payments]
- **feature**: Bank reconciliation [feature-bank-reconciliation]; Card payments [feature-card-payments]; Payment reminders [feature-payment-reminders]; Recurring invoices [feature-recurring-invoices]
- **persona**: Freelancer [persona-freelancer]
- **integration**: Xero [integration-xero]
- **pricing_tier**: Free [pricing_tier-free]; Pro [pricing_tier-pro]
- **competitor**: Billbird [competitor-billbird]; Paypad [competitor-paypad]
- **market_segment**: Freelancers and small agencies [market_segment-freelancers-and-small-agencies]
- **revenue_stream**: Card payment fees [revenue_stream-card-payment-fees]; Pro subscription [revenue_stream-pro-subscription]
- **channel**: Self-serve sign-up [channel-self-serve-sign-up]
- **geography**: European Union [geography-european-union]
- **compliance**: GDPR [compliance-gdpr]; PSD2 [compliance-psd2]
- **risk**: Card data breach [risk-card-data-breach]; One payment processor [risk-one-payment-processor]; Payment regulation changes [risk-payment-regulation-changes]; Price war with bigger rivals [risk-price-war-with-bigger-rivals]; Small-business churn [risk-small-business-churn]
- **technology**: PostgreSQL [technology-postgresql]; React [technology-react]; Stripe [technology-stripe]

## Only in billbird.example (billbird-example-2026-10-14)

- **feature**: Time tracking [feature-time-tracking]

## Read with care

A node missing from one run can mean the product does not have it, or that the analysis did not find or record it. Check the evidence before stating a gap as fact.
