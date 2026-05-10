# Security Remediation Report — noa10/madkrapow

**Branch:** `fix/security-remediation-20260510`
**Base:** `master` @ `e47a77b`
**Date:** 2026-05-10
**Scope:** All 14 open Dependabot + Code Scanning alerts

## Summary

| Source         | Critical | High | Medium | Low | Total | Fixed | Deferred |
|----------------|----------|------|--------|-----|-------|-------|----------|
| Dependabot     | 0        | 0    | 1      | 0   | 1     | 1     | 0        |
| Code Scanning  | 0        | 4    | 9      | 0   | 13    | 13    | 0        |
| Secret Scan    | 0        | 0    | 0      | 0   | 0     | —     | —        |
| **Total**      | **0**    | **4**| **10** | **0**| **14**| **14**| **0**   |

## Verification

- `npm run typecheck` → exit 0
- `npm run lint` → exit 0 (23 pre-existing warnings, 0 errors)
- `npm test` → 136/136 pass (12 files)
- `npm audit` → **0 vulnerabilities**

## Alert-by-alert

### Dependabot

| # | Pkg | From | To | GHSA | Action |
|---|-----|------|-----|------|--------|
| 20 | postcss | 8.4.31 (nested under next) | ≥8.5.10 | GHSA-qx2v-qp2m-jg93 | Added `overrides` in root `package.json` pinning all `postcss` (including `next → postcss`) to `^8.5.10`; regenerated lockfile. All nested copies now resolve ≥8.5.14. |

### Code Scanning — High

| # | Rule | File:Line | Fix |
|---|------|-----------|-----|
| 44 | `js/user-controlled-bypass` | `apps/web/src/app/api/webhooks/lalamove/route.ts:51` | Removed the "warn-only" branch that let signature verification failure pass through. Missing-signature and failed-signature requests now return `401`. |
| 27 | `js/tainted-format-string` | `apps/web/src/lib/lalamove/transport.ts:83` | Replaced template-literal logging with separate `console.*` args after `sanitizeForLog(path)`; JSON payload is stringified + newline-stripped before logging. |
| 26 | `js/tainted-format-string` | `apps/web/src/lib/lalamove/transport.ts:66` | Same approach — request method/path logged as separate args after sanitization. |
| 25 | `js/xss` | `apps/web/src/app/auth/callback/page.tsx:125` | Replaced the inline ternary that assigned a raw user-controlled string to `window.location.href` with `resolveRedirectTarget()`, which re-parses through `new URL(..., origin)` and only returns `pathname + search + hash`. |
| 24 | `js/xss` | `apps/web/src/app/auth/callback/page.tsx:97` | Same `resolveRedirectTarget()` helper applied on the session-present path. |

### Code Scanning — Medium

| # | Rule | File:Line | Fix |
|---|------|-----------|-----|
| 43 | `js/log-injection` | `apps/web/src/app/api/webhooks/lalamove/route.ts:531` | Eliminated the separate local helper; all webhook logs now route through shared `sanitizeForLog` imported from `@/lib/log-sanitize`. |
| 42 | `js/log-injection` | `apps/web/src/app/api/webhooks/lalamove/route.ts:113` | `eventType` passed through `sanitizeForLog` before logging. |
| 41 | `js/log-injection` | `apps/web/src/app/api/checkout/verify/route.ts:67` | `paymentIntentId` passed through `sanitizeForLog`. |
| 30 | `js/log-injection` | `apps/web/src/lib/lalamove/transport.ts:83` | Addressed with #27 (same fix). |
| 29 | `js/log-injection` | `apps/web/src/lib/lalamove/transport.ts:74` | Response status/text logged as separate args after sanitization. |
| 28 | `js/log-injection` | `apps/web/src/lib/lalamove/transport.ts:66` | Addressed with #26 (same fix). |
| 23 | `js/client-side-unvalidated-url-redirection` | `apps/web/src/app/auth/callback/page.tsx:125` | Addressed with #25 (same `resolveRedirectTarget` helper; `new URL(..., origin)` provides the CodeQL-recognized sanitizer). |
| 22 | `js/client-side-unvalidated-url-redirection` | `apps/web/src/app/auth/callback/page.tsx:97` | Addressed with #24 (same fix). |

## Files changed

```
apps/web/src/app/api/checkout/verify/route.ts
apps/web/src/app/api/webhooks/lalamove/route.ts
apps/web/src/app/auth/callback/page.tsx
apps/web/src/lib/lalamove/transport.ts
apps/web/src/lib/log-sanitize.ts  (new — shared sanitizer)
package.json                       (added overrides)
package-lock.json                  (regenerated)
```

## Behavioral notes (review carefully)

- **Webhook now rejects unsigned POSTs.** Previously unsigned requests were logged and processed. If Lalamove's portal validation ping is unsigned, the dedicated empty-body `{}` branch (lines 39–43) still returns 200 — that path runs before the signature check. Verify in staging that production webhooks continue to flow.
- **Redirect sanitizer change.** `getRedirectPath` now resolves the candidate through `new URL(redirect, window.location.origin)` and returns `pathname + search + hash`. Absolute URLs that previously would have been accepted (none should — the old code already rejected `//` and non-`/` prefixes) are now additionally double-checked via `URL.origin` equality.

## Outstanding

None. All 14 alerts have a code change or dependency bump targeting them. CodeQL will re-scan on PR open and confirm closure.
