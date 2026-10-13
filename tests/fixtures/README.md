# tests/fixtures

Small, fake sample files used by tests. Never put real HAR files, real run folders or personal data here.

- `plan-sample.json`: a three-task plan for `reb plan save`.
- `kb-sample/`: a small, made-up run ("Acme Notes") with a knowledge graph and evidence ledger.
  It contains one deliberate example of each validation problem, so
  `node dist/cli.js kb validate --run tests/fixtures/kb-sample` lists 6 problems.
  Running reb on it writes `logs/events.jsonl` inside it; that file is ignored by git.
- `layers/`: code snippets for the layer import lint test.
- `pages/`: saved, made-up HTML pages, a robots.txt and `site.json`, a fake website the research tests
  read instead of the real internet.
- `har/`: synthetic HAR files. `sample.har` has fake secrets (all containing `FAKE-SECRET`) planted in
  headers, cookies, query strings and bodies; no test output may contain them. `not-a-har.json` and
  `broken.har` test the "file is not a HAR" refusal.
