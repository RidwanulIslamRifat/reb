---
report: strategy
title: Strategy and growth outlook
sections:
  - id: swot
    title: SWOT analysis
    about: Strengths, weaknesses, opportunities and threats.
    views: [swot]
    needs:
      - { type: finding, min: 4, evidence: true }
  - id: environment
    title: External environment (PESTLE)
    about: Political, economic, social, technological, legal and environmental trends.
    views: [pestle]
    needs:
      - { type: trend, min: 2 }
  - id: forces
    title: Competitive forces
    about: Porter's five forces for the market the business is in.
    views: [five_forces]
    needs:
      - { type: force, min: 3 }
  - id: market
    title: Market size and position
    about: How big the market is and where the business stands against competitors.
    views: [market_size, competitor_matrix]
    needs:
      - { type: market_segment, min: 1 }
      - { type: competitor, min: 2, evidence: true }
  - id: growth
    title: Growth outlook
    about: Dated signals and numbers that show whether the business is growing.
    views: [growth_signals, metrics]
    needs:
      - { type: signal, min: 2 }
      - { type: metric, min: 1, severity: major }
  - id: recommendations
    title: Strategic recommendations
    about: What the business should do next, most important first.
    views: [recommendations]
    needs:
      - { type: finding, min: 1 }
---

Where {product} stands and where it is heading: SWOT, PESTLE, competitive forces, market position and
growth, with strategic recommendations.
