TASK (user-stated P0, verbatim: **"all the above 4"**): Drive the **referral incentive release** forward on all four fronts — they are largely non-overlapping and can be parallelised:
1. **Get the external 2025-26 referral records + already-paid list from the Director**, parse them, match against the 1,863 real 2025-26 admissions, and produce an EXCEPTION report (unmatched / duplicate claims / self-referrals / already-paid) BEFORE any amount is computed.
2. **Diagnose + fix the silent approve failure** on `/admission/consultants/commissions` (Confirm fires but never persists).
3. **Build the missing release pieces**: commission rate config + the generator that turns attributions into transactions + a referral import template carrying referrer/date/amount.
4. **Unlock `entry_date`** in the lead form (admin-gated) + fix the "Fee Amount: ₹NaN" render.

User explicitly said carry EVERYTHING forward — nothing to drop.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase prod ref `kvizhngldtiuufknvehv`; Mgmt API token at `~/.supabase/access-token`; service-role key in `.env.production.local` (NEVER echo it).
PROGRESS: `progress.txt` — read the TOP block "## Session: 2026-07-20 (END /cnext)".
MEMORY (read FIRST): `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_referral_incentive_release.md` — the complete evidence base for everything below. Also `project_universal_referral_engine.md` (June red-team: forgeable approval, no clawback, no tenant scoping).

## CURRENT STATE (all live-verified 2026-07-20)

**Referral release = NOT RELEASABLE.** Four independent blockers:
- **2025-26 has ZERO attribution.** Admission year 2025 = **1,863 admissions, 0** with `referred_by_id`/`referral_type`. Capture began **2026-02-26**; all 21,448 `admission_leads` are 2026-27. Year 2026 = 2,136 admissions, **851 attributed** (consultant 547, faculty 196, student 108). Director confirmed 2025-26 records exist **OUTSIDE the system**.
- **No rates, no generator.** `consultant_commission_structures` = 0, `referral_reward_configs` = 0. **No function/service/button anywhere CREATES a commission transaction.** Chain: attribution ✅ → **[compute ⛔ MISSING]** → transaction → approve/pay → payout batch.
- **Approve button SILENTLY FAILS.** Live test: inserted ₹1 txn → page rendered it → menu offered `Mark as Earned` → confirm dialog → clicked Confirm → spinner → **DB unchanged** (`pending`, `approved_by` NULL, `status_history` `[]`). Same UPDATE **succeeds at DB level under RLS as super_admin** ⇒ **app-layer bug, NOT permissions.** Exact error UNDIAGNOSED (Chrome extension disconnected mid-test).
- **`entry_date` HARD-DISABLED.** `app/(routes)/admission/leads/new/page.tsx`: `const [entryDate] = useState(...)` (no setter) + `<Input id="entry_date" disabled>`. Live DOM: `{value:"2026-07-20", disabled:true}`. DB column is nullable/no-default and DOES accept backdating.

**No payment history exists anywhere** (`consultant_commission_transactions` / `consultant_payout_batches` / `consultant_payment_queries` / `referral_rewards` all 0) → **DOUBLE-PAY RISK** if the already-paid list isn't imported alongside claims.

**HP ALFA schools-network = DONE, verified live.** 7 PRs merged+deployed; 75 HP schools / 46 owners / 75 contacts / 74 visits / 16 websites live. ⚠️ **Nudges were switched ON by Isvarya Lakshmi (Joint MD) on 2026-07-10** (74 assignments, 305 notifications, last 07-17) — reverses the earlier "nudges off" setting. ⚠️ **0 of 75 AI-session statuses set** in 13 days (dropdowns live but unused).

## VERIFY CURRENT STATE (run BEFORE any work — read-only)
```sql
-- 1. still zero attribution for 2025-26?
SELECT ay.year, count(*) FILTER (WHERE lp.referred_by_id IS NOT NULL) AS attributed, count(*) AS total
FROM learners_profiles lp JOIN admission_years ay ON ay.id=lp.admission_year_id
WHERE ay.year BETWEEN 2025 AND 2026 GROUP BY ay.year ORDER BY ay.year;
-- expect 2025 -> 0/1863 ; 2026 -> 851/2136

-- 2. still no rates / no ledger rows?
SELECT 'structures' k,count(*)::text v FROM consultant_commission_structures
UNION ALL SELECT 'reward_configs',count(*)::text FROM referral_reward_configs
UNION ALL SELECT 'ledger',count(*)::text FROM consultant_commission_transactions
UNION ALL SELECT 'payout_batches',count(*)::text FROM consultant_payout_batches;
-- expect 0/0/0/0
```
If any differ (someone added rates, or rows appeared) → STOP, report, do NOT execute the stale plan.

## WHAT NEEDS TO HAPPEN
1. **Ask the Director for the two files**: (a) 2025-26 referral records — referrer name+type+id/email, referred learner name + **application/roll number**, program/institution, date, any pre-agreed amount; (b) the **already-paid list**. Then parse → match to the 1,863 admissions → EXCEPTION REPORT. Do NOT compute money before the exception report is reviewed.
2. **Diagnose the approve failure**: re-run the UI test on `/admission/consultants/commissions` capturing **console + network** (extension disconnected last time). Insert a marked ₹1 txn, click Confirm, capture the failing request/response, then DELETE the row and verify zero residue.
3. **Build the missing pieces** (ships via Translator Pattern, PR to `jicate` remote).
4. **Unlock `entry_date`** (admin-gated) + fix `₹NaN`.

## CONSTRAINTS & RULES
- **MONEY = highest care.** Never compute or release an amount from unverified external claims. Matching each claim to a real admission converts assertion → evidence.
- **Branch protection blocks direct merge** — every PR needs the Director to merge (Visual Proof Gate blocks any PR touching a `page.tsx` unless a screenshot is committed or `visual-proof-skip` is applied). Expect: build → PR → Director merges → I deploy via hook.
- **Deploy ships CODE, not migrations** — apply SQL via Mgmt API separately; show SQL first.
- **Test-data discipline**: `trg_update_consultant_commission_totals` fires on INSERT/DELETE/UPDATE so deleting a test txn correctly reverses totals (verified). But **do NOT create test admission_leads** — `trg_admission_leads_auto_assign_counselor` assigns a REAL counselor and there is **no DELETE trigger to decrement** their count.
- **Consultants have a portal** (`/consultant-portal/commissions`) — a test txn on a real agency would show them a phantom commission. Use an internal person (Boobalan `a8cfcc91-0854-4c09-a547-ac027edbd709`) + JKKN Testing Institution (`183847c5-be1b-4903-86eb-bbc20c213071`) + tiny amount + delete fast.
- New SECDEF RPCs must `REVOKE EXECUTE FROM anon, PUBLIC`.

## KEY FILES
- `app/(routes)/admission/leads/new/page.tsx` — the disabled `entry_date` (~line 225 state, ~line 710 input)
- `app/(routes)/admission/consultants/commissions/page.tsx` — the failing approve path (`useUpdateCommissionTransactionStatus`, `useProcessClawback`)
- `lib/utils/mappings/marketing-leads-excel-mappings.ts` + `app/api/admission/marketing/leads/bulk-upload/route.ts` — the WRONG importer (targets `marketing_leads_database`, no referral/date/amount columns)
- Triggers that ARE the referral engine: `sync_lead_referral_to_attribution`, `sync_lead_referral_to_learner_profile`, `sync_learner_referral_to_attribution`

## KEY DECISIONS MADE (with rationale)
- **Did NOT build a test import template.** An import can't produce a releasable amount because the generator doesn't exist — building the importer first creates data nothing can act on. Sequence rates+generator first.
- **Did NOT create a test admission_lead.** The `disabled` attribute was already dispositive, and a test lead assigns a real counselor with no decrement on delete.
- **DID create + delete one real ledger row** (Director chose "full test") — proved the ledger, numbering, page render, menu and confirm dialog all work, and isolated the failure to the persist step. Zero residue verified.
- **Cleaner path than backdated leads**: the 1,863 admissions already exist with empty `referred_by_id`; writing attribution onto those learners sidesteps the locked date field and avoids 1,863 fake leads.

## QUALITY BAR
Exception report produced and reviewed before any amount is computed; approve-failure root cause identified with a captured error (not inferred); every test row deleted with residue verified; no PR merged without the Director.

## DO NOT
- Do NOT compute or release any referral amount until (a) claims are matched and (b) the already-paid list is imported — double-pay risk is real.
- Do NOT create test `admission_leads` rows in production.
- Do NOT push `omm-dev` to main. Do NOT echo the service-role key.
- Do NOT blanket-compact `MEMORY.md` — a parallel session actively owns it (hook wants it <17.1KB; coordinate first).

## VERIFY BY
2025-26 claims matched with a written exception report; the approve button persists a status change (DB-confirmed, not just UI); rates exist and a generated transaction reaches `paid`; `entry_date` accepts a 2025 date as admin; ledger/test rows all cleaned up.
