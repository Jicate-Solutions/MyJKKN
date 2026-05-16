# Counselor Routing — Path Y Onboarding Prep

**Audience:** JKKN Director (Omm Sharravana). Sibling chapter to the [routing-engine director's guide](2026-04-28-counselor-routing-engine-director-guide.md) (#577).
**Last updated:** 2026-04-28
**Spec references:** [#537](https://github.com/Jicate-Solutions/MyJKKN/pull/537) decision D3 (Path Y onboarding track), [#561](https://github.com/Jicate-Solutions/MyJKKN/pull/561) (Phase 8a-Full UI-config), [#567](https://github.com/Jicate-Solutions/MyJKKN/pull/567) (Add-Counselor flow), [#568](https://github.com/Jicate-Solutions/MyJKKN/pull/568) (Rules-tab CRUD)

## What this guide covers

A scoped, repeatable sweep you can run in a single 30-minute sitting:

1. Verify the four Path Y profiles are sane in the database
2. Onboard them into `admission_counselors` (UI walkthrough OR SQL — both work)
3. Seed the **five starter routing rules** so `fn_auto_assign_counselor_v2` stops falling back to the hardcoded PR #549 behaviour
4. Confirm the staffing-imbalance widget on `/dashboard` re-normalises within ~24h

This doc is **prep**, not auto-execute. The SQL blocks below are copy-paste-ready, but every block lives behind a Director merge/click — no script in the codebase fires them.

---

## 0. Pre-flight: confirm each candidate's `profiles` row + institution

**Why first:** the Add-Counselor wizard (Members tab) filters its facilitator-search dropdown by institution. A profile with no `institution_id` simply will not surface, and you'll waste a minute thinking the search is broken.

**Run this in Supabase SQL editor (or ask the engineer to run it):**

```sql
SELECT
  p.email,
  p.full_name,
  p.role,
  p.institution_id,
  i.name AS institution_name,
  p.department_id,
  p.is_active
FROM profiles p
LEFT JOIN institutions i ON i.id = p.institution_id
WHERE p.email IN (
  'coo@jkkn.ac.in',
  'dhuraimurugan.g@jkkn.ac.in',
  'gowrisankar@jkkn.ac.in',
  'kandasamyk@jkkn.ac.in'
)
ORDER BY p.email;
```

**Current state on prod (queried 2026-04-28):**

| Email | Full name | Role | Institution | Dept | Active | Status |
|---|---|---|---|---|---|---|
| `coo@jkkn.ac.in` | Narayan Rao | `hr_admin` | JKKN College of Engineering and Technology | set | yes | **Ready** |
| `dhuraimurugan.g@jkkn.ac.in` | DHURAIMURUGAN G | `admission` | JKKN College of Education | null | yes | **Ready** (department null is fine; wizard cascades but is not required) |
| `gowrisankar@jkkn.ac.in` | Gowrisankar M.N | `executive_admin_officer` | JKKN College of Engineering and Technology | null | yes | **Ready** |
| `kandasamyk@jkkn.ac.in` | Dr. Kandasamy K | `admission_staff` | **null** | null | yes | **BLOCKED** — patch profile first |

**Heads-up on `kandasamyk`:** institution_id is null. The Add-Counselor wizard's facilitator search will not surface him. Two options:

- **Option A (recommended):** Patch his profile first via Users > Profiles UI, set institution to whichever JKKN institution is his actual base (likely Engineering or Pharmacy — confirm with HR).
- **Option B:** Skip him this round and onboard the other three. Re-include him after the profile patch.

**Heads-up on the role values:** spec #537 D2 (taxonomy filter) imagined a clean `counselor` role, but in production the four Path Y users carry mixed roles (`admission`, `admission_staff`, `executive_admin_officer`, `hr_admin`). That is expected — the routing engine reads from the `admission_counselors` table, not from `profiles.role`. Onboarding adds them to the routing pool regardless of their `profiles.role`. Just don't enable Rule 2.2 (`taxonomy_filter` with `["counselor"]`) until you've also added `["counselor", "admission", "admission_staff", "executive_admin_officer", "hr_admin"]` to the allow-list — otherwise these four get cascaded right back out on the next cron tick.

---

## 1. UI walkthrough — Add-Counselor wizard (3 minutes per candidate)

For Director who prefers click-by-click. Mirrors the format used in §1 of #577.

1. Navigate to **https://www.jkkn.ai/admission/counselors/team** — Members tab opens by default.
2. Click **Add Counselor** at the top right.
3. The "Add Counselor" dialog opens. Fill it in:
   - **User Type**: select **Facilitator** (all four Path Y users are admission-cell staff, not students).
   - **Institution**: pick their primary institution from the table in §0.
     - `coo`, `gowrisankar` -> JKKN College of Engineering and Technology
     - `dhuraimurugan.g` -> JKKN College of Education
     - `kandasamyk` -> _whichever you patched in §0 Option A_
   - **Department**: cascades from institution. Optional; leave blank if the user has no dept.
   - In the search box, type the user's name or email until they appear, then click their row to select.
   - **Counselor Settings** appears once a user is selected:
     - **Max Leads**: leave at the dialog default (**50**). Per #537 decision #11, the cap rule (Section 2.1 below) is the actual routing gate; `max_leads` is just a display number.
     - **Specializations**: optional. For Path Y, leave blank or enter coarse tags like `Engineering, Education, Pharmacy` if you intend to wire taxonomy rules later.
4. Click **Add Counselor** at the bottom of the dialog.
5. Repeat for the remaining candidates.

**Impact:** within 15 minutes the next cron run includes them in the routing pool. New leads at JKKN Engineering and JKKN Education stop dumping onto `jeevavarshinis`. **Existing** open leads on `jeevavarshinis` do not redistribute automatically — only new leads + cascade events from the duty-log threshold redistribute. Use the Emergency-Off toggle (#577 Section 4) on `jeevavarshinis` for one cron tick if you want to force redistribution today.

---

## 2. SQL seed — bulk-insert the four candidates (alternative to UI)

For the Director who'd rather copy-paste a single block than click through four wizard runs. **Idempotent** (ON CONFLICT DO NOTHING on the unique `email` index) so it's safe to re-run.

> **Pre-condition for `kandasamyk`:** profile must have `institution_id` set, OR remove him from the email list.

```sql
-- ============================================================================
-- Path Y bulk onboard — 4 candidates from #577 + #537 D3
-- Idempotent: safe to re-run; existing rows (matched on email) are not modified.
-- Reversible: see "Undo" block at the bottom.
-- ============================================================================
INSERT INTO admission_counselors (user_id, institution_id, name, email, is_active, max_leads, specializations)
SELECT
  p.id                       AS user_id,
  p.institution_id           AS institution_id,
  p.full_name                AS name,
  p.email                    AS email,
  true                       AS is_active,
  50                         AS max_leads,        -- per #537 D11, cap rule is the real gate
  ARRAY[]::text[]            AS specializations   -- backfill later via UI if needed
FROM profiles p
WHERE p.email IN (
  'coo@jkkn.ac.in',
  'dhuraimurugan.g@jkkn.ac.in',
  'gowrisankar@jkkn.ac.in',
  'kandasamyk@jkkn.ac.in'
)
  AND p.institution_id IS NOT NULL                -- excludes kandasamyk if not patched
ON CONFLICT (email) DO NOTHING
RETURNING id, name, email, institution_id, is_active;
```

**What you should see:** 3 rows returned (assuming `kandasamyk` is still un-patched), or 4 rows if you patched him first.

**Undo (reversible — soft-delete style):** if you want to roll back without losing the inserted IDs (FKs from any leads already routed to them):

```sql
-- Soft revert: deactivate so cron stops routing, but keeps history intact
UPDATE admission_counselors
SET is_active = false,
    deactivated_at = now()
WHERE email IN (
  'coo@jkkn.ac.in',
  'dhuraimurugan.g@jkkn.ac.in',
  'gowrisankar@jkkn.ac.in',
  'kandasamyk@jkkn.ac.in'
);
```

**Hard delete (only if no leads have been routed to them yet):**

```sql
DELETE FROM admission_counselors
WHERE email IN (
  'coo@jkkn.ac.in',
  'dhuraimurugan.g@jkkn.ac.in',
  'gowrisankar@jkkn.ac.in',
  'kandasamyk@jkkn.ac.in'
)
AND id NOT IN (SELECT counselor_id FROM admission_leads WHERE counselor_id IS NOT NULL);
```

---

## 3. Five starter routing rules — plain English

The Rules tab CRUD UI is at **https://www.jkkn.ai/admission/counselors/team/rules**. The schema your rules write to is `admission_assignment_rules`, with the following columns:

- `institution_id` (uuid, NOT NULL) — scope the rule to one institution, OR seed it once per institution if you want the rule global
- `name` (text) — display label
- `description` (text)
- `priority` (int) — higher fires first
- `is_active` (bool, default true)
- `criteria` (jsonb, default `[]`)
- `action` (jsonb, NOT NULL) — `fn_auto_assign_counselor_v2` keys off `action.type`

**Default-safe-when-empty:** with the table currently at zero active rows on prod (verified 2026-04-28), routing falls back to the pre-#537 hardcoded behaviour. Seed these 5 organically — nothing breaks if you stage them.

### Rule 1 — Cap per cron run (D1 from #537 thrash)

**If** any counselor would receive more than 10 NEW lead assignments in a single cron run **then** stop assigning to them for the rest of this run.

- **Rule Name:** `Default per-counselor cap`
- **Priority:** `100`
- **Action JSON:**
  ```json
  { "type": "cap_per_run", "value": 10, "scope": "counselor" }
  ```
- **Why:** Prevents the `jeevavarshinis` 857-leads-in-13-min pattern from recurring. Pairs with Rule 4 below for visibility.

### Rule 2 — Engineering routing override

**If** a lead's institution is JKKN College of Engineering and Technology **then** prefer Path Y Engineering counselors (`coo@jkkn.ac.in`, `gowrisankar@jkkn.ac.in`) over the Pharmacy default.

- **Rule Name:** `Engineering -> Path Y counselors`
- **Priority:** `200`
- **Action JSON:**
  ```json
  {
    "type": "institution_routing_preference",
    "institution_id": "5de4fba1-4564-41ed-8c73-5d948b74b843",
    "preferred_counselor_emails": ["coo@jkkn.ac.in", "gowrisankar@jkkn.ac.in"]
  }
  ```
- **Why:** 4,544 unassigned Engineering leads on prod (snapshot 2026-04-28). Once Path Y onboards, this rule pulls them off the orphan stack instead of cascading to Pharmacy via Rule 5 fallback.
- **Caveat:** rule depends on the `institution_routing_preference` action handler being shipped. If `fn_auto_assign_counselor_v2` doesn't recognise the action.type, it skips the rule (default-safe). Confirm with the engineer that this handler exists before enabling, OR substitute `cross_institution_fallback` with a tighter scope.

### Rule 3 — Medical / Pharmacy reservation

**If** a lead's institution is JKKN College of Pharmacy or JKKN College of Nursing and Research **then** prefer the existing medical-track counselors and don't overflow to Engineering Path Y.

- **Rule Name:** `Pharmacy/Nursing -> existing medical counselors`
- **Priority:** `200`
- **Action JSON:**
  ```json
  {
    "type": "institution_routing_preference",
    "institution_ids": [
      "5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334",
      "70e54e51-9b98-4e07-9534-a85310609bfd"
    ],
    "preferred_counselor_emails": [
      "jeevavarshinis.dp@jkkn.ac.in",
      "priyadharshinis24nur@jkkn.ac.in",
      "priyadharshinivj24nur@jkkn.ac.in"
    ]
  }
  ```
- **Why:** Keeps domain coherence — Engineering Path Y onboards shouldn't get Pharmacy leads. Snapshot 2026-04-28: Pharmacy has 8,561 open leads vs Nursing 1,526.

### Rule 4 — Cap-hit alert to Director (debounced 24h)

**If** every counselor at an institution exhausts their per-run cap inside one cron run **then** notify Director once per institution per 24h.

- **Rule Name:** `Cap-hit alert to Director`
- **Priority:** `100`
- **Action JSON:**
  ```json
  {
    "type": "notification",
    "trigger": "cap_hit",
    "debounce_minutes": 1440,
    "recipient_role": "super_admin"
  }
  ```
- **Why:** Closes the visibility loop on Rule 1 — caps without telemetry are silent. 1440 min = 24h debounce so you don't get flooded.

### Rule 5 — Cross-institution overflow (D5 from #537 thrash)

**If** a lead's institution has zero on-duty counselors **then** allow up to 20 leads per cron run to overflow to any active counselor in the broader pool.

- **Rule Name:** `Orphan-institution overflow`
- **Priority:** `50` (lowest — runs after the institution-preference rules above)
- **Action JSON:**
  ```json
  {
    "type": "cross_institution_fallback",
    "enabled": true,
    "max_overflow_per_run": 20
  }
  ```
- **Why:** Solves the orphan-institution problem on prod — six institutions have zero active counselors (snapshot 2026-04-28: Engineering 4,544 / Allied Health 934 / Arts and Science 732 / Dental 489 / Jicate Solutions 1,594 / Education 4 unassigned). Path Y covers Engineering and Education; this rule handles the rest until they hire mapped counselors.
- **Note:** with `max_overflow_per_run=20` and 5 institutions still orphan after Path Y, you'll redistribute ~100 orphan leads per cron run = 9,600/day. The 7,747 remaining orphan leads (excluding Engineering + Education) clear in roughly 19 hours at that rate.

---

## 4. Acceptance criteria for Director — what "worked" looks like

**60 minutes after Path Y onboarding completes (Section 1 OR 2) AND Rules 1+5 are active (minimum viable set):**

The `/dashboard` staffing-imbalance widget (PR #570) should show one of:

- **Best case:** widget hidden — load ratio dropped below 3x median, AND fewer than 6 institutions are orphan.
- **Improving case:** widget still visible but the description text changed. Snapshot 2026-04-28: title shows `Highest-load counselor has 1,198 open leads (6.9x the median of 174.5). 6 institutions have zero active counselors.` After Path Y you should see something like `4x the median of ~250` and `4 institutions have zero active counselors` (Engineering and Education drop off the orphan list once Path Y is in the pool).

**Verify directly via SQL (engineer can run, or you can pop into Supabase SQL editor):**

```sql
-- Load distribution on active counselors after Path Y onboarding
WITH counts AS (
  SELECT
    ac.id, ac.name, ac.email,
    COUNT(al.id) FILTER (
      WHERE al.counselor_id = ac.id
        AND COALESCE(al.state, '') NOT IN ('admitted','rejected','dropped','cancelled','closed')
    ) AS open_leads
  FROM admission_counselors ac
  LEFT JOIN admission_leads al ON al.counselor_id = ac.id
  WHERE ac.is_active = true
  GROUP BY ac.id, ac.name, ac.email
)
SELECT
  COUNT(*)                                                      AS active_counselors,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY open_leads)::int  AS median_open,
  MAX(open_leads)                                               AS max_open,
  ROUND((MAX(open_leads)::numeric / NULLIF(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY open_leads)::numeric, 0))::numeric, 1)
                                                                AS imbalance_ratio
FROM counts;
```

**Snapshot at 2026-04-28 (pre-Path-Y baseline for comparison):**

| active_counselors | median_open | max_open | imbalance_ratio |
|---|---|---|---|
| 4 | 174.5 | 1,198 | **6.9x** |

**Target post-Path-Y + 24h:** `active_counselors >= 7`, `imbalance_ratio < 3.0x`, orphan institutions reduced from 6 to ~4.

**If after 24h the ratio is still >5x:**

1. Check `admission_lead_cascade_history` — is the cron actually firing? Reason values should include `queue_flush` events.
2. Check whether Rule 2 (Engineering preference) was enabled — if `institution_routing_preference` action type is not implemented, that rule no-ops silently. Either ship that handler or substitute Rule 5 with a tighter scope.
3. Verify `jeevavarshinis` isn't holding leads via `current_leads` cache — the cache may have drifted from real `open_leads` count. Engineer can run the recalc procedure if so.

---

## Glossary additions (sibling to #577 Glossary)

- **Path Y:** the 4-user onboarding track from spec #537 decision D3. Distinct from Path X (existing Pharmacy team). Path Y candidates are admission-cell staff who have admin-adjacent roles in `profiles` (`admission`, `admission_staff`, `executive_admin_officer`, `hr_admin`) but are not yet rows in `admission_counselors`.
- **Default-safe-when-empty:** with zero active rows in `admission_assignment_rules`, `fn_auto_assign_counselor_v2` falls back to the hardcoded PR #549 behaviour. Seeding rules organically replaces the hardcoded constants with no breaking transition. Verified zero rows on prod 2026-04-28.
- **Imbalance ratio:** highest open-lead count divided by the median open-lead count across active counselors. The dashboard widget (PR #570) fires when this ratio exceeds 3.0x.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Path Y user not appearing in Add-Counselor facilitator search | `profiles.institution_id` is null | Patch profile via Users > Profiles, then retry. See §0 `kandasamyk` row |
| INSERT in §2 returns 0 rows | All four already inserted (ON CONFLICT skipped them) OR all four still have institution_id IS NULL | Re-run the §0 SELECT to see actual state; fix the candidate with null institution |
| Rule 2 / Rule 3 saved but routing doesn't change | The `institution_routing_preference` action handler may not be shipped | Confirm with engineer; substitute with a `cross_institution_fallback` scoped to specific institutions |
| Rule 1 cap firing but `jeevavarshinis` still gets all new leads | Cap is per-RUN not per-DAY. With 96 cron runs/day x 10 leads = 960 max/day per counselor | If you need a daily cap, change `action.scope` to `daily` once that handler ships |
| Widget on `/dashboard` still shows 6 orphan institutions after Path Y | Path Y maps to Engineering + Education only. The other 4 orphans (Allied Health, Arts and Science, Dental, Jicate Solutions) need separate hiring or Rule 5 to clear | Verify Rule 5 is active and `max_overflow_per_run` is high enough |
| `kandasamyk` patched but still not appearing | Department might also be required if the wizard cascades hard. Try selecting just institution + leaving department blank | If still failing, check browser console for facilitator-search filter parameters |
