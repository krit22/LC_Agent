# Product Overview: LC_Agent

**LC_Agent** is the central AI Agent Brain for **The Literary Circle Club**. It operates as an autonomous operational assistant that listens to communication channels, maintains club knowledge, and turns conversational intent into structured records and automated actions.

---

## 1. The Core Problem

In active community and club environments (like The Literary Circle Club), tasks, responsibilities, announcements, and member information are constantly exchanged inside WhatsApp groups and channels. Important commitments and domain ownership get lost in chat history:
- Tasks assigned in conversations are forgotten without formal tracking.
- Club members across various creative and administrative domains lack a unified, live directory.
- Manual logging of action items creates friction and overhead.

---

## 2. The Solution

LC_Agent bridges real-time messaging with structured persistence:

```text
WhatsApp Group/Channel Message
  ↓
Baileys Socket Ingestion
  ↓
Pattern / Intent Filter
  ↓
AI Agent Brain (Reasoning & Schema Extraction)
  ↓
PostgreSQL Relational Storage (People, Tasks, Events)
  ↓
Hono HTTP API / Real-time Querying / Bot Response
```

1. **Continuous Listening**: Connects directly to WhatsApp via `@whiskeysockets/baileys` to receive group and channel updates.
2. **Selective Sketching & Extraction**: Filters for actionable messages (task delegations, member intros, domain assignments, queries).
3. **Structured Entity Resolution**: Maps people to their domains and tasks to their assignees in a PostgreSQL database.
4. **Lightweight Backend**: Exposes a minimal, high-performance HonoJS REST API to monitor agent status, inspect records, and trigger manual actions.

---

## 3. Key Entities

- **People**: Club members, their assigned domains (e.g., Editorial, Design, Logistics, Content, Outreach), phone identifiers, and roles.
- **Tasks**: Specific action items captured from conversation, their assigned owners, status (pending, in-progress, completed), source message references, and deadlines.
- **Message Events**: Audit records of ingested messages to support event deduplication and traceability.
