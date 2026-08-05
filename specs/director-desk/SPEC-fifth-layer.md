# The FIFTH layer — edge middleware

**Status:** fold this into `specs/director-desk/SPEC.md` when both this branch and
`feat/director-desk-spine` are on `main`. It is a separate file only because
`SPEC.md` does not exist on `main` yet, and a PR that re-added it would collide
with the spine PR — a merge conflict here reads as an auto-merge problem and
costs a session to diagnose.

---

## What SPEC.md says today, and why it is wrong

> Change those two, and a handover unlocks all four layers of any page at once
> (page gate · RLS · RPC · API route).

There are **five**, and the fifth runs **first**.

`proxy.ts` — Next 16's renamed `middleware.ts`, at the repo root — enforces the
route's `MENU_PERMISSIONS` key server-side, and it does so by reading
`custom_roles.permissions` for `profiles.role` **alone**. It never calls
`user_has_permission()`. It never calls `fn_my_handover_permissions()`.

So a handover never reached the other four. The receiver was redirected to
`/unauthorized` before the page rendered and before one RLS query was issued,
with every server-side piece of the spine working correctly behind it.

### The cruel inversion that hid it

`proxy.ts` exempts eleven role strings — `super_admin`, `administrator`,
`faculty`, `staff`, `student`, `guest`, `driver`, `hod`, `admission`,
`registrar`, `principal`. For those it leaves `userPermissions` undefined, which
`routeMatcher.hasAccess()` reads as "allow; the client enforces the detail".

So the feature **worked for HODs** and **failed for the C-suite it was built
for**. 185 production profiles sit outside that list: `ceo` (2), `coe` (6),
`chief_warden` (2), `cao` (1), `cbo` (1), `executive_admin_officer` (1) and more.
Hand `/accreditation/naac/narratives/owners` — the page named in the spine
migration's own header as the motivating incident — to the COO at level `full`,
and every wall passes, the row is written, `fn_handover_grants_key` returns true,
`fn_my_handover_permissions` returns the key, the client hook ORs it in… and the
COO is bounced.

---

## The corrected layer table

| # | Layer | Chokepoint | Runs |
|---|---|---|---|
| 1 | **Edge middleware** | `proxy.ts` → `routeMatcher.hasAccess()`, then `routeAllowedByHandover()` | before everything |
| 2 | Page gate | `hooks/use-permissions.ts` merge | client render |
| 3 | RLS | `user_has_permission(text)` — 4,093 call sites | every query |
| 4 | RPC | `SECURITY DEFINER` functions calling `user_has_permission` | on call |
| 5 | API route | in-route guards | on call |

## How the fifth layer is taught

`lib/auth/handover-route-access.ts`, consulted from `proxy.ts` **only inside the
branch that was already about to redirect**.

- **Same predicate, not a copy of it.** It calls `fn_my_handover_permissions()`,
  the function the page gates already use. Status, `revoked_at`, the IST
  inclusive due date, grantee still active, grantee still inside the granting
  institution, `fn_handover_key_allowed_at_level` and
  `fn_handover_key_is_blocked` are all enforced there. Restating any of it in
  TypeScript would create exactly the drift the spine's shared-predicate design
  exists to prevent.
- **Same matcher, not a second one.** The requested path resolves to its
  `MENU_PERMISSIONS` key through the same `routeMatcher.match()` call
  `hasAccess()` just made, so `/projects/[id]/budget` and a literal id resolve
  identically by construction. `director_handovers.route` is deliberately never
  re-matched.
- **Keys, not routes.** If two routes map to one `MENU_PERMISSIONS` key, a
  handover for either opens both — because `user_has_permission()` already
  granted that key platform-wide, so RLS, the RPCs, the API routes and the page
  gate opened both already. A middleware NARROWER than the other four would
  reintroduce this bug's exact shape.
- **Fails closed, always.** Error, timeout (300 ms ceiling), malformed answer →
  the redirect stands. That includes production today: the spine migration is
  unapplied, the function does not exist, PostgREST answers `PGRST202`, and this
  layer contributes nothing. Deploying it before the spine lands is a no-op.
- **Costs nothing on the passing path.** A user who holds the page by role never
  reaches the lookup — asserted by RPC call-count in
  `__tests__/lib/auth/director-handover-middleware.test.ts`.

### Where a handover still cannot rescue a receiver

If the denial came from the **static** `PROTECTED_ROUTES` role list rather than a
`MENU_PERMISSIONS` key, there is no key for a handover to have granted, and the
redirect stands. This is not a gap: such a route can never be handed over,
because the capture control resolves `permission_keys` from `MENU_PERMISSIONS`
and `director_handovers.dh_keys_not_empty` rejects an empty array.

### Cache window

The receiver's live key set is reused for 30 s (5 s when the answer is empty, so
a freshly-sent handover opens within seconds rather than after a full TTL). An
UNKNOWN answer is never cached, so a transient PostgREST blip cannot pin a user
out. Revocation closes the DATA immediately at RLS either way; this window is
strictly shorter than the 5-minute client permission cache SPEC.md already
documents.

### Measured cost

| Path | Added |
|---|---|
| Allowed by role (the overwhelming majority) | **0** — the lookup is not reached; RPC call count asserted as 0 |
| Denied by role, cache hit | **0.74 µs** in-process |
| Denied by role, cache miss | **one** PostgREST RPC — 45.7 ms median / 48.2 ms p90 measured against production Supabase over a warm keep-alive connection (n=14, from a client in Tamil Nadu; a Vercel function co-located with the database will be lower) |
| Any failure or stall | **≤ 300 ms**, then the original redirect |
