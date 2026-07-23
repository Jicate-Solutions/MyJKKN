# Visual Proof — PDE Tier 2 T2.8 (agency-index live mode)

**PR**: `feat/pde-tier2-agency-live-mode` → jicate `main`
**Touched UI file**: `app/(routes)/learn/_components/agency-index-card.tsx`
**Date**: 2026-05-19

## Placeholder receipt

`agency-index-card-live-mode-placeholder.png` is a deep-green 256×96 PNG
placeholder committed per the task spec ("Visual Proof Gate: placeholder
OK"). A live screenshot would show the AgencyIndexCard at `/learn` with:

1. **`semester_end` mode** (current production default):
   - Level badge only ("Self-Directed" / "Independent" etc).
   - No live pill, no refresh icon.
   - Score is static between full page reloads.

2. **`live` mode** (after Director flips
   `pde.visibility.agency_index_mode` to `live` in
   `/admin/pde-policies/visibility`):
   - Small "Live" pill with pulsing RefreshCw icon left of the level badge.
   - Score re-fetched every 30 seconds via React-Query invalidation.
   - Network tab shows `GET /api/pde/agency?learnerId=...` every 30s.

3. **`live_coarse` mode** (cheaper UI variant):
   - "Live~" pill (tilde indicates coarse bucketing).
   - Same 30s refresh; score values land on multiples of 10.

## Why placeholder is acceptable

The new code path is **policy-gated and dormant by default**. With the
seeded default value `'live'` it activates on every render of the card,
but the actual behavioural change (polling + pill) is invisible until a
learner with a known `learner_id` exists in `pde_demonstrations` with
non-null `weighted_score`. Production data for that table is currently
empty (table was created 2026-05-18). A meaningful live screenshot
requires either:

- Seeding `pde_demonstrations` rows for an admission-pipeline learner, or
- Manually impersonating a learner via `/auth/dev-login`.

Both are out-of-scope for this PR which is the substrate wire-up only.
Live screenshots will follow when Tier 3 scoring engine begins writing
`weighted_score` values (T3.* PRs).
