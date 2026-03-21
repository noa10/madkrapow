<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **madkrapow** (586 symbols, 1092 relationships, 22 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/madkrapow/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/madkrapow/context` | Codebase overview, check index freshness |
| `gitnexus://repo/madkrapow/clusters` | All functional areas |
| `gitnexus://repo/madkrapow/processes` | All execution flows |
| `gitnexus://repo/madkrapow/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->

---

# ECC Agent Harness — Behavioral Framework

This section provides behavioral guidelines, agent orchestration patterns, and development workflows that complement GitNexus code intelligence.

## Session Startup

Before doing anything else:

1. Read `SOUL.md` — this defines who you are and how you work
2. Read `MEMORY.md` — this contains long-term decisions and learnings
3. Read `memory/2026-03-17.md` (today + yesterday) for recent context
4. Read `HEARTBEAT.md` — understand proactive check patterns

Don't ask permission. Just do it.

## Core Principles

1. **Security-First** — Never compromise on payment/delivery security
2. **Research-First** — Use GitNexus to understand before changing
3. **Test-Driven** — Write tests before implementation, 80%+ coverage
4. **Agent-First** — Delegate complex tasks to specialized agents
5. **Plan Before Execute** — Plan complex features before writing code

## Agent Orchestration

Use specialized agents for domain tasks:

| When | Use Agent | Purpose |
|------|-----------|---------|
| Complex feature requests | planner | Break down into phases, identify risks |
| Code just written/modified | code-reviewer | Quality and security review |
| Bug fix or new feature | tdd-guide | Test-driven development workflow |
| Architectural decision | architect | System design and scalability |
| Security-sensitive code | security-reviewer | Vulnerability detection |
| Build failures | build-error-resolver | Fix TypeScript/build errors |
| Critical user flows | e2e-runner | Playwright E2E testing |

**Use agents proactively** — don't wait for user to ask. If you just wrote payment code, immediately use security-reviewer.

## Security Guidelines (CRITICAL)

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated (Zod schemas)
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- Authentication/authorization verified
- Rate limiting on endpoints
- Error messages don't leak sensitive data

**Payment/Delivery Specific:**
- Never trust client-sent prices — re-validate from database
- Always verify webhook signatures (Stripe, Lalamove)
- Check idempotency before processing webhooks
- Test payment flows with Stripe test cards before production
- Verify Lalamove quotation freshness before booking

**If security issue found:**
1. STOP immediately
2. Use security-reviewer agent
3. Fix CRITICAL issues before proceeding
4. Rotate any exposed secrets
5. Review codebase for similar issues

## Coding Style

**Immutability (CRITICAL):**
- Always create new objects, never mutate existing ones
- Return new copies with changes applied
- Use spread operators, map/filter/reduce instead of push/splice

**File Organization:**
- Many small files over few large ones
- 200-400 lines typical, 800 max per file
- Organize by feature/domain, not by type
- High cohesion, low coupling

**Error Handling:**
- Handle errors at every level
- User-friendly messages in UI code
- Detailed context in server-side logs
- Never silently swallow errors

**Input Validation:**
- Validate all user input at system boundaries
- Use Zod schema-based validation
- Fail fast with clear messages
- Never trust external data

## Testing Requirements

**Minimum coverage: 80%**

Test types (all required):
1. **Unit tests** — Individual functions, utilities, components
2. **Integration tests** — API endpoints, database operations
3. **E2E tests** — Critical user flows (menu → cart → checkout → tracking)

**TDD workflow (mandatory for new features):**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

**For Mad Krapow critical paths:**
- Payment flow (checkout → Stripe webhook → order creation)
- Delivery automation (Stripe webhook → Lalamove booking)
- Real-time updates (Supabase Realtime subscriptions)
- Order state transitions (PENDING → PAID → ACCEPTED → etc.)

## Development Workflow

1. **Research** — Read SOUL.md, MEMORY.md, relevant docs (architecture.md, plans.md)
2. **Understand** — Use GitNexus to understand code context and dependencies
3. **Plan** — Use planner agent for complex features, break into phases
4. **Impact Analysis** — Run `gitnexus_impact` before modifying critical paths
5. **TDD** — Use tdd-guide agent, write tests first, implement, refactor
6. **Review** — Use code-reviewer agent immediately, address CRITICAL/HIGH issues
7. **Verify** — Run `gitnexus_detect_changes()` to confirm expected scope
8. **Document** — Update MEMORY.md if significant decisions made
9. **Commit** — Conventional commits format, comprehensive messages

## Git Workflow

**Commit format:** `<type>: <description>`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

**Examples:**
- `feat: add Lalamove delivery automation`
- `fix: verify Stripe webhook signatures before processing`
- `refactor: extract price calculation to utility function`
- `test: add E2E test for checkout flow`

**Before committing:**
1. Run `gitnexus_detect_changes()` to verify scope
2. Run `npm run typecheck && npm run lint`
3. Verify no console.log statements in code
4. Check no hardcoded secrets
5. Ensure tests pass

**PR workflow:**
- Analyze full commit history
- Draft comprehensive summary
- Include test plan
- Push with `-u` flag

## Memory and Context Management

**Write it down — no "mental notes":**
- Memory is limited across sessions
- If you want to remember something, WRITE IT TO A FILE
- "Mental notes" don't survive session restarts. Files do.

**Where to write:**
- **Significant decisions** → MEMORY.md
- **Daily session logs** → memory/YYYY-MM-DD.md
- **Architectural changes** → docs/architecture.md decision log
- **Progress updates** → docs/documentation.md
- **Temporary context** → memory/YYYY-MM-DD.md (not MEMORY.md)

**Session continuity:**
- Start each session by reading SOUL.md, MEMORY.md, recent memory files
- End each session by updating memory/YYYY-MM-DD.md with summary
- Update MEMORY.md when significant learnings occur

## Performance and Context

**Context management:**
- Avoid last 20% of context window for large refactoring
- Use GitNexus queries instead of reading entire files
- Delegate to specialized agents to free up context
- Clear context strategically after planning phase

**Model selection:**
- Use appropriate model for task complexity
- Haiku: Simple edits, formatting, linting
- Sonnet: Standard development, refactoring
- Opus: Complex architecture, critical payment/delivery code

## Mad Krapow Specific Patterns

**Critical paths (extra caution required):**
- Payment processing: src/app/api/checkout/route.ts
- Stripe webhook: src/app/api/webhooks/stripe/route.ts
- Lalamove booking: src/lib/lalamove/book.ts
- Order fulfillment: src/lib/services/order-fulfillment.ts
- Real-time subscriptions: src/hooks/useOrderTracking.ts

**Always verify:**
- Prices calculated in cents (integers only)
- Webhook signatures verified before processing
- RLS policies enforced on Supabase queries
- Order state transitions follow defined state machine
- Lalamove quotations checked for freshness (<4 min)

**Tech stack reminders:**
- Next.js 16: Server Components by default
- Supabase: RLS enabled, service_role for webhooks only
- Stripe: Checkout Sessions (redirect flow)
- Lalamove: HMAC-SHA256 auth, MOTORCYCLE service type
- Prices: Always in cents (RM 12.50 = 1250)

## Success Metrics

You are successful when:
- All tests pass with 80%+ coverage
- No security vulnerabilities
- Code is readable and maintainable
- Performance is acceptable
- User requirements are met
- GitNexus impact analysis shows controlled blast radius
- Payment and delivery flows work reliably

---

**Philosophy**: GitNexus provides code intelligence. ECC provides behavioral frameworks. Together they enable safe, efficient, and maintainable development.
