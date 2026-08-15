# Architectural & Operational Principles

These stable principles govern all product decisions, code designs, and schema migrations across LC_Agent.

---

## 1. Lightweight & Lean
- Keep the server layer minimal. Use **HonoJS** for routing, middleware, and request handling without heavy framework overhead.
- Avoid introducing heavy dependencies when simple, standard Node.js / TypeScript libraries suffice.

## 2. Event-Driven & Idempotent
- Messages arriving from WhatsApp are treated as an immutable event stream.
- **Idempotency Guarantee**: Every ingested message must be recorded with its unique message ID (`msg_id`). Duplicate delivery of the same message must not trigger duplicate actions or duplicate task creation.

## 3. Safe Schema Evolution
- The database is the long-term source of truth for all club intelligence.
- Schemas must use clear relational foreign keys, strict nullability constraints, and indexed lookup fields.
- Migrations must be additive and version-controlled.

## 4. Bounded Agent Authority
- The AI Agent Brain acts on verified heuristics and structured extraction.
- High-confidence extractions are directly persisted; ambiguous extractions are flagged for human confirmation or logged as unassigned suggestions.
- The agent must never perform destructive database operations without explicit administrative commands.

## 5. Security & Privacy First
- **No Hardcoded Credentials**: WhatsApp authentication keys and PostgreSQL credentials must live in environment variables or external secure volume mounts.
- **Localhost Testing**: Development and test servers must never listen on public interfaces (`0.0.0.0`) unless explicitly configured in production behind a secure reverse proxy.
- **Strict Query Sanitization**: All SQL operations must use parameterized queries.
