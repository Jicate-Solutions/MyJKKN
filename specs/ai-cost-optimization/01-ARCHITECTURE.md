# AI Cost Optimization — Architecture

## Current Architecture (All Claude)

```
┌─────────────────────────────────────────────────────────┐
│                    MyJKKN Next.js App                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  React Components                                        │
│  ├── ai-suggested-responses.tsx                          │
│  ├── insights/  (cards, trends, anomalies)               │
│  └── agentic-query/  (chat UI)                           │
│         │                                                │
│  React Query Hooks                                       │
│  ├── use-ai-responses.ts                                 │
│  ├── use-ai-insights.ts                                  │
│  └── use-ai-query.ts                                     │
│         │                                                │
│  Services / API Routes                                   │
│  ├── ai-response-service.ts ──────────┐                  │
│  ├── admission-ai-service.ts ─────────┤                  │
│  ├── agentic-query-service.ts ────────┤                  │
│  ├── api/admission/insights/generate ─┤                  │
│  ├── api/work-pulse/analyze ──────────┤  ALL go to       │
│  ├── api/work-pulse/translate ────────┤  Anthropic API   │
│  └── api/ai-query ────────────────────┤  ($$$)           │
│                                       ▼                  │
│                            ┌──────────────────┐          │
│                            │  @anthropic-ai/  │          │
│                            │     sdk          │          │
│                            │                  │          │
│                            │  Claude Haiku    │          │
│                            │  Claude Sonnet   │          │
│                            └────────┬─────────┘          │
│                                     │                    │
└─────────────────────────────────────┼────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  Anthropic API   │
                            │  api.anthropic.  │
                            │  com             │
                            │                  │
                            │  $1-15/M tokens  │
                            └──────────────────┘
```

**Problem**: Single point of dependency. All 7 features funnel through one paid API.

---

## Target Architecture (Tiered)

```
┌──────────────────────────────────────────────────────────────┐
│                      MyJKKN Next.js App                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  React Components (UNCHANGED — model-agnostic)                │
│         │                                                     │
│  React Query Hooks (UNCHANGED — call same API routes)         │
│         │                                                     │
│  Services / API Routes                                        │
│  │                                                            │
│  │  ┌─────────────────────────────────────────────┐           │
│  │  │         lib/ai/provider.ts                   │           │
│  │  │         (Unified AI Provider)                │           │
│  │  │                                              │           │
│  │  │  • Model routing by feature                  │           │
│  │  │  • Response caching (lib/ai/cache.ts)        │           │
│  │  │  • JSON extraction & repair                  │           │
│  │  │  • Error handling & fallback                 │           │
│  │  └──────┬──────────────┬───────────────┘           │
│  │         │              │                            │
│  │    ┌────▼────┐    ┌────▼────────┐                   │
│  │    │ Google  │    │ Anthropic   │                   │
│  │    │ AI      │    │ Provider    │                   │
│  │    │ Provider│    │ (Claude)    │                   │
│  │    └────┬────┘    └─────┬──────┘                   │
│  │         │               │                           │
│  ├─────────┼───────────────┼───────────────────────────┤
│  │         │               │                           │
│  │  Features routed:       │  Features routed:         │
│  │  • Response drafting    │  • AI data query          │
│  │  • Lead analysis        │    (20+ tools)            │
│  │  • CRM insights         │                           │
│  │  • Work pulse analysis  │                           │
│  │  • Agentic query        │                           │
│  │                         │                           │
│  │  ┌──────────────┐       │                           │
│  │  │ Google Cloud │       │                           │
│  │  │ Translation  │       │                           │
│  │  │ API          │       │                           │
│  │  └──────┬───────┘       │                           │
│  │         │               │                           │
│  │  Features routed:       │                           │
│  │  • Tamil→English        │                           │
│  │    translation          │                           │
│  │                         │                           │
└──┼─────────┼───────────────┼───────────────────────────┘
   │         │               │
   │         ▼               ▼
   │  ┌──────────────┐ ┌──────────────┐
   │  │ Google AI    │ │ Anthropic    │
   │  │ Studio API   │ │ API          │
   │  │              │ │              │
   │  │ Gemma 4      │ │ Claude       │
   │  │ FREE (1500/d)│ │ Sonnet       │
   │  │ or $0.13/M   │ │ $3-15/M     │
   │  └──────────────┘ └──────────────┘
   │
   │  ┌──────────────┐
   └──▶ Google Cloud │
      │ Translation  │
      │ API          │
      │ FREE 500K/mo │
      └──────────────┘
```

---

## Key Design Decisions

### 1. Provider Abstraction Pattern

```typescript
// Usage in any service:
import { ai } from '@/lib/ai/provider';

const result = await ai.generate({
  prompt: "Analyze these leads...",
  model: 'gemma-4-31b',       // or 'claude-sonnet' for complex tasks
  maxTokens: 4096,
  responseFormat: 'json',      // enables JSON extraction
});
```

The provider:
- Selects the backend (Google AI Studio or Anthropic) based on model name
- Applies response caching (configurable TTL)
- Extracts JSON from markdown-wrapped responses
- Handles retries and error mapping

### 2. No Hooks or Components Change

The entire migration happens at the service/route layer. React hooks and components are model-agnostic — they call API routes and render whatever JSON comes back. This is already well-architected.

### 3. Translation is a Separate Path

Tamil→English translation doesn't go through the AI provider at all. It uses the Google Cloud Translation API directly — a purpose-built translation service is always better than a general-purpose LLM for translation.

### 4. Caching Strategy

```
Request → Cache check (key = hash of prompt + model)
  ├── Cache HIT → return cached response (skip API call entirely)
  └── Cache MISS → call AI API → store in cache → return
```

Cache TTL by feature:
- Translation: 24 hours (same text = same translation)
- Lead analysis: 5 minutes (data changes frequently)
- Insights: 10 minutes (dashboard refreshes)
- Response drafts: 0 (never cache — each response should be unique)
- Agentic queries: 0 (never cache — queries are contextual)

---

## File Map — What Changes

```
lib/ai/                          ← NEW DIRECTORY
├── provider.ts                  ← Unified AI client
├── cache.ts                     ← Response cache
├── types.ts                     ← Shared types
└── providers/
    ├── google-ai.ts             ← Google AI Studio backend
    └── anthropic.ts             ← Anthropic backend (wrapper)

lib/services/admission/
├── ai-response-service.ts       ← MODIFY: use provider
├── admission-ai-service.ts      ← MODIFY: use provider
├── agentic-query-service.ts     ← MODIFY: use provider
└── ai-insights-service.ts       ← UNCHANGED (delegates to API route)

app/api/
├── work-pulse/
│   ├── translate/route.ts       ← MODIFY: Google Translate API
│   └── analyze/route.ts         ← MODIFY: use provider
├── admission/insights/
│   └── generate/route.ts        ← MODIFY: use provider
└── ai-query/route.ts            ← UNCHANGED (stays on Claude)

package.json                     ← ADD: @google/generative-ai, @google-cloud/translate
.env.local                       ← ADD: GOOGLE_AI_API_KEY, AI_PROVIDER_DEFAULT
```

---

## Dependency Graph

```
Phase 1: Provider Abstraction
    │
    ├── Phase 2: Translation (independent, no provider needed)
    │
    ├── Phase 3: Response Drafting
    │       │
    │       └── depends on Phase 1 (uses provider)
    │
    ├── Phase 4: Insights + Work Pulse
    │       │
    │       └── depends on Phase 1 (uses provider)
    │
    ├── Phase 5: Agentic Query
    │       │
    │       └── depends on Phase 1 (uses provider)
    │
    └── Phase 6: Caching
            │
            └── depends on Phases 1-5 (wraps provider)

Phase 7: Cleanup (depends on all above)
```

Phase 2 can run in parallel with Phase 1 since translation uses Google Translate directly (not the provider).

---

*Generated: 2026-04-07*
