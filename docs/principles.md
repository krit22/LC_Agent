# Architectural & Operational Principles

These stable principles govern all product decisions, code designs, and schema migrations across LC_Agent.

---

## 1. Lightweight & Lean
- Keep the server layer minimal. Use **HonoJS** for routing, middleware, and request handling without heavy framework overhead.
- Use **Vercel AI SDK** for LLM integration — a single `generateText()` call with typed tools, not heavyweight agent frameworks.
- Avoid introducing heavy dependencies when simple, standard Node.js / TypeScript libraries suffice.

## 2. Event-Driven & Idempotent
- Messages arriving from WhatsApp are treated as an immutable event stream.
- **Idempotency Guarantee**: Every ingested message must be recorded with its unique message ID (`msg_id`). Duplicate delivery of the same message must not trigger duplicate actions or duplicate task creation.

## 3. Safe Schema Evolution
- The database is the long-term source of truth for all club intelligence.
- Schemas must use clear relational foreign keys, strict nullability constraints, and indexed lookup fields.
- Migrations must be additive and version-controlled.
- **The AI agent has zero authority to modify schemas** — no ALTER TABLE, no new columns, no dropped tables.

## 4. Bounded Agent Authority
- The AI Agent Brain operates within a strict tool sandbox. It can only call the 7 defined tools (listTasks, getTask, createTask, updateTask, listPeople, getPerson, listDomains).
- No destructive tools exist — no DELETE operations. Tasks can only be moved to `CANCELLED` or `COMPLETED` status.
- High-confidence extractions are directly persisted; ambiguous requests prompt the agent to ask for clarification.
- The agent must explicitly acknowledge when it cannot fulfill a request.

## 5. Trigger-Gated Activation
- The backend receives **all** messages from monitored groups but only activates the agent brain when a message starts with the configured trigger keyword (`lc`).
- Non-triggered messages are logged silently and discarded. This prevents unnecessary LLM calls and keeps costs predictable.

## 6. Minimal Memory, Maximum Efficiency
- Short-term conversation context uses an in-memory sliding window (configurable size and TTL).
- No long-term memory persistence — context resets on server restart.
- Only triggered messages and agent responses enter the conversation context.

## 7. Security & Privacy First
- **No Hardcoded Credentials**: WhatsApp auth keys, database credentials, and LLM API keys must live in environment variables.
- **Localhost Testing**: Development servers must never listen on public interfaces (`0.0.0.0`) unless explicitly configured for production.
- **Strict Query Sanitization**: All SQL operations use Prisma's parameterized queries.
- **LLM Key Isolation**: The `OPENROUTER_API_KEY` is loaded from env, never exposed to the agent or logged.
