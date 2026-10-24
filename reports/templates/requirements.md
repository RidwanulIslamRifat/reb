---
report: requirements
title: Functional and non-functional requirements specification
sections:
  - id: overview
    title: Product overview and scope
    about: What the product is, its modules (main areas) and who uses it.
    needs:
      - { type: product, min: 1, evidence: true }
      - { type: module, min: 2 }
      - { type: persona, min: 1, severity: major }
  - id: features
    title: Features, their logic and data reuse
    about: Every feature by module, what data it reads and writes, how it probably works behind the screen, and how its data is reused elsewhere.
    views: [feature_logic]
    list: false
    needs:
      - { type: feature, min: 5, evidence: true }
  - id: data
    title: Data model
    about: The entities with their attributes and types, required fields, states and relations, with an ER diagram.
    views: [data_model]
    list: false
    needs:
      - { type: data_object, min: 3, evidence: true }
  - id: functional
    title: Functional requirements
    about: Numbered requirements (FR-001 ...) a team can build and test against, with acceptance criteria.
    views: [requirements]
    list: false
    needs:
      - { type: feature, min: 5 }
  - id: non-functional
    title: Non-functional requirements
    about: Numbered quality requirements (NFR-001 ...) for performance, scalability, security, privacy, audit, usability, accessibility, interoperability and more.
    views: [nfr]
    list: false
    needs:
      - { type: requirement, min: 5 }
  - id: stories
    title: User stories
    about: One story per persona and journey, step by step.
    views: [user_stories]
    list: false
    needs:
      - { type: journey, min: 2, severity: major }
  - id: roles
    title: Roles and permissions
    about: The user roles inside the product and what each may use.
    views: [permission_matrix]
    list: false
    needs:
      - { type: user_role, min: 1, severity: major }
  - id: rules
    title: Business rules, workflows and limits
    about: Validations, state flows, limits and plan locks the product applies.
    views: [business_rules]
    list: false
    needs:
      - { type: business_rule, min: 2, severity: major }
  - id: screens
    title: Screens and navigation
    about: The screens, how they lead to each other and what each shows.
    views: [sitemap]
    list: false
    needs:
      - { type: screen, min: 3, severity: major }
  - id: ux
    title: UX and design requirements
    about: The layout, components, states and design values a look-alike build must match.
    views: [ux_spec, design_system]
    list: false
    needs:
      - { type: ux_pattern, min: 1, severity: minor }
      - { type: design_token, min: 1, severity: minor }
  - id: integrations
    title: Integrations and public API
    about: Outside services to connect to, and the public API to offer.
    views: [api]
    needs:
      - { type: integration, min: 1, severity: minor }
      - { type: api_endpoint, min: 1, severity: minor }
---

The requirements a development team needs to build a product that works like {product}: its modules
and features, the logic and data reuse behind each feature, the data model, numbered functional and
non-functional requirements with acceptance criteria, user stories, roles, rules, screens, UX and design.
It is reasoned from the product's behaviour and measured visual design in normal use and its public
documentation; it copies no code, logos, icons, illustrations or content. Requirements marked inferred are educated guesses to confirm before building.
