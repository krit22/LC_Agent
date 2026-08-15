# Agent Maintenance Contract for LC_Agent

This repository houses **LC_Agent** — the AI Agent Brain for The Literary Circle Club.

All AI coding agents, developers, and maintainers interacting with this codebase **must** adhere to this document and the associated documentation architecture in `docs/`.

---

## 1. The Core Rule: Synchronous Doc & Code Updates

> **Keep affected documentation current in the exact same change as code.**
> Documentation maintenance is **never** a separate or deferred pass. If a code change modifies an interface, database schema, event handler, or workflow, the corresponding document in `docs/` must be updated in the same commit/turn.

- **Docs are the source of intent & contracts**: They define observable behaviors, invariants, and boundaries.
- **Code is the source of truth for implementation**: Code, tests, and database migrations embody the live state.
- **Never guess or hallucinate**: Check `docs/` first before introducing new components, schemas, or dependencies.

---

## 2. Bounded Context & Coarse-to-Fine Route

When working on a task, **do not read the entire codebase or all docs at once**. Follow the coarse-to-fine route:

```text
Product Intent (docs/overview.md & principles.md)
  ↓
System Boundaries & Schema (docs/architecture.md & docs/schema.md)
  ↓
Specific Workflow (docs/workflows/*.md)
  ↓
Engineering Contract (docs/contracts/*.md)
  ↓
Implementation & Focused Tests (src/...)
```

### Routing Table

| If your task touches... | First read... | Then inspect contract... |
| :--- | :--- | :--- |
| System vision, core rules, or project goals | [`docs/overview.md`](docs/overview.md), [`docs/principles.md`](docs/principles.md) | N/A |
| Architecture, service boundaries, or flow | [`docs/architecture.md`](docs/architecture.md) | [`docs/contracts/README.md`](docs/contracts/README.md) |
| Database models, tables, migrations | [`docs/schema.md`](docs/schema.md) | [`docs/contracts/database-contract.md`](docs/contracts/database-contract.md) |
| WhatsApp listener, Baileys socket, events | [`docs/workflows/whatsapp-ingestion.md`](docs/workflows/whatsapp-ingestion.md) | [`docs/contracts/whatsapp-baileys-contract.md`](docs/contracts/whatsapp-baileys-contract.md) |
| Agent reasoning, prompt parsing, task actions | [`docs/workflows/task-management.md`](docs/workflows/task-management.md) | [`docs/contracts/agent-brain-contract.md`](docs/contracts/agent-brain-contract.md) |
| Hono HTTP API routes or middlewares | [`docs/architecture.md`](docs/architecture.md) | [`docs/contracts/README.md`](docs/contracts/README.md) |

---

## 3. Technology Stack & Invariants

- **Backend Framework**: [Hono](https://hono.dev/) v4 on Node.js (TypeScript ESM).
- **Database**: PostgreSQL (relational storage for people, tasks, message audit logs, domain metadata).
- **ORM**: [Prisma](https://www.prisma.io/) v7 with Supabase PostgreSQL.
- **Messaging Integration**: [@whiskeysockets/baileys](https://github.com/whiskeysockets/Baileys) for WhatsApp multi-device socket connection and channel listening.
- **AI Agent Framework**: [Vercel AI SDK](https://ai-sdk.dev/) (`ai`) with [OpenRouter](https://openrouter.ai/) (`@openrouter/ai-sdk-provider`) for LLM-powered tool calling. Schemas validated with [Zod](https://zod.dev/).
- **Security & Reliability Invariants**:
  1. **Strict Localhost Binding**: During local development and testing, servers must bind to `127.0.0.1` / `localhost`.
  2. **Zero Hardcoded Secrets**: WhatsApp auth credentials, database connection strings, and API keys must be loaded via environment variables or secure session stores, never committed.
  3. **Event Idempotency**: Messages ingested from Baileys must be deduplicated by message ID before triggering downstream agent reasoning or database mutations.
  4. **SQL Parameterization**: Parameterized queries or type-safe ORM / query builders must always be used to prevent SQL injection.

---

## 4. How Agents Must Maintain Documentation

As the project grows, agents are expected to actively manage `docs/`:

1. **Adding New Capabilities**: When adding a new subsystem (e.g., meeting scheduler, book catalog, reminder engine), create a corresponding workflow in `docs/workflows/<name>.md` and an engineering contract in `docs/contracts/<name>-contract.md`. Update the routing table in `docs/README.md` and `AGENTS.md`.
2. **Refactoring Code / Changing Schemas**: Update `docs/schema.md` and affected contract files to reflect the updated entity relationships, column types, or interface signatures.
3. **Pruning Obsolete Specs**: If a workflow or approach is deprecated or replaced, prune or update the obsolete docs to prevent agent context drift.
4. **Keeping Files Lean & Focused**: Maintain bounded, well-scoped documents. Avoid giant monolithic documents.
