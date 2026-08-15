# Engineering Review Contracts

These contracts define the risky interfaces, non-negotiable invariants, implementation entry points, and validation strategies for LC_Agent subsystems.

Before modifying subsystem code, engineers and AI coding agents must review the corresponding contract.

---

## Contract Index

| Subsystem / Change Surface | Contract File | Key Invariants Covered |
| :--- | :--- | :--- |
| **PostgreSQL Database** | [`database-contract.md`](database-contract.md) | Connection pool limits, query parameterization, transaction isolation, migrations. |
| **WhatsApp / Baileys Integration** | [`whatsapp-baileys-contract.md`](whatsapp-baileys-contract.md) | Auth state security, reconnect backoff loop, channel filtering, event idempotency. |
| **AI Agent Brain Engine** | [`agent-brain-contract.md`](agent-brain-contract.md) | Prompt structure, JSON schema output validation, safe fallback handling, entity resolution. |

---

## Review Rules for Agents

1. **Check Invariants**: Before altering code in a subsystem, inspect its contract to ensure you do not break safety invariants (e.g. leaking raw SQL queries or dropping message deduplication checks).
2. **Update Implementation Maps**: When new services, files, or utilities are added to a subsystem, update the **Implementation Map** in the corresponding contract.
3. **Focused Verification**: Ensure the contract's specified test or validation steps are executed before declaring work complete.
