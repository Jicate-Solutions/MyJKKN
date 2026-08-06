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
- **Same matcher, not a second one.** Both lanes below go through
  `routeMatcher`: the key lane through the same `routeMatcher.match()` call
  `hasAccess()` just made, the route lane through `routeMatcher.sameRoute()`,
  which walks that same permission trie. A segment is dynamic exactly where the
  trie says it is, so `/projects/[id]/budget` and a literal id are one route by
  construction and there is no second matcher free to disagree.
- **Keys OR routes — a union, never an intersection.** See the section below.
  If two routes map to one `MENU_PERMISSIONS` key, a handover for either opens
  both — because `user_has_permission()` already granted that key platform-wide,
  so RLS, the RPCs, the API routes and the page gate opened both already. A
  middleware NARROWER than the other four would reintroduce this bug's exact
  shape.
- **Fails closed, always.** Error, timeout (300 ms ceiling), malformed answer →
  the redirect stands. That includes production today: the spine migration is
  unapplied, the function does not exist, PostgREST answers `PGRST202`, and this
  layer contributes nothing. Deploying it before the spine lands is a no-op.
- **Costs nothing on the passing path.** A user who holds the page by role never
  reaches the lookup — asserted by RPC call-count in
  `__tests__/lib/auth/director-handover-middleware.test.ts`.

## The union — and the 70 routes that made it necessary

Comparing the requested path's `MENU_PERMISSIONS` key is correct only while the
keys **written onto a handover** are menu keys. They are not, deliberately.
`components/director-desk/route-permission-resolver.ts` resolves the keys from
`ROUTE_GATE_MAP` — the page's real `PermissionGuard` / `PolicyPageShell` gate —
and drops the menu key wherever no `RoutePermissionGuard` enforces it. That was
itself a fix: the resolver used to write a key the page's own gate never reads,
producing handovers that looked healthy and granted nothing.

Both changes are right. Their **composition** was not. Measured against that
resolver's own map: of **477** routes with a recorded gate, 122 are un-handable,
99 also sit under a `RoutePermissionGuard` (so the menu key is granted too) and
186 agree by coincidence — leaving **70 routes where the page's real gate key is
not the menu key**:

| Route | Menu key | Key actually written |
|---|---|---|
| `/accreditation/manage/metrics` | `accreditation.view` | `accreditation.metrics.manage` |
| `/admission/gd-pi/[id]/evaluate` | `admission.applications.edit` | `admission.gd_pi.evaluate` |
| `/bos/committees` | `bos.view` | `academic.bos-compositions.view` |
| `/campus-living/mess/menu-loop` | `campus_living.mess.view` | `campus_living.settings.view` |
| `/admission/gate-entry` | `admission.dashboard.view` | `admission.gate_entry.create` |

On every one of those the row carried keys this layer never looked for, no key
matched, and the receiver was bounced — the showstopper the fifth layer exists
to kill, surviving inside the fix for it.

Access is therefore granted on **(key match) OR (route match)**:

| Lane | Question | Source |
|---|---|---|
| key | is the requested path's `MENU_PERMISSIONS` key in my live key set? | `fn_my_handover_permissions()`, unchanged |
| route | do I hold a live handover whose stored `route` **is** this page? | `director_handovers.route` under RLS `dh_select` |

It cannot be a swap. The other four layers grant by key, so dropping the key
lane would make this middleware narrower than all of them.

**Where the route lane gets its liveness.** Not from TypeScript. Rows are
filtered by `permission_keys && <the key set `fn_my_handover_permissions()` just
returned>`, so status, `revoked_at`, the inclusive IST due date, grantee active,
grantee still in the granting institution, the walls and the access level are all
enforced by the spine's own function and are restated nowhere. A revoked,
expired or declined handover contributes no keys and therefore no routes — and
when the key set comes back empty the route query is **not issued at all**, which
is what keeps an ordinary denial at exactly one round trip.
`.eq('grantee_user_id', …)` is not a liveness filter: `dh_select` also lets
admins read other people's handovers, and an admin must not inherit a
colleague's routes.

### Where a handover still cannot rescue a receiver

A path the matcher does not recognise at all is not a protected route, so
`hasAccess()` cannot have denied it and nothing can have been handed over for
it — answered without asking the database anything.

A denial that came from the **static** `PROTECTED_ROUTES` role list carries no
`MENU_PERMISSIONS` key, which kills the key lane for that request. The route lane
still applies: such a page can declare its own gate keys and so can still have
been handed over.

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
| Allowed by role (the overwhelming majority) | **0** — the lookup is not reached; RPC and table-query counts both asserted as 0 |
| Denied by role, cache hit | **0.74 µs** in-process |
| Denied by role, cache miss, **no live handover** | **one** PostgREST RPC — 45.7 ms median / 48.2 ms p90 measured against production Supabase over a warm keep-alive connection (n=14, from a client in Tamil Nadu; a Vercel function co-located with the database will be lower). The route query is skipped on an empty key set, so this is unchanged. |
| Denied by role, cache miss, **holds a live handover** | that RPC **plus** one indexed `director_handovers` read — only for the handful of people who actually hold one, and only until the 30 s cache warms |
| Any failure or stall | **≤ 300 ms**, then the original redirect — one deadline covering **both** lanes, not one each |
