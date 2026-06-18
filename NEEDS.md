# NEEDS — feat(meetings): institution-manager analytics tier

This branch is intentionally scoped to 4 files (service, hook, page, one migration)
and does NOT touch shared registries. The following are owned by the lead's
reconcile PR or by a follow-up; they are documented here, not edited in this branch.

## Permission key (assumed to exist via lead's reconcile PR)
- **`meetings.analytics.view`** — already consumed by the existing
  `app/(routes)/meetings/analytics/page.tsx` `PermissionGuard`
  (`module="meetings" action="analytics.view"`) on production main, and now also
  by the new institution-tier RPCs' permission gate
  (`user_has_permission('meetings.analytics.view')`).
  It is **not yet present** in `lib/constants/permissions.ts` (only
  `meetings.view` exists in the `meetings` module block, line ~1931).
  Per the build prompt, the lead's reconcile PR adds this key — this branch
  assumes it lands. No other new permission keys are required by this feature.

## Migration (NOT applied — review + apply with the reconcile PR)
- `supabase/migrations/20260619000300_meeting_analytics_institution_rls.sql`
  adds two additive, anon-locked SECURITY DEFINER RPCs:
  - `fn_meeting_analytics_summary_institution(p_from, p_to, p_institution_ids)`
  - `fn_meeting_routing_distribution_institution(p_from, p_to, p_institution_ids)`
  plus a supporting index `idx_mb_institution_start`.
  It consumes (never edits) the canonical fns `is_super_admin`, `is_admin`,
  `user_has_permission`, `role_has_institution_access`, and
  `get_user_accessible_institutions`. Ends with `NOTIFY pgrst, 'reload schema';`.
  **Do NOT apply until the `meetings.analytics.view` key exists**, otherwise
  every non-admin caller will be denied by the permission gate.

## Generated types
- The two new RPCs are not in `types/supabase.ts`. The service casts
  `(supabase as any).rpc(...)` for those two calls to keep TypeCheck green,
  per the build prompt's instruction. Regenerate types post-merge if desired.

## Out of scope (deliberately untouched)
- `lib/constants/permissions.ts`, `lib/sidebarMenuLink.ts`, `vercel.json`,
  `types/supabase.ts`, `lib/navigation/route-manifest.generated.ts`
  (the build regenerated the manifest locally; that change was reverted, not committed).
- `supabase/SQL_FILE_INDEX.md` was NOT edited to avoid the EOF-append conflict
  class with concurrent migration PRs; add the index entry during reconcile.
