# KBM Marathon v2 — Implementation Plan

> **Race Day:** April 12, 2026 (3 days out)
> **Plan Date:** April 9, 2026
> **Source:** Synthesized from `docs/features/marathon-v2/` + 4 parallel investigation agents
> **Verdict:** Ship blockers first. Minimal additive mobile work. Defer the full mobile-first rewrite to post-race.

---

## Executive Summary

The marathon-v2 handoff proposes a 14-page mobile-first rewrite (~4,500 LOC) of a working internal module. With the public registration site currently **broken** and 3 days to race day, that plan is malpractice. This implementation plan adopts a **race-day-safe** strategy:

1. **Fix the broken front door first** — public site table mismatch breaks registration for everyone
2. **Ship additive mobile improvements only** — CSS polish + 1 new card view, no rewrites
3. **Defer the full mobile-first rebuild to post-race** — armed with real usage analytics

### Agent Findings at a Glance

| Agent | Key Finding |
|-------|-------------|
| **Mobile UX Audit** | 40% CSS tweaks, 30% mechanical swaps, 30% genuine rewrites. Only 3 pages truly need rewrites (Registrations, Committees, Live Ops) |
| **Component Architect** | Existing primitives (`sheet.tsx`, `drawer.tsx`, `work-pulse-fab.tsx`) already cover 80% of what we need. ~605 LOC to build the rest |
| **Devil's Advocate** | The rewrite is misprioritized. Existing DataTable has mobile CSS — horizontal-scroll is acceptable for an admin tool for 3 days |
| **Public Site Investigator** | Blocker #1 confirmed. Internal module clean. Single SQL migration fixes it in 4 hours |

---

## Phase 0 — Race-Day Blockers (Day 1, April 9)

**Objective:** Unbreak the event. Nothing else matters until these ship.

### Task 0.1: Fix Public Site Table Mismatch (P0, 4 hours)

The `kbm-marathon-public` app queries `marathon_events`, `marathon_categories`, `marathon_registrations` — tables that do NOT exist. Registration is broken.

**Fix:** Ship database views + INSTEAD OF trigger via Supabase migration. Zero code changes on the public site.

**Steps:**

1. Apply migration `create_marathon_compat_views` via Supabase MCP:

```sql
-- Read-side views
CREATE OR REPLACE VIEW public.marathon_events AS
  SELECT * FROM public.events WHERE event_type = 'marathon';

CREATE OR REPLACE VIEW public.marathon_categories AS
  SELECT ec.* FROM public.event_categories ec
  JOIN public.events e ON e.id = ec.event_id
  WHERE e.event_type = 'marathon';

CREATE OR REPLACE VIEW public.marathon_registrations AS
  SELECT id, event_id, category_id,
         participant_name, participant_phone, participant_email,
         participant_age, participant_gender, institution_name,
         bib_number, status, payment_status, payment_amount,
         custom_data, created_at, updated_at
  FROM public.events_registrations;

-- INSTEAD OF INSERT trigger (public site registers participants through this view)
CREATE OR REPLACE FUNCTION public.marathon_registrations_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.events_registrations (
    event_id, category_id, participant_name, participant_phone,
    participant_email, participant_age, participant_gender,
    institution_name, bib_number, status, payment_status,
    payment_amount, custom_data, participant_type, source
  ) VALUES (
    NEW.event_id, NEW.category_id, NEW.participant_name, NEW.participant_phone,
    NEW.participant_email, NEW.participant_age, NEW.participant_gender,
    NEW.institution_name, NEW.bib_number,
    COALESCE(NEW.status, 'registered'),
    COALESCE(NEW.payment_status, 'pending'),
    NEW.payment_amount, NEW.custom_data,
    'external', 'public_site'
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER marathon_registrations_insert_trg
  INSTEAD OF INSERT ON public.marathon_registrations
  FOR EACH ROW EXECUTE FUNCTION public.marathon_registrations_insert();

-- Grants for anon key used by public site
GRANT SELECT ON public.marathon_events TO anon, authenticated;
GRANT SELECT ON public.marathon_categories TO anon, authenticated;
GRANT SELECT, INSERT ON public.marathon_registrations TO anon, authenticated;
```

2. Also save to `supabase/setup/05_views.sql` (append) and `supabase/setup/04_triggers.sql` (append)
3. Verify RLS on `events_registrations` permits anon INSERT (the `events_reg_public_insert` policy already does this)
4. End-to-end smoke test: open `kbm-marathon-public.vercel.app`, complete a test registration, verify row appears in `events_registrations`
5. Commit: `fix(events): add marathon_* compat views for public site registration`

### Task 0.2: Payment Decision (P0, 1 hour)

Current state: Razorpay placeholder key `rzp_test_placeholder` on public site. Online payment is non-functional.

**Decision required (30 min):** Real Razorpay keys OR remove online payment CTA entirely and commit to "pay at venue" workflow.

**If REMOVE:** Update public site registration form to:
- Hide "Pay Online" button
- Show "Pay ₹{amount} at venue on race day" message
- Set `payment_status: 'pending'` on registration
- Registration desk collects cash and manually marks `payment_status: 'paid'` (already supported in internal module)

**If INTEGRATE:** Only viable if Razorpay keys are already provisioned. Otherwise, takes longer than 3 days.

**Recommendation:** Remove CTA. Registration desk handles payment at venue. Post-race, integrate Razorpay properly.

### Task 0.3: DNS Configuration (P0, 30 min + propagation)

Current: public site only at `kbm-marathon-public.vercel.app`. Target: `marathon.jkkn.ac.in`.

**Steps:**
1. Add DNS record in JKKN DNS manager: CNAME `marathon` → `cname.vercel-dns.com`
2. In Vercel dashboard (`kbm-marathon-public` project): Settings → Domains → Add `marathon.jkkn.ac.in`
3. Wait for SSL (5-10 min)
4. Update `NEXT_PUBLIC_SITE_URL=https://marathon.jkkn.ac.in` in Vercel env vars
5. Verify: `curl -I https://marathon.jkkn.ac.in` returns 200

### Task 0.4: Regenerate Supabase Types (P1, 30 min)

The `lib/types/database.ts` file has stale `marathon_events/categories/registrations` table type definitions. Regenerate from live schema.

**Steps:**
1. `npx supabase gen types typescript --project-id hhprjbgknupaplivtoib > lib/types/database.ts`
2. Verify stale marathon_* entries are gone
3. Commit: `chore(types): regenerate database types`

### Phase 0 Verification Checklist

- [ ] Public site registration works end-to-end (test with real phone number)
- [ ] Payment flow is consistent (either working or clearly marked "pay at venue")
- [ ] `marathon.jkkn.ac.in` resolves with valid SSL
- [ ] Database types are fresh

**DO NOT PROCEED to Phase 1 until all four checkboxes are green.**

---

## Phase 1 — Minimum Viable Mobile (Day 2, April 10)

**Objective:** Make the 2 race-critical pages (Registrations, Live Ops) usable on phone without rewriting them. All changes must be **additive and reversible**.

### Task 1.1: Global Touch Target CSS Pass (2 hours, benefits all 14 pages)

One PR, global improvement. No structural changes.

**File changes:**

1. **`components/ui/data-table.tsx`** — bump row density on mobile:
   - Row min-height 48px (currently cramped)
   - Action buttons `h-10 w-10` (currently `h-8 w-8` — 32px, below 44px WCAG minimum)
   - Sticky first column on `< sm` so BIB number stays visible
   - Abbreviated column headers on mobile

2. **`components/ui/button.tsx`** — verify `size="sm"` has `min-h-[44px]` on mobile. If not, add it.

3. **Global filter bar pattern** — find all marathon pages with `SelectTrigger className="w-[150px]"` and change to `flex-wrap gap-2 overflow-x-auto` with full-width pills.

4. **Breadcrumb** — wrap `<PageBreadcrumb>` in `hidden sm:block` on marathon pages to reclaim vertical space.

**Estimated changes:** ~80 LOC across 5 files. No risk of breaking existing behavior.

**Commit:** `fix(marathon): mobile touch targets and spacing improvements`

### Task 1.2: Registrations Page — Additive Mobile Card View (6 hours)

This is the highest-traffic page on race day (registration desk check-in). Build a mobile card view **alongside** the existing DataTable — NOT as a replacement.

**File:** `app/(routes)/events/marathon/[id]/registrations/page.tsx`

**Strategy:**
```tsx
<div className="block lg:hidden">
  {/* Mobile card list — NEW */}
  <RegistrationsCardList data={filteredRegistrations} onCheckIn={handleCheckIn} />
</div>

<div className="hidden lg:block">
  {/* Existing DataTable — UNTOUCHED */}
  <DataTable columns={columns} data={registrations} ... />
</div>
```

**RegistrationsCardList component** (inline, ~150 LOC):

```tsx
function RegistrationsCardList({ data, onCheckIn }) {
  return (
    <div className="space-y-2">
      {data.map(r => (
        <Card key={r.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{r.bib_number}</span>
                <Badge variant={r.payment_status === 'paid' ? 'default' : 'outline'} className="text-[10px]">
                  {r.payment_status === 'paid' ? '✓ Paid' : r.payment_status}
                </Badge>
              </div>
              <p className="font-semibold text-sm mt-0.5 truncate">{r.participant_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <a href={`tel:${r.participant_phone}`} className="flex items-center gap-1 hover:text-primary">
                  📱 {r.participant_phone}
                </a>
                <span>·</span>
                <span>{r.category?.name}</span>
              </div>
              {r.department && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {r.department}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant={r.checked_in ? 'default' : 'outline'}
              className="shrink-0 min-h-[44px] min-w-[44px]"
              onClick={() => onCheckIn(r.id)}
              disabled={r.checked_in}
            >
              {r.checked_in ? '✓' : 'Check In'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

**Key race-day features:**
- **Phone numbers are `tel:` links** — one-tap call if someone can't find a runner
- **Check-in button is 44x44px minimum** — large tap target
- **Optimistic check-in** — UI updates immediately, API sync in background
- **BIB number is monospace** — scannable by registration desk

**Search/filter:** Reuse the existing filter state. Both card list and DataTable read the same filtered array.

**Commit:** `feat(marathon/registrations): add additive mobile card view for race-day check-in`

### Task 1.3: Live Ops — Tap Targets + Emergency FAB (3 hours)

**File:** `app/(routes)/events/marathon/[id]/live/page.tsx` + `_components/*.tsx`

Minimum changes for race day:

1. **Report Incident FAB** — extract from `components/work-pulse-fab.tsx` pattern. Render `fixed bottom-20 right-4 z-[70] lg:hidden` when event status is `live`. On tap, open `IncidentForm` in a `<Sheet side="bottom">`.

2. **Tap target pass** on Live Ops buttons — bump all action buttons (`race-controls.tsx`, `incident-panel.tsx`, `volunteer-panel.tsx`) to `min-h-[44px]`.

3. **Incident form as bottom sheet** — change existing `<Dialog>` to `<Sheet side="bottom" className="h-[90vh]">`. This is a 3-line change (the existing `incident-form.tsx` already uses Radix, just swap the wrapper).

4. **Stationary alerts — make phone `tel:` links** so coordinators can immediately call the runner's emergency contact.

**NOT doing:** Full-screen map, draggable bottom sheet with tabs, runner slide-over — these are post-race.

**Commit:** `feat(marathon/live): add mobile FAB for incident reporting + tap target fixes`

### Task 1.4: Device QA (2 hours)

**Who:** 2 humans, 2 real phones (1 iOS, 1 Android).
**What to test:**
1. Register a participant via public site end-to-end
2. Check in the new registration via the internal card view on phone
3. Report a test incident via the Live Ops FAB
4. Call a participant via the `tel:` link

If any of these fail → fix before proceeding.

---

## Phase 2 — Freeze & Dry Run (Day 3, April 11)

### Task 2.1: Code Freeze at Noon

**Rule:** After 12:00 PM April 11, only P0 hotfixes merge. Any feature work still in progress gets reverted.

### Task 2.2: Dry Run with Committee Leads

Walk through race-day flows with the 6 committee leads on their actual devices:
- **Registration committee:** search for a participant, check in, create a walk-up registration
- **First Aid committee:** report an incident from Live Ops
- **Water Point committee:** mark a task as complete
- **Crowd Mgmt committee:** view stationary alerts
- **Route committee:** scan a checkpoint QR (if ready)
- **Stage committee:** view budget items (read-only)

Document issues in a checklist. Fix P0 issues only. Log P1+ to post-race backlog.

### Task 2.3: Pre-Stage Desktop Fallbacks

**At the registration desk:** Laptop with MyJKKN open to the registrations page. If mobile breaks, staff pivots in 60 seconds.

**At the Live Ops tent:** Laptop with Live Ops dashboard open. Coordinator monitors from desktop; mobile is the backup.

---

## Phase 3 — Race Day (April 12)

### Task 3.1: On-Call Rotation

One engineer on Slack/WhatsApp from 5:00 AM — 10:00 AM IST. Hotfix P0 issues only. No new features.

### Task 3.2: Live Monitoring

- Vercel logs for errors
- Supabase Advisors dashboard
- Watch `events_registrations` table for insert rate
- Watch `marathon_race_tracks` for GPS sync health
- Watch `marathon_incidents` for critical incidents

### Task 3.3: Observability Metrics to Capture

These become the **input data for the post-race mobile rebuild**:

- Device type breakdown (mobile vs desktop vs tablet) — answers the "95% mobile" question
- Pages visited per device type — which pages actually need mobile work?
- Action counts: check-ins, incident reports, task completions by page+device
- Session durations per page
- Error rates per device

---

## Phase 4 — POST-RACE (April 13+)

**This is where the full mobile-first rebuild from `docs/features/marathon-v2/02-MOBILE-FIRST-SPECS.md` actually happens** — but now with real usage analytics to guide priorities.

### Task 4.1: Post-Race Retrospective (1 day)

Analyze Phase 3 metrics. Answer:
1. What % of race-day usage was actually mobile?
2. Which pages had the highest mobile traffic?
3. Which pages had the most errors / drop-offs on mobile?
4. What features were used most (check-in, incident, task completion)?

The handoff's "95% mobile" claim either gets validated or corrected. Rebuild scope is adjusted accordingly.

### Task 4.2: Build Mobile Component Library (2 days, ~605 LOC)

Based on the Component Architect agent's design:

1. **`hooks/use-media-query.ts`** (15 LOC) — blocks 3 components
2. **`components/ui/mobile/bottom-sheet.tsx`** (120 LOC) — wraps `vaul` Drawer, delegates to Dialog on desktop
3. **`components/ui/mobile/mobile-card-list.tsx`** (140 LOC) — responsive wrapper around DataTable
4. **`components/ui/mobile/fab.tsx`** (60 LOC) — extracted from `work-pulse-fab.tsx` pattern
5. **`components/ui/mobile/filter-pills.tsx`** (70 LOC) — horizontal scrollable filter badges
6. **`components/ui/mobile/stats-bar.tsx`** (90 LOC) — horizontal scrollable stat cards
7. **`components/ui/mobile/mobile-checklist.tsx`** (110 LOC) — touch-friendly task list

**Standardize z-index tokens** in `app/globals.css`:
```css
:root {
  --z-bottom-nav: 60;
  --z-fab: 70;
  --z-command-palette: 80;
  --z-sheet: 90;
  --z-dialog: 100;
  --z-toast: 110;
}
```

### Task 4.3: Page Migrations (5 days, prioritized by race-day analytics)

**Likely priority order** (pending analytics):
1. Registrations — migrate additive card view to use `MobileCardList<T>`
2. Live Ops — full-screen map + draggable `BottomSheet` with tabs
3. Committees — accordion → expandable cards + `MobileChecklist`
4. Budget — DataTable → summary + item cards
5. Events List — DataTable → card list
6. Results — DataTable → card list
7. Sponsors — DataTable → card list with swipe actions
8-14. Dashboard, Settings, Analytics, Certificates, Detail pages, New Event, Hub — CSS polish only

### Task 4.4: Public Site Refactor — Option C (2 weeks)

Refactor `kbm-marathon-public` to call MyJKKN API endpoints (`/api/events/marathon/[eventId]/*`) instead of direct Supabase. Remove the compatibility views. Aligns with `docs/plans/2026-04-08-marathon-external-app.md`.

**After this refactor:**
- Drop the compat views + trigger
- Single source of truth for business logic
- Proper CORS, rate limiting, validation layer
- Public site no longer needs direct Supabase access

### Task 4.5: Razorpay Integration (if not done in Phase 0)

Implement proper Razorpay flow:
1. Server-side order creation
2. Client-side checkout
3. Webhook signature verification
4. Update `events_registrations.payment_status` to 'paid' on success
5. Refund flow for cancellations

---

## Scope Cut — What We Are NOT Doing Before Race Day

**DO NOT TOUCH these pages before April 12:**

| Page | Current State | Why Skip |
|------|--------------|----------|
| Events List | DataTable, horizontal-scrolls on mobile | Admins use desktop; post-race rebuild |
| Dashboard | Already responsive grid | Works fine on mobile already |
| Committees (full rewrite) | Dense grid, mobile-ugly | Committee leads mostly on desktop; dry run will confirm |
| Budget | DataTable + Dialog | Finance team uses desktop |
| Sponsors | Kanban view | No active sponsors yet (0 in DB) |
| Sponsor Detail | Detail page | Only relevant if sponsors exist |
| Certificates | DataTable | Post-race only |
| Results | DataTable | Post-race only |
| Analytics | Responsive charts | Already mostly OK |
| Settings | Tab navigation | Pre-event configuration, done via desktop |
| New Event Form | Form-based | Admin-only, rarely used |
| Events Hub | Simple card grid | Minimal |
| Registration Detail | Vertical layout | CSS tweaks in Phase 1.1 global pass |
| Registration Form (create) | Dialog | Keep as Dialog for 3 days; Sheet post-race |

**The only pages we touch before race day:** Registrations (additive card view) + Live Ops (FAB + tap targets).

---

## Timeline Summary

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  April 9 (Today)                                               │
│  ├── Task 0.1  Public site fix (SQL views)        4h  CRITICAL │
│  ├── Task 0.2  Payment decision                   1h  CRITICAL │
│  ├── Task 0.3  DNS setup                         30m  CRITICAL │
│  └── Task 0.4  Regenerate types                  30m  P1       │
│                                                                │
│  April 10                                                      │
│  ├── Task 1.1  Global touch target CSS pass      2h            │
│  ├── Task 1.2  Registrations card view (add)     6h  HIGH      │
│  ├── Task 1.3  Live Ops FAB + taps               3h  HIGH      │
│  └── Task 1.4  Device QA                         2h  CRITICAL  │
│                                                                │
│  April 11                                                      │
│  ├── Task 2.1  Code freeze at noon                             │
│  ├── Task 2.2  Dry run with committee leads      4h            │
│  └── Task 2.3  Pre-stage desktop fallbacks       1h            │
│                                                                │
│  April 12 — RACE DAY 🏃                                        │
│  ├── On-call rotation 5AM-10AM                                 │
│  ├── Live monitoring                                           │
│  └── Capture analytics for post-race rebuild                   │
│                                                                │
│  April 13+ — POST-RACE                                         │
│  ├── Retrospective + analytics review            1d            │
│  ├── Mobile component library (~605 LOC)         2d            │
│  ├── Page migrations (prioritized by data)       5d            │
│  ├── Public site API refactor (Option C)         2w            │
│  └── Proper Razorpay integration (if needed)     3d            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Risk Register

| Risk | P | Impact | Mitigation |
|------|---|--------|------------|
| Public site fix breaks existing registrations | Medium | High | Test on a preview branch first; rollback plan: `DROP VIEW` statements |
| Phase 1.2 registrations card view has bugs | Medium | Medium | Additive only — DataTable fallback always available on desktop |
| Committee leads reject mobile changes on dry run | Low | Medium | All changes are additive; can hide mobile card view with a feature flag |
| DNS propagation > 30 min | Low | Low | Start DNS change ASAP; fallback to Vercel URL on day of |
| Razorpay decision delayed | Medium | Medium | Default to "pay at venue" if no decision by EOD Apr 9 |
| Phase 0 runs over into Apr 10 | Low | High | Start Phase 0 immediately; freeze Phase 1 if Phase 0 slips |

---

## Success Criteria

### Phase 0 (April 9 EOD)
- [ ] Public site registration works end-to-end
- [ ] Payment flow is consistent (works OR clearly labeled "at venue")
- [ ] `marathon.jkkn.ac.in` resolves with HTTPS
- [ ] Database types file is fresh

### Phase 1 (April 10 EOD)
- [ ] Registrations page has usable mobile card view with check-in, tel: links, and search
- [ ] Live Ops has mobile FAB for incident reporting
- [ ] All touch targets on marathon pages are ≥ 44px
- [ ] Device QA passed on iOS + Android

### Phase 2 (April 11 EOD)
- [ ] Dry run complete with 6 committee leads
- [ ] Code freeze enforced
- [ ] Desktop fallbacks staged at registration desk and Live Ops tent

### Phase 3 (April 12)
- [ ] Event runs without P0 bugs
- [ ] Usage analytics captured for post-race review

---

## Appendix: Files Touched

**Phase 0 (blockers):**
- `supabase/setup/05_views.sql` (append)
- `supabase/setup/04_triggers.sql` (append)
- `lib/types/database.ts` (regenerate)
- [External repo] `kbm-marathon-public` env vars + DNS

**Phase 1 (mobile MVP):**
- `components/ui/data-table.tsx` (touch targets)
- `components/ui/button.tsx` (verify sm size)
- `app/(routes)/events/marathon/[id]/registrations/page.tsx` (additive card view)
- `app/(routes)/events/marathon/[id]/live/page.tsx` (FAB)
- `app/(routes)/events/marathon/[id]/live/_components/race-controls.tsx` (tap targets)
- `app/(routes)/events/marathon/[id]/live/_components/incident-panel.tsx` (tap targets)
- `app/(routes)/events/marathon/[id]/live/_components/incident-form.tsx` (Dialog → Sheet)
- `app/(routes)/events/marathon/[id]/live/_components/volunteer-panel.tsx` (tap targets)
- `app/(routes)/events/marathon/[id]/live/_components/stationary-alerts.tsx` (tel: links)

**Phase 2 (freeze):** No file changes, only testing and staging.

**Phase 4 (post-race):** Full scope of `docs/features/marathon-v2/02-MOBILE-FIRST-SPECS.md` — deferred.

---

## Appendix: Agent Reports Summary

Full agent reports are embedded in the session transcript. Key findings synthesized into this plan:

1. **Mobile UX Audit Agent** — identified exact breaks per page, confirmed `sheet.tsx`/`drawer.tsx` already exist, identified 3 pages needing rewrites vs 11 needing only CSS
2. **Component Architect Agent** — designed ~605 LOC component library with existing primitive foundation, warned of z-index collisions
3. **Devil's Advocate Agent** — challenged the entire 14-page rewrite premise; identified Blocker #1 as the real priority; proposed the "additive-only" safe path adopted by this plan
4. **Public Site Investigator Agent** — confirmed Blocker #1 root cause, wrote exact SQL for the compat views + INSTEAD OF trigger fix, distinguished the 3-day fix (Option A) from the correct long-term refactor (Option C)

---

**Plan author:** Claude Opus 4.6 with parallel agent team
**Next action:** Review this plan, approve scope, then start Phase 0 Task 0.1 immediately.
