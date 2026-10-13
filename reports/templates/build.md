---
report: build
title: Build-it assessment
sections:
  - id: scope
    title: Modules and features to build
    about: The modules and features a copy of the product would need.
    needs:
      - { type: module, min: 2 }
      - { type: feature, min: 5, evidence: true }
  - id: data
    title: Data model
    about: The main things the product stores and how they relate.
    needs:
      - { type: data_object, min: 3, evidence: true }
  - id: integrations
    title: Integrations
    about: Outside services a copy would have to connect to.
    needs:
      - { type: integration, min: 1, evidence: true, severity: major }
  - id: how
    title: How it is likely built
    about: Reasoned guesses about how the product is built.
    needs:
      - { type: hypothesis, min: 1, severity: major }
---

What it would take to build a product like {product}: scope, data model, integrations and likely technology.
