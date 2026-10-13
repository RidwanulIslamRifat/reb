# Audit 1 for acme-notes.example

- When: 2026-10-01T10:24:48.000Z
- Plan version audited: v10
- Re-plan rounds before this audit: 0 of 3
- Gaps: 5 (2 blocking, 3 major, 0 minor)

## Gaps

1. **[blocking]** Focus question 1 has no answer yet.
   "Which export formats are offered?" needs an answer draft in notes/focus-1.md that cites nodes and evidence.
   Suggested task a1-focus-1 (business_analyst): Answer focus question 1: Which export formats are offered?. Done when: file notes/focus-1.md exists; the answer cites node ids or E-/S- ids for every claim.

2. **[blocking]** Focus question 2 has no answer yet.
   "What does the Business plan add?" needs an answer draft in notes/focus-2.md that cites nodes and evidence.
   Suggested task a1-focus-2 (desk_researcher): Answer focus question 2: What does the Business plan add?. Done when: at least 1 pricing_tier node; file notes/focus-2.md exists; the answer cites node ids or E-/S- ids for every claim.

3. **[major]** Only 4 of 5 feature nodes the reports need.
   Needed by feature: Features.
   Suggested task a1-feature (feature_analyst): Find feature nodes for feature: Features. Done when: at least 5 feature nodes; every feature node has evidence.

4. **[major]** 1 integration node has no evidence.
   integration-slack; needed with evidence by feature: Integrations.
   Suggested task a1-evidence-integration (desk_researcher): Back every integration node with evidence. Done when: every integration node has evidence.

5. **[major]** Only 1 of 2 competitor nodes the reports need.
   Needed by business: Competition.
   Suggested task a1-competitor (market_researcher): Find competitor nodes for business: Competition. Done when: at least 2 competitor nodes; every competitor node has evidence.

## Stop rule

Continue: 2 blocking gaps; re-plan round 1 of 3. Next: apply_replan with audit 1 (reb plan replan).
