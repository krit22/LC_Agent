# Contract: WhatsApp & Baileys Integration

This contract defines the invariants, socket lifecycle, and event handling requirements for the `@whiskeysockets/baileys` WhatsApp integration.

---

## 1. Primary Invariants

1. **Credentials Isolation**: Baileys multi-file authentication state (`auth_info_baileys/`) contains private keys and session secrets. It must **never** be committed to Git (must be in `.gitignore`).
2. **Reconnection Loop with Exponential Backoff**: When the socket disconnects due to transient network drops (`DisconnectReason.loggedOut` vs temporary restart), the service must gracefully attempt reconnection without crash-looping.
3. **Strict Channel Whitelist**: The listener must drop messages from unrecognized JIDs or private chats before invoking the extraction engine.
4. **Idempotency Gate**: The listener must check `message_id` against `message_audit_logs` before dispatching. Duplicate WhatsApp socket pushes must not produce duplicate tasks.

---

## 2. Implementation Map

- **Socket Client Manager**: `src/services/whatsapp/client.ts` — Manages `makeWASocket`, auth state, and connection status updates.
- **Event Listener**: `src/services/whatsapp/listener.ts` — Subscribes to `messages.upsert` and performs channel filtering.
- **Message Normalizer**: `src/services/whatsapp/parser.ts` — Extracts text content, sender JIDs, and timestamps.

---

## 3. Validation & Testing

- Verify that socket disconnection due to network failure does not crash the Node.js process.
- Verify that receiving the same message payload twice results in exactly one database insert.
