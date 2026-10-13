---
report: feature
title: Feature report
sections:
  - id: product
    title: Product and modules
    about: The product and how it is split into modules.
    needs:
      - { type: product, min: 1, evidence: true }
      - { type: module, min: 2 }
  - id: features
    title: Features
    about: What the product can do, with how sure we are of each feature.
    needs:
      - { type: feature, min: 5, evidence: true }
  - id: journeys
    title: Key journeys
    about: The main tasks people do with the product, step by step.
    needs:
      - { type: journey, min: 2 }
      - { type: persona, min: 1, severity: major }
  - id: plans
    title: What each plan includes
    about: Which features each plan unlocks.
    needs:
      - { type: pricing_tier, min: 1, evidence: true }
  - id: integrations
    title: Integrations
    about: Other tools the product connects to.
    needs:
      - { type: integration, min: 1, evidence: true, severity: major }
---

What {product} does: its modules, features, main journeys and what each plan includes.
