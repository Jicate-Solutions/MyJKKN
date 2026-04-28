# Attention Bar — 5-Layer System Spec

**Status:** Draft v1 (2026-04-28)
**Owner:** MD / Director (Omm)
**Source:** Continuation brief from session 2026-04-27→28 (pane `9badc7fe`); priority cascade validated via interactive mockup at `/tmp/quick-action-interactive.html` (551 LOC, 13 rules, live resolver).
**Pre-spec context:** `feedback_attention_bar_quick_action_pill.md` is the single-slot, urgency-ordered architectural insight that this spec formalizes.

---

## 1. Problem statement

The MyJKKN dashboard has been accumulating **two competing attention surfaces** that fight for the same prefrontal cortex:

| Surface | What it does | Symptom |
|---|---|---|
| Bell-icon notifications panel | Lists all unread notifications | Becomes a 200+ item junk drawer; users mute it within 2 weeks |
| Per-page Quick Actions strip | Hardcoded "Add Lead / Bulk Assign / Export" buttons above bottom nav | Wrong action 60% of the time — counselor at 4pm with 23 pending leads doesn't need "Add Lead", they need "Resume Lead #4521 (last touched 2 days ago)" |

**The architectural error:** treating *prescriptive* (here is the next action) and *descriptive* (here is what just happened) as separate UI primitives. They compete for the same attention budget — the user's working memory. iOS Dynamic Island, WhatsApp's pinned-message strip, and Telegram's chat header all converged on the same answer: **one slot, urgency-ordered, layered priority**. The latest red-severity event displaces the rule-engine recommendation, which displaces the static default, which displaces the AI fallback.

This spec collapses both surfaces into a single component — the **Attention Bar** — sitting directly above the bottom-nav strip on every page, populated by a 5-layer resolver.

### Goals (in priority order)

1. **Right action surfaces 80%+ of the time** for top-10 pages × top-5 roles (50 page×role pairs cover ~90% of session minutes).
2. **Admin-configurable** — Director can change rules without a deploy. Rules engine UI under `/system/attention-bar`.
3. **Privacy-respecting** — behavioral learning is opt-in (DPDPA-compliant), per-user data deletable, all layers auditable.
4. **Bounded cost** — AI fallback (Layer 4) capped at ~$5/day at current traffic, with circuit-breaker.
5. **Observable** — every render produces an audit row: which layer fired, why, what the user did next.

### Non-goals

- Replace the in-app notifications inbox at `/system/notifications` (the searchable archive). Layer 0 is a *real-time push* of severity=red items; the inbox stays for triage of everything else.
- Cover desktop. Phase 1-7 ship mobile-first; desktop is Phase 8 (out of scope here).
- Personalize for non-authenticated visitors. The Attention Bar is institutional-internal only.

---

## 2. Architecture overview — priority cascade

```
┌─────────────────────────────────────────────────────────────┐
│   Attention Bar (single slot above bottom-nav strip)         │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ resolve(ctx) → action
                          │
┌─────────────────────────┴──────────────────────────────────┐
│             RESOLVER (priority-ordered)                     │
│                                                              │
│  Layer 0: URGENT NOTIFICATIONS    (real-time, Supabase RT)  │
│           severity=red AND requires_acknowledgment=true     │
│           latency: < 2s from DB insert to user pixel        │
│                                                              │
│  Layer 2: STATE-AWARE RULES       (admin-configurable)      │
│           e.g., "if counselor on /admission/leads AND       │
│           pending_count > 10 → 'Resume Lead #N'"            │
│                                                              │
│  Layer 3: BEHAVIORAL LEARNING     (per-user, confidence-    │
│           thresholded; min 30 days data; opt-in via DPDPA)  │
│           "User taps Y 73% of the time on this page"        │
│                                                              │
│  Layer 1: STATIC DEFAULTS         (page × role registry)    │
│           Always-available safety net                        │
│                                                              │
│  Layer 4: AI FALLBACK             (last resort, LLM-ranked) │
│           Only when L0–L3 produce nothing. Cached by        │
│           page×role×hour. Circuit-breaker on cost.          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Resolution semantics

```ts
function resolve(ctx: ResolverContext): Resolved {
  // First match wins. Order is non-negotiable.
  for (const layer of [0, 2, 3, 1, 4] as const) {
    const action = layers[layer].evaluate(ctx)
    if (action) return { action, firedLayer: layer, trace: ctx.trace }
  }
  return null  // empty Attention Bar (rare; Layer 1 should always have a default)
}
```

**Why Layer 2 outranks Layer 3:** explicit admin rules are an *intent declaration* by the org's most senior decision-maker. Behavioral learning is an inference. Director's directive > inferred preference, always.

**Why Layer 1 outranks Layer 4:** Layer 1 is hand-curated for the top page×role pairs and validated against the org's playbook. Layer 4 is best-effort and unverified — only fires when nothing else has an opinion.

---

## 3. The 5 layers — full detail

### Layer 0 — Urgent Notifications

**What it is:** a real-time listener on the `notifications` table for rows where `severity = 'red'` AND `requires_acknowledgment = true` AND target user matches `auth.uid()`.

**Mechanism:** Supabase Realtime subscription opened when the user enters the app, kept alive across page transitions, closed on logout.

**Display:** The notification's `title` becomes the Attention Bar label, its primary CTA becomes the bar's CTA. Severity=red gets the bar's `tone='urgent'` styling (red gradient + pulse animation, distinct from green/blue/amber tones used for Layer 2/3/1).

**Dismissal:** tapping the CTA acknowledges (writes `acknowledged_at`); swiping right snoozes for 1 hour (writes `snoozed_until`); 2-finger tap forces dismissal (writes `force_dismissed_at` + audit row). Layer 0 cannot be globally muted from settings — that's by design; if it can be muted, it isn't urgent.

**Constraints:**
- **No more than ONE Layer 0 active at a time.** If a second red notification arrives while the bar is showing one, it queues. After acknowledgment, the next pops in. Visual indicator: small "+2" pip if queue > 0.
- **Latency budget:** 2 seconds end-to-end (insert → bar render). Realtime gives us ~500ms; rest is render budget.

### Layer 1 — Static defaults (page × role registry)

**What it is:** a hard-coded mapping in `lib/attention-bar/static-defaults.ts` from `(page, role) → defaultAction`. The safety net. Every page×role pair must have a Layer 1 entry — no exceptions.

**Coverage target:** top-10 pages × 5 roles = 50 entries minimum. Approved roles for v1: `super_admin`, `admin`, `counselor`, `faculty`, `hod`.

**Pages in scope for Phase 1:**
1. `/dashboard`
2. `/admission/leads`
3. `/admission/counselors`
4. `/academic/attendance/dashboard`
5. `/academic/timetables`
6. `/billing/invoices`
7. `/billing/receipts`
8. `/staff` (HR people grid)
9. `/learners`
10. `/system/notifications`

**Example Layer 1 entries:**

```ts
// counselor on /admission/leads — default
{
  id: 'L1.counselor.leads',
  page: '/admission/leads',
  role: 'counselor',
  action: () => ({
    label: 'Add new lead',
    context: 'Capture inbound walk-in or phone enquiry',
    tone: 'neutral',
    cta: 'Add lead',
    icon: 'UserPlus',
    href: '/admission/leads/new',
  }),
}

// hod on /academic/attendance/dashboard — default
{
  id: 'L1.hod.attendance',
  page: '/academic/attendance/dashboard',
  role: 'hod',
  action: () => ({
    label: 'Review today\'s attendance',
    context: 'See which sections have unmarked periods',
    tone: 'neutral',
    cta: 'Open dashboard',
    icon: 'CalendarCheck',
    href: '/academic/attendance/dashboard?view=today',
  }),
}
```

### Layer 2 — State-aware rules engine

**What it is:** admin-configurable rules stored in the `quick_action_rules` table. Each rule has a JSON `when` condition evaluated against the resolver context, and a JSON `action` template.

**Rule shape:**

```ts
{
  id: uuid,
  rule_name: 'Counselor with stale leads',  // human-readable
  page: '/admission/leads' | '*',            // '*' = any page
  role: 'counselor' | '*',                   // '*' = any role
  when: { type: 'all_of', conditions: [
    { state_query: 'counselor.pending_leads', op: '>', value: 10 },
    { state_query: 'time_of_day', op: 'between', value: ['09:00', '17:00'] },
  ]},
  action: {
    label: 'Resume Lead #{state.oldest_pending_lead.id}',
    context: 'Last touched {state.oldest_pending_lead.days_ago} days ago',
    tone: 'amber',
    cta: 'Open',
    icon: 'PhoneCall',
    href: '/admission/leads/{state.oldest_pending_lead.id}',
  },
  priority: 10,           // higher fires first within Layer 2
  is_active: true,
  created_by: uuid,
  created_at: timestamp,
}
```

**State queries:** rules don't query the DB directly. They reference named queries registered in the `quick_action_state_queries` table (e.g., `counselor.pending_leads`, `attendance.unmarked_periods_today`). State queries are SECURITY DEFINER functions returning a JSON blob. This indirection means:
1. Admins editing rules don't need SQL access.
2. State queries are auditable and rate-limitable.
3. Bad rules can't drop tables.

**Rule evaluation order:** Layer 2 rules sort by `priority DESC`, then `created_at ASC`. First rule whose `when` returns true wins. (This matches the mockup's behavior.)

### Layer 3 — Behavioral learning

**What it is:** a confidence-thresholded override that fires *only* when a per-user signal exceeds 0.7 confidence on a (page, role) pair, calculated from at least 30 days of tap data.

**Data source:** `quick_action_taps` table — every Attention Bar render writes an `impression`; every CTA tap writes a `tap`. Tap rate per (user, page, available_actions[]) becomes the signal.

**DPDPA compliance gate:**
- Layer 3 is **opt-in**. Default state for all users: off.
- Settings page at `/system/attention-bar/my-data` shows the user every tap recorded, lets them download (CSV export), and provides a one-click "Delete all my Attention Bar data" button (cascades to `quick_action_taps` and `quick_action_audit` rows where `user_id = auth.uid()`).
- Consent banner shown on first dashboard visit after Layer 3 ships. Explicit opt-in required. No dark patterns; "No thanks" is equally prominent.
- All Layer 3 inferences are logged with `user_id` so the deletion request actually clears them.

**Confidence calculation (v1):**
```
confidence(action_id, user, page, role) =
  (tap_count(action_id) / total_impressions) *
  min(1.0, total_impressions / 30)   // confidence ramp-up over 30 impressions
```

Any action_id achieving confidence ≥ 0.7 with ≥ 30 impressions becomes the Layer 3 candidate. Below threshold, Layer 3 returns null (skip to Layer 1).

**Drift handling:** confidence recalculated on a 30-day rolling window. A user who used to tap "Bulk assign" 80% of the time but stopped 6 weeks ago will see Layer 3 release that override naturally.

### Layer 4 — AI fallback

**What it is:** an LLM call (Claude Haiku 4.5 or smaller) ranking the available actions for `(page, role, recent_actions, time_of_day)`. Only fires when L0–L3 all return null.

**When does that happen?** New page added without Layer 1 entry; brand-new role without rules; weekend edge case where no rules match. Should be < 2% of renders in steady state; if it exceeds 5%, that's a Layer 1 coverage gap and we add the missing entries.

**Cost guardrails:**
- Cache key: `(page, role, hour_bucket)`. Same role on the same page at the same hour-of-day gets the cached answer for 1 hour. Hit rate target: 90%+.
- Per-day budget: $5 hard cap (configurable in `quick_action_config`). Circuit-breaker trips on 5th consecutive day-cap hit; Layer 4 disabled until manual reset.
- Per-user budget: 50 uncached calls/day. Excess gets the cached answer for that hour even if context drifted.
- All Layer 4 calls audited with prompt + response + cost.

**Allowlist:** the LLM can only return action_ids from the page's registered Layer 1 + Layer 2 candidates. It cannot invent new actions or HREFs. This prevents hallucinated routes.

---

## 4. Database schema

```sql
-- ─────────────────────────────────────────────────
-- Layer 2: rules + state queries
-- ─────────────────────────────────────────────────

CREATE TABLE quick_action_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name     VARCHAR(200) NOT NULL,
    description   TEXT,
    page          VARCHAR(200) NOT NULL,    -- '*' or '/admission/leads'
    role          VARCHAR(50)  NOT NULL,    -- '*' or 'counselor'
    when_clause   JSONB        NOT NULL,    -- { type, conditions[] }
    action_template JSONB      NOT NULL,    -- label/context/tone/cta/icon/href
    priority      INTEGER      NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    institution_id UUID REFERENCES institutions(id),  -- NULL = global
    created_by    UUID REFERENCES auth.users(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_priority CHECK (priority BETWEEN 0 AND 1000)
);

CREATE INDEX idx_qar_page_role_active
    ON quick_action_rules (page, role, is_active, priority DESC);

CREATE TABLE quick_action_state_queries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_key   VARCHAR(100) UNIQUE NOT NULL,    -- 'counselor.pending_leads'
    description TEXT,
    sql_function_name VARCHAR(100) NOT NULL,     -- name of fn() in 02_functions.sql
    return_shape JSONB NOT NULL,                  -- expected output schema for UI
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────
-- Layer 1: static defaults registry (read-only at runtime)
-- ─────────────────────────────────────────────────
-- Layer 1 is code, NOT DB. Stored in lib/attention-bar/static-defaults.ts
-- Reason: changes are infrequent + need code review + part of the page contract.
-- DB-backed Layer 1 invites unbounded sprawl; we want it small + curated.

-- ─────────────────────────────────────────────────
-- Layer 3: behavioral data
-- ─────────────────────────────────────────────────

CREATE TABLE quick_action_taps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    page          VARCHAR(200) NOT NULL,
    role          VARCHAR(50)  NOT NULL,
    fired_layer   SMALLINT NOT NULL,        -- 0,1,2,3,4
    rule_id       UUID,                     -- FK to quick_action_rules if L2
    action_id     VARCHAR(200) NOT NULL,    -- canonical id from action template
    event_type    VARCHAR(20) NOT NULL,     -- 'impression' | 'tap' | 'dismiss'
    context       JSONB,                    -- snapshot of resolver ctx
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_event_type CHECK (event_type IN ('impression','tap','dismiss'))
);

CREATE INDEX idx_qat_user_page_role_action
    ON quick_action_taps (user_id, page, role, action_id, occurred_at DESC);

CREATE INDEX idx_qat_pruning ON quick_action_taps (occurred_at);
-- Pruning policy: auto-delete rows > 90 days old via nightly cron.

CREATE TABLE quick_action_user_consent (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    layer_3_consent BOOLEAN NOT NULL DEFAULT false,
    consented_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    consent_text_version VARCHAR(20)  -- which DPDPA notice they accepted
);

-- ─────────────────────────────────────────────────
-- Layer 4: AI cache + audit
-- ─────────────────────────────────────────────────

CREATE TABLE quick_action_ai_cache (
    cache_key    VARCHAR(300) PRIMARY KEY,    -- 'page|role|hourbucket'
    response     JSONB NOT NULL,              -- ranked action list
    model        VARCHAR(50) NOT NULL,
    cost_usd     NUMERIC(10,6) NOT NULL,
    cached_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL          -- cached_at + 1 hour
);

CREATE INDEX idx_qac_expires ON quick_action_ai_cache (expires_at);

-- ─────────────────────────────────────────────────
-- Universal audit trail
-- ─────────────────────────────────────────────────

CREATE TABLE quick_action_audit (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    page        VARCHAR(200) NOT NULL,
    role        VARCHAR(50)  NOT NULL,
    fired_layer SMALLINT NOT NULL,
    rule_id     UUID,
    action_id   VARCHAR(200),
    trace       JSONB,                      -- full layer-by-layer evaluation
    rendered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qau_rendered_at ON quick_action_audit (rendered_at DESC);
-- Retention: 30 days, then aggregate-only via nightly cron.

-- ─────────────────────────────────────────────────
-- Configuration
-- ─────────────────────────────────────────────────

CREATE TABLE quick_action_config (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES auth.users(id)
);

-- Seeded keys:
-- 'layer_4.daily_budget_usd' → 5
-- 'layer_4.per_user_daily_calls' → 50
-- 'layer_3.min_impressions' → 30
-- 'layer_3.confidence_threshold' → 0.7
-- 'layer_4.cache_ttl_minutes' → 60
-- 'layer_0.queue_pip_visible_at' → 1
```

### RLS policies

Following the standardized pattern from CLAUDE.md (using `user_has_permission` + `role_has_institution_access`):

```sql
-- quick_action_rules: admin-only writes, all-roles reads
CREATE POLICY "qar_select" ON quick_action_rules
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('attention_bar.rules.view')
      AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
);

CREATE POLICY "qar_modify" ON quick_action_rules
FOR ALL USING (
  is_super_admin()
  OR user_has_permission('attention_bar.rules.manage')
);

-- quick_action_taps: user reads/deletes own; admin reads all
CREATE POLICY "qat_self_read" ON quick_action_taps
FOR SELECT USING (
  user_id = auth.uid() OR is_super_admin() OR is_admin()
);

CREATE POLICY "qat_self_delete" ON quick_action_taps
FOR DELETE USING (user_id = auth.uid());

-- quick_action_user_consent: user owns their own row
CREATE POLICY "qauc_self" ON quick_action_user_consent
FOR ALL USING (user_id = auth.uid() OR is_super_admin());

-- quick_action_audit: admin-only (PII-adjacent)
CREATE POLICY "qau_admin" ON quick_action_audit
FOR SELECT USING (is_super_admin() OR is_admin());

-- quick_action_config: super_admin-only writes
CREATE POLICY "qac_read" ON quick_action_config FOR SELECT USING (is_admin() OR is_super_admin());
CREATE POLICY "qac_write" ON quick_action_config FOR ALL USING (is_super_admin());
```

### New permission keys (add to `lib/constants/permissions.ts`)

```
attention_bar.rules.view
attention_bar.rules.manage
attention_bar.audit.view
attention_bar.config.manage
attention_bar.test_sandbox.use
```

---

## 5. Resolver service contract

```ts
// lib/attention-bar/resolver.ts

export interface ResolverContext {
  userId: string
  role: UserRole
  page: string                    // pathname only, no query
  state: Record<string, unknown>  // pre-fetched state-query results
  preferences: {
    layer3Consent: boolean
    layer3OverrideTo: 'on' | 'off' | 'inherit'  // user-level toggle
  }
  enabledLayers: Set<0 | 1 | 2 | 3 | 4>          // for kill-switch testing
  trace?: TraceEntry[]
}

export interface ResolvedAction {
  id: string
  label: string
  context?: string
  tone: 'urgent' | 'amber' | 'green' | 'blue' | 'neutral'
  cta: string
  icon: string                    // lucide-react icon name
  href: string
  firedLayer: 0 | 1 | 2 | 3 | 4
  ruleId?: string                 // when firedLayer === 2
  trace: TraceEntry[]
}

export async function resolve(ctx: ResolverContext): Promise<ResolvedAction | null>
```

**Server vs client split:**
- The resolver runs **server-side** in a Server Component (Next.js 16 App Router) so we don't ship rules/state-queries to the browser.
- The resolved action is passed as a prop to the client `<AttentionBar/>` component for render.
- For Layer 0 (real-time), the client opens a Supabase Realtime channel that, on incoming red-severity event, calls `/api/attention-bar/resolve` to re-resolve and update.

**Latency budgets:**
- L0/L1/L2/L3: ≤ 80ms total (mostly state-query DB calls, parallelizable)
- L4: ≤ 800ms (LLM call), but cache hit rate target 90% means median ≤ 100ms

---

## 6. Admin UI — `/system/attention-bar`

7 tabs, in order:

| # | Tab | Purpose | Permission |
|---|---|---|---|
| 1 | Overview | Last-24h metrics: renders/layer, top-firing rules, AI cost, consent stats | `attention_bar.audit.view` |
| 2 | Layer 1 — Defaults | Read-only view of static defaults (because they're code). Shows page×role coverage matrix + "Add to backlog" button that opens a GitHub issue. | `attention_bar.rules.view` |
| 3 | Layer 2 — Rules | CRUD on `quick_action_rules`. Rule editor with JSON when/action editor + "Test" button (runs against Tab 7 sandbox). | `attention_bar.rules.manage` |
| 4 | Layer 3 — Behavior | Aggregate stats only (per-user data NEVER shown to admins). "How many users have Layer 3 on", "What's the global confidence distribution". | `attention_bar.audit.view` |
| 5 | Layer 4 — AI | Cache hit rate, cost dashboard, daily-budget controls, allowlist editor, kill-switch toggle. | `attention_bar.config.manage` |
| 6 | Audit Log | Filterable table of `quick_action_audit` rows. Filters: date, user, page, fired_layer. | `attention_bar.audit.view` |
| 7 | Test Sandbox | Form: pick role, page, mock state. Click "Resolve" → see resolution trace + rendered bar preview. Same UI as the `/tmp/quick-action-interactive.html` mockup. | `attention_bar.test_sandbox.use` |

### Per-user surface — `/system/attention-bar/my-data`

For DPDPA compliance, every user has access to their own data:
- Layer 3 toggle (on/off/inherit)
- Tap history (last 90 days, filterable)
- "Download my data" → CSV export
- "Delete all my Attention Bar data" → cascades L3 + audit deletion, requires re-confirm

---

## 7. Phase decomposition (7 PRs)

| # | Phase | Scope | Size | Pre-reqs |
|---|---|---|---|---|
| 1 | Resolver + DB + Layer 1 (top 10 pages) | Tables + RLS + Layer 1 registry + resolver service. NO UI render yet. | Large (~1,200 LOC) | Spec merged (this PR) |
| 2 | Pill component | `<AttentionBar/>` + integration into `BottomNav`. Wired to Layer 1 only. Ship + measure. | Medium (~600 LOC) | PR #541 (dashboard glass) merged so Tier-D aesthetic is on main |
| 3 | Layer 0 — real-time urgent notifications | Supabase Realtime hook + queue UI + acknowledgment writes | Medium (~400 LOC) | Phase 2 |
| 4 | Layer 2 — rules engine + admin UI tabs 1, 2, 3, 6, 7 | Rule CRUD + state-query registry + Test Sandbox | Large (~1,800 LOC) | Phase 3 |
| 5 | Layer 3 — behavioral learning + DPDPA | Tap-tracking + consent banner + per-user data page + confidence engine | Large (~1,400 LOC) | Phase 4 + DPDPA legal review |
| 6 | Layer 4 — AI fallback + cost guardrails + admin Tab 5 | LLM integration + cache + circuit-breaker + allowlist | Medium (~900 LOC) | Phase 5 |
| 7 | Polish | Edge cases, perf tuning, full tab 4 (L3 admin view), error states | Small (~400 LOC) | Phase 6 |

**Total estimated LOC:** ~6,700 across 7 PRs.

**Recommended cadence:** 1 PR per 1–2 weeks. Phases 1–4 deliver 90% of the value; Phases 5–7 are optional polish.

**Kill-switch architecture:** every layer has a config flag in `quick_action_config` (`layer_N.enabled`). Set false → that layer is skipped in resolution. Default: all true after their phase ships.

---

## 8. Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Layer 2 rules become a maintenance nightmare (50+ rules, conflicting priorities) | Test Sandbox (Tab 7) lets admin verify before activating. Audit log shows which rule fires on which renders. Inactive rules don't pollute resolution. |
| R2 | Layer 3 leaks PII via tap context | `quick_action_taps.context` schema review per migration; admin views aggregate only; user can delete. |
| R3 | Layer 4 hallucinates a route the user can't access | Allowlist constraint: LLM picks from registered actions, doesn't invent. Server validates HREF before render. |
| R4 | Latency creep — resolver becomes 500ms because state queries slow | Per-query rate limit + DB index plan reviewed in Phase 1 PR. Budgets enforced via `await Promise.all(stateQueries)` parallelization + 80ms total timeout. |
| R5 | Real-time channel exhaustion (each client opens 1 channel) | Supabase Realtime tier supports 200 concurrent channels per project; we have ~30 active users. Headroom 6.6×. |
| R6 | DPDPA audit failure on Layer 3 | Legal review of consent text + cascade-delete-tested before Phase 5 ships. Spec drafted by tech; sign-off required from Director before merge. |

### Open questions (to resolve before each phase)

- **Q1 (Phase 1):** Should `institution_id` on `quick_action_rules` default to `NULL` (global) or be required? Recommendation: nullable with admin choice. Director may want JKKN-wide rules + per-college overrides.
- **Q2 (Phase 2):** Pill height in mobile viewport — 44px (iOS HIG) or 56px (Material) or 48px (compromise)? Validate against Tier-D BottomNav strip height to avoid visual cramping.
- **Q3 (Phase 3):** When two Layer 0 events arrive within 500ms, which one shows first? Recommendation: `severity_score DESC, created_at ASC`. Add `severity_score` column to `notifications`.
- **Q4 (Phase 5):** What's the consent-revocation grace period? When user revokes, do their L3 inferences keep firing for 24h or stop immediately? Recommendation: stop immediately; data retained 7 days for support, then purged.
- **Q5 (Phase 6):** Which LLM? Recommendation: Claude Haiku 4.5 (cheap, low-latency, in-region) with allowlist. Re-evaluate quarterly based on cost.

---

## 9. Out of scope for v1

- **Multi-action bars** (showing 2-3 actions). v1 is one slot, one action. Multi-slot is a v2 conversation about whether attention budgets actually scale.
- **Cross-app attention** (e.g., showing a Cockpit alert in MyJKKN's Attention Bar). The Cockpit is a separate app; cross-app is a federation problem.
- **Voice CTA** ("Resume Lead via voice"). Out of scope but Layer 1/2 action templates accept any HREF, including `voice://` schemes.
- **Notification grouping in Layer 0** — if 5 red notifications fire in 1 minute, we show them sequentially, not summarized. Summarization is Phase 8+.

---

## 10. Acceptance criteria for spec sign-off (this PR)

- [ ] Director (Omm) confirms 5-layer priority cascade order: 0 → 2 → 3 → 1 → 4.
- [ ] Director confirms Layer 1 lives in code, not DB.
- [ ] Director confirms DPDPA opt-in default for Layer 3.
- [ ] Director confirms $5/day cap for Layer 4 (or specifies different).
- [ ] Director picks first POC page for Phase 2 (recommendation: `/admission/leads`).
- [ ] Engineering: structural review of DB schema (column types, RLS pattern, indexes).
- [ ] Engineering: latency budget review (80ms L0–L3, 800ms L4).
- [ ] Privacy review: Q4 consent-revocation grace period.

Once accepted, this spec becomes the source of truth referenced by every Phase 1–7 PR. Drift between code and spec → spec gets updated in same PR (specs decay; verify reality, see `feedback_specs_decay_verify_reality.md`).

---

## Appendices

### A. Mockup reference

The interactive HTML mockup at `/tmp/quick-action-interactive.html` (551 LOC, 13 sample rules: 4 Layer 2 + 9 Layer 1) was the validation artifact for this architecture. Resolver semantics in this spec match the mockup exactly. Mockup is throwaway; this spec is durable.

### B. Glossary

- **Action** — `{label, context, tone, cta, icon, href}` — the rendered content of the Attention Bar.
- **Rule** — Layer 2 entity: `{when, action}` evaluated against context.
- **Resolver context (`ctx`)** — `{userId, role, page, state, preferences, enabledLayers}` — input to the priority cascade.
- **Layer** — one of 0/1/2/3/4 in the priority cascade. Numbers are not ordinals; the actual order is 0 → 2 → 3 → 1 → 4.
- **Trace** — array of `{layer, ruleId?, result}` showing every layer's verdict, useful for debugging in the audit log.

### C. Contrast with prior art

| System | Attention model | Why we differ |
|---|---|---|
| iOS Dynamic Island | Single slot, urgency-ordered, animated | Same model. We borrow heavily; the layered priority is the OS-level innovation. |
| WhatsApp pinned message | Single slot, manual pin | We add automatic + state-aware via Layer 2. |
| Slack reminders | List-based, opt-in per item | We collapse into one slot to avoid notification fatigue. |
| Linear command bar | On-demand keyboard shortcut | Different surface; we're persistent, not invoked. |
