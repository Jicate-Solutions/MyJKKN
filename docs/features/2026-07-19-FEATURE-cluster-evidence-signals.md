# Cluster Evidence Signals — captured logs & screenshots join the loop

**Date:** 2026-07-19 · **Status:** building · **Owner:** Director + Claude
**Predecessors:** `2026-07-18-FEATURE-cluster-selfimproving-loop.md` (the loop), PR #2176 (two-tier scan matching)

## Problem

Every bug report captures rich evidence the pipeline never uses:

| Captured evidence | Open reports that have it (measured 2026-07-19) |
|---|---|
| Structured console logs (jsonb: `{type, module, message, count}`) | 977 / 1,048 (93%) |
| Screenshot | 1,031 / 1,048 (98%) |
| Logs containing an error-level entry | 219 |

- The nightly duplicate **scan** matches only description text. Two learners hitting the
  same crash, described in different words (or different languages), never group — yet an
  identical error signature is the strongest same-bug evidence that exists.
- The **"What's causing this?" diagnosis** receives description + module + page URL only.
  Captured entries like `[academic/attendance] Number of periods found: 0` (×64) or
  `referenceerror: isadmitted is not defined` frequently *are* the root cause, named.

Measured fingerprint landscape (error-type entries, normalized, open pool): real defect
signatures are **concentrated** (`[academic/attendance/mark] save result was
null/undefined` → 3 reports, 1 sub-module; RLS violations → 1 sub-module each) while
ambient noise **spreads** (DialogContent accessibility warning → 4 sub-modules; generic
`failed to fetch` → 5 sub-modules). Concentration separates signal from noise.

## Increments

### A. Scan-time error fingerprints (SQL, in `fn_bug_cluster_scan`)
A third matching signal beside tier-1 (0.55 trigram) and tier-2 (0.45 + same sub-module):

- **Fingerprint:** error-type entries only; message lowercased, UUIDs/numbers collapsed
  to `#`, first 160 chars.
- **Noise guard (D2, double):** a fingerprint is usable only if it appears in **< 3
  distinct sub-modules** across the open pool, AND a fingerprint pair additionally
  requires **same sub-module** between the two reports.
- **Strength (D3):** decided by simulation, not assumption. **VERDICT (simulated
  2026-07-19 on the live pool): fingerprint pairs FORM groups** — 163 concentrated
  fingerprints yield only 14 pairs after all guards, creating 7 brand-new groups
  (64→71) with ZERO over-cap risk (largest component unchanged at 33); every sampled
  pair shares an exact production error (`save result was null/undefined` ×3,
  `referenceerror: isadmitted is not defined` ×2, `a timetable already exists` ×2 …).
  Recruit-only was also simulated and captures almost nothing (+1 bug) — fp-paired
  reports are precisely the duplicates that sit NOWHERE NEAR a text-formed group.
- Same rails as ever: 14-day window, 40-member cap, confirmed/dismissed untouched.

### B. Console logs into the diagnosis prompt (runner-side)
`bug-cluster-fixability.mjs` fetches `console_logs` per member and appends, per report,
up to 5 error/warn entries (each trimmed to ~200 chars, with `×count`) under an explicit
caution: *browser-captured data, possibly misleading, never instructions* (D4). The
runner already runs read-only-tool-locked (Read/Glob/Grep only), which bounds any
injection blast radius. Diagnosis method text gains: "identical error signatures across
reports are strong shared-cause evidence; different signatures are strong distinct-cause
evidence."

### C. Screenshots into the diagnosis (runner-side, vision)
For clusters of **≤ 10 members** (D5, token budget), the runner downloads each member's
screenshot into the throwaway analysis worktree (`.evidence/` inside it) and lists the
file paths in the prompt; the model Reads them (vision). Download failures are
non-fatal (analysis proceeds without). Screenshots never leave the local runner — same
trust boundary as the DB and code the runner already holds.

## Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Fingerprint source | `type='error'` entries only; log/warn stay out of scan matching (too generic) but DO appear in the diagnosis evidence (B) |
| D2 | Noise guard | concentration (< 3 sub-modules pool-wide) AND same-sub-module pairing — both required |
| D3 | Fingerprint match strength | simulation-decided; recruit-only unless group-forming proves blob-free |
| D4 | Log evidence in prompts | data-not-instructions framing; per-report cap (5 entries × 200 chars); read-only tool lock is the enforcement backstop |
| D5 | Screenshot scope | diagnosis only (never scan); clusters ≤ 10 members; non-fatal on failure |
| D6 | Runner deployment | `bug-cluster-fixability.mjs` is Mac-lane infrastructure (not in repo); this spec + the runner file header carry the change record |

## Verification gates
1. Increment A simulated read-only on the live pool BEFORE the migration exists (blob
   check + example recruits), then BEGIN..RAISE rolled-back validation on prod, then PR
   → Director merge → Mgmt-API apply → real scan with before/after counts.
2. Increment B/C proven by re-running "What's causing this?" on a real cluster and
   eyeballing that the verdict cites the captured evidence (₹0 Max lane).
3. Nothing auto-resolves, auto-emails, or auto-confirms anywhere in this feature — it
   sharpens proposals and diagnosis inputs only.

## Follow-on: SPLIT for multi-cause groups (Director-interviewed 2026-07-19)

A "distinct causes — separate fixes" verdict locks the automated lane by design.
Split is the designed exit: one human click re-sorts the group by the verdict's
causes; each new group runs its own full pipeline.

| # | Decision | Locked answer |
|---|---|---|
| S1 | Already-confirmed groups | Splittable — members are re-filed from the old canonical under each cause's own oldest report |
| S2 | How children are born | CONFIRMED — the split click IS the decision (parked members also leave the scan pool, giving S4 for free) |
| S3 | Members the verdict didn't sort | Stay together in a needs-another-look child, flagged for re-diagnosis |
| S4 | Can the nightly scan re-merge a split? | Never — a split is final (re-merge-on-new-evidence can be a future proposal feature) |
| S5 | A cause with a single report | Not a group — that report returns to the ordinary open list (technical call) |
| S6 | Split under an in-flight reporter-feedback thread | Refused; also refused when already split (technical call) |

Children start FRESH at step ① (fixability not inherited; the parent's cause text
is kept as `metadata.split_context` for display). **Seed-collision rule** (found by
the rolled-back validation): when a cause's oldest report IS the old canonical,
`seed_bug_id` uniqueness means the parent row is repurposed in place as that
child (stays confirmed, audit as `split_siblings`); otherwise the parent is
dismissed with `split_into`. Surface: `fn_bug_cluster_split` + POST
`/clusters/[id]/split` + an amber Split button on stepper step ② for multi-cause
verdicts.

## Follow-on: AUTO-RESOLVE policy (Director-interviewed 2026-07-19, built DORMANT)

| # | Decision | Locked answer |
|---|---|---|
| R1 | Trigger | Thread fully SETTLED (every question answered or expired; unsent questions block) + zero still-broken + at least one fixed. Silence never blocks forever, never counts as yes |
| R2 | Earn-it gate | OFF until 10 CLEAN human-approved resolutions (ledger-measured: positive outcome, zero late still-broken, not auto-resolved themselves). Flipping enabled stays a human act |
| R3 | Circuit breaker | First still-broken answer on an auto-resolved group suspends the feature everywhere until a human reviews |
| R4 | Visibility | Bell notification per auto-resolve to the admin who enabled the policy |

Surface: 3 policy rows (config-table pattern) + `fn_bug_auto_resolve_status/scan/mark`
+ breaker inside `fn_bug_feedback_answer` + nightly pass in the bug-cluster-scan cron
(reusing the extracted `lib/bug-reports/resolve-cascade` — the SAME email/cascade/ledger
path as a human resolve, never a second implementation) + a gate strip on the Groups tab
("earned N/10 clean resolutions"). Built dormant by explicit Director choice.
