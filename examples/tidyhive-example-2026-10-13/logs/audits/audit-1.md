# Audit 1 for tidyhive.example

- When: 2026-10-13T18:35:49.828Z
- Plan version audited: v8
- Re-plan rounds before this audit: 0 of 3
- Gaps: 3 (1 blocking, 2 major, 0 minor)

## Gaps

1. **[blocking]** No journey nodes, but the reports need at least 2.
   Needed by feature: Key journeys.
   Suggested task a1-journey (business_analyst): Find journey nodes for feature: Key journeys. Done when: at least 2 journey nodes.

2. **[major]** No persona nodes, but the reports need at least 1.
   Needed by feature: Key journeys.
   Suggested task a1-persona (business_analyst): Find persona nodes for feature: Key journeys. Done when: at least 1 persona node.

3. **[major]** No integration nodes, but the reports need at least 1.
   Needed by feature: Integrations.
   Suggested task a1-integration (desk_researcher): Find integration nodes for feature: Integrations. Done when: at least 1 integration node; every integration node has evidence.

## Stop rule

Continue: 1 blocking gap; re-plan round 1 of 3. Next: apply_replan with audit 1 (reb plan replan).
