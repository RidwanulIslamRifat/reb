# Evidence protocol

Every finding in a reb analysis is an evidence record in `evidence/ledger.jsonl`.
The ledger is append-only: records are never edited or deleted.

## Two kinds of record

**Source (S-NNN)**: something that was read. Record it with `record_source` before citing it.

- `url`, `title`, `publisher` (if known), `published` (date like 2026-09-01, 2026-09 or 2026, if known).
- `content`: the text you read (reb stores only its sha256 hash), or `content_sha256` if you have it.
- reb sets `id` and `read_at`.

**Evidence (E-NNN)**: one finding about one node. Record it with `record_evidence`.

- `role`: your role. `subject`: the node id the finding is about (for example `feature-sso`).
- `operation`: what you did, for example `read pricing page`, `user session note`, `compared plans`.
- `source`: an S-NNN id (preferred), a URL, or a file path in the run folder.
- `finding`: one fact in one sentence, in your own words. Short quotes only.
- `confidence`: the label (below). `limitations`: what this finding does not show.
- `links`: other E-/S- ids it builds on. reb sets `id` and `at`.

## Labels

| Label      | Use when                                                          | Example                                                  |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| observed   | The user saw it in their own session (screenshot, note).          | "Export to CSV is in the File menu on the Free trial."   |
| documented | The product or a reliable third party states it publicly.         | "Pricing page lists SSO on Business and above."          |
| inferred   | Your reasoned guess from other evidence; say what it is based on. | "Likely uses Stripe: checkout page loads js.stripe.com." |
| unknown    | Not confirmed; worth recording as an open question.               | "Unclear whether the API has rate limits."               |

Rules:

- Never label stronger than the evidence. A pricing page is documented, not observed.
- Features above the user's `plan_tier` can only be documented or inferred.
- A number (price, user count, limit) needs a source with a `published` date, or an observed session.
- Inferred findings list their basis in `links` and their uncertainty in `limitations`.

## Corrections

If a record is wrong, add a new one with `corrects: "E-012"` (or `S-004` for a source).
The old record stays; reb marks it `corrected_by` in listings.

## Ids

reb assigns every id, even when several sub-agents write at once. Never invent one.
Use the id returned by the tool when you link a node to evidence (`link_nodes` with type `evidence`).

## What never goes in the ledger

Passwords, tokens, cookies, API keys, personal data of real people, or anything from a logged-in
session that the user did not choose to share. If a note or screenshot contains these, leave them out.
