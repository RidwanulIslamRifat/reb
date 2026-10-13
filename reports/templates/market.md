---
report: market
title: Market analysis
sections:
  - id: segments
    title: Market segments
    about: The groups of customers the product is aimed at.
    needs:
      - { type: market_segment, min: 2 }
  - id: competitors
    title: Competitors
    about: The other products in this market.
    needs:
      - { type: competitor, min: 3, evidence: true }
  - id: positioning
    title: Feature comparison
    about: How the product's features compare with what competitors offer.
    needs:
      - { type: feature, min: 3, evidence: true }
  - id: pricing
    title: Pricing comparison
    about: How the product's plans compare.
    needs:
      - { type: pricing_tier, min: 1, evidence: true }
---

The market {product} plays in: segments, competitors, and how features and prices compare.
