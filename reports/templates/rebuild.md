---
report: rebuild
title: Product rebuild specification
sections:
  - id: overview
    title: Product overview and scope
    about: What the product is, its areas and who uses it.
    needs:
      - { type: product, min: 1, evidence: true }
      - { type: module, min: 2 }
      - { type: persona, min: 1 }
  - id: features
    title: Features and acceptance criteria
    about: Every feature, with the criteria a rebuilt version must meet.
    needs:
      - { type: feature, min: 5, evidence: true }
  - id: stories
    title: User stories
    about: One story per persona and journey, step by step.
    views: [user_stories]
    needs:
      - { type: journey, min: 2 }
  - id: screens
    title: Screens and navigation
    about: The screens, how they lead to each other and what each shows.
    views: [sitemap]
    needs:
      - { type: screen, min: 3, severity: major }
  - id: ux
    title: UX specification
    about: Each screen's layout, regions, components and states, and each component's anatomy and states.
    views: [ux_spec]
    list: false
    needs:
      - { type: ux_pattern, min: 3, severity: major }
  - id: design
    title: Design system
    about: The measured colours, typography, spacing, corner radius, shadows and sizes.
    views: [design_system]
    list: false
    needs:
      - { type: design_token, min: 5, severity: major }
  - id: roles
    title: Roles and permissions
    about: The user roles inside the product and what each may use.
    views: [permission_matrix]
    needs:
      - { type: user_role, min: 1, severity: major }
  - id: data
    title: Data model
    about: The data objects with their fields, states and relations.
    views: [data_model]
    needs:
      - { type: data_object, min: 3, evidence: true }
  - id: rules
    title: Business rules and limits
    about: Rules, limits and validations the product applies.
    views: [business_rules]
    needs:
      - { type: business_rule, min: 2, severity: major }
  - id: plans
    title: Plans and entitlements
    about: The pricing plans and what each one unlocks.
    needs:
      - { type: pricing_tier, min: 1, evidence: true }
  - id: integrations
    title: Integrations and public API
    about: Outside services to connect to, and the public API to offer.
    views: [api]
    needs:
      - { type: integration, min: 1, severity: major }
      - { type: api_endpoint, min: 1, severity: minor }
  - id: stack
    title: Technology notes
    about: What the product is likely built with, as a starting point.
    views: [tech_stack]
    needs:
      - { type: technology, min: 1, severity: minor }
      - { type: hypothesis, min: 1, severity: minor }
---

What a team would need to rebuild the behaviour of {product}: scope, features with acceptance criteria,
user stories, screens, UX and design system, roles and permissions, data model, business rules, plans
and integrations. It describes behaviour and measured visual design seen in normal use and public
documentation; it copies no code, logos, icons, illustrations or content.
