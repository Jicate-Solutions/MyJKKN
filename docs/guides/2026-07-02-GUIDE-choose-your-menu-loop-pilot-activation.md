# Choose Your Menu — Self-Improving Loop: Pilot Activation Runbook & Chairperson Playbook

**Date:** 2026-07-02
**Status:** Ready to activate (loop built, deployed, verified DARK on prod)
**Scope of pilot:** ONE tier — **Premium** (197 residents, smallest active tier; Classic is 458)
**Spec:** `specs/mess-choose-your-menu-self-improving-loop-2026-06-28.md` (§3 sim, §4 activation, §5 safety)

---

## 1. What this loop is (plain English)

Students on a mess plan **rate the meals** they eat and **vote dishes up/down**. Each week the
system:

1. **Measures** how last week's menu actually landed — average rating vs the 4-week baseline (a
   real before/after comparison, with a minimum number of ratings so one grumpy review can't
   swing it).
2. **Recommends** next week's dishes — ranking the library by what residents actually voted for
   and chose. If last week's advice was **rejected** or made **no real difference** (rating change
   inside the noise band, ±0.2), it **changes approach** and drops the picks that didn't work.
3. Hands that recommendation to the **chairperson**, who **Accepts, Edits, or Rejects** it. Only
   then does it reach students.

That third step is permanent: **the loop never changes a student's menu on its own.** A human
approves every proposal, forever.

The moat isn't the code — it's the accumulated weeks of real ratings that make each recommendation
smarter than the last. **A loop with zero cycles of real data is not a moat. It becomes one only
after several real weeks of fuel.**

---

## 2. Current state (verified on prod 2026-07-02)

| Thing | State | Meaning |
|---|---|---|
| `mess.choose.master_enabled` | `false` | Student engagement layer (voting/rating) is OFF everywhere |
| `mess.choose.loop.master_enabled` | `false` | Weekly recommend/measure cron is OFF |
| Tuning rows | `min_ratings_k=3`, `baseline_window_weeks=4`, `noise_band=0.2`, `recommend_count=6` | Present; every threshold is a config row, not a hardcode |
| 3 loop RPCs | exist, `anon` EXECUTE = **false** | Correctly locked to authenticated callers |
| Votes / ratings / choices | `0 / 0 / 0` | No fuel yet — the loop is idling at zero |
| `mess_menus` | 56 rows, **all week of 2026-05-25**, 1 institution | **Weekly menu publishing is dormant** (see §3) |

**Bottom line:** the machine is built and safe, but it has no fuel and no current-week menu to
rate. Flipping the switches without fixing that would light up an empty feature.

---

## 3. The real precondition: a live weekly menu (and a human who drives it)

The loop reads `mess_menus` for its rating baseline. That table has not been updated since the
week of **2026-05-25** — publishing is **manual** and simply stopped (there is no rollover cron;
the code works fine). The likely reason: rebuilding a 7-day × 4-meal grid from scratch every week
is tedious, so once there was no live reason to publish, it lapsed.

**Two things are required each week for the loop to produce anything:**

1. **A published current-week menu** — so residents have real meals to rate.
2. **Residents actually voting + rating** — this is human behaviour, not a switch. It needs a
   **chairperson / warden who owns the weekly cadence.** *No code creates student engagement.* If
   nobody drives it, the loop stays at zero even with both switches on.

**Friction-killer shipped with this pilot:** the Mess Menu Editor now has a **"Copy last week"**
button. One click seeds the selected week from the most recent prior week (as *planned*,
idempotent), so publishing is *copy + edit the changes* instead of rebuilding 28 cells. The
chairperson still reviews and edits before it goes live.

> **Optional fast-follow (not built):** an auto-rollover cron that copies last week forward if a
> week is left empty, for zero-touch continuity. Deliberately deferred to keep the chairperson in
> explicit control of each week's menu. Build it only if the pilot shows weeks being missed.

---

## 4. Activation runbook (exact steps — run only when an owner is assigned)

> Ships via config flips on prod; **no deploy needed** (the RPCs + page read these rows live).
> Do these in order. All are reversible in seconds (§6).

**Pre-check — confirm the pilot institution's Premium residents exist and where:**
```sql
SELECT p.institution_id, count(*) AS premium_residents
FROM learners_profiles lp
JOIN mess_categories mc ON mc.id = lp.mess_category_id AND mc.name = 'Premium'
JOIN profiles p ON p.learner_id = lp.id
GROUP BY p.institution_id;
```

**Step 1 — Seed a current-week Premium menu** (so residents can rate immediately). Preferred:
open **Mess Menu Editor → Premium → Current week → "Copy last week"**, review, publish. Or, one-off
via SQL (copies the 2026-05-25 Premium cells into the current ISO week — adjust the target Monday):
```sql
-- DRY RUN FIRST inside BEGIN … ROLLBACK; then re-run with COMMIT.
INSERT INTO mess_menus (institution_id, caterer_id, week_start_date, day_of_week,
                        meal_type, tier_key, items, items_tamil, items_english, status)
SELECT institution_id, caterer_id, DATE '<CURRENT_MONDAY>', day_of_week,
       meal_type, tier_key, items, items_tamil, items_english, 'planned'
FROM mess_menus
WHERE tier_key = 'premium' AND week_start_date = '2026-05-25'
  AND NOT EXISTS (
    SELECT 1 FROM mess_menus t
    WHERE t.tier_key='premium' AND t.week_start_date = DATE '<CURRENT_MONDAY>'
      AND t.day_of_week = mess_menus.day_of_week AND t.meal_type = mess_menus.meal_type
      AND t.caterer_id = mess_menus.caterer_id);
```

**Step 2 — Scope the engagement layer to Premium only:**
```sql
UPDATE platform_policies SET value = '["premium"]'::jsonb
WHERE policy_key = 'mess.choose.voting.enabled_tiers' AND scope_type = 'global';
```

**Step 3 — Flip the two master switches ON:**
```sql
UPDATE platform_policies SET value = 'true'::jsonb
WHERE policy_key IN ('mess.choose.master_enabled','mess.choose.loop.master_enabled')
  AND scope_type = 'global';
```

**Step 4 — Verify:**
```sql
SELECT policy_key, value FROM platform_policies WHERE policy_key LIKE 'mess.choose%' ORDER BY policy_key;
-- expect master_enabled=true, loop.master_enabled=true, voting.enabled_tiers=["premium"]
```
- Load `/campus-living/my-hostel/my-meals` as a **Premium** resident → current-week menu shows,
  the vote/rate boards render.
- Load `/campus-living/mess/menu-loop` as chairperson/super-admin → the verdict board renders.
- Trigger the weekly cron once (or wait for its schedule) and confirm the JSON response shows
  `tierScope: ["premium"]` and generated ≥ 1.

**Human-approval gate is intact by design:** `fn_mess_recommend_next_menu` only writes rows with
status `proposed`; nothing reaches students until the chairperson sets a verdict on the menu-loop
page. Never wire any auto-apply.

---

## 5. Chairperson fueling playbook (the weekly rhythm)

Give this to the pilot hostel's chairperson/warden. Each week, in order:

| When | Who | Action |
|---|---|---|
| **Start of week (Mon)** | Chairperson | Open **Mess Menu Editor → Premium → this week → "Copy last week"**, apply any accepted recommendation from the loop, publish. |
| **All week** | Residents | Open **My Meals** on their phone → **rate** each meal (1–5) and **vote** dishes up/down. This is the fuel — the more who do it, the smarter the loop. |
| **~T+8 days (next week)** | System (cron) | Measures how the week landed (avg rating vs the last 4 weeks) and generates next week's dish recommendation. |
| **Before next week** | Chairperson | Open **Menu Loop** page → read the recommendation + why → **Accept / Edit / Reject**. Accepted picks flow into next week's "Copy last week" starting grid. |

**The two jobs of the pilot:** *fuel it* (publish + get residents rating) and *prove it* (let real
cycles run so the lift is measured, not assumed). Both need the chairperson showing up weekly.

---

## 6. Undo (instant rollback)

```sql
UPDATE platform_policies SET value = 'false'::jsonb
WHERE policy_key IN ('mess.choose.master_enabled','mess.choose.loop.master_enabled')
  AND scope_type = 'global';
-- (optional) restore the tier list:
UPDATE platform_policies SET value = '["classic","premium","premium_plus"]'::jsonb
WHERE policy_key = 'mess.choose.voting.enabled_tiers' AND scope_type = 'global';
```
The next page load / next cron tick is dark again. No deploy, no data loss (accumulated
votes/ratings remain for when you re-activate).

---

## 7. Certification: when is it a "verified self-improving loop"?

Let **≥ 3–4 real cycles** accumulate (real published menus + real resident ratings), then run the
spec §3 two-cycle simulation asserts against cycles that **actually ran** (not synthetic):

1. **No change ⇒ lift ≈ 0.00** — same menu week-over-week measures no improvement.
2. **+1 rating delta ⇒ lift ≈ 1.00** — a genuinely better week measures a full point of lift.
3. **Feed-forward changes the set** — after a rejected / zero-lift week, the next recommendation
   drops the prior picks and proposes different dishes.
4. **Causal-validity guard fires** — if accepted-vs-rejected outcomes are statistically
   indistinguishable, the guard flags "can't attribute the lift to the loop."

The verdict flips to **"Verified self-improving"** only via a cycle that genuinely ran. If the data
shows **no lift**, do **not** kill the loop and do **not** demote it to a voting toy — **adjust the
dish-scoring inside `fn_mess_recommend_next_menu`** (the demand ranking / change-of-approach logic)
and run another cycle.

---

## 8. Known caveats

- **Loop generation is now tier-scoped** (this PR): the weekly cron only proposes for tiers in
  `mess.choose.voting.enabled_tiers`. With `["premium"]`, only Premium gets proposals — a clean
  single-tier pilot.
- **`master_enabled` is a global boolean.** Turning it on also enables the return-arc panels
  (my-activity / live counts) for other tiers' residents, but `voting.enabled_tiers=["premium"]`
  means only Premium residents can actually vote/rate. Non-Premium residents see empty panels, not
  an interactive surface. Acceptable for a pilot; note it.
- **Config drift:** `voting.enabled_tiers` currently lists `premium_plus`, but the code tier ladder
  is only `classic` + `premium` (Premium Plus category is inactive, 0 residents). Harmless; the
  activation narrows the list to `["premium"]` anyway.
