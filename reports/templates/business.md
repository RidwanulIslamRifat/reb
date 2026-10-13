---
report: business
title: Business analysis
sections:
  - id: overview
    title: Company and product
    about: Who makes the product, what it is and what it is for.
    needs:
      - { type: company, min: 1 }
      - { type: product, min: 1, evidence: true }
  - id: customers
    title: Customers and segments
    about: Who uses the product and which market segments they belong to.
    needs:
      - { type: persona, min: 2 }
      - { type: market_segment, min: 1 }
  - id: pricing
    title: Pricing and packaging
    about: The plans on offer, what they cost and what each one unlocks.
    needs:
      - { type: pricing_tier, min: 1, evidence: true }
  - id: competition
    title: Competition
    about: Who else solves the same problem, and what they offer.
    needs:
      - { type: competitor, min: 2, evidence: true }
  - id: risks
    title: Risks and assumptions
    about: Reasoned guesses that are not confirmed yet, and what would confirm them.
    needs:
      - { type: hypothesis, min: 1, severity: minor }
---

How {product} makes money, who it serves and who it competes with.
