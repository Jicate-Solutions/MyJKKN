# How To Use This Handoff Package

## For: Project Owner (Omm)

This package enables your developer (human or AI) to migrate MyJKKN from Anthropic Claude to a cost-optimized AI stack.

---

## Before Handing Off

### 1. Provide API Keys

The developer needs these added to the production environment:

```
GOOGLE_AI_API_KEY=<your Google AI Studio key>
```

Get your key from: https://aistudio.google.com/apikey

The existing `ANTHROPIC_API_KEY` stays — it's still used for the ai-query feature.

### 2. Create a PR Branch

Tell the developer to create a branch from `main`:
```bash
git checkout main && git pull
git checkout -b feat/ai-cost-optimization
```

### 3. Hand Off

Share these files with the developer:

```
specs/ai-cost-optimization-spec.md          ← Master plan (read first)
specs/ai-cost-optimization/
├── 00-HANDOFF-INDEX.md                     ← Quick start
├── 01-ARCHITECTURE.md                      ← System design
├── 02-SUBMODULE-SPECS.md                   ← Per-feature migration code
├── 03-DATABASE-SCHEMAS.md                  ← DB tables involved
└── HOW-TO-USE.md                           ← This file
```

### 4. Prompt for AI Agent (if using Claude Code)

Copy-paste this to start an AI agent session:

```
Read specs/ai-cost-optimization-spec.md and all files in specs/ai-cost-optimization/.
Execute the migration in the exact phase order specified.
For each phase:
1. Read the submodule spec for that phase
2. Implement the changes
3. Run `npm run build` to verify
4. Commit with message: "feat(ai): Phase X - [description]"
Do NOT skip phases. Do NOT modify app/api/ai-query/route.ts (Phase 7 keeps Claude there).
```

---

## After Developer Completes

### Verify Checklist

- [ ] `npm run build` passes
- [ ] Translation endpoint works without Claude (test with Tamil text)
- [ ] AI insights generate correctly via Gemma 4
- [ ] Work pulse analysis produces valid JSON patterns
- [ ] Response suggestions render in the counselor UI
- [ ] Agentic query (text-to-SQL) still works
- [ ] AI data query (20+ tools) still works via Claude
- [ ] No `@anthropic-ai/sdk` imports remain except in `app/api/ai-query/route.ts` and `lib/ai/providers/anthropic.ts`

### Monitor After Deploy

- Check Anthropic dashboard — usage should drop ~80-90%
- Check Google AI Studio dashboard — verify requests flowing
- Watch for error spikes in Supabase logs for 48 hours

---

*Generated: 2026-04-07*
