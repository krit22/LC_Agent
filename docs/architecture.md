# System Architecture

This document describes the high-level architecture, subsystem boundaries, data flow, and trust zones of **LC_Agent**.

---

## 1. System Topology

```text
┌────────────────────────────────────────────────────────┐
│                   WhatsApp Channels                    │
└──────────────────────────┬─────────────────────────────┘
                           │ Baileys WebSocket connection
                           ▼
┌────────────────────────────────────────────────────────┐
│             WhatsApp Ingestion Service                 │
│  - @whiskeysockets/baileys multi-device socket         │
│  - Auth state store & reconnection manager             │
│  - Event filter & deduplication gateway                │
└──────────────────────────┬─────────────────────────────┘
                           │ Normalized Message Event
                           ▼
┌────────────────────────────────────────────────────────┐
│                 AI Agent Brain Layer                   │
│  - Intent classifier & prompt parser                   │
│  - Schema extractor (People, Tasks, Actions)           │
│  - Decision & response generator                       │
└──────────────┬─────────────────────────┬───────────────┘
               │ Query / Mutation        │ API Access / Stats
               ▼                         ▼
┌──────────────────────────┐   ┌─────────────────────────┐
│     PostgreSQL DB        │   │    Hono HTTP Server     │
│  - people                │   │  - /health              │
│  - tasks                 │   │  - /api/people          │
│  - messages_audit        │   │  - /api/tasks           │
│  - domains               │   │  - /api/agent/status    │
└──────────────────────────┘   └─────────────────────────┘
```

---

## 2. Component Ownership & Responsibilities

| Component | Technology | Primary Responsibilities |
| :--- | :--- | :--- |
| **HTTP API Layer** | Hono (Node.js) | Exposes health checks, CRUD endpoints for dashboard/admin, webhook triggers, and agent monitoring. |
| **WhatsApp Ingestion** | `@whiskeysockets/baileys` | Maintains socket connection to WhatsApp, persists multi-file auth credentials, receives message events, filters target channels/groups. |
| **Agent Brain Engine** | TypeScript Modules | Processes messages through extraction rules / LLM prompts, identifies entities (people, tasks), coordinates actions. |
| **Persistence Layer** | Supabase (PostgreSQL) + Prisma ORM | Stores persistent records of people, domains, tasks, and historical message audits via type-safe Prisma client. |

---

## 3. Data Flow

1. **Ingestion**: A user sends a message in a monitored WhatsApp group. Baileys fires the `messages.upsert` event.
2. **Filtering & Deduplication**: The event filter checks if the message comes from an authorized channel and verifies that `message_id` has not been processed.
3. **Brain Extraction**: The message text and metadata (sender, timestamp, channel) are forwarded to the Agent Brain parser.
4. **Database Mutation**:
   - If a person intro or domain assignment is recognized, `people` is updated.
   - If a task or assignment is detected, a new record in `tasks` is created with a reference to the assigned person.
5. **Action / Response** (optional): The agent can reply in-channel via Baileys socket or publish the state to the Hono API.

---

## 4. Trust Boundaries & Security

- **WhatsApp Socket**: Authentication credentials (`auth_info_baileys`) represent full account access. They must be stored in a secured directory and never committed to version control.
- **Database Access**: PostgreSQL connection uses credentials from `DATABASE_URL`. Connection pooling must be configured with sane timeouts and limits.
- **API Boundary**: Hono backend endpoints for reading or updating records must be protected via authentication headers or restricted network access.
