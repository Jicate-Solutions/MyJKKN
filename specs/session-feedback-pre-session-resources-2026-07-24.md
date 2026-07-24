# Pre-session setup — post materials + objective opens trace (Rank 3, slice a)

**Date:** 2026-07-24
**Author:** Director interview 2026-07-23/24 (verbatim), built by Claude
**Status:** spec → build → Draft PR (Director reviews; never self-merge/deploy/apply-migration)
**Module:** session-feedback / class materials

---

## Why
Rank 2 made the NotebookLM signal a learner self-report ("which materials I used"). The
Director also wants the **objective** counterpart: a Senior Learner posts the NotebookLM
link/material **before class** (any time ahead), and the platform **logs which learners
opened it** — the "was it actually used" trace that pairs with the self-report.

## Scope of THIS slice (3a)
Post a session material + log opens + surface to learners. **Deferred to slice 3b:** the
Live-Pulse pre-build (prepare-poll-ahead / open-on-attendance-marked / auto-open-at-
class-end / move-on-reschedule / tuck-on-cancel) — a separate substrate feature.

## Decisions (locked)
- **Any Senior Learner of the course** (or HOD/admin of the institution) can post — reuse
  `_fn_curriculum_class_ctx(tt, date, period, require_manage := true)`, the exact authority
  the topic-linking already uses ("a topic can be set BEFORE the poll opens").
- Post **any time ahead** — the resource is anchored to the session (timetable_id,
  attendance_date, period_id), independent of whether a poll/attendance exists yet.
- **Log learner opens** — one row per (resource, learner) with first/last opened + count.
  The Senior Learner sees an **aggregate open count** (adoption), never who.

## Substrate (new)
Two tables, SECDEF-only (RLS on, NO permissive policies — same pattern as
`class_session_lesson`):
- `session_resource` — id, institution_id, timetable_id, attendance_date, period_id,
  course_id, kind ('notebooklm' | 'material' | 'other'), title, url, posted_by, posted_at,
  is_active.
- `session_resource_open` — id, resource_id (FK, cascade), learner_id, first_opened_at,
  last_opened_at, open_count. UNIQUE (resource_id, learner_id).

Four SECDEF RPCs (all `REVOKE EXECUTE FROM anon, PUBLIC; GRANT authenticated, service_role`):
- `fn_scf_post_session_resource(tt, date, period, kind, title, url)` — manage authority.
- `fn_scf_resources_for_session(tt, date, period)` — active resources + the caller's own
  `opened` flag + total `open_count`. **Authenticated read** (study links are class-shared,
  not sensitive — so no fragile attendance-blob gate; documented choice).
- `fn_scf_log_resource_open(resource_id)` — upserts the caller-learner's open row.
- `fn_scf_deactivate_session_resource(resource_id)` — manage authority (mis-post cleanup).

## UI
- **Senior Learner** (their session-feedback page): a "Pre-session materials" control to
  post a NotebookLM link for a recent/upcoming session and see its open count.
- **Learner** (class-feedback pending list): each pending session shows its posted
  materials; tapping a link logs an open and opens it in a new tab.

## JKKN terminology
New copy uses **session**, **learner**, and **Senior Learner** — never the legacy role/place terms.

## Ordering
New tables + RPCs — the migration must apply before the UI reads them (Director one-click
apply). Until applied, the RPCs 404; the UI degrades gracefully (empty/absent, no crash).
Apply with the deploy.

## Verification
- Scoped `tsc` (0 new errors) + terminology + the anon-revoke gate (4 new SECDEF RPCs).
- Migration applied + impersonated in a rolled-back prod txn: a Senior Learner posts,
  another course's Senior Learner is rejected, a learner opens + the count increments,
  anon can't execute.
- Render-as-learner + render-as-Senior-Learner (worktree dev server).
