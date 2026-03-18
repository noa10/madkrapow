# HEARTBEAT.md — Mad Krapow Proactive Checks

This file defines periodic checks that AI assistants should perform proactively during heartbeat polls. Keep this small to limit token burn.

**Last Updated**: 2026-03-17

---

## Heartbeat Prompt

When you receive a heartbeat poll, follow this checklist. If nothing needs attention, reply `HEARTBEAT_OK`.

---

## Daily Checks (Rotate 2-4 times per day)

### 1. Project Health Check (Every ~2 hours)
- Run `git status` — any uncommitted changes that should be committed?
- Check if tests are passing: `npm run typecheck && npm run lint`
- Look for console.log statements in recent changes
- Verify `.env.local` has all required variables (compare with `.env.local.example`)

### 2. Build Status (Once per day)
- Run `npm run build` to verify production build succeeds
- Check for any TypeScript errors or warnings
- Verify no hardcoded secrets in code

### 3. Documentation Sync (Once per day)
- Check if docs/documentation.md needs updating with recent progress
- Verify MEMORY.md reflects any significant decisions made today
- Update memory/YYYY-MM-DD.md with session summary

### 4. Dependency Check (Once per week)
- Check for critical security updates: `npm audit`
- Review outdated dependencies: `npm outdated`
- Surface any HIGH/CRITICAL vulnerabilities

---

## Track Your Checks

Store state in `memory/heartbeat-state.json`:

```json
{
  "lastChecks": {
    "projectHealth": 1710694132,
    "buildStatus": 1710607732,
    "documentationSync": 1710607732,
    "dependencyCheck": null
  }
}
```

---

## When to Reach Out

**Proactive notifications (interrupt user):**
- Build is broken (TypeScript errors, lint failures)
- Critical security vulnerabilities found
- Uncommitted changes for >24 hours (risk of losing work)
- Tests failing

**Silent work (no interruption):**
- Update memory files with session summaries
- Organize daily logs
- Review and update MEMORY.md with learnings
- Run git status and prepare commit suggestions

---

## When to Stay Quiet (HEARTBEAT_OK)

- Late night (23:00-08:00 local time) unless urgent
- User is clearly busy (active coding session)
- Nothing new since last check (<30 minutes ago)
- All systems green (tests pass, build succeeds, no issues)

---

## Proactive Work (Background Tasks)

Things you can do without asking:

1. **Memory maintenance**: Review recent memory/YYYY-MM-DD.md files, update MEMORY.md with significant learnings
2. **Documentation updates**: Keep docs/documentation.md in sync with progress
3. **Code organization**: Suggest cleanup opportunities (dead code, unused imports)
4. **Git hygiene**: Prepare commit messages for uncommitted changes
5. **Test coverage**: Identify untested critical paths

---

## Heartbeat vs Cron

**Use heartbeat when:**
- Multiple checks can batch together
- Timing can drift slightly (~30 min is fine)
- You want to reduce API calls by combining checks

**Use cron when:**
- Exact timing matters ("9:00 AM sharp every Monday")
- Task needs isolation from main session
- One-shot reminders ("remind me in 20 minutes")

---

## Example Heartbeat Response

```
HEARTBEAT: Project health check complete
- ✅ Git status clean
- ✅ TypeScript check passed
- ✅ Lint passed
- ⚠️  Found 2 console.log statements in src/app/api/checkout/route.ts
- 📝 Updated memory/2026-03-17.md with session summary

Suggestion: Remove console.log statements before committing.
```

---

**Philosophy**: Be helpful without being annoying. Check in a few times a day, do useful background work, but respect quiet time.
