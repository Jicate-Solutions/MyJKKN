# Logged-in NULL `learner_id` Profile Triage — 2026-05-20

**Workstream:** R5.C (B3.3.2) — targeted follow-up to T2.1 (PR #1012)
**Origin:** T2.1's Path C named the 23 logged-in orphan profiles as the highest-stakes class. R5.C is the investigation step.
**Verdict:** **Audit-only.** No safe automated backfill exists. All 22 profiles need Director manual triage.
**Scope:** The specific subset of T2.1's 273 orphan profiles who have ever signed in.

## TL;DR

| Metric | Count |
|---|---:|
| Profiles with `role='student'` AND `learner_id IS NULL` | 273 |
| Subset who have ever signed in (`auth.users.last_sign_in_at IS NOT NULL`) | **22** (one fewer than T2.1's 23 — likely a sign-in event aged out, or T2.1 used a slightly different timestamp predicate) |
| Exact email matches to `learners_profiles.college_email` | **0** |
| Exact email matches to `learners_profiles.student_email` | **0** |
| Exact email matches to either column | **0** |
| Profiles with cleanly disambiguatable manual candidate | **0** |
| Auto-backfill candidates (per negative permissions) | **0** |

**Outcome:** This PR ships the triage doc. No backfill migration is shipped because the negative-permissions safety floor (exact-email-match only) yields zero clean candidates. Director receives a per-profile manual-review packet.

## Reproduction

The probe queries live below — apply against prod via Management API to reproduce.

### Q1. The 22 logged-in NULL-`learner_id` profiles

```sql
SELECT
  p.id AS profile_id,
  p.email AS profile_email,
  p.full_name AS profile_name,
  p.institution_id,
  i.name AS institution_name,
  u.last_sign_in_at,
  p.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN institutions i ON i.id = p.institution_id
WHERE p.role = 'student'
  AND p.learner_id IS NULL
  AND u.last_sign_in_at IS NOT NULL
ORDER BY u.last_sign_in_at DESC;
```

Run on 2026-05-20: **22 rows** (PR #1012 reported 23).

### Q2. Exact email match — `college_email`

```sql
SELECT p.id, p.email, lp.id AS candidate_learner_id, lp.college_email
FROM profiles p
JOIN auth.users u ON u.id = p.id
JOIN learners_profiles lp ON lower(trim(p.email)) = lower(trim(lp.college_email))
WHERE p.role = 'student' AND p.learner_id IS NULL AND u.last_sign_in_at IS NOT NULL;
```

Result: `[]` — **zero matches.**

### Q3. Exact email match — `student_email`

```sql
SELECT p.id, p.email, lp.id AS candidate_learner_id, lp.student_email
FROM profiles p
JOIN auth.users u ON u.id = p.id
JOIN learners_profiles lp ON lower(trim(p.email)) = lower(trim(lp.student_email))
WHERE p.role = 'student' AND p.learner_id IS NULL AND u.last_sign_in_at IS NOT NULL;
```

Result: `[]` — **zero matches.**

### Q4. Exact email match — either column

```sql
SELECT p.id, p.email
FROM profiles p
JOIN auth.users u ON u.id = p.id
JOIN learners_profiles lp ON (
    lower(trim(p.email)) = lower(trim(lp.college_email))
 OR lower(trim(p.email)) = lower(trim(lp.student_email))
)
WHERE p.role = 'student' AND p.learner_id IS NULL AND u.last_sign_in_at IS NOT NULL;
```

Result: `[]` — **zero matches.**

### Q5. Bridge table `user_learner_relationship` — already-linked elsewhere?

```sql
SELECT p.id, p.email, ulr.learner_id, ulr.relationship, ulr.revoked_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN user_learner_relationship ulr ON ulr.user_id = p.id
WHERE p.role = 'student' AND p.learner_id IS NULL AND u.last_sign_in_at IS NOT NULL
  AND ulr.user_id IS NOT NULL;
```

Result: `[]` — **no parallel linkage exists.** These users have no in-DB connection to any `learners_profiles` row through any path.

## The 22 profiles in detail

Sorted by `last_sign_in_at` desc. Institution column is the profile's `institution_id` resolution, not the learner row's (which doesn't exist).

| # | Last sign-in | Email | Display name | Institution | Profile created |
|---|---|---|---|---|---|
| 1 | 2026-05-12 | `graciakaren.ra24mds@jkkn.ac.in` | GRACIA KAREN R.A | Dental | 2026-04-06 |
| 2 | 2026-04-09 | `vicepresident.learnerscouncil@jkkn.ac.in` | Abishek | Testing Institution | 2026-03-04 |
| 3 | 2026-04-06 | `prabakarankcse2023@jkkn.ac.in` | PRABA KARAN K | Engineering | 2025-07-31 |
| 4 | 2026-04-02 | `poovarasank@jkkn.ac.in` | POOVARASAN K | Pharmacy | 2026-02-09 |
| 5 | 2026-03-23 | `mouzhidharanteee2023@jkkn.ac.in` | MOUZHLIDHARAN THIMMARAYAN | Engineering | 2026-01-29 |
| 6 | 2026-03-19 | `jananipriyamit2025@jkkn.ac.in` | JANANI PRIYA M | Engineering | 2026-02-09 |
| 7 | 2026-03-18 | `keerthivasini.c@jkkn.ac.in` | **KAVYAPRIYA R** (note: email/name mismatch) | Dental | 2025-07-22 |
| 8 | 2026-03-14 | `sathish6ece2025@jkkn.ac.in` | SATHISH B | Engineering | 2025-09-19 |
| 9 | 2026-03-13 | `santhoshkumar.a11@jkkn.ac.in` | SANTHOSHKUMAR A A | Dental | 2025-07-22 |
| 10 | 2026-03-13 | `sanjayragunathan24bp@jkkn.ac.in` | SANJAY R | Pharmacy | 2026-03-09 |
| 11 | 2026-03-10 | `ragavi.n@jkkn.ac.in` | RAGAVI N | Dental | 2025-07-22 |
| 12 | 2026-03-10 | `vigneshwari.r@jkkn.ac.in` | VIGNESHWARI R R | Dental | 2026-03-08 |
| 13 | 2026-03-10 | `vaishnavim@jkkn.ac.in` | VAISHNAVI M M | Dental | 2025-07-22 |
| 14 | 2026-03-10 | `kavyapriya.r@jkkn.ac.in` | **KAVITHA S S** (note: email/name mismatch) | Dental | 2025-07-22 |
| 15 | 2026-03-10 | `kasthuri.m02@jkkn.ac.in` | KASTHURI M | Dental | 2025-07-22 |
| 16 | 2026-03-10 | `nishaanth.sm@jkkn.ac.in` | NISHAANTH SM | Dental | 2025-07-22 |
| 17 | 2026-03-10 | `kavitha.s4@jkkn.ac.in` | KAVITHA S | Dental | 2025-07-22 |
| 18 | 2026-03-10 | `akash.v@jkkn.ac.in` | AKASH V V | Dental | 2025-07-22 |
| 19 | 2026-03-08 | `ramya.r21@jkkn.ac.in` | RAMYA R R | Dental | 2025-07-22 |
| 20 | 2026-03-08 | `sowmiyaa.s@jkkn.ac.in` | SOWMIYAA S S | Dental | 2025-07-22 |
| 21 | 2026-03-08 | `hariprasathm.bp@jkkn.ac.in` | HARIPRASATH M | Pharmacy | 2025-07-28 |
| 22 | 2026-03-08 | `naveenak2024ece@jkkn.ac.in` | NAVEENA.K K | Engineering | 2025-08-01 |

### Pattern signal

**13 of 22 are Dental, 12 of those created in a single 30-second window on 2025-07-22 (between 16:40:06 and 16:40:22 UTC).** This is the fingerprint of a single batch insert — almost certainly an admission-cycle import script that wrote `profiles` rows but did not (or could not) populate `learner_id`. Recovery for that cluster is likely best done by re-running whatever import script created them, with the linkage step fixed.

### Cross-institution distribution

| Institution | Count |
|---|---:|
| JKKN Dental College and Hospital | 13 |
| JKKN College of Engineering and Technology | 5 |
| JKKN College of Pharmacy | 3 |
| JKKN Testing Institution | 1 |

## Why no auto-backfill

The mission's negative permissions are: **exact-email-match only; no fuzzy matching of any kind.** Three concrete cases demonstrate why the floor is correctly drawn there:

### Case A — Looks like a match, isn't a clean one

Profile 1: `graciakaren.ra24mds@jkkn.ac.in` / "GRACIA KAREN R.A" / Dental / 2026-04-06.
The only `GRACIA KAREN` in `learners_profiles` is `15f5228b-…` with:
- `first_name = 'GRACIA KAREN'`, `last_name = 'R.A'` — same human name.
- `college_email = 'graciakaren24.mds@jkkn.ac.in'` — different format (dots and segment order differ).
- `student_email = 'karengracia0520@gmail.com'` — different mailbox.
- `lifecycle_status = 'active'`.

This is very likely the same person, but the email mismatch could equally indicate: (a) the user typed `graciakaren.ra24mds` at signup but the learner record had `graciakaren24.mds`, OR (b) two different people with the same display name. The cost of (b) being true once across 22 attempts is a wrong notification fan-out — exactly the cost class T2.1 was trying to fix.

### Case B — Email/name mismatch within the profile itself

Profile 7: email `keerthivasini.c@jkkn.ac.in` but `full_name = 'KAVYAPRIYA R'`. Either the email or the name is wrong on the profile row itself. No matching algorithm against `learners_profiles` can be safe when the source row contains internal inconsistency. Same for Profile 14: email `kavyapriya.r@jkkn.ac.in` but name `KAVITHA S S`.

### Case C — Ambiguous first-name token matches

Many of the 22 first-name tokens (Sanjay, Janani, Santhoshkumar, Vaishnavi, Ramya, Poovarasan, Akash) match **5-24 different `learners_profiles` rows** — without a second tiebreaker (exact email, registration date, program), automated pick-one is a coin flip among many.

### Counterfactual

If `lp.college_email` ever exactly equalled `p.email` for any of the 22, a one-line UPDATE per match would have been safe — that's the path Part 2 of the mission was reserved for. Since Q2/Q3/Q4 all returned empty, Part 3 (audit-only) applies.

## Director manual-review packet

For each row, the recommended manual investigation is:

1. **Find candidate in `learners_profiles`** by searching against `first_name`, `last_name`, `student_mobile`, `father_mobile`, program code embedded in the email (e.g. `mds`, `bp`, `cse`, `ece`, `ec`, `bp`, `mit`).
2. **Verify with the institution's admissions office** that the auth-account email and the candidate `learners_profiles` row belong to the same human.
3. **If confirmed**: run a one-row UPDATE:
   ```sql
   UPDATE profiles
   SET learner_id = '<verified_learner_id>'
   WHERE id = '<profile_id>' AND learner_id IS NULL;
   ```
4. **If the profile is duplicate / test data / wrong person**: either soft-delete the auth account or change the profile's `role` away from `student` (depending on what the row actually represents).

The Dental 2025-07-22 cluster (13 rows) probably collapses to one root-cause finding: a single batch import. Solving that one likely fixes 13 of 22 at once.

## Recommendation

Two non-overlapping next actions:

### Action 1 — Resolve the 22 by manual SQL (Director / institution heads)

Hand the packet above to the Dental, Engineering, and Pharmacy admissions offices. They are the only authoritative source for matching auth-account email to actual learner identity. Each match → one UPDATE.

### Action 2 — Fix the activation flow that's creating new orphans

The 100 of 273 orphan profiles created in 2026 (per T2.1) prove this isn't a one-time data bug — the activation code path is still writing student-role profile rows with `learner_id` left NULL. Worth a separate investigation workstream (proposed name: R5.D — instrument the activation flow). Out of scope for R5.C.

## Anti-recurrence — defense-in-depth options for Director

These are options, not recommendations from this audit:

- **NOT NULL constraint on `profiles.learner_id` for `role='student'`** — out of scope per mission negative permissions. Would catch new orphans at insert time but breaks existing 250 never-logged-in orphans and requires data cleanup first.
- **Periodic alert query** — schedule a daily job that emits a Slack/email alert when `COUNT(profiles WHERE role='student' AND learner_id IS NULL AND last_sign_in_at > now() - interval '7 days') > 0`. Catches new orphans before they accumulate.
- **Trigger-level enforcement** — a `BEFORE INSERT` trigger on `profiles` that rejects `role='student' AND learner_id IS NULL` unless a flag like `bypass_learner_link = true` is set. Strongest, but breaks any flow that legitimately creates a student profile first and links later.

None of these are shipped by this PR.

## Files in this PR

- `docs/audit/profiles-null-learner-id-triage-2026-05-20.md` (this file)

No migration. No backfill. No schema change. No RLS change.

## Cross-references

- T2.1 audit (PR #1012): `docs/audit/learners-profiles-mapping-gap-2026-05-19.md` — parent context.
- Mission spec: R5.C / B3.3.2.
