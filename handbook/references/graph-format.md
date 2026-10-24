# Knowledge graph format

The graph is one Markdown file per node in `kb/nodes/<id>.md`: YAML front matter plus a body.
Create and change nodes with `upsert_node`; add links with `link_nodes`. `build_graph` writes
`kb/graph.json` and `kb/stats.json`; `validate_graph` lists problems with fixes. `get_framework`
draws standard frameworks (SWOT, risk register, business model canvas, feature logic, functional and
non-functional requirements, design system, UX specification ...) from the graph.

## Node ids and labels

- Id: `<type>-<short-kebab-name>`, for example `feature-csv-export`. reb makes it from the name if you
  do not give one. Unique per run.
- `label`: observed, provided, documented, inferred or unknown, never stronger than the node's evidence.
- Before creating a node, `query_graph` with `text` to check it does not already exist.

## Node types

| Family                 | Types                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Product                | company, product, module, feature, journey, persona, data_object, integration, pricing_tier |
| Market                 | competitor, market_segment                                                                  |
| Thinking               | hypothesis, question                                                                        |
| Business model         | value_proposition, revenue_stream, cost_driver, channel, partner, customer                  |
| Company condition      | metric, funding_round, leader, signal, geography, compliance                                |
| Strategy and risk      | finding, risk, trend, force                                                                 |
| Technology and rebuild | technology, screen, user_role, business_rule, api_endpoint, requirement                     |
| Design and UX          | design_token, ux_pattern                                                                    |

What each v2 type holds:

- `value_proposition`: a promise the product makes to a customer group ("send an invoice in one minute").
- `revenue_stream`: one way money comes in (subscription, usage, transaction fees ...).
- `cost_driver`: a main cost (hosting, payment fees, sales team ...), usually inferred.
- `channel`: how customers are reached and sold to. `partner`: resellers, suppliers, alliances.
- `customer`: a named, public reference customer or case study.
- `metric`: one dated number (revenue, customers, employees, market size ...). One number, one node.
- `funding_round`: one round with its date. `leader`: a founder or executive, public role only.
- `signal`: a dated event that says something about growth (hiring, launch, layoff, outage ...).
- `geography`: a country or region the business operates in. `compliance`: a law, certification or standard.
- `finding`: an assessed conclusion, rated, with a recommendation; `swot` places it in a SWOT.
- `risk`: one risk for the risk register, with likelihood, impact and mitigation.
- `trend`: one PESTLE trend. `force`: one of Porter's five forces with its strength.
- `technology`: a part of the stack. `screen`: one screen or page of the product.
- `user_role`: a permission role inside the product (admin, member, guest).
- `business_rule`: a rule, limit or validation the product applies.
- `api_endpoint`: one endpoint from the public API documentation (never called).
- `requirement`: one functional or non-functional requirement for a team rebuilding the product
  ("Record lists page and filter on the server ..."), with its quality category and priority.
- `design_token`: one measured design value a clone must match: a colour, text style, spacing,
  corner radius, shadow, size, breakpoint or transition ("Primary #4f46e5, fill of the main buttons").
- `ux_pattern`: one layout, component, navigation, interaction, feedback or state pattern with its
  anatomy (sizes, colours, font, corners), variants and states ("Button", "App shell", "Empty state").
  Link both `appears_on` the screens where they are seen. reb measures how things look; it never
  copies the product's code, logos, icons, illustrations or text.

Leaders are people: record only their public business role, nothing personal.

## Typed fields

Some types carry extra front-matter fields. Set them with `upsert_node`'s `fields`
(for example `{"likelihood": "high", "impact": "medium"}`) or `reb kb add ... --field likelihood=high`.
`validate_graph` reports a required field that is missing or a value that is not allowed.

| Type           | Field          | Required | Allowed values                                                                                                                                                                               | Meaning                                                                                            |
| -------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| feature        | acceptance     | no       | list of text                                                                                                                                                                                 | Acceptance criteria a rebuilt feature must meet, one sentence each.                                |
| feature        | logic          | no       | list of text                                                                                                                                                                                 | How the feature probably works behind the screen (calculations, triggers, states).                 |
| feature        | data_use       | no       | list of text                                                                                                                                                                                 | How the feature's data is reused elsewhere (reports, other records, automation).                   |
| feature        | priority       | no       | must, should, could                                                                                                                                                                          | MoSCoW priority for a rebuild: must, should or could.                                              |
| data_object    | fields         | no       | list of { name, type, required, choices }                                                                                                                                                    | The fields it holds: a list of { name, type, required } (type in plain words).                     |
| data_object    | states         | no       | list of text                                                                                                                                                                                 | The states it moves through, in order, for example [draft, sent, paid].                            |
| revenue_stream | model          | yes      | subscription, usage, transaction_fee, license, services, advertising, commission, product_sales, other                                                                                       | How the money is charged.                                                                          |
| channel        | kind           | yes      | self_serve, direct_sales, partner, marketplace, content, community, paid_ads, referral, retail, other                                                                                        | How customers are reached.                                                                         |
| metric         | kind           | yes      | revenue, recurring_revenue, customers, users, employees, growth_rate, valuation, funding_total, tam, sam, som, other                                                                         | What is measured (tam, sam and som are market sizes).                                              |
| metric         | value          | yes      | text                                                                                                                                                                                         | The number as stated, for example 120 or 4.5M.                                                     |
| metric         | unit           | no       | text                                                                                                                                                                                         | The unit, for example USD, customers, % per year.                                                  |
| metric         | as_of          | yes      | date like 2026-09-01, 2026-09 or 2026                                                                                                                                                        | When the number was true.                                                                          |
| funding_round  | date           | yes      | date like 2026-09-01, 2026-09 or 2026                                                                                                                                                        | When the round was announced.                                                                      |
| funding_round  | stage          | no       | text                                                                                                                                                                                         | For example Seed, Series A.                                                                        |
| funding_round  | amount         | no       | text                                                                                                                                                                                         | As stated, with currency, for example USD 12M.                                                     |
| funding_round  | investors      | no       | list of text                                                                                                                                                                                 | Lead and other investors.                                                                          |
| leader         | title          | yes      | text                                                                                                                                                                                         | Their public role, for example CEO or co-founder.                                                  |
| signal         | kind           | yes      | hiring, launch, expansion, funding, partnership, acquisition, leadership_change, pricing_change, layoff, outage, other                                                                       | What happened.                                                                                     |
| signal         | date           | yes      | date like 2026-09-01, 2026-09 or 2026                                                                                                                                                        | When it happened or was announced.                                                                 |
| signal         | direction      | no       | positive, negative, neutral                                                                                                                                                                  | What it says about growth.                                                                         |
| compliance     | kind           | yes      | regulation, certification, standard, policy                                                                                                                                                  | A law that applies, or a certification or standard.                                                |
| compliance     | status         | no       | certified, claimed, applies, unknown                                                                                                                                                         | certified: a certificate is public; claimed: the company says so; applies: the law applies.        |
| technology     | category       | yes      | frontend, backend, database, hosting, cdn, analytics, payments, auth, email, monitoring, ai, other                                                                                           | What part of the stack it is.                                                                      |
| finding        | rating         | yes      | low, medium, high                                                                                                                                                                            | How much it matters: high, medium or low.                                                          |
| finding        | area           | yes      | strategy, product, market, customers, finance, technology, operations, compliance, people                                                                                                    | Which part of the business it is about.                                                            |
| finding        | swot           | no       | strength, weakness, opportunity, threat                                                                                                                                                      | Where it sits in a SWOT analysis.                                                                  |
| finding        | recommendation | no       | text                                                                                                                                                                                         | What the business (or a buyer, investor or builder) should do.                                     |
| risk           | category       | yes      | market, competitive, product, technology, security, regulatory, financial, operational, dependency, reputational, people                                                                     | What kind of risk.                                                                                 |
| risk           | likelihood     | yes      | low, medium, high                                                                                                                                                                            | How likely it is: low, medium or high.                                                             |
| risk           | impact         | yes      | low, medium, high                                                                                                                                                                            | How bad it would be: low, medium or high.                                                          |
| risk           | mitigation     | yes      | text                                                                                                                                                                                         | What reduces it, or what the business already does about it.                                       |
| trend          | pestle         | yes      | political, economic, social, technological, legal, environmental                                                                                                                             | Which PESTLE factor it is.                                                                         |
| trend          | direction      | yes      | tailwind, headwind                                                                                                                                                                           | Whether it helps or hurts the business.                                                            |
| force          | force          | yes      | rivalry, new_entrants, substitutes, buyer_power, supplier_power                                                                                                                              | Which of Porter's five forces.                                                                     |
| force          | strength       | yes      | low, medium, high                                                                                                                                                                            | How strong the force is: low, medium or high.                                                      |
| screen         | path           | no       | text                                                                                                                                                                                         | Where it is, for example /settings/billing (from normal use).                                      |
| screen         | layout         | no       | text                                                                                                                                                                                         | How the screen is laid out, for example: left sidebar 240px, top bar 56px, main area with a table. |
| screen         | regions        | no       | list                                                                                                                                                                                         | The parts of the screen with their place and size, one per item.                                   |
| screen         | components     | no       | list                                                                                                                                                                                         | The components on the screen (ux_pattern names), one per item.                                     |
| screen         | states         | no       | list                                                                                                                                                                                         | States seen on the screen: empty, loading, error, selected, disabled ...                           |
| screen         | viewport       | no       | text                                                                                                                                                                                         | The window size the screen was seen at, for example 1440x900.                                      |
| business_rule  | kind           | yes      | limit, validation, permission, workflow, billing, retention, other                                                                                                                           | What kind of rule.                                                                                 |
| api_endpoint   | method         | yes      | GET, POST, PUT, PATCH, DELETE                                                                                                                                                                | The HTTP method from the public API docs.                                                          |
| api_endpoint   | path           | yes      | text                                                                                                                                                                                         | The path from the public API docs, for example /v1/invoices.                                       |
| requirement    | kind           | yes      | functional, non_functional                                                                                                                                                                   | functional (what it does) or non_functional (how well).                                            |
| requirement    | statement      | yes      | text                                                                                                                                                                                         | The requirement in one sentence: The system shall ...                                              |
| requirement    | category       | no       | performance, scalability, availability, security, privacy, auditability, usability, accessibility, interoperability, portability, localisation, configurability, maintainability, compliance | For a non-functional requirement: which quality.                                                   |
| requirement    | priority       | no       | must, should, could                                                                                                                                                                          | MoSCoW priority: must, should or could.                                                            |
| design_token   | category       | yes      | color, typography, spacing, radius, shadow, size, breakpoint, motion                                                                                                                         | What kind of design value.                                                                         |
| design_token   | value          | yes      | text                                                                                                                                                                                         | The measured value, for example #4F46E5, 14px/20px Inter 500, 8px.                                 |
| design_token   | usage          | no       | text                                                                                                                                                                                         | Where it is used, for example primary buttons and links.                                           |
| ux_pattern     | kind           | yes      | component, layout, navigation, interaction, feedback, state                                                                                                                                  | What kind of pattern: component, layout, navigation ...                                            |
| ux_pattern     | anatomy        | no       | text                                                                                                                                                                                         | Its parts and measurements: size, padding, colours, font, corners.                                 |
| ux_pattern     | variants       | no       | list                                                                                                                                                                                         | Its variants, for example primary, secondary, ghost.                                               |
| ux_pattern     | states         | no       | list                                                                                                                                                                                         | Its states, for example default, hover, focus, disabled, loading.                                  |
| ux_pattern     | behaviour      | no       | text                                                                                                                                                                                         | What it does when used, in plain words (from normal use).                                          |

## Link types (from -> to)

| Link          | From -> to                                                        | Meaning                                                  |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| makes         | company -> product                                                | The company makes the product.                           |
| has           | product -> module, module -> feature                              | Structure of the product.                                |
| does          | persona -> journey                                                | Who does a journey.                                      |
| uses          | journey -> feature                                                | Steps of a journey, in order (list order is step order). |
| gated_by      | feature -> pricing_tier                                           | The lowest plan that includes the feature.               |
| reads_writes  | feature or api_endpoint -> data_object                            | Data a feature or endpoint reads or changes.             |
| connects_to   | feature -> integration                                            | Outside tools a feature talks to.                        |
| also_offers   | competitor -> feature                                             | A competitor has a similar feature.                      |
| belongs_to    | persona or customer -> market_segment                             | Which segment a persona or customer is in.               |
| explains      | hypothesis -> any node                                            | A guess about how something works.                       |
| evidence      | any node -> E-/S- id                                              | The evidence behind the node.                            |
| about         | question -> any node                                              | An open question about a node.                           |
| delivers      | product -> value_proposition                                      | The product makes this promise.                          |
| serves        | value_proposition or product -> persona, market_segment, customer | Who the promise or product is for.                       |
| earns         | company or product -> revenue_stream                              | Where the money comes from.                              |
| incurs        | company -> cost_driver                                            | A main cost of the business.                             |
| sells_through | company or product -> channel                                     | How it reaches and sells to customers.                   |
| partners_with | company -> partner                                                | A key partner.                                           |
| buys          | customer -> product                                               | A named customer uses the product.                       |
| measures      | metric -> any node                                                | What the number is about.                                |
| raised        | company -> funding_round                                          | Funding history.                                         |
| leads         | leader -> company                                                 | Who leads the company.                                   |
| complies_with | company or product -> compliance                                  | Laws that apply and certifications held.                 |
| operates_in   | company or product -> geography                                   | Where the business operates (its scope).                 |
| competes_in   | competitor -> market_segment                                      | Where a competitor sells.                                |
| powers        | technology -> product, module, feature, integration               | What a technology is used for.                           |
| threatens     | risk -> any node                                                  | What a risk would hurt.                                  |
| concerns      | finding -> any node                                               | What a finding is about.                                 |
| affects       | trend, force or signal -> any node                                | What a trend, force or event affects.                    |
| shows         | screen -> feature or data_object                                  | What a screen shows.                                     |
| navigates_to  | screen -> screen                                                  | Navigation between screens.                              |
| can           | user_role -> feature or screen                                    | Permissions: what a role may use.                        |
| governs       | business_rule -> feature, data_object, pricing_tier, user_role    | What a rule or limit applies to.                         |
| exposes       | product or module -> api_endpoint                                 | The public API.                                          |
| relates_to    | data_object -> data_object                                        | Relations in the data model.                             |
| specifies     | requirement -> any node                                           | What a requirement is about (product, feature, data).    |
| appears_on    | design_token or ux_pattern -> screen or feature                   | Where a design value or pattern is seen.                 |

reb rejects any other pair, for example `persona makes feature`.

## Rules

- One fact lives in one node; other nodes link to it. Do not repeat a price in every feature node:
  link the feature `gated_by` the pricing_tier node that holds the price.
- Every feature needs at least one `evidence` link.
- Keep the body short: what it is, why it matters, open points. Cite E-/S- ids in the text like `[E-012]`.
  The first paragraph of the body is what reports and frameworks quote.
- Open questions are `question` nodes linked `about` the node they concern.
- One number per `metric` node, with `as_of`; a new figure for a later date is a new metric node.

## What validate_graph reports

broken links, features without evidence, numbers without a dated source, labels stronger than the
evidence, duplicate names, wrong link pairs, node files that cannot be read, missing or invalid
typed fields, and metrics more than 18 months older than the newest evidence.
