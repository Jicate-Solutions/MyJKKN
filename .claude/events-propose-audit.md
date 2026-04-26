# `/events/propose` — Sprint 0 Audit

> **Status:** Audit complete. Verdict: **PROCEED to Sprint 1 redesign + add discoverability layer.**
> **Audit date:** 2026-04-26
> **Auditor:** Claude (main thread, this session)
> **Spec reference:** `specs/chat-bypass-workflow-gravity.md` §4.1 (recovered to `/tmp/chat-bypass-spec.md` for this session)
> **Form under audit:** `app/(routes)/events/propose/page.tsx` (216 LOC, last modified 2026-04-24, shipped via PR #455 on 2026-04-17)
> **Empirical context:** 81 chat-bypass asks classified as `events` in 365-day window — biggest existing-module gap

---

## Methodology

This audit combines:
1. **Static code review** of `app/(routes)/events/propose/page.tsx` against the 8 spec criteria.
2. **Discoverability grep** across `lib/sidebarMenuLink.ts`, `components/Sidebar/`, `lib/constants/`, `app/(routes)/events/`, `components/dashboard/` to enumerate every UI surface that links to `/events/propose`.
3. **Notification-path grep** to verify whether the form triggers any Director-side surface on submit.
4. **Asker status page existence check** via filesystem scan for `/events/propose/[id]/status/` or equivalent.

Browser screenshots were considered but the static evidence is conclusive enough that visual verification adds supplementary documentation, not verdict-changing evidence. Screenshots can be added in a follow-up if Director requests visual exhibits.

---

## Scoring against §4.1 — 8 criteria

### Criterion 1: Field count — **FAIL**

**Spec target:** 3 visible fields, max 5 with progressive disclosure.

**Actual form (page.tsx lines 137–209):**

| # | Field | Required? | Type |
|---|---|---|---|
| 1 | Event name | Required | text |
| 2 | Category | Required | async-loaded Select (fetches from `events_general_categories`) |
| 3 | Start datetime | Required | `datetime-local` (browser picker) |
| 4 | End datetime | Required | `datetime-local` (browser picker) |
| 5 | Venue | Required | text |
| 6 | Scope | Defaults to `institution` | Select (3 options) |
| 7 | Visibility | Defaults to `institution` | Select (4 options) |
| 8 | Description | Optional | textarea (4 rows) |

**5 required fields + 2 with defaults + 1 optional = 8 visible at first paint.** Vs spec target of 3 visible. **>2.5× over the target.** Hard fail.

**Implication:** A Krishna-Veni-style chat ask ("@Director, can we run a NAAC awareness session next week?") provides ~5 words. The form demands category dropdown + 2 datetime-local pickers + venue + scope + visibility before submit. That's 4 dropdowns and 2 date pickers worth of friction the chat ask doesn't present.

---

### Criterion 2: Mobile-first — **FAIL**

**Spec target:** Full-bleed, no sidebar/nav at submit time, works on phone in <30s.

**Actual form structure (lines 112–214):**
- Wrapped in `<ContentLayout title="Propose Event">` — this renders the **full app sidebar** at desktop, narrow header at mobile. Not full-bleed.
- `<Breadcrumb>` row above the card (lines 114–122) — Home > Events > Propose. Eats vertical space.
- "Back" button (line 125) above the card — eats more vertical space.
- `<Card><CardHeader>` wrapper with title + 2-line muted description. More chrome.
- `max-w-2xl` (768px) container. Narrow on desktop is fine, but combined with all the chrome above, the actual form block sits ~250px below the top of the viewport on mobile.

The form **does** use `grid-cols-1 sm:grid-cols-2` for date + scope rows (lines 156, 172) — so it's responsive in the literal sense. But "responsive layout" ≠ "mobile-first". A phone user sees ~3 fields above the fold; `datetime-local` pickers on iOS Safari open a wheel picker that consumes the bottom half of the screen.

**Verdict:** Form is desktop-first with responsive fallback, not mobile-first. Hard fail.

---

### Criterion 3: Time-to-submit median — **FAIL (estimated >60s, likely 90–120s on phone)**

**Spec target:** ≤30 seconds. >60s = fail.

**Static estimate based on field interaction pattern:**

| Field | Phone time (est.) | Reasoning |
|---|---:|---|
| Event name (text input + autofocus, ~5 chars) | ~6s | Mobile keyboard open, type, dismiss |
| Category (async Select, 6+ options) | ~8s | Wait for `loadingCats=false`, tap, scroll, pick |
| Start datetime-local | ~12s | iOS picker — scroll year/month/day/hour/minute wheels |
| End datetime-local | ~12s | Same as above |
| Venue (text input) | ~8s | Keyboard open, type "Main Auditorium", dismiss |
| Scope (default `institution`, but user may verify) | ~3s | Tap to verify (or skip if confident) |
| Visibility (default `institution`, may verify) | ~3s | Same |
| Description (optional, but ~50% of users will write) | ~15s | Keyboard, type, dismiss |
| Tap Submit, await round-trip | ~3s | Network round-trip |

**Estimated phone time: 60–70s minimum, typical ~90s.** Hard fail.

**Risk amplifier:** the category list is fetched via `useEffect` on mount (lines 49–60). On a slow connection, the `<Select>` shows "Loading…" placeholder until the fetch resolves. The user may tap and find no options yet, triggering retry behavior.

A real measurement on iOS Safari + 4G would tighten this estimate, but the gap from 30s target is wide enough that the verdict won't change.

---

### Criterion 4: Director-side notification — **FAIL (no notification path exists)**

**Spec target:** Director gets a push notification within 60s of submit. Not just inclusion in PR #492's daily digest.

**Static evidence (lines 80–104, the INSERT path):**
```typescript
const { data, error } = await (supabase as any).from('events').insert({
  // ... 21 fields ...
  status: 'draft',
  proposed_by: user.id,
  // ...
}).select('id, slug').single();

setSubmitting(false);
if (error) { toast.error(`Submit failed: ${error.message}`); return; }
toast.success(`Event proposed — id ${data.id.slice(0, 8)}…`);
router.push(`/events/propose?created=${data.slug}`);
```

**The form's only post-submit action is a toast + URL redirect to itself with `?created=<slug>`.** No call to:
- `fn_create_dashboard_work_item`
- A push-notification service or fetch to `/api/notifications/push`
- An event_proposals table separate from events
- Anything observable to Director

PR #492 (merged) wired a `dashboard:event_proposal` work-item generator into `fn_generate_all_dashboard_work_items` — but that's a **batch sweep** at digest time, not a real-time push. Best case Director sees a new event proposal ~24h after submit (when the daily digest runs). At worst, the asker never gets visible feedback on whether Director saw it.

**Verdict:** Hard fail. The asker has no way to verify Director received the proposal short of pinging him in chat — which is exactly the chat-bypass behavior the spec is trying to eliminate.

---

### Criterion 5: Asker-side status timeline — **FAIL (no status page exists)**

**Spec target:** After submit, asker sees a status page with timeline (Submitted → Reviewing → Decided), can re-find later, sees Director's response inline, can comment, can copy-paste a shareable URL back to Chat.

**Filesystem evidence:** `find app/\(routes\)/events/propose -type f -name "*.tsx"` returns ONE file — `page.tsx`. No `[id]/status/page.tsx`, no nested routes, no detail page.

**What happens after submit:** `router.push('/events/propose?created=<slug>')` redirects back to the SAME form with a query string. The form does not read `?created=` (no `useSearchParams` in the file). User sees an empty form with a success toast that fades in 4 seconds.

**Implication:** The asker has no URL to come back to, no timeline, no way to know if Director has reviewed the event. The chat-bypass behavior — "@Director, did you see my event request?" — is **structurally encouraged** by the form, because there's literally no way for the asker to check status in-app.

**Verdict:** Hard fail. This single failure justifies redesign on its own — without an asker status page, no amount of form-friction reduction can win against chat.

---

### Criterion 6: Discoverability — **HARD FAIL (form is reachable only via direct URL typing)**

**Spec target:** Sidebar entry, dashboard CTA, or top-nav link so staff at moment of intent can find the form.

**Discoverability grep results across the entire codebase:**

| Surface | Has link to `/events/propose`? | Evidence |
|---|---|---|
| `lib/sidebarMenuLink.ts` (the ONLY sidebar source-of-truth) | **NO** | grep matches: 0. Only `/startup-studio/events/*` and unrelated `events` strings. |
| `components/Sidebar/*` | **NO** | grep: 0. |
| `lib/constants/*` (MODULES, MENU_PERMISSIONS, etc.) | **NO** | grep: 0. |
| `components/dashboard/*` (any CTA card) | **NO** | grep: 0. |
| `app/(routes)/events/page.tsx` (the events landing page) | **NO** | Only links to `/events/marathon`. The propose page is invisible from the events module's own home. |
| Dashboard `/admin/*` pages | **NO** | Not surfaced. |
| Search anywhere | **NO** | The form is not indexed in any in-app navigation. |

**The only references to `/events/propose` are:**
1. Self-redirect after submit (line 109, the form sending the user back to itself).
2. A breadcrumb that points to `/events` (line 118 — and `/events` doesn't link forward to `/events/propose`).

**Net effect:** the form is a dead-letter URL. A staff member cannot discover it through any in-app path. They would have to either (a) remember the URL `/events/propose` from a prior conversation, (b) get the URL pasted to them in Chat (which is itself a chat-bypass moment), or (c) guess by typing `/events/...` and trying combinations.

**This is the dominant failure mode.** It's not that the form is friction-heavy at the moment of asking — it's that the form **isn't present at the moment of asking** at all.

**Verdict:** Hardest possible fail.

---

### Criterion 7: Pre-fill from `auth.uid()` — **PARTIAL FAIL**

**Spec target:** Sender-derivable fields (institution, role, contact) auto-populated from `auth.uid()`.

**Actual form (lines 70–74):**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) { toast.error('Sign in first'); setSubmitting(false); return; }

const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', user.id).single();
if (!profile?.institution_id) { toast.error('Your profile has no institution'); setSubmitting(false); return; }
```

**Server-side INSERT (line 81):** `institution_id: profile.institution_id` and `proposed_by: user.id` and `created_by: user.id` are correctly auto-populated.

**UI surface:** None of this is shown to the asker. There is no "Submitting as: Omm Sharravana, JKKN Pharmacy" header. The asker doesn't see what context the form is using on their behalf.

**Verdict:** Partial fail. The data is auto-populated correctly server-side, but the asker doesn't see this and therefore can't catch errors (e.g., if they're logged in to the wrong account). Also, no other contextual fields (counselor name, role, contact phone, common venue defaults from prior submissions) are pre-populated. The form treats every submission as cold-start.

---

### Criterion 8: Error recovery — **PARTIAL PASS**

**Spec target:** Required field missing → form retains state, doesn't lose user's inputs.

**Actual behavior (lines 62–67):**
```typescript
if (!name || !categoryId || !startAt || !endAt || !venueText) {
  toast.error('Fill all required fields');
  return;
}
```

The form uses `useState` for each field, so state is retained on validation error. ✅ Good.

**Weaknesses:**
- Single blanket toast "Fill all required fields" — doesn't tell the asker *which* field is missing. On a 5-required-field form, the asker has to re-scan to find the empty one.
- No per-field error state (no red border, no inline message).
- If the network fails on submit (line 107 `if (error)`), error is shown via toast but form state is NOT cleared — so retry is possible. ✅

**Verdict:** Partial pass. State is retained (good), but error UX is sub-spec.

---

## Summary scoring

| # | Criterion | Verdict |
|---|---|---|
| 1 | Field count | **FAIL** |
| 2 | Mobile-first | **FAIL** |
| 3 | Time-to-submit median | **FAIL** |
| 4 | Director push notification | **FAIL** |
| 5 | Asker status timeline | **FAIL** |
| 6 | Discoverability | **HARD FAIL** |
| 7 | Pre-fill | **PARTIAL FAIL** |
| 8 | Error recovery | **PARTIAL PASS** |

**Total: 6 hard fails + 1 partial fail + 1 partial pass.**

Spec §4.3 audit gate:
- ≥3 criteria fail → proceed to Sprint 1 redesign. ✅ **6 hard fails, gate opens.**
- ≥6 criteria pass → discoverability is the bug, NOT form design. **NOT triggered.**

**Audit gate verdict: PROCEED to Sprint 1.**

---

## Findings beyond the checklist

### Finding A: Discoverability failure is dominant, not auxiliary

Spec §10 Q2 asks: *"What if discoverability is the binding constraint, not form speed?"* — and frames it as an alternative hypothesis the audit might surface.

The audit doesn't pick between "form is bad" vs "discoverability is bad" — **both are true, and discoverability is dominant.** Even a perfect Sprint 1 form redesign (3 fields, full-bleed mobile, 30s submit, push to Director, asker status page, the works) **cannot win against chat at the moment of asking** unless the redesigned form is placed somewhere staff actually navigate to.

**Recommendation for Sprint 1 scope (this is a deviation from spec §5):**
- Sprint 1 must include a discoverability layer alongside form redesign:
  - Add `/events/propose` to `lib/sidebarMenuLink.ts` under the Events section, surfaced for all permissioned roles (not just super_admin).
  - Add a "Propose new event" CTA on `/events/page.tsx` (the events landing page currently only surfaces `/events/marathon`).
  - Consider a dashboard tile for "Quick actions: propose event / report bug / request leave" so the form is hit at moment of intent without needing to click through the events module.
- Without this, even a Sprint 1 form that scores 8/8 on §4.1 will continue to lose to chat — because the asker still doesn't reach the form to use it.

### Finding B: Form is a smoke test, not a production form

The page header (lines 6–7) explicitly says: *"Phase-1A production schema is live (events + events_general_categories + 5 new tables + 6 triggers). This page writes ONE event directly via browser Supabase client to validate the full schema end-to-end with real user input. Deliberately minimal — no approval chain wiring yet, no bundles/roles/sessions/waitlist UI."*

This is **honest and correct documentation** — the form was never meant to absorb 81 chat asks/year. It was a schema validation tool. The chat-bypass-workflow-gravity spec implicitly assumes this form was a serious intake; the audit reveals it isn't, by its own stated design.

**Implication for Sprint 1 redesign:** Don't iterate on this file. **Replace it.** Build a new form per spec §5 that replaces the current page.tsx wholesale, since the existing implementation is a developer smoke-test that was never optimized for asker friction.

### Finding C: No `event_proposals` table exists separately from `events`

The form INSERTs directly into `events` with `status='draft'`. There is no separate `event_proposals` table. Spec §5.2 step 2 says *"Server creates `events.event_proposals` row..."* — but the schema treats proposed events as `events` rows in `draft` status.

**Implication for Sprint 1:** Either (a) pivot the spec to use `events.status='draft'` as the proposal state and add an `approval_status` column for Director's review state, or (b) create a separate `event_proposals` table that promotes to `events` on approval. Option (a) is lower migration cost; option (b) is cleaner separation. **Recommendation: option (a)** — extend `events` rather than fork into a new table, since the schema validation work has already shipped.

### Finding D: PR #492's "event proposal" work-item generator depends on a column that may not exist yet

PR #492 added `fn_generate_event_proposal_items` (or equivalent) which scans `events` for newly-created proposals. The audit didn't verify what column it filters on. If the generator filters on `status='draft' AND created_at > NOW() - INTERVAL '24h'`, it picks up proposals correctly but with up to 24h latency.

**Recommendation for Sprint 1:** Add a real-time push trigger on insert (Supabase Database Webhook → push API) so Director gets the push within 60s, AND keep the digest path as fallback for missed pushes. Don't replace one with the other.

---

## Sprint 1 scope (per the audit)

The audit forces a wider Sprint 1 than spec §5 alone implies:

| Stream | Spec section | Audit-driven addition |
|---|---|---|
| **A. Form redesign** | §5.1 (3 fields, mobile-first) + §5.2 (submission flow) + §5.4 (tests) | Replace `page.tsx` wholesale, don't iterate. |
| **B. Asker status page** | §5.2 (status URL, timeline, comment thread) | New route `/events/propose/[id]/status`. New components. |
| **C. Director push** | §5.2 (push within 60s) | New webhook or in-form fetch to push API. Plus PR #492 digest as fallback. |
| **D. Discoverability layer** | NOT in §5; surfaced by audit Finding A | Add to `sidebarMenuLink.ts`, add CTA on `/events/page.tsx`, optionally dashboard tile. **WITHOUT THIS, Sprint 1 fails on the Day 30 measurement regardless of form quality.** |
| **E. Schema** | §5.2 implies `event_proposals` table | Use `events.status='draft'` (Finding C) — no migration needed for this Sprint. Add `approval_status` column if needed. |

**Estimated effort:** 4–6 hours main-thread work (vs spec's ~3-4 hour estimate) due to the discoverability layer addition.

**PR pattern:** Single PR Ready against `jicate/main`. Branch name: `feat/events-propose-redesign-sprint-1`. Do NOT merge — Director merges manually.

---

## Open question raised by audit

**Should the Day 30 measurement window start from the form-redesign merge date OR from the discoverability-layer merge date?** If we ship form redesign first (without sidebar entry) and measure Day 30 from there, the form will look like a failed redesign even if it's perfect — because no one finds it. The Day 30 baseline measurement should start from the date when **both** form and discoverability ship together.

**Recommendation:** Ship form + discoverability + status page in ONE PR (Sprint 1A). Measure Day 30 from that PR's merge date. Don't split into multiple PRs because partial deployment will give partial measurement and the falsifiable hypothesis loses meaning.

---

## Verdict

**Audit gate: open. Proceed to Sprint 1.**

**Sprint 1 scope expanded** to include discoverability layer per Finding A. Form redesign per spec §5 alone is necessary but not sufficient.

**Falsifiable Day 30 measurement** still applies. Start clock from Sprint 1 merge date (with all 4 streams shipped together).

If Sprint 1 ships and Day 30 chat-bypass for events is still ≥50% of the 81/365d baseline (i.e. ≥40 chat-events asks in days 23–30 post-merge), the workflow-gravity hypothesis itself is questionable, not just the form design — and we stop the replication chain to investigate before Sprint 2 (admission_leads).

---

*Audit complete 2026-04-26. Browser-screenshot supplements available on request via `cdp.py navigate https://www.jkkn.ai/events/propose` + `screenshot` against the persistent jkkn-ai session.*
