---
report: risk
title: Risk assessment
sections:
  - id: register
    title: Risk register
    about: Every risk with its likelihood, impact, score and mitigation, highest first, and a heat map.
    views: [risk_register]
    needs:
      - { type: risk, min: 3, evidence: true }
  - id: findings
    title: Findings and recommendations
    about: The conclusions the risks lead to, and what to do about them.
    views: [findings, recommendations]
    needs:
      - { type: finding, min: 1, severity: major }
  - id: compliance
    title: Compliance and regulation
    about: The laws that apply and the certifications or standards the business claims or holds.
    views: [compliance]
    needs:
      - { type: compliance, min: 1 }
  - id: external
    title: External threats
    about: Trends and competitive forces that could hurt the business.
    views: [pestle, five_forces]
    needs:
      - { type: trend, min: 1, severity: major }
      - { type: force, min: 1, severity: minor }
  - id: dependencies
    title: Dependencies
    about: Outside services, partners and technologies the business relies on.
    needs:
      - { type: integration, min: 1, severity: minor }
      - { type: partner, min: 1, severity: minor }
      - { type: technology, min: 1, severity: minor }
---

What could go wrong for {product}, how likely and how bad it would be, and what is done about it.
