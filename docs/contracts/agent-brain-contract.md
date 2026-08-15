# Contract: AI Agent Brain Engine

This contract defines the extraction pipeline, prompt schemas, and reasoning boundaries of the AI Agent Brain.

---

## 1. Primary Invariants

1. **Schema Validation**: All LLM / heuristic extraction outputs must be validated against a strict runtime schema (e.g. using `zod` or TypeScript type guards) before triggering database mutations.
2. **Graceful Fallbacks**: If parsing fails or the LLM returns unparseable output, the system must log the raw message to `message_audit_logs` with `intent_detected = 'PARSE_ERROR'` and never throw an unhandled exception.
3. **No Destructive Autonomous Operations**: The agent may insert or update records (people, tasks), but must never delete entities without explicit human authorization.
4. **Deterministic Entity Resolution**: When linking a task to a person, exact WhatsApp JID matches take precedence over fuzzy name searches.

---

## 2. Implementation Map

- **Brain Router**: `src/services/agent/brain.ts` — Main orchestrator receiving message events.
- **Intent Classifier**: `src/services/agent/classifier.ts` — Determines message category (`TASK_ASSIGN`, `MEMBER_INTRO`, `INFO`).
- **Entity Extractor**: `src/services/agent/extractor.ts` — Extracts task descriptions, due dates, and assignee targets.
- **Schema Validators**: `src/services/agent/schemas.ts` — Zod or type-guard schemas for extraction payloads.

---

## 3. Validation & Testing

- Unit tests must feed sample conversational messages (e.g. task delegations, intro messages) through the extractor and assert accurate JSON schema extraction.
- Fuzz tests with empty strings, malformed emojis, or large inputs must not cause crashes.
