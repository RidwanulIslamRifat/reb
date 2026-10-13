# Knowledge graph format

The graph is one Markdown file per node in `kb/nodes/<id>.md`: YAML front matter plus a body.
Create and change nodes with `upsert_node`; add links with `link_nodes`. `build_graph` writes
`kb/graph.json` and `kb/stats.json`; `validate_graph` lists problems with fixes.

## Node ids and labels

- Id: `<type>-<short-kebab-name>`, for example `feature-csv-export`. reb makes it from the name if you
  do not give one. Unique per run.
- `label`: observed, documented, inferred or unknown, never stronger than the node's evidence.
- Before creating a node, `query_graph` with `text` to check it does not already exist.

## Node types

company, product, module, feature, journey, persona, data_object, integration, pricing_tier,
competitor, market_segment, hypothesis, question.

## Link types (from -> to)

| Link         | From -> to                           | Meaning                                                  |
| ------------ | ------------------------------------ | -------------------------------------------------------- |
| makes        | company -> product                   | The company makes the product.                           |
| has          | product -> module, module -> feature | Structure of the product.                                |
| does         | persona -> journey                   | Who does a journey.                                      |
| uses         | journey -> feature                   | Steps of a journey, in order (list order is step order). |
| gated_by     | feature -> pricing_tier              | The lowest plan that includes the feature.               |
| reads_writes | feature -> data_object               | Data a feature reads or changes.                         |
| connects_to  | feature -> integration               | Outside tools a feature talks to.                        |
| also_offers  | competitor -> feature                | A competitor has a similar feature.                      |
| belongs_to   | persona -> market_segment            | Which segment a persona is in.                           |
| explains     | hypothesis -> feature or data_object | A guess about how something works.                       |
| evidence     | any node -> E-/S- id                 | The evidence behind the node.                            |
| about        | question -> any node                 | An open question about a node.                           |

reb rejects any other pair, for example `persona makes feature`.

## Rules

- One fact lives in one node; other nodes link to it. Do not repeat a price in every feature node:
  link the feature `gated_by` the pricing_tier node that holds the price.
- Every feature needs at least one `evidence` link.
- Keep the body short: what it is, why it matters, open points. Cite E-/S- ids in the text like `[E-012]`.
- Open questions are `question` nodes linked `about` the node they concern.

## What validate_graph reports

broken links, features without evidence, numbers without a dated source, labels stronger than the
evidence, duplicate names, wrong link pairs, and node files that cannot be read.
