# Menu Management Implementation Plan

> **For agentic workers:** Use test-first implementation and independent review; preserve unrelated working-tree changes and do not deploy or mutate production services.

**Goal:** Make web and merchant menu management consistent, allow GrabFood price editing, fix deletion while preserving orders, and reliably request GrabFood menu refreshes after catalogue changes.

**Architecture:** Preserve order history and Grab item identities through the menu lifecycle. Capture publication-relevant changes durably at the database boundary so both clients participate, retry refresh notifications, and distinguish local save and notification from upstream application. Reuse existing authenticated price APIs and match web editor semantics in Flutter.

**Tech Stack:** Next.js 16, TypeScript, Flutter, Supabase/PostgreSQL, GrabFood menu API.

**Spec:** User request in this session; existing web admin and checked-in GrabFood integration establish the current behavior and supported contracts.

## Global Constraints

- Preserve historical orders, delayed Grab order identity resolution, and integer sen prices; zero is a valid Grab override and null uses the local price.
- Do not invoke production mutations or apply migrations as part of implementation.
- Preserve existing unrelated workspace changes; do not commit without a request.
- Do not claim Grab has applied a menu solely because it accepted a refresh notification.

## Review Focus

- Delete an item, modifier, category, or group referenced by an order: retain historical snapshot and ensure late Grab orders remain resolvable.
- Handle empty, invalid, zero, and concurrent Grab price edits and expose partial-save failures without losing edits.
- Handle notification failure, restart, concurrent edits, disabled integrations, and retry without losing the latest desired revision.
- Warn about destructive category and group cascades and keep the menu usable when a delete fails.
- Reject stale editors that would create or move active items under an archived category or options under an archived group.
- Never leave a required assigned group without an available option, and never let a stale binding save resurrect an archived group.
- Verify both web and merchant mutations refresh storefront and request Grab updates without relying on a browser remaining open.

## Tasks

1. **Merchant parity:** test then implement item and modifier Grab overrides with concurrency and partial-error handling, match existing web editing controls, and protect historical categories. Verify focused Flutter tests and analysis.
2. **Deletion and identity:** test the actual PostgreSQL deletion behavior and order/Grab mapping consumers. Implement the smallest safe schema and application change that allows deletion without losing order history or the ability to resolve delayed Grab orders. Verify active-order and integration consumers before changing nullable assumptions.
3. **Web deletion UX:** test structured database errors and cascading delete confirmation, preserve the menu on failures, and use a single atomic group delete where safe. Verify focused admin tests.
4. **Grab sync:** test and implement durable change capture and retry using the existing supported refresh notification contract, covering both direct web writes and merchant API writes; preserve concurrent changes and report only what is known. Verify no live external operations are invoked.
5. **Security:** independently verify the reported permissive menu write policies and nullable role-check bypass; add fail-closed authorization and regression tests while preserving authorized staff and service access.
6. **Atomic bindings:** prevent a failed menu modifier-group replacement from deleting existing bindings by making replacement transactional for both clients.
7. **Integration review:** run relevant full suites, type checks and analysis; separately review security, schema, error handling, cache invalidation and order ingestion. Report baseline failures and required deployment steps truthfully.
