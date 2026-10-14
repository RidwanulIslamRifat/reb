---
report: due_diligence
title: Business condition and due diligence
sections:
  - id: findings
    title: Key findings and recommendations
    about: The most important conclusions about the business, rated, with what to do about each.
    views: [findings, recommendations]
    needs:
      - { type: finding, min: 3, evidence: true }
  - id: company
    title: Company and leadership
    about: Who the company is, who leads it and where it operates.
    views: [leadership]
    needs:
      - { type: company, min: 1 }
      - { type: product, min: 1, evidence: true }
      - { type: leader, min: 1, severity: major }
      - { type: geography, min: 1, severity: minor }
  - id: business-model
    title: Business model
    about: What the business promises, to whom, how it reaches them and how it makes money.
    views: [business_model_canvas]
    needs:
      - { type: value_proposition, min: 1, severity: major }
      - { type: revenue_stream, min: 1, evidence: true }
      - { type: channel, min: 1, severity: major }
      - { type: customer, min: 1, severity: minor }
  - id: traction
    title: Traction and financial condition
    about: Dated numbers on size and growth, funding history and recent signals.
    views: [metrics, funding, growth_signals]
    needs:
      - { type: metric, min: 2, evidence: true }
      - { type: funding_round, min: 1, severity: minor }
      - { type: signal, min: 2, severity: major }
  - id: market
    title: Market and competition
    about: The market the business plays in, its size, and how competitors compare.
    views: [market_size, competitor_matrix]
    needs:
      - { type: market_segment, min: 1 }
      - { type: competitor, min: 2, evidence: true }
  - id: risks
    title: Risks and compliance
    about: The risk register, and the laws and certifications that apply.
    views: [risk_register, compliance]
    needs:
      - { type: risk, min: 3, evidence: true }
      - { type: compliance, min: 1, severity: major }
  - id: technology
    title: Technology and operations
    about: What the product is built with and what it depends on.
    views: [tech_stack]
    needs:
      - { type: technology, min: 1, severity: major }
      - { type: integration, min: 1, severity: minor }
---

The condition of {product}'s business as an investor, acquirer or audit team would assess it: company,
business model, traction, market, risks and technology, with rated findings and recommendations.
