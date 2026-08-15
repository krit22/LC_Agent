# Workflow: Task Management & Predefined Workflows

This document describes how the AI Agent Brain parses, creates, and transitions tasks across flexible states and predefined workflow pipelines (such as the Poster Making lifecycle).

---

## 1. Workflow Types & State Machine

LC_Agent distinguishes between **General Tasks** (`workflow_type = 'GENERAL'`) and **Predefined Structured Workflows** (`workflow_type = 'POSTER'`, etc.).

### Generic Workflow (`GENERAL`)
For ad-hoc assignments without a rigid multi-stage review process:
```text
[ ASSIGNED ] ──► [ ONGOING ] ──► [ COMPLETED ]
       │                │
       ▼                ▼
  [ BLOCKED ]      [ CANCELLED ]
```

### Predefined Workflow: Poster Making (`POSTER`)
For creative design deliverables that require review rounds and iterations:
```text
[ SEARCHING_TEMPLATES ]
         │
         ▼
    [ EDITING ] ◄────────────────┐
         │                       │
         ▼                       │
    [ REVIEW ]                   │
         │                       │
         ├───────────────────────┤
         ▼                       │
[ CHANGES_REQUESTED ] ───────────┘
  (Feedback stored in `feedback` & `metadata.change_log`)
         │
         ▼
  [ COMPLETED ]
```

---

## 2. Handling "Changes Requested" Feedback

When a reviewer requests revisions on a poster or task:
1. The status transitions to `CHANGES_REQUESTED`.
2. The specific revision notes (e.g. *"Change the date font to bold and fix the club logo resolution"*) are stored directly in `tasks.feedback`.
3. An entry is appended to `tasks.metadata` in the `change_history` array:
   ```json
   {
     "change_history": [
       {
         "requested_by": "Rohit",
         "feedback": "Change the date font to bold and fix the club logo resolution",
         "timestamp": "2026-08-15T17:30:00Z",
         "round": 1
       }
     ]
   }
   ```
4. Once the designer updates the draft, the task transitions back to `EDITING` or `REVIEW`.

---

## 3. Entity Resolution & Domain Routing

- **Assignee Resolution**:
  - Matched via WhatsApp JID mention (`@919876543210`) or by case-insensitive name against `people`.
- **Domain Association**:
  - If a task explicitly mentions or relates to one of the 4 domains (`Web Development`, `Video Editing`, `Content Writing`, `Graphic Designing`), `domain_id` is linked.
  - If the task is cross-domain or general, `domain_id` remains `NULL`.
- **Member Year Constraints**:
  - Members in `people` belong to academic year `1`, `2`, `3`, or `4`, and can be linked to 2, 3, or 4 domains in `person_domains`.

---

## 4. Agent Conversational Examples

The agent is activated by the `lc` trigger prefix in monitored WhatsApp groups. Here are representative interactions:

### Creating a Task
```text
User:  lc create a poster task for the upcoming hackathon, assign to Rahul under graphic design, high priority
Agent: ✅ Task created:
       • Title: Poster for upcoming hackathon
       • Assignee: Rahul
       • Domain: Graphic Designing
       • Workflow: POSTER (stage: SEARCHING_TEMPLATES)
       • Priority: high
```

### Querying Tasks
```text
User:  lc what tasks is Rahul assigned to?
Agent: Rahul has 3 active tasks:
       1. Poster for upcoming hackathon (SEARCHING_TEMPLATES, high)
       2. Build club website (ONGOING, medium)
       3. Write blog post for newsletter (ASSIGNED, low)
```

### Follow-up with Context
```text
User:  lc update the first one to EDITING status
Agent: ✅ Updated "Poster for upcoming hackathon" → EDITING
```

The agent resolves "the first one" from short-term conversation context (sliding window of 15 messages, 30-min TTL).

### Agent Acknowledging Limitations
```text
User:  lc delete all tasks for Rahul
Agent: ❌ I can't delete tasks. I can move them to CANCELLED status instead. Would you like me to cancel Rahul's tasks?

User:  lc add a new column for task urgency score
Agent: ❌ I can't modify the database schema. Schema changes need to be made by a developer through Prisma migrations.
```
