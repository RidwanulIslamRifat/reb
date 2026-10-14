# Source playbook

Where to find each part of a business analysis in **public** sources, and how to label it.
Read pages one at a time with `read_public_page` (it obeys robots.txt and records the source);
find them with your own web search. Never log in, never use paywalled or leaked material,
never scrape or bulk-download. If reb refuses a page, do not open it another way.

| Topic                        | Where to look                                                                                             | Node types                                                      | Usual label                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| What the product is and does | Home, product, features, solutions pages; help centre; demo videos' descriptions                          | product, module, feature, value_proposition                     | documented                                           |
| Pricing and packaging        | Pricing page, plan comparison, billing help articles, archived pricing pages                              | pricing_tier, business_rule (limits), revenue_stream            | documented                                           |
| Customers and segments       | Customers / case-study pages, logo walls, review-site category pages, industry pages                      | customer, persona, market_segment                               | documented                                           |
| Business model               | Pricing logic, "how we make money" in filings, partner programme pages, marketplace fees                  | revenue_stream, channel, partner, cost_driver                   | documented or inferred                               |
| Company size and traction    | Annual reports, company registry filings, investor letters, press releases, blog milestones               | metric, signal                                                  | documented (company claims: say so)                  |
| Funding and ownership        | Press releases, company registry, the investors' own announcements                                        | funding_round, metric (funding_total)                           | documented                                           |
| Leadership                   | About / team page, press releases, registry officer lists                                                 | leader                                                          | documented                                           |
| Growth signals               | Careers page (open roles, teams, locations), changelog, launches, new offices, layoffs in reputable press | signal                                                          | documented                                           |
| Market and competitors       | "alternatives" and "vs" pages, analyst press releases, industry statistics, government data               | competitor, market_segment, metric (tam/sam/som), trend         | documented or inferred                               |
| Regulation and trends        | Regulators' sites, official journals, industry associations                                               | trend, compliance                                               | documented                                           |
| Security and compliance      | Trust / security centre, certifications pages, privacy policy, subprocessor list, DPA                     | compliance, risk, technology                                    | documented ("claimed" until a certificate is public) |
| Reliability                  | Status page and its incident history                                                                      | signal (outage), risk                                           | documented                                           |
| Technology                   | `detect_tech_stack`, engineering blog, job posts' required skills, subprocessor list, public docs         | technology, integration, hypothesis                             | documented or inferred                               |
| Public API                   | Developer docs, API reference, SDK repositories, webhooks docs (read only, never call)                    | api_endpoint, data_object                                       | documented                                           |
| Screens, roles and rules     | The user's own session (screenshots, notes), help centre articles with screenshots                        | screen, user_role, business_rule, data_object fields and states | observed or documented                               |
| Reputation                   | Review sites (one page at a time), app store pages, reputable press                                       | finding, risk                                                   | documented (third-party)                             |

## Documents the business handed over

In an audit or due-diligence engagement the business may give the analyst its own documents
(financial statements, board packs, contracts, policies). The user saves them in
`evidence/inbox/provided/` with an optional notes file that summarises them
(`- [metric-revenue-2025] Revenue for 2025 was 4.2M USD (annual-report-2025.pdf).`), then
`import_inbox` with session `provided` records them as `provided` evidence. Never put such
documents anywhere public, and never record personal data from them.

## Quality bar for official reports

- Every number has a date (`published` on the source, or `as_of` on the metric).
- Prefer primary sources (the company, the regulator, the filing) over articles quoting them.
- Third-party claims say who made them in limitations.
- Anything that cannot be confirmed becomes a `question` node, not a guess stated as fact.
