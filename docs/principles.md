# Architectural & Operational Principles

These stable principles govern all product decisions, code designs, and schema migrations across LC_Agent.

---

## 1. Lightweight & Lean
- Keep the server layer minimal. Use **HonoJS** for routing, middleware, and request handling without heavy framework overhead.
- Use **Vercel AI SDK** for LLM integration — a single `generateText()` call with typed tools, not heavyweight agent frameworks.
- Avoid introducing heavy dependencies when simple, standard Node.js / TypeScript libraries suffice.

## 2. Channel Scope & Privacy Isolation
- **Supported Channels**: The agent operates in **WhatsApp Group chats** (`@g.us`) and in the admin's personal **"Chat with self"** ("Message yourself").
- **External DM Isolation**: 1-on-1 Direct Messages with other contacts (`@s.whatsapp.net`) and status broadcasts (`status@broadcast`) are strictly blocked and discarded at the gateway level to protect personal chat privacy.

## 3. Trigger-Gated Activation
- The backend receives messages from permitted channels but only activates the agent brain when a message starts with the configured trigger keyword (`lc `).
- Non-triggered messages are logged silently and discarded. This prevents unnecessary LLM calls and keeps costs predictable.

## 4. Event-Driven & Idempotent
- Messages arriving from WhatsApp are treated as an immutable event stream.
- **Idempotency Guarantee**: Every ingested message must be recorded with its unique message ID (`msg_id`). Duplicate delivery of the same message must not trigger duplicate actions or duplicate task creation.

## 5. Safe Schema Evolution with Double Confirmation
- The database is the long-term source of truth for all club intelligence.
- The agent has access to `executeDatabaseQuery` for necessary schema evolution (ALTER TABLE, ADD COLUMN), but **must never execute DDL without human authorization**.
- The agent must issue a specific confirmation token, explain the exact SQL to the user, and require explicit confirmation (`lc confirm <TOKEN>`) before running the query.

## 6. Minimal Memory, Maximum Efficiency
- Short-term conversation context uses an in-memory sliding window (configurable size and TTL, default 15 messages / 30m TTL).
- No long-term memory persistence — context resets on server restart.
- Only triggered messages and agent responses enter the conversation context.

## 7. Security & Privacy First
- **No Hardcoded Credentials**: WhatsApp auth keys, database credentials, and LLM API keys must live in environment variables.
- **Localhost Testing**: Development servers must never listen on public interfaces (`0.0.0.0`) unless explicitly configured for production.
- **Strict Query Sanitization**: SQL operations use parameterized queries or double-confirmed DDL tools.
- **LLM Key Isolation**: The `OPENROUTER_API_KEY` is loaded from env, never exposed to the agent or logged.
