---
title: "Spec: Demo Day Evaluation System — Appathon 2.0"
date: 2026-03-08
status: ready-for-dev
priority: urgent — must be live before Monday 9:00 AM Demo Day
tags: [spec, appathon, demo-day, evaluation, myjkkn]
---

# Spec: Demo Day Evaluation System

**What:** Build the Demo Day evaluation flow into MyJKKN so evaluators can verify team claims, the leaderboard auto-ranks teams, and results can be published — all within the existing MyJKKN platform.

**Why:** Last Appathon used a standalone Lovable app on a separate Supabase project (`hrlttjqmxmkvhbfnsvrc`). This time, MyJKKN already has teams, submissions, venues, and auth. Build it here so data flows end-to-end without manual syncing.

**Key Difference from Last Time:** This is a VERIFICATION system, not a judging system. Evaluators verify team claims (live URL works, user count is real, revenue proof checks out). They don't score subjectively.

**Deadline:** Must be live before Monday March 9, 9:00 AM (Demo Day start)

---

## What Already Exists in MyJKKN

> **Do NOT rebuild these.** Use them as-is.

| Existing Table/Feature | What It Has | How This Spec Uses It |
|------------------------|-------------|----------------------|
| `ss_teams` | Team name, anchor_id, event_id, institution_id, build_venue_id, demo_venue_id | Teams being evaluated |
| `ss_team_members` | user_id, team_id, role, department, is_anchor | Team member list for Role Cards |
| `ss_appathon_submissions` | app_name, live_url, lovable_url, github_url, mrr_amount, paying_users_count, proof_urls, status | Team's self-reported metrics + app links |
| `ss_event_venues` | venue_name, institution_id, capacity, day_type ('demo_day') | Demo Day venues |
| `ss_venue_staff` | venue_id, user_id, role ('judge'/'panel_chair') | Evaluator assignments to venues |
| `ss_events` | Event config, dates | Event container |
| Auth (profiles + user_roles) | Google OAuth, role-based access | Evaluator authentication |
| Leaderboard page | `/startup-studio/events/[id]/leaderboard` | Extends with verified scores |

### Existing MyJKKN Judging Tables (DO NOT USE)

The `ss_judge_scores` table exists but uses the OLD 5-criteria weighted scoring (real_problem, working_app, user_tested, completeness, presentation). **Do not use it for Appathon 2.0.** The new system is verification-based, not scoring-based.

---

## The Scoring System (Final — from Evaluation Criteria doc)

### Tier Levels — Base Score

Teams earn the **highest tier** they achieve (not cumulative):

| Tier | Achievement | Points | What Evaluator Verifies |
|------|-------------|--------|------------------------|
| **Level 1** | App deployed and working | **10 pts** | Live URL loads, core feature works |
| **Level 2** | 5+ real users signed up | **25 pts** | Supabase auth panel or user list |
| **Level 3** | 10+ active users | **40 pts** | Analytics showing active sessions |
| **Level 4** | 25+ active users | **50 pts** | Analytics or dashboard showing 25+ |

### Revenue Bonus — Extra Points on Top

| Revenue Earned | Bonus Points |
|----------------|-------------|
| Any payment (₹1+) | **+5 pts** |
| ₹100+ total | **+10 pts** |

**Total Score** = Tier Base Points + Revenue Bonus

**Tiebreaker:** More active users wins. If still tied, revenue breaks it.

---

## Demo Day Flow

### Timeline

```
8:30 AM  — Evaluators arrive, get briefed
9:00 AM  — Teams arrive, final metrics update on MyJKKN
9:15 AM  — Leaderboard FREEZES (no more metric updates from teams)
9:15 AM  — Presentations begin (3 min per team)
         — Evaluators verify claims during/after each presentation
~12 PM   — All presentations complete
12-1 PM  — Admin reviews flagged teams, finalizes verifications
2:00 PM  — Results published, closing ceremony
```

### Presentation Format (Per Team — 3 Minutes)

```
0:00 - 2:00  →  Metrics walkthrough (show app + proof)
2:00         →  Bell rings
2:00 - 3:00  →  Q&A from evaluators
3:00         →  Hard stop. Next team.
```

---

## New Data Model

### New Table: `appathon_verifications`

This replaces subjective scoring. One row per team per evaluator.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Auto-generated |
| `submission_id` | uuid, FK → ss_appathon_submissions | The team's submission being verified |
| `evaluator_id` | uuid, FK → auth.users | The evaluator doing the verification |
| `venue_id` | uuid, FK → ss_event_venues | Demo Day venue |
| `app_live` | boolean | Does the live URL load and work? |
| `claimed_users` | integer | What the team claims (copied from submission at freeze time) |
| `verified_users` | integer | What the evaluator confirms after checking proof |
| `claimed_active_users` | integer | Team's active user claim |
| `verified_active_users` | integer | Evaluator-confirmed active users |
| `claimed_revenue` | numeric(10,2) | Team's revenue claim (₹) |
| `verified_revenue` | numeric(10,2) | Evaluator-confirmed revenue (₹) |
| `verified_tier` | integer | 0-4 (the tier level evaluator confirms) |
| `revenue_bonus` | integer | 0, 5, or 10 (bonus points) |
| `total_score` | integer | verified_tier points + revenue_bonus |
| `verification_status` | text | 'verified', 'flagged', 'disqualified' |
| `flag_reason` | text | Why flagged (null if verified) |
| `notes` | text | Evaluator's notes |
| `presented` | boolean, default false | Did the team actually present? |
| `presentation_slot` | integer | Order number in the venue |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

**Constraint:** `UNIQUE(submission_id, evaluator_id)` — one verification per evaluator per team.

### How Tier + Bonus Calculates

```
-- Tier logic (highest achieved, not cumulative)
verified_tier = CASE
  WHEN verified_active_users >= 25 THEN 4  -- 50 pts
  WHEN verified_active_users >= 10 THEN 3  -- 40 pts
  WHEN verified_users >= 5 THEN 2          -- 25 pts
  WHEN app_live = true THEN 1              -- 10 pts
  ELSE 0                                    -- 0 pts
END

-- Tier to points mapping
tier_points = CASE verified_tier
  WHEN 4 THEN 50
  WHEN 3 THEN 40
  WHEN 2 THEN 25
  WHEN 1 THEN 10
  ELSE 0
END

-- Revenue bonus
revenue_bonus = CASE
  WHEN verified_revenue >= 100 THEN 10
  WHEN verified_revenue >= 1 THEN 5
  ELSE 0
END

total_score = tier_points + revenue_bonus
```

This calculation should happen **client-side** as the evaluator fills in numbers, AND be **recomputed server-side** on save (don't trust the client).

### New View: `appathon_leaderboard`

```sql
CREATE OR REPLACE VIEW appathon_leaderboard AS
SELECT
  s.id as submission_id,
  t.id as team_id,
  t.name as team_name,
  t.institution_id,
  s.app_name,
  s.live_url,
  s.category,
  v.verified_tier,
  CASE v.verified_tier
    WHEN 4 THEN 50
    WHEN 3 THEN 40
    WHEN 2 THEN 25
    WHEN 1 THEN 10
    ELSE 0
  END as tier_points,
  v.revenue_bonus,
  v.total_score,
  v.verified_users,
  v.verified_active_users,
  v.verified_revenue,
  v.verification_status,
  v.presented,
  v.evaluator_id,
  ev.venue_name,
  RANK() OVER (
    PARTITION BY t.institution_id
    ORDER BY v.total_score DESC, v.verified_active_users DESC, v.verified_revenue DESC
  ) as college_rank,
  RANK() OVER (
    ORDER BY v.total_score DESC, v.verified_active_users DESC, v.verified_revenue DESC
  ) as overall_rank
FROM ss_appathon_submissions s
JOIN ss_teams t ON s.event_id = t.event_id AND s.user_id = t.anchor_id
LEFT JOIN appathon_verifications v ON v.submission_id = s.id
LEFT JOIN ss_event_venues ev ON v.venue_id = ev.id
WHERE s.status != 'draft';
```

> **Note:** If multiple evaluators verify the same team (rare but possible), use the verification from the evaluator assigned to that venue (via `ss_venue_staff`). Don't average — one evaluator per team is the design.

### New View: `evaluator_progress`

```sql
CREATE OR REPLACE VIEW evaluator_progress AS
SELECT
  vs.user_id as evaluator_id,
  p.full_name as evaluator_name,
  vs.venue_id,
  ev.venue_name,
  COUNT(DISTINCT s.id) as total_teams,
  COUNT(DISTINCT av.submission_id) as verified_count,
  COUNT(DISTINCT s.id) - COUNT(DISTINCT av.submission_id) as remaining,
  array_agg(DISTINCT av.submission_id) FILTER (WHERE av.id IS NOT NULL) as verified_submissions,
  array_agg(DISTINCT s.id) FILTER (WHERE av.id IS NULL) as pending_submissions
FROM ss_venue_staff vs
JOIN ss_event_venues ev ON vs.venue_id = ev.id
JOIN ss_teams t ON t.demo_venue_id = ev.id
JOIN ss_appathon_submissions s ON s.event_id = t.event_id AND s.user_id = t.anchor_id
LEFT JOIN appathon_verifications av ON av.submission_id = s.id AND av.evaluator_id = vs.user_id
JOIN profiles p ON vs.user_id = p.id
WHERE ev.day_type = 'demo_day'
  AND vs.role IN ('judge', 'panel_chair')
GROUP BY vs.user_id, p.full_name, vs.venue_id, ev.venue_name;
```

---

## Indexes

```sql
CREATE INDEX idx_verifications_submission ON appathon_verifications(submission_id);
CREATE INDEX idx_verifications_evaluator ON appathon_verifications(evaluator_id);
CREATE INDEX idx_verifications_venue ON appathon_verifications(venue_id);
CREATE INDEX idx_verifications_status ON appathon_verifications(verification_status);
```

---

## RLS Policies

### `appathon_verifications`

| Action | Who | Condition |
|--------|-----|-----------|
| SELECT | Evaluators | Own verifications OR admin |
| INSERT | Evaluators | `evaluator_id = auth.uid()` AND user has 'judge' or 'panel_chair' role in `ss_venue_staff` |
| UPDATE | Evaluators | Own verifications only (`evaluator_id = auth.uid()`) |
| SELECT | Admin | All rows (for review + publishing) |
| SELECT | All authenticated | Only after results are published (check event config flag) |

**Teams can NOT see verification details until results are published.** They can only see the leaderboard (which shows scores but not evaluator notes/flags).

---

## Evaluator UI — Verification Flow

### What Evaluators See

**Page:** `/startup-studio/events/[id]/evaluate`

This is the main evaluator workspace. Shows teams assigned to their Demo Day venue.

```
┌──────────────────────────────────────────────────────┐
│  Demo Day Evaluation — Engineering College Hall      │
│  Progress: 8 of 32 teams verified                    │
│  ━━━━━━━━░░░░░░░░░░░░░░░░░░░░ 25%                   │
│                                                      │
│  [Current]  [Pending]  [Verified]  [Flagged]         │
├──────────────────────────────────────────────────────┤
│  Slot 9: Team "MedTrack" — JKKNCET CSE              │
│                                                      │
│  App: MedTrack                                       │
│  Live URL: https://medtrack.lovable.app  [Open ↗]    │
│  GitHub: https://github.com/team/medtrack [Open ↗]   │
│                                                      │
│  Team Claims:           You Verify:                  │
│  ───────────            ──────────                   │
│  Total Users: 18        Verified Users: [___]        │
│  Active Users: 12       Verified Active: [___]       │
│  Revenue: ₹150          Verified Revenue: [₹___]     │
│  Proof: [View ↗]                                     │
│                                                      │
│  ☑ App is live and working                           │
│                                                      │
│  Auto-calculated:                                    │
│  Tier: Level 3 (40 pts) + Revenue: +10 = 50 pts     │
│                                                      │
│  Notes: [________________________________]           │
│                                                      │
│  [✓ Verify]  [⚑ Flag for Review]  [✗ Disqualify]   │
│  [← Previous]                        [Next →]       │
└──────────────────────────────────────────────────────┘
```

### Verification Workflow

1. Team presents (3 min)
2. Evaluator opens team's verification card
3. Evaluator checks live URL (tap to open in new tab)
4. Evaluator checks proof URLs (screenshots, dashboards)
5. Evaluator enters verified numbers (may differ from team's claims)
6. Score auto-calculates based on verified numbers
7. Evaluator taps **Verify** (confirmed) or **Flag** (needs admin review)
8. Card moves to "Verified" or "Flagged" tab
9. Next team

### Flagging

When evaluator taps "Flag for Review":
- Must enter reason (required text field)
- Team stays in "Flagged" state
- Admin sees all flagged teams in admin dashboard
- Admin makes final decision: verify (override to correct numbers) or disqualify

### Disqualification

When evaluator taps "Disqualify":
- Must enter reason (required)
- Team gets `total_score = 0` and `verification_status = 'disqualified'`
- Shows "DQ" badge on leaderboard
- Admin can reverse this

---

## Admin Dashboard — Demo Day Tab

**Page:** `/startup-studio/events/[id]/demo-day` (enhance existing page)

### Controls

| Control | Action |
|---------|--------|
| **Freeze Metrics** | Prevents teams from updating submission metrics. Copy current metrics to verification records. Sets `config.metrics_frozen_at` timestamp |
| **Flagged Teams** | Shows all flagged verifications for admin review |
| **Publish Results** | Makes leaderboard visible to all. Sets `config.results_published = true` |
| **Export CSV** | Downloads all verification data + Role Card data |

### Freeze Flow

At 9:15 AM, admin clicks "Freeze Metrics":
1. System copies current `mrr_amount`, `paying_users_count` from each submission to verification records as `claimed_revenue`, `claimed_users`
2. Active user count pulled from team's proof (or self-reported field)
3. Teams can no longer update metrics on their submission
4. Evaluators can now begin verifying

### Admin Review of Flagged Teams

```
┌─────────────────────────────────────────────┐
│  Flagged Teams (3)                          │
│                                             │
│  Team: "QuickBite" — Flagged by: Dr. Priya  │
│  Reason: "User count screenshots show       │
│  different app name. Possible fake."        │
│  Claimed: 15 users | Evaluator saw: 3      │
│                                             │
│  [Override: Set verified to 3] [Disqualify] │
│                                             │
│  Team: "StudyBuddy" — Flagged by: Mr. Ravi  │
│  Reason: "Revenue screenshot is from        │
│  personal Google Pay, not app payments"     │
│  Claimed: ₹250 | Evaluator saw: ₹0         │
│                                             │
│  [Override: Set revenue to ₹0] [Disqualify] │
└─────────────────────────────────────────────┘
```

---

## Leaderboard Enhancements

The leaderboard already exists at `/startup-studio/events/[id]/leaderboard`. Enhance it:

### Pre-Freeze (Before 9:15 AM)
- Shows teams ranked by self-reported metrics
- Label: "Preliminary — Based on team-reported metrics. Final ranking after evaluator verification."
- Auto-refreshes every 30 seconds (realtime subscription on `ss_appathon_submissions`)

### Post-Freeze, Pre-Publish
- Shows "Verification in progress..." banner
- Evaluators can see their venue's progress
- Admin sees all venues' progress

### Post-Publish
- Final rankings visible to everyone
- Shows: Rank, Team Name, App Name, College, Tier Level, Revenue Bonus, Total Score
- Tiebreaker visible: active users shown alongside score
- Top 5 per college highlighted
- Filter by college/institution
- "Disqualified" teams shown at bottom with DQ badge

### Realtime Updates
- Subscribe to `appathon_verifications` table changes
- When an evaluator submits a verification, leaderboard updates live
- Admin and evaluators see live progress; teams see it only after publish

---

## Integration with Role Cards

> See `Spec-Role-Card-Skill-Bank.md` for the full Role Card spec.

### When Role Cards Appear in the Flow

```
Team submits metrics (existing flow, before 9:15 AM freeze)
    │
    ▼
"Now each team member fills in their Role Card" (new step)
    │
    ├── Member 1 fills Role Card
    ├── Member 2 fills Role Card
    └── ... (for each team member)
    │
    ▼
Role Card completion status shown on "My Team" page
    │
    ▼
Demo Day presentations happen (evaluators verify metrics)
    │
    ▼
Results published (Role Card data feeds into Skill Bank)
```

### Team Submission Page Enhancement

Add a "Role Cards" section to the submission/My Team page:

```
┌─────────────────────────────────────────────┐
│  Team Role Cards                            │
│  2 of 4 members completed  ━━━━░░░░ 50%    │
│                                             │
│  ✅ Arun (you) — Completed                  │
│  ✅ Priya — Completed                       │
│  ⏳ Deepa — Not yet filled                  │
│  ⏳ Raj — Not yet filled                    │
│                                             │
│  [Fill My Role Card]                        │
└─────────────────────────────────────────────┘
```

Role Cards are **optional for submission** (don't block Demo Day) but **strongly encouraged**. Show a nudge: "Help us build the JKKN Skill Bank! Fill in your Role Card — it takes 1 minute."

---

## Presentation Timer (Optional but Valuable)

If time permits, add a simple presentation timer:

**Page:** `/startup-studio/events/[id]/timer` (projected on screen)

```
┌─────────────────────────────────────────────┐
│                                             │
│  Slot 12: Team "MedTrack"                   │
│                                             │
│           2:00                              │
│          PRESENT                            │
│                                             │
│  [Green at 0-2:00, Yellow at 2:00, Red at   │
│   2:30, STOP flashing at 3:00]             │
│                                             │
│  [Start] [Reset] [Next Team →]              │
└─────────────────────────────────────────────┘
```

- Green background: 0:00 - 2:00 (presenting)
- Yellow background: 2:00 - 2:30 (Q&A)
- Red background: 2:30 - 3:00 (wrap up)
- Flashing "STOP": 3:00+ (time's up)
- Controlled by the evaluator/admin at the venue

**Priority:** LOW — a phone timer works fine. Only build if other items are done.

---

## Offline Support

> Borrowed from the previous standalone app's pattern (`useOfflineScores.tsx`).

Evaluators may have spotty WiFi in large halls. Support offline:

1. **Queue verifications locally** in `localStorage` key `appathon_pending_verifications`
2. **Show pending count badge** on evaluator dashboard
3. **Auto-sync when online** — on reconnection, push queued verifications to Supabase
4. **Handle conflicts** — if server already has a verification for that submission_id + evaluator_id, skip (don't overwrite)
5. **Visual indicator** — Show "Online" / "Offline" / "Syncing (3 pending)" badge

**Priority:** MEDIUM — useful but not critical if WiFi is good.

---

## CSV Export

Admin can export all Demo Day data for offline analysis:

### Export: Verification Results

| Column | Source |
|--------|--------|
| Team Name | ss_teams.name |
| App Name | ss_appathon_submissions.app_name |
| College | institutions.name |
| Department | ss_team_members.department (anchor) |
| Live URL | ss_appathon_submissions.live_url |
| Claimed Users | appathon_verifications.claimed_users |
| Verified Users | appathon_verifications.verified_users |
| Claimed Active | appathon_verifications.claimed_active_users |
| Verified Active | appathon_verifications.verified_active_users |
| Claimed Revenue | appathon_verifications.claimed_revenue |
| Verified Revenue | appathon_verifications.verified_revenue |
| Tier Level | appathon_verifications.verified_tier |
| Revenue Bonus | appathon_verifications.revenue_bonus |
| Total Score | appathon_verifications.total_score |
| Status | appathon_verifications.verification_status |
| College Rank | Computed |
| Overall Rank | Computed |
| Evaluator | profiles.full_name |
| Notes | appathon_verifications.notes |

### Export: Role Cards + Skill Bank

| Column | Source |
|--------|--------|
| Learner Name | profiles.full_name |
| Team Name | ss_teams.name |
| College | institutions.name |
| Department | ss_team_members.department |
| Self-Selected Roles | appathon_role_cards.self_roles |
| Proud Of | appathon_role_cards.proud_of |
| Peer Tags Received | Aggregated from appathon_peer_tags |
| Peer-Confirmed Roles | Roles where 2+ peers agree |

---

## API Routes

All new routes go under `/api/startup-studio/`:

| Route | Method | Who | What |
|-------|--------|-----|------|
| `events/[id]/verifications` | GET | Evaluator, Admin | Get verification status for venue/all |
| `events/[id]/verifications` | POST | Evaluator | Submit a verification |
| `events/[id]/verifications/[vid]` | PATCH | Evaluator (own), Admin | Update a verification |
| `events/[id]/freeze-metrics` | POST | Admin | Freeze team metrics |
| `events/[id]/publish-results` | POST | Admin | Publish leaderboard |
| `events/[id]/export/verifications` | GET | Admin | CSV export |
| `events/[id]/export/skill-bank` | GET | Admin | CSV export of role cards |
| `events/[id]/role-cards` | POST | Team member | Submit own role card |
| `events/[id]/role-cards/team/[teamId]` | GET | Team member, Admin | Get team's role card status |

---

## Event Config Additions

Add to `ss_events.config` JSONB:

```json
{
  "metrics_frozen_at": null,          // timestamp when admin froze metrics
  "results_published": false,         // whether leaderboard is public
  "results_published_at": null,       // timestamp
  "scoring": {
    "tier_1_points": 10,
    "tier_2_points": 25,
    "tier_2_threshold": 5,
    "tier_3_points": 40,
    "tier_3_threshold": 10,
    "tier_4_points": 50,
    "tier_4_threshold": 25,
    "revenue_bonus_1": 5,
    "revenue_bonus_1_threshold": 1,
    "revenue_bonus_2": 10,
    "revenue_bonus_2_threshold": 100
  }
}
```

Storing scoring thresholds in config means they can be adjusted without code changes.

---

## Validation Rules

| Rule | Details |
|------|---------|
| One verification per evaluator per team | `UNIQUE(submission_id, evaluator_id)` |
| Evaluator must be assigned to venue | Check `ss_venue_staff` for the submission's team's `demo_venue_id` |
| Metrics must be frozen before verification | Check `config.metrics_frozen_at IS NOT NULL` |
| Can't publish without all teams verified or flagged | Admin warning if pending verifications remain |
| Verified numbers can't exceed claimed numbers | Warning (not block) — evaluator may see more than team reported |
| Disqualification requires reason | `flag_reason IS NOT NULL` when `verification_status = 'disqualified'` |
| Results can't be unpublished | Once published, prevent toggle back (or require confirmation) |

---

## What NOT to Build

- No audience voting — evaluators only, not crowd-judged
- No subjective scoring criteria (no sliders, no 1-10 scales)
- No multi-evaluator averaging — one evaluator per team
- No separate evaluator app — everything lives in MyJKKN
- No print scorecards — everything digital
- No edit after publish — results are final once published
- No evaluator reassignment UI — admin handles in Venues page (already exists)

---

## Pages Summary

### New Pages

| Page | URL | Who | Purpose |
|------|-----|-----|---------|
| Evaluate | `/startup-studio/events/[id]/evaluate` | Evaluator | Verification workspace |
| Timer | `/startup-studio/events/[id]/timer` | Admin/Evaluator | Presentation timer (optional) |

### Enhanced Existing Pages

| Page | URL | Enhancement |
|------|-----|-------------|
| Leaderboard | `/startup-studio/events/[id]/leaderboard` | Verified scores, college rank, realtime, publish state |
| Demo Day | `/startup-studio/events/[id]/demo-day` | Freeze button, flagged review, CSV export |
| My Team | `/startup-studio/events/[id]/my-team` | Role Card completion status + CTA |
| Submit | `/startup-studio/events/[id]/submit` | Role Card section after metrics |

---

## Build Priority

Build in this order. Each step is independently useful.

| Priority | What | Why |
|----------|------|-----|
| **P0** | `appathon_verifications` table + migration | Foundation for everything else |
| **P0** | Evaluator verification page (`/evaluate`) | Core Demo Day function — evaluators need this at 9:15 AM |
| **P0** | Admin freeze button | Must freeze metrics before verification starts |
| **P1** | Leaderboard with verified scores | Shows results to everyone |
| **P1** | Admin publish button | Makes results visible |
| **P1** | Flagged teams review for admin | Handle disputes |
| **P2** | Role Card tables + submission UI | Skill Bank data (see Role Card spec) |
| **P2** | CSV export | Post-event analysis |
| **P3** | Offline support | Nice-to-have |
| **P3** | Presentation timer | Nice-to-have |
| **P3** | Realtime leaderboard updates | Nice-to-have |

**Minimum viable Demo Day = P0 items only.** Everything else can be done after.

---

## Previous Standalone App — What to Borrow

The standalone Lovable app (`hrlttjqmxmkvhbfnsvrc`) had good patterns. Borrow these ideas:

| Pattern | From Previous App | Adapt For MyJKKN |
|---------|-------------------|-------------------|
| Offline score queue | `useOfflineScores.tsx` (localStorage queue + auto-sync) | Same pattern for `appathon_pending_verifications` |
| Realtime connection | `useRealtimeConnection.tsx` (Supabase postgres_changes) | Subscribe to `appathon_verifications` changes |
| Scoring drawer | `ScoringDrawer.tsx` (slide-up mobile panel) | Verification card inline (not drawer — simpler) |
| Multi-venue matching | `venues_overlap()` SQL function | Already handled by `ss_venue_staff` + `ss_event_venues` |
| CSV upload | `CSVUpload.tsx` (generic preview + import) | Not needed — teams and evaluators already in MyJKKN |
| Conflict of interest flag | `has_conflict` boolean in scores | Keep as optional flag in verification |
| App not working flag | `app_not_working` boolean | → `app_live = false` in verification |
| Absent flag | `is_absent` boolean | → `presented = false` in verification |

---

## Success Criteria

- [ ] Evaluators can verify all teams in their venue within 2 hours
- [ ] Leaderboard shows correct rankings (tier + bonus) matching verified data
- [ ] Admin can freeze metrics, review flags, and publish results — all from MyJKKN
- [ ] Top 5 per college are identifiable from the leaderboard
- [ ] No evaluator needs training beyond "tap the team, check their proof, enter what you see"
- [ ] Works on mobile (evaluators will use phones/tablets, not laptops)

---

*Spec created: March 8, 2026*
*Context: JKKN Appathon 2.0 — Powered by She Builds (Lovable x Anthropic) x JKKN Institutions*
*Related: Spec-Role-Card-Skill-Bank.md (Role Card / Skill Bank feature)*
