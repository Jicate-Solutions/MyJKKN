TASK: Take the "ORION casesheet → PDE teaching-case" bridge live. Both halves are built, verified, and open as green PRs; the ₹0 AI recipe is already applied to prod. The single most important thing (user-stated verbatim): **merge + deploy both PRs, set the env vars, then run the FULL end-to-end test** — import a real dental casesheet in the PDE UI, confirm the AI-drafted case renders in the form builder, save it as a draft, and publish. This is the first time the whole PMS→MyJKKN→AI→builder chain runs as one flow (each half was proven independently last session).

PROJECT: /Users/omm/PROJECTS/MyJKKN  (this local clone is branch feat/campus-living-fee-compute-engine — omm-dev, 720+ diverged; all real code shipped via PR branches, NOT here)
PMS REPO: Jicate-Solutions/jkkn-pms-frontend (Next.js 16 + Drizzle + MySQL `jkkn326`, READ-ONLY live clinical DB; a working clone was at /private/tmp/.../scratchpad/pms-src but scratchpad is session-scoped — re-clone if needed)
DATABASE (MyJKKN): Supabase ref kvizhngldtiuufknvehv; mgmt token at ~/.supabase/access-token; app env at /Users/omm/PROJECTS/MyJKKN/.env.production.local (real service key — never echo it)
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (top entry = this session)

MUST READ FIRST (user-stated): the two PRs themselves —
- https://github.com/Jicate-Solutions/jkkn-pms-frontend/pull/1  (PMS de-identified export)
- https://github.com/Jicate-Solutions/MyJKKN/pull/2156           (MyJKKN import route + tab)

CURRENT STATE (as of 2026-07-18 ~10:30):
- PR1 (jkkn-pms-frontend#1, branch feat/pde-casesheet-export): de-identified READ-ONLY export `GET /api/pde-export/casesheet/[id]` + `/search`; bearer-authed (unset⇒503 fail-safe); proxy.ts exempts `/api/pde-export/*`. HEAD 6b5d1d2 (added bearer-guard unit test). No blocking CI on that repo.
- PR2 (MyJKKN#2156, branch feat/pde-import-from-pms): recipe migration + `app/api/pde/cases/import-from-pms/route.ts` + `lib/services/pde/case-author-draft.ts` + `ImportFromPmsTab.tsx` + new-case page wiring. HEAD 7b5669201. CI 18/18 green.
- `pde.case_author` recipe is APPLIED LIVE on prod Supabase (tool_set=none, lane=max, interactive=false, external_allowed=false) and E2E-proven at ₹0 (real job → 7 Qs, weights=100). It is DORMANT until the deployed import route calls it.
- NOT yet done: the two PRs are un-merged; the four env vars are unset; the full chained E2E has never run.

VERIFY CURRENT STATE (run BEFORE any work — state drifts):
- `gh pr view 1 --repo Jicate-Solutions/jkkn-pms-frontend --json state,mergeStateStatus`
- `gh pr view 2156 --repo Jicate-Solutions/MyJKKN --json state,mergeStateStatus`
- `gh pr checks 2156 --repo Jicate-Solutions/MyJKKN` (confirm still green)
- Confirm recipe still present: query ai_job_types where job_type='pde.case_author' via the mgmt token (see progress/memory for the curl pattern).
- If either PR is already MERGED or the recipe is gone → STOP, re-read progress.txt, do NOT re-apply blindly.

WHAT NEEDS TO HAPPEN:
1. Get both PRs reviewed + merged (Director approves; you cannot self-merge multi-tenant PRs). PR2 ships via the normal MyJKKN flow; PR1 merges on jkkn-pms-frontend master.
2. Deploy both apps. MyJKKN: /deploy-myjkkn after merge. PMS: its own deploy (ask Director where PMS is hosted — it's a separate app, likely a separate Vercel/host).
3. Set env (the activation switch): PMS gets `PMS_EXPORT_TOKEN`; MyJKKN gets `PMS_EXPORT_URL` (the PMS base URL) + `PMS_EXPORT_TOKEN` (SAME value). Generate with `openssl rand -hex 32`. You CANNOT set prod secrets yourself — hand the Director exact values/commands.
4. Full E2E on prod: open /pde/faculty/cases/new → "Import from PMS" tab → search a real diagnosis → Draft with AI → confirm the draft populates the builder → Save as draft → open it → publish. Screenshot each step (visual-artifact verification gate).

CONSTRAINTS & RULES:
- JKKN terminology is a ZERO-TOLERANCE blocking CI gate on new copy ("educator"→"Senior Learner" caught this session). Avoid student/faculty/educator/teacher in user-facing strings.
- PMS `jkkn326` is LIVE PRODUCTION, READ-ONLY, no new tables (PMS Rule 7). The export is SELECT-only.
- De-ID is mandatory + already implemented (patient's own name/phone/email read solely to redact + pseudonym + structural PII scrub). RESIDUAL: third-party names in narrative are NOT auto-redacted — faculty review-before-publish is the safeguard (user said carry forward, do NOT reopen unless governance demands).
- Draft-only: AI clinical content is never auto-created; the route returns JSON, faculty saves. Keep it that way.
- At PMS prod cutover (when ALLOWED_CIDRS is armed) the MyJKKN server egress CIDR must be in PMS ALLOWED_CIDRS or the server-to-server pull 403s.

KEY FILES TO READ FIRST:
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_pms_casesheet_to_pde_case_bridge.md — full architecture, contract, gotchas, activation steps
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_myjkkn_full_tsc_ooms_use_scoped_tsconfig.md — how to typecheck MyJKKN without a vacuous OOM pass
- The two PRs (above)

KEY DECISIONS MADE THIS SESSION (with rationale):
- Chose server-to-server pull + AI-assisted authoring (levels 2+3), per user, over the simpler paste-JSON bridge.
- Chose to have the import route RETURN the assembled case (not write it) so the AI draft is human-reviewed in the builder before any DB write — reuses the existing handleImport path and avoids refactoring the create route (smaller, safer diff).
- Chose an INTERNAL MyJKKN AI job (fn_ai_enqueue_system), NOT the b2a external door — MyJKKN is the one wanting AI here, so the external door was unnecessary.
- Chose interactive=false on the recipe (chat drain refuses non-chat jobs; interactive=true fails 100% — prior bug.triage incident).
- Chose to de-identify by reading the patient's OWN identifiers solely to redact them (known-identifier redaction) after a poisoned-field test proved structural-pattern scrubbing alone leaks names.

APPROACH: Sequential. Verify state → get merges → deploy → set env (Director) → walk the E2E as a real faculty user (persona-harness or Director login) with screenshots. This is a ship + verify session, not a build session — no new features unless the E2E surfaces a bug.

QUALITY BAR: A real de-identified casesheet becomes a published PDE clinical_case, end to end, with every step screenshotted; ₹0; no PII in the created case; nothing auto-published without a human click.

DO NOT:
- Do NOT re-apply the pde.case_author recipe blindly — it's already live (verify first).
- Do NOT touch jkkn326 with any write.
- Do NOT auto-merge the PRs (multi-tenant; Director approves).
- Do NOT reopen the third-party-name de-ID residual (user chose to accept faculty-review).
- Do NOT trust a full-project `tsc` "0 errors" — it OOMs vacuously; use a scoped tsconfig.

VERIFY BY (post-execution): screenshots of the full import→draft→save→publish flow on prod; the created case's case_scenario contains a pseudonym (not a real name); the AI job ran on the max lane at ₹0.
