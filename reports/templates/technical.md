---
report: technical
title: Technical capability assessment
sections:
  - id: stack
    title: Technology stack
    about: The technologies the product visibly uses, by part of the stack.
    views: [tech_stack]
    needs:
      - { type: technology, min: 3, evidence: true }
  - id: architecture
    title: Architecture and data
    about: The main data the product keeps, and reasoned guesses about how it is built.
    views: [data_model]
    needs:
      - { type: data_object, min: 2 }
      - { type: hypothesis, min: 1, severity: major }
  - id: integrations
    title: Integrations and API
    about: Outside services it connects to, and its public API.
    views: [api]
    needs:
      - { type: integration, min: 1, evidence: true }
      - { type: api_endpoint, min: 1, severity: minor }
  - id: security
    title: Security, reliability and compliance
    about: Certifications, compliance claims and technical risks.
    views: [compliance]
    needs:
      - { type: compliance, min: 1, severity: major }
      - { type: risk, min: 1, severity: major }
  - id: findings
    title: Technical findings
    about: Conclusions about the product's technical strengths and weaknesses.
    views: [findings]
    needs:
      - { type: finding, min: 1, severity: major }
---

What {product} is built with and how capable, dependable and open it is technically.
