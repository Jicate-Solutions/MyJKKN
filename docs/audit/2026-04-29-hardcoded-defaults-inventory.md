# Hardcoded Defaults Inventory — 2026-04-29

**Audience:** super_admin team designing future `platform_policies` migrations.
**Methodology:** code grep (6 categories), results captured at write-time
(commit SHA: `8abee37bc4646f9c20f4d906612661eb7f4e3f8e` of `jicate/main`).
**Scope:** discovery only. NO code changes proposed in this PR.
**Standing rule (Director, 2026-04-29):** every policy decision = config-table row
+ super_admin UI that writes it; SQL functions / app code READ at runtime. Future
PRs that hardcode policy must be rejected.

---

## Summary

| Category | Raw hits | Likely policy candidates | Top-3 next-migration sites |
|---|---:|---:|---|
| 1. Default redirects (landing) | 60 | ~25 | `app/(routes)/admission/page.tsx:17`, `app/(routes)/academic/page.tsx:11`, `app/(routes)/learners/page.tsx:10` |
| 2. Numeric thresholds (named consts) | 13 | ~8 | `lib/services/whatsapp/whatsapp-personal-queue-service.ts:24` (`PERSONAL_WA_DAILY_LIMIT=200`), `lib/attention-bar/circuit-breaker.ts:33` (`CONSECUTIVE_CAP_DAY_LIMIT=5`), `lib/services/permissions-audit/compliance-report-service.ts:68-70` (3 list caps) |
| 3. Sort orders + page sizes (incl. `limit:` literals) | 395 | ~30 (recurring sites) | `app/(routes)/admission/leads/[id]/page.tsx:1591-1603` (lead-score thresholds), `supabase/setup/02_functions.sql` (53 `LIMIT n` clauses inside server fns), section/student dropdowns hardcoded `limit: 10000` |
| 4. Recipient lists / role mappings | 352 (incl. UI) | ~12 hardcoded address strings + 8 local role arrays | `app/(routes)/campus-living/safety/emergency-contacts/page.tsx:38` (`antiragging@jkkn.ac.in`), `app/(routes)/health/assessments/page.tsx:522` (`counselor@jkkn.ac.in`), `app/auth/access-denied/page.tsx:100` (`support@jkkn.ac.in`) |
| 5. Category-to-action mappings | 109 | ~4 cross-cutting | `supabase/setup/02_functions.sql:6298-6301` (dashboard-category → label map), `app/(routes)/admission/leads/[id]/page.tsx:1591-1603` (Hot/Warm/Cool/Cold thresholds), `app/(routes)/health/fitness/page.tsx:228-234` (fitness category bucket map) |
| 6. Feature flags / toggles | 62 | ~6 (env-var-driven, not DB) | `lib/config/feature-flags.ts` (entire file — 6+ flags driven by `NEXT_PUBLIC_*` env, not config-table) |
| Bonus: SQL `INTERVAL 'N days/hours'` retention/lookback windows | 69 | ~12 cross-cutting | `02_functions.sql:6408` (24h notification expiry), `02_functions.sql:6469` (1h dashboard purge), multiple 30/60/90/180-day filters in dashboard fanout fns |
| Bonus: SQL hardcoded role arrays in fanout fns | 25 | ~6 | `02_functions.sql:8985` (`director,admin,accounts,principal`), `02_functions.sql:9026` (`admission,admin,admission_staff,super_admin`), `02_functions.sql:9115` (`director,principal,hod,admin`) |

**Approximate totals:** ~1,085 raw hits across 6 + 2 bonus categories. After excluding test fixtures, comments, placeholder strings, and `LIMIT 1`/`LIMIT 1 day` (interval arithmetic, not a policy), I count ~110 distinct **policy-shaped decisions** that should migrate to `platform_policies`. The top ~25 are listed below as HIGH/MEDIUM/LOW priorities.

---

## Already addressed (do NOT propose again)

The following are already covered by in-flight work — exclude from the "remaining work" lists below.

- **/admin/, /admin/lti/, /admin/pde/ default redirects** → handled by Agent J's PR in the same wave (config-row replacement of `redirect('/admin/bug-reports')`, `redirect('/admin/lti/launches')`, `redirect('/admin/pde/assessments')`).
- **/admin/landing-pages/** UI for managing landing-page redirects → handled by Agent K.
- **4 module-specific config tables shipped 2026-04-29:**
  - `retention_policies` (R-001 reference impl, replaces `90 days` purge in `/api/cron/duty-log-retention`)
  - `counselor_routing_config`
  - `staffing_alert_thresholds`
  - `notification_recipient_policies`
- **`platform_policies` substrate** (PR #595, migration `20260429000002_platform_policies_substrate.sql`):
  canonical `(policy_key, scope_type, scope_id, value::jsonb)` table + resolver fns
  `fn_get_policy()`, `fn_get_policy_int()`, `fn_get_policy_text()`, `fn_get_policy_bool()`.
  Already retires 2 hardcoded values (`holiday_backfill_lookback`, `audit_retention_years`).
- **`whatsapp_send_limits` (singleton) + `/admin/whatsapp-limits` UI** — `lib/services/admission/expo-whatsapp-service.ts` documents this as the reference pattern (60s in-process cache, fallback constant, RPC `fn_get_whatsapp_daily_limit`). **This is the canonical template for all migrations below.**

---

## Remaining work — prioritized

Priority = (user-visible impact × tweak frequency) / migration cost.

### HIGH priority (ship first)

1. **Lead-score buckets — `Hot/Warm/Cool/Cold` thresholds** (`app/(routes)/admission/leads/[id]/page.tsx:1591-1603`).
   - Hardcoded: `Hot: 75–100`, `Warm: 50–74`, `Cool: 25–49`, `Cold: 0–24`.
   - Director / admission head will tweak these as funnel data accumulates.
   - Proposed `policy_key`: `lead_score.bucket_thresholds` → `{ hot_min: 75, warm_min: 50, cool_min: 25 }`.
   - Also referenced in scoring logic that classifies new leads (search for `score >= 70` etc. in `02_functions.sql:7458`).

2. **Personal WhatsApp daily limit** (`lib/services/whatsapp/whatsapp-personal-queue-service.ts:24`):
   `const PERSONAL_WA_DAILY_LIMIT = 200`.
   - Same shape as already-shipped `whatsapp_send_limits` but for personal-account sends.
   - Either add a row to `whatsapp_send_limits` or retire that table in favour of `platform_policies` rows `whatsapp.daily_limit.<channel>`.
   - Proposed: `whatsapp.daily_limit.personal` (int, default 200), `whatsapp.daily_limit.business` (int, default 950 — already done).

3. **Notification expiry window** (`supabase/setup/02_functions.sql:6408`):
   `UPDATE notifications SET expires_at = NOW() + INTERVAL '24 hours'` for dashboard work-items.
   - 24h is arbitrary. Director may want 12h for high-urgency, 72h for low.
   - Proposed: `notifications.dashboard_expiry_hours` (int, default 24, scoped per category later).

4. **Dashboard fanout role lists** (`supabase/setup/02_functions.sql:8985, 9026, 9115`):
   Three different hardcoded role arrays driving notifications:
   - `('director','admin','accounts','principal')` — billing overdue digest
   - `('admission','admin','admission_staff','super_admin')` — admission lead escalation
   - `('director','principal','hod','admin')` — academic anomaly
   - These should be **rows in `notification_recipient_policies`** (already shipped) keyed by digest type. Migrate the SQL functions to read from the table.
   - Proposed: each fanout fn does `SELECT array_agg(role_key) FROM notification_recipient_policies WHERE digest_kind = 'billing_overdue'`.

5. **Dashboard work-item purge windows** (`supabase/setup/02_functions.sql:6469`):
   `WHERE un.created_at < NOW() - INTERVAL '1 hour' AND n.category LIKE 'dashboard:%'`.
   - 1h purge for read dashboard items. Director may want different per-category retention.
   - Proposed: row per category in `retention_policies` (already-shipped table) keyed `notifications.dashboard:approval`, `notifications.dashboard:escalation`, etc.

6. **Stale-billing / stale-application thresholds** (`02_functions.sql:8968, 9019, 9060`):
   - `INTERVAL '30 days'` for billing-overdue digest cutoff
   - `INTERVAL '24 hours'` (no-touch) + `INTERVAL '30 days'` (cap) for stale-application escalation
   - `INTERVAL '48 hours'` (no-decision) for stale-decision escalation
   - These are operational SLAs. Should be tweakable from `/admin/staffing-alert-thresholds` (table already shipped).

### MEDIUM priority (ship second)

7. **`STUDENT_QUERY_LIMIT = 10000`** in `lib/services/analytics/engagement-service.ts:202, 369, 447`:
   Three identical hardcoded query caps for analytics aggregation. If any institution exceeds 10K students per filter (which JKKN approaches), data is silently truncated.
   - Proposed: `analytics.engagement.query_cap` (int, default 10000).

8. **Permissions-audit list caps** (`lib/services/permissions-audit/compliance-report-service.ts:68-70`):
   - `ORPHAN_LIST_LIMIT = 25`
   - `MISMATCH_LIST_LIMIT = 25`
   - `TOP_RLS_TABLES_LIMIT = 10`
   - Reports get truncated. Whether 25 vs 50 vs 100 is right depends on the auditor reading them.
   - Proposed: `compliance_report.{list_kind}.limit` rows in `platform_policies`.

9. **Affected-users impact-preview cap** (`lib/services/permissions-audit/impact-preview-service.ts:56`):
   `AFFECTED_USERS_LIMIT = 50`. UI shows "first 50 affected" — silently hides the long tail.
   - Proposed: `compliance.impact_preview.user_cap` (int, default 50).

10. **Circuit-breaker consecutive-cap-day trigger** (`lib/attention-bar/circuit-breaker.ts:33`):
    `CONSECUTIVE_CAP_DAY_LIMIT = 5`. Layer 4 trips if the AI cost cap is hit 5 days in a row.
    - Operational guardrail; Director may want 3 (more aggressive) or 7 (more lenient) depending on rollout phase.
    - Proposed: `attention_bar.layer_4.consecutive_cap_day_limit` (int, default 5).

11. **Form rate-limit** (`app/api/public/forms/[slug]/submit/route.ts:13`): `RATE_LIMIT = 5`.
    - 5 submissions per (window — also hardcoded). Spam-bot defence.
    - Proposed: `public_forms.rate_limit_per_window` (int, default 5).

12. **`PREVIEW_LIMIT = 20`** (`app/api/admin/notifications/audiences/[id]/preview/route.ts:11`).
    - Previewing notification audiences caps at 20 users. Different audiences have very different sizes.
    - Proposed: `notifications.audience_preview.cap` (int, default 20).

13. **Retention windows in dashboard fanout fns** (`02_functions.sql` — 12 separate `INTERVAL` literals at lines 9019, 9060, 9100, 9229, 9256, 9286, 9717, 9897, 9961, 10051, 10166, 10220):
    - All use 30-day / 60-day / 90-day / 180-day "look-back" windows for finding stale entities.
    - Several already have correct scopes (`staffing_alert_thresholds` table covers some), but the fns currently read literals.
    - Proposed: convert each `INTERVAL 'N days'` into `make_interval(days := fn_get_policy_int('staff_alerts.<kind>.lookback_days', N))`.

14. **Local `ADMIN_ROLES` / `STAFF_ROLES` arrays** — at least 8 distinct in-file definitions:
    - `app/(routes)/work-pulse/all/page.tsx:8` — `['super_admin', 'administrator']`
    - `app/(routes)/startup-studio/solve-for-100/_components/sf100-landing.tsx:20` — `['super_admin', 'administrator', 'hod', 'principal']`
    - `app/(routes)/startup-studio/events/[id]/leaderboard/_components/leaderboard-view.tsx:47` — `['admin', 'super_admin', 'administrator']`
    - `app/api/startup-studio/submissions/[id]/metrics/route.ts:12` — `['admin', 'super_admin', 'administrator']`
    - `app/api/work-pulse/admin/route.ts:9` — `['super_admin', 'administrator']`
    - `lib/learners-council/lc-roles.ts:19` — `['admin', 'super_admin', 'staff', 'hod', 'principal']`
    - `lib/services/telephony/call-attribution.ts:53` — full STAFF_ROLES list
    - **Each one is a different opinion of "who counts as an admin."** Drift will cause incidents.
    - Proposed: replace all with `user_has_permission()` calls (already canonical per CLAUDE.md role-management rules) OR if a coarse "admin-shaped" group is genuinely needed, store as `roles.admin_group` array policy.

### LOW priority (ship later or accept as-is)

15. **`mailto:` recipients on user-facing surfaces** (~5 hardcoded addresses):
    - `iqac@jkkn.ac.in`, `antiragging@jkkn.ac.in`, `counselor@jkkn.ac.in`, `support@jkkn.ac.in`, `noemail@jkkn.ac.in` (last is fallback for missing email; not a real recipient).
    - These rarely change but a Director-driven rebrand (e.g., to `helpdesk@jkkn.ac.in`) currently requires a code PR.
    - Proposed: `contact_emails.{kind}` rows under `platform_policies` (`contact_emails.iqac`, `contact_emails.antiragging`, etc.).

16. **Section/student/faculty dropdown `limit: 10000`** in `app/(routes)/organizations/sections/_components/section-filters.tsx:75-96` and `section-form.tsx:235-355`:
    - Used to fetch "all" entities for dropdowns. 10000 is a finger-in-the-air "should be enough" — true today, may break at scale.
    - Proposed: `dropdown.max_options` (int, default 10000); UI also needs paginated combobox eventually but that's a UX problem, not a policy one.

17. **`pageSize: 20/25/50/100` literals** scattered across ~30 list pages.
    - Per-page tweaks rare. User can change via UI on most tables.
    - Acceptable as-is unless we want a tenant-level "default page size" preference. **Recommend: don't migrate — UI-level setting is sufficient.**

18. **`feature-flags.ts` — env-var-driven flags** (`NEXT_PUBLIC_USE_LEARNERS_PROFILES`, etc.):
    - 6 flags currently controlled by Vercel env vars + redeploy.
    - Migrating to DB rows would mean Director can flip them in real-time without redeploy.
    - **Trade-off:** env vars survive DB outages; DB rows survive deploy outages. For master rollout flags, env vars are arguably safer.
    - Recommend: migrate **only** the `ENABLE_STUDENT_PORTAL` flag (frequently flipped), leave the others on env until rollout completes.

19. **Fitness category buckets** (`app/(routes)/health/fitness/page.tsx:228-234`):
    `excellent / good / average / below_average`. Stable definitions in fitness-assessment domain. **Recommend: skip — domain constants, not policy.**

20. **WhatsApp template categories** (`MARKETING` vs `UTILITY` checks at `broadcast-tab.tsx:743, 798, 805, 812, 817`).
    - These mirror Meta's API contract. **Skip — external system constraint, not internal policy.**

### Explicitly OUT of scope (not policy)

- **CSS color tokens, Tailwind class lists, layout breakpoints** — design-system concerns, not runtime policy. Out of scope for this rule.
- **`LIMIT 1` and `INTERVAL '1 day'/'1 hour'` clauses inside SQL** when used for arithmetic / single-row lookup — those are query semantics, not policy.
- **DLT template IDs, Exotel app IDs, Razorpay key prefixes** — vendor IDs that genuinely shouldn't change without code review.
- **Domain-validation regexes** like `endsWith('@jkkn.ac.in')` — institutional identity rule, not a tweakable threshold.

---

## Methodology notes

### Greps used (with hit counts at run time)

| # | Pattern | Hits |
|---|---|---:|
| 1 | `redirect\s*\(\s*['"]/` in `app/(routes)/` `*.tsx` | 60 |
| 2 | `(LIMIT|RETENTION|TIMEOUT|MAX_|MIN_|DEFAULT_)\s*[=:]\s*[0-9]+` in `lib/`, `app/`, `supabase/setup/` | 13 |
| 3 | `ORDER BY|sort:\s*['"]|orderBy\s*\(|defaultSortOrder|pageSize\s*[=:]\s*[0-9]+|limit\s*[=:]\s*[0-9]+` in `app/`, `lib/` | 395 |
| 4 | `@jkkn\.ac\.in|recipient_role|fan_out|target_role` in `app/`, `lib/`, `supabase/`, minus tests | 352 |
| 5 | `category.*===\s*['"]|kind.*===\s*['"]` in `app/`, `lib/` | 109 |
| 6 | `FEATURE_|isEnabled|featureFlag|disabled\s*[=:]\s*(true|false)` in `app/`, `lib/` | 62 |
| Bonus A | `LIMIT\s+[0-9]+` in `supabase/setup/` | 53 |
| Bonus B | `INTERVAL\s+'[0-9]+\s*(day\|days\|hour\|hours\|week\|weeks\|month\|months)` in `supabase/setup/` | 69 |
| Bonus C | `role IN \(|role = '` in `02_functions.sql` | ~25 (real fanout sites; many more are RLS predicates which are already canonical) |

### False positives excluded

- **Test fixtures** (`*.test.*`) excluded across all categories.
- **Comments / JSDoc** containing the patterns (e.g. `// const DAILY_LIMIT = 950 (TIER_1K...)` in expo-whatsapp-service.ts after the migration).
- **Placeholder examples** in docs and form-help text: `placeholder="user@jkkn.ac.in"`, `'john.doe@jkkn.ac.in'` in API-guidelines docs page.
- **`LIMIT 1` for single-row lookup** — query semantics, not a tweakable cap.
- **`INTERVAL '1 day'` / `INTERVAL '1 hour'` for arithmetic** (e.g. `partition_start + INTERVAL '1 month'`, `target_date + INTERVAL '1 day'` for upper-bound timestamps) — not policy.
- **Domain-validation `endsWith('@jkkn.ac.in')`** — institutional rule, not contact-email policy.
- **DOM `disabled = false` props** on UI components (Cat 6 had ~30 of these).

### Patterns NOT covered by this audit

- **Server-side env vars / `process.env.*` fallbacks** — separate audit needed, but most are infrastructure (Supabase URL, Vercel API keys).
- **Cron schedule expressions** (e.g. `0 17 * * *` in vercel.json) — operational, but Vercel only supports them via redeploy. Could be migrated to a `cron_schedules` table with a single dispatcher.
- **Hardcoded UUIDs of "well-known" rows** (e.g. `'00000000-0000-0000-0000-000000000000'` sentinel uuids) — by design.
- **i18n strings / labels** — design-system territory.

---

## Recommendation for next fan-out

Top-3 candidates ranked by impact × tweak-frequency / migration-cost:

1. **Lead-score bucket thresholds** (HIGH #1) — Director-visible, frequently re-discussed during admission funnel reviews, low migration cost (single jsonb policy row + 1 fn rewrite). **First to ship.**
2. **Dashboard fanout role lists** (HIGH #4) — already has the target table (`notification_recipient_policies`); just need to retrofit the 3 SQL fanout functions to read from it. Highest leverage per LOC.
3. **Notification expiry & purge windows** (HIGH #3 + #5) — single substrate change covering 24h-expiry + 1h-purge + 30d-stale across at least 6 SQL fns. Use `platform_policies` resolver fns directly.

After these, the medium-priority cluster (#7-#13) can fan out as 4-5 small parallel PRs, all reading via `fn_get_policy_int()`.

The pattern to keep replicating is the one already shipped in
`lib/services/admission/expo-whatsapp-service.ts`:
`platform_policies` row → resolver fn → 60s in-process cache → fallback constant on RPC failure.

---

## Open questions for the super_admin team

These came up while reading the hits but couldn't be answered without product input:

1. **Lead-score thresholds** — should they be per-institution or global? (Current code is global; institution-level scope means 8 colleges can each tune.)
2. **Notification expiry** — should it scope by `category` (12 distinct dashboard categories) or by audience role?
3. **Page-size defaults** — preference for "store as policy" vs "let user override per-table via UI"? The current default 20/25/50/100 split is incoherent.
4. **Local `ADMIN_ROLES` arrays** — preferred resolution: replace with `user_has_permission()` everywhere, OR keep one canonical `lib/constants/role-groups.ts` exporting `ADMIN_GROUP`, `STAFF_GROUP` constants? (CLAUDE.md says permissions are canonical, but that's a bigger refactor.)
5. **`feature-flags.ts`** — should master rollout flags genuinely move to DB, accepting the risk that a DB outage hides a feature from prod users?

These are tracked here, not as work; the super_admin team can answer in a follow-up PR's design doc.
