# Session Feedback — NotebookLM measurement reframe (Rank 2)

**Date:** 2026-07-24
**Author:** Director interview 2026-07-23/24 (verbatim), built by Claude
**Status:** spec → build → Draft PR (Director reviews; never self-merge/deploy/apply-migration)
**Module:** learner feedback form + the checklist config substrate

---

## Why

`session_feedback.checklist.notebooklm_used` (a yes/no "NotebookLM was used properly in
this class" tick) is **saturated: 96.6% "yes"** (47,739 / 49,430 rows since 2026-06-08),
per-facilitator stddev only 4.1 — it cannot discriminate anything. A metric everyone
answers the same way measures nothing.

## Decision (locked — do not re-litigate)

Replace the yes/no with a **feature checklist**: the learner ticks **which NotebookLM
materials they actually used** this session — audio overview, video overview, slide deck,
mind map, report, flashcards, quiz, infographic, chat — plus a neutral **"No NotebookLM
this session."** This de-saturates the signal (different learners use different materials,
or none). The Senior Learner "shared" side and the link+opens objective trace are **Rank 3**
(pre-session posting) — they combine with this checklist there.

## Scope of THIS PR (coherent slice)

The **learner "used" capture**. Deliberately out of scope (→ Rank 3, their natural home):
the Senior Learner "shared" capture and the combined shared-vs-used / link-opens display.

## Design — why NOT config-checklist items

The generic checklist-config mechanism can't hold these features, because the carry-forward
RPC computes "unmet items" as `config items (is_active=true) where checklist[key] = false`.
If the 9 features were config items, a learner who used the audio overview but not the quiz
would get "you didn't use the quiz — better this time?" re-asked next session. Nonsense.

So the features live **outside** the config/unmet universe:
- Stored in `session_feedback.checklist` under **reserved keys** `nblm:audio_overview` …
  `nblm:chat`, `nblm:none`. These are booleans (the checklist type is unchanged) but are
  **not config item_keys**, so the carry-forward RPC never sees them.
- The feature taxonomy is a fixed product list, hardcoded in one shared constant
  (`lib/session-feedback/notebooklm-features.ts`) so Rank 3's Senior-Learner-shared side + any
  display read the SAME list — no copy-paste mirror drift.
- No RPC change (the submit RPC stores arbitrary checklist JSONB) → no new SECDEF → no
  anon-revoke needed. No new table.

## `notebooklm_used` retirement + ordering

- The learner form **filters `notebooklm_used`** out of the rendered config items AND out
  of the carry-forward "flagged missing" labels — so the old yes/no disappears and never
  re-asks, immediately, client-side.
- A migration **deactivates** the platform-default `notebooklm_used` config row
  (`is_active=false`). Historical `checklist.notebooklm_used` stays fully readable (49k rows).
- **Ordering note:** MyJKKN deploy ships CODE before migrations apply (migrations are
  Director-triggered one-click apply). Pre-apply the UX is already clean (the form hides
  it); the only residual is the carry-forward RPC still counting an un-ticked
  `notebooklm_used` toward "unmet" on the backend until the migration lands — invisible in
  the UI (the label is filtered), bounded, self-heals on apply. **Apply the migration with
  the deploy.**

## Files

- `lib/session-feedback/notebooklm-features.ts` — NEW shared taxonomy constant.
- `app/(routes)/learners/class-feedback/_components/feedback-dialog.tsx` — filter
  `notebooklm_used`; add the "Which NotebookLM materials did you use?" multi-select
  (features + neutral "None", mutually exclusive with the features).
- `supabase/migrations/<ts>_scf_notebooklm_feature_checklist.sql` — deactivate the
  `notebooklm_used` config row (idempotent UPDATE; no RPC, no table).

## JKKN terminology

New copy uses **session** and **learner** (implicit "you") — never the legacy role/place terms.

## Verification

- Scoped `tsc` (0 new errors vs baseline) + terminology delta-gate.
- Deterministic logic check: "None" clears features and vice-versa; `nblm:*` keys never
  appear in the config-item / unmet universe.
- Render-as-learner: the feedback dialog shows the feature multi-select and no longer shows
  the old "NotebookLM was used properly" yes/no.
