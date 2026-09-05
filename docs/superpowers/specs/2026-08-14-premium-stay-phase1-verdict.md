# Verdict: premium-stay-phase1
**Verdict date:** 2026-08-14  
**Rendered by:** Scheduled routine (automated, Director not present)  
**Verdict:** MISS-kill  

---

## Initiative summary

| Field | Value |
|---|---|
| Initiative ID | `premium-stay-phase1` |
| Locked | 2026-05-16 (migration `20260516131800_create_hostel_tier_policy.sql`) |
| Metric | `incremental_premium_fee_revenue_inr_90d` |
| SQL (as locked) | `SELECT SUM(amount) FROM hostel_premium_invoices WHERE created_at >= ship_date AND created_at <= ship_date + INTERVAL '90 days'` |
| HIT threshold | ₹15,00,000 (₹15L) |
| Kill criterion | < ₹5,00,000 (₹5L) |
| Verdict date | 2026-08-14 |

---

## Q1 — Current reading of `incremental_premium_fee_revenue_inr_90d`

**Result: UNRUNNABLE — table does not exist**

The SQL query references `hostel_premium_invoices`. This table **was never created** in any Supabase migration. Confirmed by:

1. Search across all `supabase/migrations/` — no file creates `hostel_premium_invoices`
2. `types/supabase.ts` — `hostel_premium_invoices` absent from the generated type tree
3. Existing premium tables are: `hostel_premium_audit_log`, `hostel_premium_invites`, `hostel_premium_vacancies`

Revenue from premium tier uplifts, if any, would only be present indirectly in the general `hostel_fees` table via `tier_id` references to `hostel_tier_policy`. No dedicated invoice capture mechanism for the premium increment was built.

**Effective revenue count: ₹0 tracked** (measurement infrastructure absent → kill criterion fires definitionally)

---

## Q2 — Verdict

**MISS-kill**

Rationale:

- `hostel_premium_invoices` table never created → no incremental premium fee revenue was ever captured by the system
- The roommate invite feature (`hostel_premium_invites`) — a core premium value prop — "never worked" and was only repaired in a recent PR (7e925efd / 06654241, merged ~2026-08-11)
- The learner-facing premium self-selection UI was scoped to Phase 2, meaning the revenue-generating surface was never activated during the 90-day window
- Even on a generous interpretation (checking `hostel_fees` for tier-uplift rows), the measurement infrastructure cannot isolate the premium increment without the dedicated table

Kill criterion (<₹5L) fires. The threshold of ₹15L was never approachable.

---

## Q3 — Lessons captured

### Was the metric right?
**No.** The metric required `hostel_premium_invoices` but this table was never migrated. The metric was defined *before* the measurement infrastructure was built. The locked SQL was aspirational, not operational.

**Rule proposed:** When a `/lock-initiative` entry specifies a SQL metric, the migration that creates the required table(s) must exist at lock time, or a TODO migration must be the P0 first task after locking.

### Was the threshold realistic?
**Unknowable** — the measurement gap prevents a fair assessment. However:
- The roommate-invite feature (a key conversion driver for premium upgrades) was broken for the entire 90-day window
- The learner-facing self-selection UI was deliberately deferred to Phase 2
- ₹15L in 90 days from an infrastructure-only Phase 1 was almost certainly over-ambitious regardless

### What would we do differently?
1. **Create the measurement table at the same time as the feature schema** — `hostel_premium_invoices` should have been in a companion migration on 2026-05-16
2. **Verify the metric table exists before locking** — the `/lock-initiative` skill should check that all tables referenced in the metric SQL are present in `types/supabase.ts`
3. **Gate the kill criterion on learner-facing UI launch** — Phase 1 shipped infrastructure; the kill clock should start when the revenue-generating surface (learner self-pick) goes live, not when the DB schema ships
4. **Fix blocking features before measuring** — the roommate-invite breakage (a core premium differentiator) should have been caught and repaired within the first 2 weeks of the 90-day window, not at week 12

---

## Pre-committed revision levers (from locked entry)

The Director pre-committed three revision options on a kill verdict:

1. **Expand features** — The roommate invite is now repaired (PR merged ~2026-08-11). The premium invite candidate list is also live. These were missing for the entire measurement window. A revised Phase 1.5 lock could measure from the repair date.

2. **Reduce price** — The 25% (premium) / 50% (premium_plus) default uplifts in `hostel_tier_policy` may be too high for adoption. Per-institution overrides are available via the admin UI.

3. **Pull learner-facing UI from Phase 2** — The learner self-selection surface was always a Phase 2 item. Since the revenue metric requires learners to actively pay for premium tier access, Phase 2 shipment is the correct moment to start the 90-day clock.

**Recommended path:** Pull lever 3 first — lock a new `premium-stay-phase2` entry that starts the 90-day clock on the day the learner self-selection UI ships. Fix the measurement gap (create `hostel_premium_invoices`) before that lock.

---

## Action required from Director

This verdict was rendered by automated scheduled routine. The routine **cannot update `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`** — that file lives in your local Obsidian vault, which is not available in the cloud container.

**Please manually:**

1. Find row `premium-stay-phase1` in the Active table of `Locked-Initiatives.md`
2. Move it to the Verdicted table with:
   - Verdict: `MISS-kill`
   - Verdict date: `2026-08-14`
   - Revenue reading: `₹0 (table hostel_premium_invoices never created)`
   - Lesson: see this file
3. Create a new Active row `premium-stay-phase2` when the learner self-selection UI ships, with metric table `hostel_premium_invoices` (must be migrated first)
