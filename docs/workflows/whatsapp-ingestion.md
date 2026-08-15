# Workflow: WhatsApp Ingestion

This document details the end-to-end flow for connecting to WhatsApp, receiving messages via Baileys, filtering channels (allowing groups and Chat with Self while blocking external DMs), validating with the trigger keyword, and dispatching events to the Agent Brain.

---

## 1. Flow Overview

```text
[ WhatsApp Message ]
           │
           │ (Baileys WebSocket, ev.process)
           ▼
[ Layer 1: Socket Gateway ] ─── QR pairing / credential restore / reconnect
           │
           │ messages.upsert (type === 'notify')
           ▼
[ Layer 2: Channel Filter ] ─── Is it a Group Chat (@g.us) OR Chat with Self?
           │                    NO → silently ignore (external DMs blocked)
           │                    YES ↓
           ▼
[ Layer 2: Group Whitelist ] ── Is remoteJid in ALLOWED_GROUP_JIDS?
           │                    NO → silently ignore
           │                    YES ↓
           ▼
[ Layer 2: Text Extraction ] ── Pull from conversation / extendedTextMessage / caption
           │
           ▼
[ Layer 2: Trigger Gate ] ───── Does text start with "lc " (case-insensitive)?
           │                    NO → log to audit with intent='IGNORED', stop
           │                    YES → strip prefix, continue ↓
           ▼
[ Layer 2: Dedup Check ] ────── message_id exists in message_audit_logs?
           │                    YES → skip (idempotent)
           │                    NO → insert audit log (processed=false) ↓
           ▼
[ Layer 3: Context Manager ] ── Append to group's conversation history
           │
           ▼
[ Layer 5: React ⏳ ] ──────── Visual feedback: processing started
           │
           ▼
[ Layer 4: Agent Brain ] ────── LLM reasoning + tool calls
           │
           ▼
[ Layer 5: Reply + React ✅ ] ─ Quoted reply + update audit log (processed=true)
```

---

## 2. Step-by-Step Lifecycle

### Step 1: Authentication & Socket Initialization
- Baileys uses `useMultiFileAuthState` to save credentials in `./auth_info_baileys/` (never committed).
- On first start, `qrcode-terminal` renders the QR code for device pairing.
- On subsequent boots, the session resumes silently.
- Disconnections trigger auto-reconnect unless `DisconnectReason.loggedOut`.

### Step 2: Channel Eligibility & Trigger Filtering
- **Channel Verification**:
  1. **Groups**: Any chat ending with `@g.us` (checked against `ALLOWED_GROUP_JIDS` if configured).
  2. **Chat with Self**: Messages sent to one's own account ("Message yourself") for private bot administration.
  3. **External DMs**: 1-on-1 chats with other contacts are strictly blocked to protect privacy.
- Only real-time deliveries (`type === 'notify'`) are processed; backfills (`type === 'append'`) are skipped.
- Text is extracted from `conversation`, `extendedTextMessage.text`, or `imageMessage.caption`.
- **Trigger gate**: If the text does not start with the trigger keyword (`lc `), the message is logged to `message_audit_logs` with `intent_detected = 'IGNORED'` and no further action is taken.
- If triggered, the `lc ` prefix is stripped, leaving the clean command text.

### Step 3: Deduplication & Audit Logging
- The `message_id` is checked against `message_audit_logs` to prevent duplicate processing.
- New messages are inserted with `processed = false`.

### Step 4: Context & Agent Processing
- The cleaned message is appended to the group/chat short-term conversation context (sliding window, 15 messages, 30-min TTL).
- The agent reacts with ⏳ and sets presence to `composing`.
- The Agent Brain receives the message + conversation history and reasons via `generateText()` with registered tools.

### Step 5: Response & Finalization
- The agent's response is sent as a quoted reply in WhatsApp with appropriate `@mentions`.
- The reaction is updated to ✅ (success) or ❌ (error).
- The audit log is updated to `processed = true` with the detected intent.
- The assistant response is appended to the conversation context.
