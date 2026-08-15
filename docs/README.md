# LC_Agent Documentation System

This directory is the single source of truth for **product intent, system architecture, database schema, observable workflows, and engineering review contracts** for the LC_Agent project.

---

## 1. Documentation Map & Coarse-to-Fine Route

To avoid token bloat and context confusion, coding agents should descend only as far as necessary to solve the active task:

```text
Level 1: Product Intent & Core Rules
  ├── overview.md          -> What is LC_Agent and why does it exist?
  └── principles.md        -> Durable architectural and engineering decision rules

Level 2: System Boundaries & Data Schemas
  ├── architecture.md      -> Process boundaries, component flow, security
  └── schema.md            -> PostgreSQL data models (People, Tasks, Messages, etc.)

Level 3: Observable Workflows
  ├── workflows/
  │   ├── whatsapp-ingestion.md  -> How WhatsApp messages are received and filtered
  │   └── task-management.md     -> How tasks are parsed, assigned, and tracked

Level 4: Engineering Contracts (Implementation & Invariants)
  └── contracts/
      ├── README.md                   -> Contract index and review rules
      ├── database-contract.md        -> DB connection, pooling, migrations, safety
      ├── whatsapp-baileys-contract.md-> Baileys auth, socket reconnection, event streams
      └── agent-brain-contract.md     -> Message parsing, schema extraction, reasoning
```

---

## 2. Reading Paths

### Orientation / Product Understanding
1. [`overview.md`](overview.md) — Mission, problem statement, key components.
2. [`principles.md`](principles.md) — Durable principles guiding all decisions.
3. [`architecture.md`](architecture.md) — High-level service layout and data flows.

### Feature Development & Schema Changes
1. [`schema.md`](schema.md) — Entity models, column rules, migration principles.
2. The relevant workflow in [`workflows/`](workflows/).
3. The relevant maintainer contract in [`contracts/`](contracts/).
4. Implement code changes and update the docs in the same change.

---

## 3. Maintenance Rules for Agents

1. **Atomic Updates**: Never commit code that changes interfaces, schemas, or behaviors without updating the corresponding doc files in the same turn.
2. **Contract-Driven**: Before modifying code in core areas (e.g. Baileys socket handling or DB queries), verify that changes fulfill the invariants documented in `docs/contracts/`.
3. **Continuous Evolution**: Create new workflow files or contract files as new modules are introduced (e.g. reminders, cron triggers, analytics). Keep existing files concise and clean.
