# AI Cost Optimization — Developer Quick Start

## What You're Doing

Migrating 6 of 7 AI features from paid Anthropic Claude API to free/cheap alternatives:
- 1 feature → Google Cloud Translation API (free)
- 5 features → Google AI Studio / Gemma 4 (free tier: 1,500 req/day)
- 1 feature → stays on Claude (complex tool-calling agent)

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Monthly Anthropic cost | $50-200 | $5-10 |
| Features on Claude | 7 | 1 |
| New dependencies | — | `@google/generative-ai`, `@google-cloud/translate` |

---

## Read Order

1. **This file** — you're here
2. **`../ai-cost-optimization-spec.md`** — master plan, decisions, phases
3. **`01-ARCHITECTURE.md`** — current vs target architecture diagrams
4. **`02-SUBMODULE-SPECS.md`** — per-feature code templates (the actual work)
5. **`03-DATABASE-SCHEMAS.md`** — tables involved

---

## Phase Execution Order (DO NOT SKIP OR REORDER)

| Phase | What | Files Changed | Depends On |
|-------|------|--------------|------------|
| 1 | Build provider abstraction | NEW: `lib/ai/provider.ts`, `lib/ai/providers/*`, `lib/ai/types.ts` | Nothing |
| 2 | Tamil translation → Google Translate | MODIFY: `app/api/work-pulse/translate/route.ts` | Phase 1 (for pattern, not dependency) |
| 3 | Response drafting → Gemma 4 | MODIFY: `lib/services/admission/ai-response-service.ts` | Phase 1 |
| 4 | Insights + Work Pulse → Gemma 4 | MODIFY: 3 files (see spec) | Phase 1 |
| 5 | Agentic query → Gemma 4 | MODIFY: `lib/services/admission/agentic-query-service.ts` | Phase 1 |
| 6 | Add response caching | NEW: `lib/ai/cache.ts`, MODIFY: `lib/ai/provider.ts` | Phases 1-5 |
| 7 | Cleanup | MODIFY: `package.json`, env files | Phases 1-6 |

---

## Environment Variables Needed

```env
# NEW — add these
GOOGLE_AI_API_KEY=<provided by project owner>
AI_PROVIDER_DEFAULT=google-ai

# EXISTING — keep as-is
ANTHROPIC_API_KEY=<already exists>
```

---

## Quick Verification After Each Phase

```bash
# After every phase
npm run build

# After Phase 2 (translation)
curl -X POST http://localhost:3000/api/work-pulse/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "வணக்கம் எப்படி இருக்கீங்க"}'
# Expected: {"translated": true, "text": "Hello, how are you"}

# After Phase 3-5 (AI features)
# Test via the UI — open admission CRM, trigger insights, try agentic query
```

---

## Known Gotchas

1. **Gemma 4 JSON output**: Sometimes wraps JSON in markdown code blocks (```json...```). The provider abstraction includes a JSON extraction utility to handle this.

2. **Prompt differences**: Gemma 4 responds differently than Claude to the same prompt. Prompts have been adjusted in the submodule specs — use the provided versions.

3. **Rate limits**: Google AI Studio free tier = 1,500 requests/day. At current MyJKKN usage (~100-500 AI calls/day), this is sufficient. Monitor via Google AI Studio dashboard.

4. **Missing table**: `admission_query_history` is referenced in `agentic-query-service.ts` but the table doesn't exist. Create the migration in Phase 5.

5. **Dual env vars**: Code checks both `CLAUDE_API_KEY` and `ANTHROPIC_API_KEY`. After migration, standardize to `ANTHROPIC_API_KEY` only.

---

## DO NOT TOUCH

- `app/api/ai-query/route.ts` — this stays on Claude (20+ tool-calling system, too complex to migrate now)
- Any files under `.claude/worktrees/` — these are worktree copies, not primary source

---

*Generated: 2026-04-07 | Branch: main (Jicate-Solutions/MyJKKN)*
