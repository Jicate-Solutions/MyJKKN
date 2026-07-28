# Runbook — Teaching-Enterprise Participant Sync

**Audience:** whoever gets the alert. No database knowledge assumed.
**Created:** 2026-07-27 · **Owner:** Director / platform admin

---

## What this job does

Every night at **04:11** a job called `teaching-cohort-sync` checks who should have
teaching-enterprise access and fixes any mismatch:

- A learner who now qualifies (right programme, right semester, active) **gains** their
  cohort's role.
- A learner who no longer qualifies (graduated, left, changed programme) **loses** it.
- The same happens for Senior Learners, based on department membership.

Who qualifies is **not** written in code — it is one row per cohort in
**Admin → Teaching Cohorts** (`/admin/teaching-cohorts`). Editing that row changes who
gets access on the next run.

**A healthy run changes nothing** and reports `role_added: 0, role_removed: 0`. That is
success, not a problem.

---

## How to check it is alive

```sql
SELECT cohort_key, is_active, last_synced_at, last_sync_result
FROM teaching_enterprise_cohorts
ORDER BY cohort_key;
```

`last_synced_at` should be within the last 24 hours for every **active** cohort.
Inactive cohorts are skipped on purpose and will not update.

If `last_synced_at` is stale by more than a day, **the job has stopped running** — that is
a real problem even though nothing looks broken. Check the Vercel cron for
`/api/cron/teaching-cohort-sync`.

---

## 🔔 The once-a-year alarm (expected, not a bug)

**Symptom.** Around the start of a new academic year the job starts failing every night
with a message like:

> `teaching cohort mba_associate: this sync would remove role mba_associate from 44 of 58
> current holders (more than half) — refusing.`

**Why.** When a whole cohort finishes and a new batch arrives, almost everyone's access
legitimately changes at once. The job cannot tell that apart from someone mistyping the
settings — and a typo silently removing 44 people's access is the worse outcome. So it
**stops and asks** instead of guessing. It has changed nothing at this point.

**What to do — in order:**

1. **Check the cohort row first** at `/admin/teaching-cohorts`. Is the *Semester window*
   still right for the current batch? Most "alarms" are really a stale semester window or
   no active academic year. If it is wrong, fix it there — the next run then succeeds
   normally and you are done.

2. **If the settings are right and this genuinely is a batch turnover**, confirm it
   deliberately. Run this as a **single** statement — the permission lasts only for that
   one transaction and cannot be left switched on:

   ```sql
   BEGIN;
     SELECT set_config('teaching_enterprise.allow_mass_revocation', 'on', true);
     SELECT * FROM fn_teaching_cohort_sync();
   COMMIT;
   ```

   Read the returned counts before you commit. `role_removed` should match the size of the
   batch that left, and `role_total` should match the new batch. If either number looks
   wrong, `ROLLBACK` instead of `COMMIT`.

3. The nightly job resumes normally from the next run.

**What this escape hatch can and cannot do.** It only relaxes the *"more than half"*
guard. It can **never** bypass the other guard — the one that fires when the settings match
**nobody at all**. That case is always refused, because a rule matching zero learners is
essentially always a mistake. If you genuinely want to end a cohort, switch it off:

```sql
UPDATE teaching_enterprise_cohorts SET is_active = false WHERE cohort_key = '<key>';
```

Switching a cohort off **stops new grants and closes its analytics access, but does not
remove roles already granted.** It stops the clock; it is not an un-grant.

---

## ⚠️ Before switching a cohort ON

Activating a cohort grants platform access to **everyone who matches its settings** on the
next nightly run — potentially a hundred learners at once. There is no preview step
(deliberate: only a super administrator can do it).

So before flipping `is_active`:

1. Re-read the **Programme**, **Department** and **Semester window** on that row.
2. Sanity-check the count yourself:

   ```sql
   SELECT count(*)
   FROM learners_profiles lp
   JOIN semesters s       ON s.id  = lp.semester_id
   JOIN academic_years ay ON ay.id = lp.academic_year_id
   WHERE lp.program_id = '<the row''s program_id>'
     AND s.semester_order = ANY ('<the row''s semester_orders>'::int[])
     AND ay.is_active
     AND lp.lifecycle_status = 'active';
   ```

   If that number surprises you, **do not activate** — fix the row first.

### 🚩 Open item: the CSE window is unconfirmed

The `cse_resident` row ships with **semester window 5, 6, 7**. A build agent chose those
values and gave no rationale, and the Director has **not** confirmed them. Treat that
window as unverified: confirm the intended year groups (and re-run the count query above)
**before** anyone activates the CSE cohort.

---

## Related

- Cohort settings UI: `/admin/teaching-cohorts`
- Job: `app/api/cron/teaching-cohort-sync/route.ts` (04:11 daily)
- Function: `fn_teaching_cohort_sync(p_cohort_key text DEFAULT NULL)` — `service_role` only
- Migrations: `20260727010000_teaching_enterprise_cohorts.sql` (hardened
  `46c3c5ea77` / PR #2479), `20260727060000_credit_pairing_and_sync_stamp.sql`
