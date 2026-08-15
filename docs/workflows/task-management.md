# Workflow: Task Management & Entity Extraction

This document describes how the AI Agent Brain identifies people, detects domain contexts, sketches tasks from unstructured messages, and manages task lifecycle states.

---

## 1. Task Lifecycle Overview

```text
[ Incoming Message ]
         │
         ▼
[ Intent Detection ]
  ├── "Rahul please review the newsletter drafts by Friday"
         │
         ▼
[ Entity & Schema Extraction ]
  ├── Extracted Action: "Review newsletter drafts"
  ├── Extracted Assignee: "Rahul" (Resolve against `people` table)
  ├── Extracted Due Date: "Friday" -> Parsed UTC ISO date
  ├── Extracted Domain: "Editorial"
         │
         ▼
[ Database Persistence ]
  └── Insert into `tasks` (status = 'pending', assigned_to = rahul_uuid)
         │
         ▼
[ Feedback / Notification ] (Optional)
  └── Confirmation message in group or API event dispatch
```

---

## 2. Extraction Patterns

The Agent Brain classifies conversational intents into categories:

1. **Task Assignment (`TASK_ASSIGN`)**:
   - Explicit: *"@Ananya can you handle poster design for Sunday's event?"*
   - Implicit: *"I will take care of room booking for the book club meet."*
2. **Member Intro / Domain Association (`MEMBER_INTRO`)**:
   - *"Welcome Rohan to the Editorial team!"* -> Links member Rohan to domain `Editorial`.
3. **Status Update (`TASK_UPDATE`)**:
   - *"Newsletter review completed."* -> Transitions corresponding task status to `completed`.
4. **General / Non-Actionable (`INFO`)**:
   - Friendly chat, emojis, general discussions -> Logged without DB mutation.

---

## 3. Entity Resolution Rules

- **Assignee Resolution**:
  1. Match by WhatsApp mention tag JID (`@123456789`).
  2. Match by case-insensitive name lookup in `people`.
  3. If no match is found, create an unlinked task with assignee set to `NULL` and store the raw extracted name string in task metadata for human resolution.
- **Domain Resolution**:
  - Match keywords (e.g. "editorial", "design", "logistics", "outreach", "tech") to `domains.name`.
