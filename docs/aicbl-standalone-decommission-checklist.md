# AICBL Standalone Decommission Checklist

**Status:** PARTIAL PROGRESS. MyJKKN port is live in production (verified 2026-05-24 via discriminating route probe — `POST /api/pde/clinical-reasoning/score` returns 401, route only exists post-merge). Real-learner verification + Vercel project deletion + Supabase row archival remain gated on Director action.

**Author:** Agent E, AICBL→PDE Clinical Reasoning sprint
**Spec reference:** `specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md` (lines 343–347)
**Last updated:** 2026-05-24

## Current decommission status (post-merge snapshot)

| Step | Status | Notes |
|---|---|---|
| MyJKKN port deployed to production | ✅ Verified 2026-05-24 | Discriminating route probe: `POST /api/pde/clinical-reasoning/score` returns 401 (route only exists post-merge). PR #1059 merged 2026-05-23 15:12 UTC. |
| Visual verification by real BDS learner | ⏳ Director action | Log in as BDS student, navigate to `/pde/learn/cases/leukoplakia`, complete a full attempt. Then run gating SQL queries below. |
| `pde_attempt_grants` migration applied | ⏳ Agent J running in parallel | Re-read DB state when Agent J completes; update this row to ✅ once verified via information_schema probe. |
| Receiver code (`handler.ts`) removed | ✅ Agent K running in parallel | Agent K owns deletion of `lib/pde/external-providers/aicbl/handler.ts` + related route registration. Re-read repo when complete; this checklist documents the change, doesn't perform it. |
| Standalone `aicbl.vercel.app` retirement | ⏳ Director action | Manual deletion via Vercel dashboard (see Step 1 below). Do NOT use deploy-hook curl per `feedback_vercel_deploy_hook_is_method_agnostic`. |
| `prototype_policies` AICBL rows archived | ⏳ Pending | See Step 4 — applies AFTER Vercel retirement. |
| `/Users/omm/PROJECTS/aicbl` local repo archived | ⏳ Pending | See Step 3 — rename + GitHub-archive AFTER Vercel retirement. |
| `reference_aicbl_project.md` updated with final disposition | ⏳ Pending | See Step 5 — last step, after all above complete. |

---

## What this document is

A pre-checked, ordered teardown plan for the AICBL standalone (`/Users/omm/PROJECTS/aicbl`, `https://aicbl.vercel.app`) once the MyJKKN port is verified working. **This is a documentation artifact, not an automation script.** Each step requires a human (the Director, with engineering support) to execute and tick off.

## Gating criteria — ALL must be green before Step 1

Per spec line 344–347, the standalone can only be retired after a real BDS learner completes a clinical case through MyJKKN AND the three SQL verifications return positive results:

```sql
-- Gate 1: at least one clinical_case_completed engagement event exists
SELECT count(*) FROM pde_engagement_events
WHERE event_type = 'clinical_case_completed'
  AND learner_id = '<real-bds-student-uuid>';
-- Expected: >= 1

-- Gate 2: that student has a demonstration_score recorded
SELECT demonstration_score
FROM pde_learner_capabilities
WHERE learner_id = '<real-bds-student-uuid>'
  AND capability_id = (SELECT id FROM pde_capabilities WHERE slug = 'clinical_reasoning');
-- Expected: a numeric percentage (the OSCE score)

-- Gate 3: standalone is NOT yet 404 (verify it's still serving — that's the
--          baseline we want to flip after teardown)
-- Manual: curl -I https://aicbl.vercel.app
-- Expected (before teardown): HTTP 200
-- Expected (after teardown):  HTTP 404
```

If ANY gate fails, halt. Investigate. Do not proceed with teardown.

---

## Step 1 — Retire the Vercel deployment

**Target:** `aicbl.vercel.app` (Vercel project under JICATE Solutions team).

**Method (manual, via Vercel dashboard):**
1. Sign in to Vercel dashboard as Director.
2. Navigate to JICATE Solutions team → `aicbl` project → Settings → General.
3. Scroll to "Delete Project" section.
4. Confirm by typing the project name. Vercel will purge all deployments and free up the subdomain.

**DO NOT** use any CLI command that fires the deploy hook — per memory `feedback_vercel_deploy_hook_is_method_agnostic`, a deploy hook URL is method-agnostic. Probing it triggers a real build. Manual UI-driven deletion is the safe path.

**Verification:**
- `curl -I https://aicbl.vercel.app` returns HTTP 404 (or DNS resolution fails).
- Vercel dashboard no longer lists the project.

---

## Step 2 — Close PR #727 (receiver code in MyJKKN)

PR #727 originally shipped the AICBL-receiver path at `lib/pde/external-providers/aicbl/handler.ts` so that AICBL standalone events could push into MyJKKN. Once the port is live, that bridge is redundant — clinical case events flow through `/api/pde/clinical-reasoning/score` directly.

**Method:**
1. On `Jicate-Solutions/MyJKKN`, navigate to PR #727.
2. If PR is still open: close with comment referencing this decommission checklist + spec.
3. If PR is merged: open a new PR that removes:
   - `lib/pde/external-providers/aicbl/handler.ts`
   - Any route registration in `app/api/pde/external-providers/aicbl/route.ts` (if AICBL-specific)
   - Related service files like `lib/services/pde-bridge-service.ts` IF used exclusively by AICBL (verify with `grep -r 'pde-bridge-service' app/ lib/ hooks/ components/` first)
   - Any UI under `/pde/admin/bridge` if AICBL-specific
4. Run `npm run typecheck` and `npm run build` to confirm nothing else depends on the receiver code.
5. Hand the PR to Director for review + merge.

**Verification:**
- `grep -r 'aicbl' app/ lib/ hooks/ components/` returns zero results (or only this checklist).
- `npm run typecheck` passes.

---

## Step 3 — Archive the AICBL standalone repo

**Target:** `/Users/omm/PROJECTS/aicbl` (local) + the GitHub remote (if any).

**Method:**
1. On the local Mac (Mac Claude scope): `git tag final-pre-decommission-snapshot-$(date +%Y%m%d)` to lock the last working state.
2. Push the tag to the remote if it exists.
3. On GitHub: Settings → Archive this repository. Read-only state preserves the history without allowing further commits.
4. On the local Mac: rename folder to `/Users/omm/PROJECTS/aicbl.archived-YYYYMMDD` to prevent confusion.

**DO NOT** delete the folder. The OSCE rubric.ts + extractor.ts IP that this sprint ported originated there; future regression audits may need to compare port-vs-source.

---

## Step 4 — Audit & remove the standalone's Supabase project (jicate-prototypes)

The standalone shared the `jicate-prototypes` Supabase project (ref `ileccfzrcrkoglssvxgm`). It is a multi-tenant prototype container; AICBL was Tenant #1. **DO NOT delete the project** — it is shared. Instead, mark the AICBL-specific rows as decommissioned:

```sql
-- Mark all clinical_case prototype_policies rows as archived
UPDATE prototype_policies
SET is_active = false,
    description = CONCAT(description, ' [ARCHIVED ', NOW()::text, ']')
WHERE policy_key LIKE 'osce.%' OR policy_key LIKE 'aicbl.%';

-- Drop any AICBL-specific RPC functions (verify they're not used by other tenants first!)
-- Manual: list functions with: SELECT routine_name FROM information_schema.routines WHERE routine_schema='public'
```

**Method:** Apply via Supabase Management API (`POST /v1/projects/ileccfzrcrkoglssvxgm/database/query`), one statement at a time, per the pattern from `feedback_supabase_management_api_for_migration_apply`.

**Verification:**
- Query `SELECT COUNT(*) FROM prototype_policies WHERE is_active = true AND policy_key LIKE 'osce.%'` returns 0.
- Other tenant prototypes still function (smoke test each one).

---

## Step 5 — Update institutional documentation

After verified teardown:

1. Update `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_aicbl_project.md` with a teardown timestamp + final disposition.
2. Update the spec file (`specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md`) line 347 status from "pending" to "decommissioned YYYY-MM-DD".
3. If any external stakeholders (Sakthi, Director, accreditation reviewers) have been pointed at `https://aicbl.vercel.app`, send a one-time notice with the new MyJKKN URL: `https://jkkn.ai/pde/learn/cases/leukoplakia`.

---

## Rollback plan (if MyJKKN port turns out broken post-Step-1)

If a real learner reports the MyJKKN flow is broken AFTER the standalone has been deleted (Step 1):

1. Revert PR teardown commits on `Jicate-Solutions/MyJKKN` main.
2. Restore the Vercel project from git: `cd /Users/omm/PROJECTS/aicbl.archived-* && vercel link && vercel deploy --prod`.
3. Direct learners back to the standalone URL while the port is repaired.

This is why Step 1 (Vercel delete) is reversible-via-redeploy, Step 3 (archive) is reversible-via-rename, and Step 4 (rows archived not deleted) is reversible-via-UPDATE. **No step in this checklist is intentionally destructive without a recoverable shadow.**

---

## Sign-off

The checklist is complete when:

- [ ] All three gating SQL queries return expected results
- [ ] `https://aicbl.vercel.app` returns HTTP 404
- [ ] PR #727 receiver code removed via follow-up PR (merged)
- [ ] `/Users/omm/PROJECTS/aicbl` archived (renamed locally + GitHub-archived)
- [ ] `prototype_policies` AICBL rows marked `is_active=false`
- [ ] `reference_aicbl_project.md` updated with final-disposition timestamp
- [ ] `specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md` line 347 marked decommissioned
- [ ] Stakeholder notice sent (if applicable)

Director sign-off: _________________   Date: _________________

---

**Reminder:** This document is the plan. Executing the plan is a separate human-initiated event. Agent E (the spec-build agent that authored this) does NOT execute decommission — that is gated on the verification SQL above + Director go-ahead.
