TASK: Get real clinical images (radiographs, intra-oral photos, OPG/IOPA) out of the live PMS casesheet system and into published PDE teaching cases on MyJKKN. The text bridge is already LIVE on real patient data — a real de-identified casesheet becomes an AI-drafted, faculty-reviewed, published clinical case a learner can attempt. But the export payload is TEXT-ONLY: no image, photo, radiograph, media, attachment, file, or URL field exists anywhere in it. Meanwhile MyJKKN already has both halves of the receiving end built and unused — the case builder has an "Optional patient image URL" field writing `case_scenario.image_url`, and the question-type enum includes `image_tag` ("Image Tag (Click Region)") with a full region-drawing authoring component (`ImageTagRegionAuthor.tsx`) and a learner-side `ImageTagQuestion.tsx` — all currently unusable because no image ever arrives. Closing this gap means: find where casesheet images physically live in PMS, de-identify the FILE (not just the surrounding record — images carry EXIF/DICOM metadata the text scrubber never touches), choose a delivery mechanism, and wire it to the two fields that already exist.

PROJECT: /Users/omm/PROJECTS/MyJKKN
PMS REPO / SERVER: `Jicate-Solutions/jkkn-pms-frontend`, self-hosted at `https://jkknsmilecare.com/app` (Next.js `next start` on 127.0.0.1:3002 + cloudflared; the `/app` basePath is PART of every URL — omitting it 404s). **The Mac session has NO terminal access to that box.** A separate SERVER Claude session runs ON the PMS Linux machine and is the ONLY one that can read MySQL `jkkn326`, inspect the filesystem, or change PMS code. All PMS-side work must be delegated by WRITING A PROMPT for the user to paste into the server session. Runbook + handoff: `ops/CUTOVER-RUNBOOK.md` and `ops/PDE-BRIDGE-HANDOFF.md` (in the PMS repo, not here).
DATABASE: MyJKKN → Supabase project ref `kvizhngldtiuufknvehv`; creds in `/Users/omm/PROJECTS/MyJKKN/.env.local` and `/Users/omm/PROJECTS/MyJKKN/.env.production.local` (read the file, never paste keys into chat; values carry a literal `\n` suffix — strip it). PMS → MySQL `jkkn326` (LIVE, read via a SELECT-only account through `PDE_EXPORT_DATABASE_URL`; the PMS app itself stays on `jkkn326_dev`). Vercel project `my-jkkn` (prj_yH37MwPX0aAAUXNjZX1YlOHoowRM, scope jicate-solutions) already holds PMS_EXPORT_URL, PMS_EXPORT_TOKEN, PMS_CF_ACCESS_CLIENT_ID, PMS_CF_ACCESS_CLIENT_SECRET in Production.
SPEC: /Users/omm/PROJECTS/MyJKKN/specs/carre-audit-pde-module-2026-07-21.md · /Users/omm/PROJECTS/MyJKKN/specs/PDE-PRINCIPAL-DEVELOPMENT-ENGINE-SPEC.md · /Users/omm/PROJECTS/MyJKKN/specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (top entry = the session that produced this brief)

CURRENT STATE (as of brief-write time):
- Bridge LIVE on REAL patient data, bridge-only. Two locks proven from outside: Cloudflare Access service-token wall on `jkknsmilecare.com/app/api/pde-export` (no CF headers → 403 at the edge, while `/app/login` still 200) + bearer token; origin loopback-bound. Bearer rotated (chat-leaked value dead).
- E2E proven in the UI on real data, BOTH entry paths: paste-an-ID → published case `f0fa9b56-fbce-46ba-8570-b6b964b7a876` ("Pit and fissure caries — Patient T, 12F", 7 AI questions, ₹0); search-by-diagnosis "caries" → 9+ real de-identified cases (Patients C/F/G/L/M/P/R/T/Z).
- **Export payload proving images are absent** — verified live, top-level keys are exactly: `source`, `case_scenario`, `facts`, `suggested_title`. `case_scenario` keys are exactly: patient_name, age, gender, occupation, chief_complaint, hopi, medical_history, habit_history, additional_clinical_details. ZERO occurrences of image/photo/radiograph/xray/opg/iopa/media/attachment/file/url in the whole payload.
- **MyJKKN already supports images** (all on `jicate/main`, NOT in this omm-dev checkout): `app/(routes)/pde/faculty/cases/_components/CaseFormBuilder.tsx` line ~353 renders "Optional patient image URL" writing `scenario.image_url`; `image_tag` question type validates `q.question_media_url` + requires ≥1 drawn region; authoring UI `ImageTagRegionAuthor.tsx`; learner UI `app/(routes)/pde/learn/cases/[caseSlug]/_components/ImageTagQuestion.tsx`. Enum defined in `supabase/migrations/20260522_pde_assessment_questions_clinical_q_types.sql`.
- PDE module has ZERO real learner participation (all pde_* tables 0 rows). The 222 `pde_demonstrations` rows are BACKFILL, not usage — never cite them as participation. CARRE v2 audit scored 35/100, "Do not scale; rebuild the experience layer."
- Branch (repo root): `feat/campus-living-fee-compute-engine`, last commit `08669f67a` (docs only). Build green; prod deploy `my-jkkn-gyav854n6` Ready. All CODE ships via worktree PRs off `jicate/main`, never from this checkout.

VERIFY CURRENT STATE (run BEFORE any work — state may have drifted):
- Confirm the CF wall still holds: `curl -s -o /dev/null -w "%{http_code}\n" https://jkknsmilecare.com/app/api/pde-export/search?q=caries` → expect **403**; and `curl -s -o /dev/null -w "%{http_code}\n" https://jkknsmilecare.com/app/login` → expect **200**.
- Confirm both locks + payload shape together: read the 4 secrets out of Vercel/`.env.production.local`, call the export search endpoint with `Authorization: Bearer …` + `CF-Access-Client-Id` + `CF-Access-Client-Secret`, pipe through `jq 'keys'` and `jq '.case_scenario | keys'`, then `grep -icE "image|photo|radiograph|xray|opg|iopa|media|attachment"` on the raw body → expect **0**. If a Sensitive var reads back empty, that means nothing — verify by behaviour (curl), never by read.
- Confirm the published case still exists: query Supabase `pde_assessments` for id `f0fa9b56-fbce-46ba-8570-b6b964b7a876` and check `status='published'` — a case silently reverted to draft once before, and the revoke path does not bump `updated_at`.
- Confirm the receiving code is still on main: `git fetch jicate main && git ls-tree jicate/main -r --name-only | grep -iE "ImageTagRegionAuthor|ImageTagQuestion|import-from-pms"`.
- **If reality differs from this brief → STOP, report, do NOT execute the stale plan.**

WHAT NEEDS TO HAPPEN:
1. **Phase 1 — READ-ONLY investigation on the PMS server (delegated).** Write a prompt for the user to paste into the SERVER session. It must instruct that session to answer, read-only, with actual command output as evidence: (a) where casesheet images physically live — MySQL BLOB/LONGBLOB columns, a filesystem upload directory, an object store, or a separate imaging/PACS system; (b) the exact table+column or directory path, and how a row links to a casesheet id; (c) how many casesheets have at least one image, and the distribution (images per case); (d) file formats and sizes (`file`/`identify` on a sample — JPEG/PNG/DICOM/proprietary); (e) what embedded metadata each format carries (`exiftool` on a sample: patient name, DOB, MRN, study date, device serial, operator, GPS); (f) whether any image is burned-in-annotated with identifiers in the PIXELS (a name overlay on a radiograph survives every metadata scrub). The prompt must state explicitly: SELECT-only, no writes to `jkkn326`, no schema changes, do not flip the PMS app off `jkkn326_dev`, and do not paste patient identifiers back into chat — report counts and column names, not values.
2. **Phase 2 — de-identification design.** Based on Phase 1's answers, specify the scrub: strip ALL EXIF/IPTC/XMP (and DICOM tags if DICOM appears), re-encode rather than trust in-place tag deletion, and decide the burned-in-pixel policy (reject, crop, or faculty-redact — do NOT auto-publish a burned-in image). Define an assertion that runs on every exported file and fails closed.
3. **Phase 3 — delivery mechanism.** Choose between short-lived signed URLs served from PMS through the existing CF-Access + bearer wall, versus copy-into-MyJKKN-Supabase-storage at import time. Weigh: the learner's browser must load the image (a CF-Access-walled URL will NOT render for a learner — this likely forces copy-into-MyJKKN), link rot, and the fact that a stored copy makes MyJKKN a holder of clinical imagery with its own retention question. Decide, document, then extend the export payload with an additive `images: []` array (do not reshape existing keys — the text path is live).
4. **Phase 4 — MyJKKN wiring.** Import route + `ImportFromPmsTab` accept the new `images` array; populate `case_scenario.image_url` for the scenario image; make `image_tag` usable by feeding `question_media_url` from an imported image so the faculty region-drawing UI (`ImageTagRegionAuthor.tsx`) works; teach the AI case-author recipe that an image exists so it can propose an image_tag question. Ship as a worktree PR off `jicate/main` via `/ship-myjkkn`, then `/deploy-myjkkn`.
5. **Phase 5 — E2E on prod with a real image**, faculty-reviewed, then published, then rendered on the learner attempt page.
6. **Carried, do NOT drop:** [P1] distribution gap — no learner case list at `/pde/learn/cases`, no assign-to-cohort (blocks every CARRE pillar); [P2] rotate the CF service token + bearer (both appeared in chat) and re-tick Sensitive; [P2] builder shows no toast on save-500 (rule-27 silent failure); [P2] revoke-to-draft does not bump `updated_at`.

CONSTRAINTS & RULES:
- **JKKN terminology is a zero-tolerance CI gate** — "students" must be "learners", etc. A terminology violation fails the build for everyone.
- **PMS Rule 7: `jkkn326` is READ-ONLY. No new tables, no writes, ever.** Enforced by DB grant (INSERT/UPDATE → 1142) — keep it that way.
- **Do NOT flip the PMS app off `jkkn326_dev`.** Bridge-only is a Director decision; the whole app shares one connection and flipping it breaks registration/casesheets/billing.
- **De-ID is mandatory and images are a NEW attack surface**: the existing text scrubber does not touch file internals. Metadata and burned-in pixels both leak. Faculty review before publish is a hard gate, not a nicety.
- Consent/ethics sign-off was waived by the Director on 2026-07-20 (learning-purpose); de-ID + faculty review ARE the operative safeguards — do not weaken either.
- **Env-only Vercel changes cannot deploy** (hook and `vercel redeploy` both auto-cancel on empty diff; `--force` upload is flaky) → ship a one-line no-op comment PR touching a CODE file (not supabase//docs//specs//.claude//.github//*.md — those are excluded from the diff), merge, then fire the hook.
- **Vercel Sensitive env vars read back EMPTY.** Never conclude "not set" from an empty read — verify by curl.
- Cloudflare Access policies must be created STANDALONE under Access → Policies (Action = Service Auth), then attached to the app. Policies built inside the app builder silently don't save and the toast lies.
- Any new SECURITY DEFINER RPC needs explicit `REVOKE EXECUTE … FROM anon, PUBLIC`.
- Merge ≠ deploy — verify code is live BY CONTENT (read a runtime artifact), not by a "Ready" badge that may predate the merge.
- Never run `npm run dev` from this omm-dev checkout (720+ commits diverged, missing the PMS bridge entirely) — use a `jicate/main` worktree.

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/progress.txt — top entry is the full state of this work.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_pms_casesheet_to_pde_case_bridge.md — the bridge's complete history, wiring, and residuals.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_pde_module_zero_participation.md — why "222 demonstrations" is a trap and why distribution is the real blocker.
- /Users/omm/PROJECTS/MyJKKN/specs/carre-audit-pde-module-2026-07-21.md — 35/100 verdict and the 12 findings images are meant to serve.
- `git show "jicate/main:app/(routes)/pde/faculty/cases/_components/CaseFormBuilder.tsx"` — the receiving `image_url` field and `image_tag` validation (line ~181 and ~353).
- `git show jicate/main:app/api/pde/cases/import-from-pms/route.ts` — the import route that must learn to accept images.
- `git show "jicate/main:app/(routes)/pde/faculty/cases/_components/ImageTagRegionAuthor.tsx"` and `.../pde/learn/cases/[caseSlug]/_components/ImageTagQuestion.tsx` — the already-built authoring + learner halves.
- /Users/omm/PROJECTS/MyJKKN/CLAUDE.md — production-sweep rule, ship/deploy discipline, RLS conventions.

KEY DECISIONS MADE THIS SESSION (with rationale):
- Chose **bridge-only real-data access** over flipping the whole PMS app to `jkkn326` because the app shares one DB connection and a flip would break every write feature (registration, casesheets, billing) institution-wide.
- Chose a **dedicated SELECT-only MySQL account + separate pool** over reusing the existing "read-only" config because that config turned out to be root WITH GRANT OPTION — the SELECT-only account is the first real wall.
- Chose a **Cloudflare Access service-token wall + loopback-bound origin** over bearer-token-only exposure because a bearer alone that had appeared in chat can never guard real patient records; the CF wall kills unauthenticated requests at the edge before they reach the app.
- Chose a **standalone CF policy attached to the app** over one built in the app builder because builder-created policies silently fail to save while showing a success toast.
- Chose to **ship the text bridge first and defer images** because text de-ID was provable on the wire in one session, while image de-ID is a different, harder problem (metadata + burned-in pixels) that would have blocked go-live.
- Chose **counts-not-values reporting** for anything the server session reads, because the Mac session's chat is not a safe place for patient identifiers.

APPROACH:
Two-session split is the governing constraint. The Mac session owns MyJKKN/Vercel/Supabase and can curl the PMS edge from outside, but cannot see inside the PMS box. So: start with the read-only verification curls above (Mac can do these alone), then WRITE the Phase 1 investigation prompt as a self-contained block the user pastes into the server session — assume that session knows nothing, restate Rule 7 and the no-identifiers-in-chat rule inside the prompt itself, and ask for command output as evidence rather than conclusions. While waiting on the server answer, do the Mac-side work that needs no PMS knowledge: read the four receiving components off `jicate/main`, map exactly which fields the import route must populate, and check whether Supabase storage buckets/RLS for clinical imagery exist or must be created. Only design delivery (Phase 3) after Phase 1's facts land — where the images live determines whether signed URLs are even possible.

QUALITY BAR:
A real de-identified clinical image (radiograph or intra-oral photo) from a live `jkkn326` casesheet is visible inside a PUBLISHED PDE teaching case on prod, rendered on the learner attempt page — with `exiftool` output on the delivered file showing zero patient identifiers, zero device/operator tags, and no burned-in identifier in the pixels (eyeballed, per rule 25 — automated checks do not catch pixel-level leaks), and a faculty member having reviewed it before publish. Bonus bar: one `image_tag` question with a drawn region that a learner can actually click.

DO NOT:
- Do NOT write to `jkkn326` in any form, or create tables/columns there.
- Do NOT change the PMS app's `DATABASE_URL` off `jkkn326_dev`.
- Do NOT attempt PMS-side investigation or edits from the Mac session — delegate via a written prompt.
- Do NOT publish any case containing an image until its metadata is proven clean AND a human has eyeballed the pixels.
- Do NOT paste patient names, DOBs, MRNs, phone numbers, or raw image metadata values into chat.
- Do NOT reshape the existing export payload keys — the text path is live on real data; add `images` additively.
- Do NOT run the dev server or test from this omm-dev checkout.
- Do NOT count `pde_demonstrations` as learner participation in any claim.
- Do NOT merge/deploy on your own judgment where the Director's approval is the gate.

VERIFY BY (post-execution):
- `curl` the export endpoint with both locks → `jq '.images'` returns a populated array on a case known to have images, and `jq 'keys'` still shows the original four top-level keys intact.
- `exiftool` (or equivalent) on a delivered file → no patient/device/operator/GPS tags; file re-encoded, not just tag-stripped.
- Screenshot of the learner attempt page on prod showing the image rendered, and the image_tag region clickable — eyeballed, saved to the scratchpad.
- Supabase query confirming the case row carries `case_scenario.image_url` (and `question_media_url` on the image_tag question) and `status='published'`.
- CF wall still returns 403 unauthenticated after any PMS change; `/app/login` still 200.
- `git ls-tree jicate/main` shows the shipped files actually reached main (stacked/early-merged PRs have silently orphaned commits before), and the deployed bundle contains the new code by content.
