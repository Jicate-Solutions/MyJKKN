# What's New across every app — one shared list, seen from every application

**Status:** DRAFT — decisions at the foot are the Director's, and section 2 and 3
recommendations do not survive a different answer to decision 1 or 2.
**Date:** 2026-09-12
**Scope:** specification only. No code, no migration, no endpoint is proposed for
immediate build. Nothing in this document has been applied.

---

## The ruling this answers

The Director ruled, verbatim: *"One shared list, seen from every app."* Build the
changelog once, and have each Application Hub entry show its own slice —
explicitly not ten separate copies of the same machinery.

Half the foundation is already on `main`. The other half has not started, and the
gap is one line:

| Half | State | Evidence |
|---|---|---|
| The table can hold more than one app's history | **Shipped** | `supabase/migrations/20260907183500_changelog_entries_key_by_app_and_sha.sql` — adds `app_key`, drops the single-column `sha` UNIQUE, adds `UNIQUE (app_key, sha)` |
| Anything other than MyJKKN can write to it | **Not started** | `scripts/sync-changelog-db.mjs:105` — `const APP_KEY = 'myjkkn';` |

Everything below is written from the code on `jicate/main` at
`22b2563e35`, with file and line cited wherever a claim rests on it.

---

## 0. What exists today, precisely

Read this first; several later sections only make sense against it.

| Piece | Where | What it does |
|---|---|---|
| Three tables | `supabase/migrations/20260906090000_changelog_live_data.sql` | `changelog_entries`, `changelog_modules`, `changelog_sync`. RLS on all three, `SELECT` granted to `authenticated`, revoked from `anon` and `PUBLIC`. The entries policy is `USING (NOT hidden)`. |
| The one writer | `scripts/sync-changelog-db.mjs` | Parses git history, upserts on `(app_key, sha)`, prunes rows the rules no longer produce, never touches `hidden` / `hidden_reason`. |
| The schedule | `.github/workflows/whats-new-refresh.yml` | 03:17 UTC daily plus `workflow_dispatch`. Checks out **this** repository at `fetch-depth: 0` and reads `CHANGELOG_REF: origin/main`. Holds `secrets.SUPABASE_DB_URL`. |
| The read path | `app/api/whats-new/route.ts` | Session-gated. Reads as the signed-in caller over the anon-key server client, never the service role. |
| The role boundary | `supabase/migrations/20261123090000_changelog_visible_modules.sql` | `fn_changelog_visible_modules()` returns the module keys the caller may read. `SECURITY DEFINER`, `REVOKE EXECUTE … FROM anon, PUBLIC`. |
| The module dictionary | `lib/changelog/modules.mjs` | Maps a module key to a label, a permission namespace (or `null` for platform-wide), and an href. |
| The existing door for other applications | `lib/api-keys/authenticate.ts`, `app/api/b2a/README.md` | Bearer keys out of `api_keys`, module-scoped as `{ read: […], write: […] }`, 30-odd module names in `VALID_MODULES`. |

---

## 1. Which apps

### How I counted

The Hub's catalogue is **not a file in this repository**. `app/(routes)/application-hub/page.tsx`
renders whatever `useApplications()` returns from the `applications` table, so the
live list is production data. I could not read production from this worktree and
have not guessed at it.

What the repository does contain is a captured browser console log of the Hub
loading for one signed-in person on 2026-06-19, committed as bug evidence at
`docs/bugs/academic-attendance-bugs-2026-06-19.md:1245`:

```
[application-hub] Applications available: 21
```

followed by one line per entry naming every application and whether that person
could open it. That is a **June 2026 snapshot of 21 active entries**, and it names
all 21 — not only the ones that person could reach. The Director's working figure
is roughly 24 today, so the catalogue has grown by about three since; those three
are not knowable from here.

### The 21 named in that capture

Evently · Insta Solver · JKKN AI Forms · JKKN Admission Management · JKKN Alumni ·
JKKN Bug Management · JKKN COPIMS · JKKN Mentor · JKKN POS · JKKN SERVICE ·
JKKNCOE · MATLAB Academy · MATLAB Online · Mentor & Mentee · MyJKKN Library ·
Onboarding Management · Problem Bank · Ticket Verifier · Transport Management ·
Bug Tracker · child app

### What I can and cannot conclude from that

Out of scope on the Director's own instruction, and consistent with the capture:
the MATLAB entries (MathWorks tools, wired through LTI 1.3 — `types/lti.ts:13-16`
enumerates `matlab_grader`, `matlab_online`, `matlab_academy`,
`matlab_production_server`), Bug Tracker, and the row literally named `child app`,
which reads as a test or placeholder row rather than a product.

That leaves **17 candidate names**, which is more than the Director's "roughly 10".
I will not narrow it further by reading the names, because a name does not say who
built a thing: several of these could be links pointing back into MyJKKN's own
modules, and at least one could be a purchased product wearing a JKKN label. The
gap between 17 and 10 is real and it is a question, not an estimate — see
decision 5.

### The structural answer: stop counting, make it a column

`types/applications.ts:7` already declares `application_type: 'internal' | 'external'`,
and every row carries one. If that column is maintained, the count is a one-line
read and nobody ever has to argue about a name again:

```sql
SELECT name, url, application_type
  FROM applications
 WHERE is_active
 ORDER BY application_type, name;
```

For the changelog specifically, ownership is still the wrong test. The right test
is **does this application publish a changelog at all**, which is narrower than
"is it ours" and is a thing an application declares about itself. So:

> **Recommendation 1.** Add `app_key text UNIQUE NULL` to `applications`. An entry
> with an `app_key` publishes into the shared list; an entry without one does not.
> The set of participating apps becomes self-declaring, the Hub screen is where it
> is declared, and `changelog_entries.app_key` gains a real referent instead of
> being a free-text label agreed by convention.

---

## 2. Ingestion — how another repository's history reaches `changelog_entries`

### The constraint that decides this

The sync job holds `SUPABASE_DB_URL` (`.github/workflows/whats-new-refresh.yml`),
which is a superuser connection string shared by several workflows in this
repository. **Handing that secret to ten sibling repositories is not on the table**,
and that single fact eliminates the most obvious design — "just run the same job
over there" — before any of the three options are weighed.

The second constraint is in the sync script's own header: the parsing rules live
in `collectChangelog()` in `scripts/generate-changelog.mjs`, and *"two copies of
those rules would drift, and the drift would be invisible until somebody saw a
line they should not have."* Any option that copies the parser into ten repos is
buying that invisible drift.

### The three options, weighed

**(a) A workflow per repository, pushing to a shared ingest endpoint.**
Each sibling repository runs a job on its own schedule, parses its own history,
and posts the result to MyJKKN over HTTPS, authenticated by that application's own
API key. It never sees the database.
*Against:* it creates a write path into a table that has only ever had one writer,
and that path is guarded by a key rather than by network position.

**(b) One central job here, with read access to every repository.**
MyJKKN's CI clones ten repositories each morning and runs the existing parser over
each.
*Against:* one long-lived credential with read access across the whole estate,
stored here, rotated whenever the estate changes; ten full-depth clones every
morning (`fetch-depth: 0` is load-bearing — a shallow clone trips the script's own
guard); and every sibling repository must be visible to this one, which is a
coupling that outlives the changelog. It does keep the parser in one place.

**(c) A per-app manifest — each app commits a changelog file we fetch.**
*Against:* this is precisely the design that was removed on 2026-09-06. The
script's header records why: *"a new entry needed a daily pull request and a
deploy before anybody could read it"*. Re-introducing it for nine apps
re-introduces the staleness for nine apps.

### Recommendation

> **Recommendation 2. Option (a), with the parser shared as a reusable workflow
> rather than copied.**
>
> MyJKKN publishes `.github/workflows/changelog-sync-reusable.yml`. Each sibling
> repository adds a four-line caller that references it by ref. The reusable
> workflow checks out **MyJKKN** for the parsing rules and the **calling**
> repository for the history, then posts to an authenticated ingest endpoint using
> a single repository secret: that app's API key.
>
> This is the only option that keeps one copy of the rules (option (a) naively
> implemented does not) while keeping the database credential in one place
> (option (b) does not) and the list live (option (c) does not).

Sharp edges the build must handle, all of which exist because the current script
was written for exactly one writer:

1. **The endpoint must set `app_key` from the key, never from the request body.**
   A caller that can name its own `app_key` can overwrite another app's slice, and
   the 2026-09-07 migration's whole purpose was to make that impossible.
2. **The prune stays server-side and stays scoped.** `sync-changelog-db.mjs:290`
   already scopes its `DELETE` to `app_key = $2` and explains why in the file:
   unscoped, it reads as *"delete every entry I did not just write."*
3. **The guards must move and must become per-app.** See section 5 — as written,
   two of them break the moment a second app arrives.
4. **`hidden` and `hidden_reason` must remain absent from the ingest path's update
   list**, exactly as they are today. That omission is the takedown guarantee.

---

## 3. Reading a slice — how a remote application renders its own entries

A remote application cannot reuse MyJKKN's session; there is no shared cookie and
no shared origin. So the read needs its own identity, and MyJKKN already has one.

### Reject the static slice, on the record

A published static slice was offered as an option. It must be rejected in the
shape it was offered, and the reason is not theoretical:

```
proxy.ts:274
const STATIC_ASSET_PATTERN =
  /^\/(_next|icons)|\.(?:js|css|png|ico|svg|json|xml|html|woff2?)$/;
proxy.ts:288
  if (STATIC_ASSET_PATTERN.test(path)) return true;
```

Any path ending `.json` is treated as a public static asset and never reaches the
auth check. On 2026-09-06 that served `public/changelog/*.json` to the open
internet — 4,753 internal change descriptions, verified at HTTP 200 with no
session, including entries about Administration, AI Routines and Users & Roles.
The incident is documented in the header of `app/api/whats-new/route.ts`.

A static slice is therefore viable **only** if either (i) the Director rules the
changelog public, in which case exposure is the intent rather than the bug, or
(ii) it is served under an extension the pattern does not match *and* from behind
the auth check — at which point it is an endpoint with extra steps. Option (i) is
decision 2.

### Recommendation

> **Recommendation 3. One authenticated read endpoint, keyed by the application's
> existing API key — the signed-endpoint and per-app-key options are the same
> option here, because `api_keys` already is the per-app key.**
>
> `GET /api/b2a/whats-new`, authenticated by `authenticateApiKey()`
> (`lib/api-keys/authenticate.ts:97`), scoped by a new `changelog` entry in
> `VALID_MODULES`, returning by default only the rows whose `app_key` matches the
> calling key's application. Same payload shape as `lib/changelog/types.ts`, so a
> remote app can render it with the same field names MyJKKN's own page uses.

Three things the build must respect:

1. **`api_keys` cannot currently say which application a key speaks for.** The
   table has gained `institution_id`, `user_id`, `user_role` and `department_id`
   across three migrations; it has no `app_key` and no reference to `applications`.
   Recommendation 1's column is the prerequisite for both halves of this design —
   a key with no application cannot be given an application's slice, and cannot be
   trusted to write one either.
2. **The read is server-to-server, not browser-to-server.** The key must live in
   the remote application's backend. `lib/api-keys/cors.ts` sends
   `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` — a combination
   browsers reject outright — and, more to the point, a key placed in a browser
   bundle is a published key. The remote app fetches on its server and renders the
   result itself.
3. **B2A authentication hands back a service-role client** —
   `lib/api-keys/authenticate.ts:37` says so in the type: *"Service role client —
   bypasses RLS."* Every scoping rule for this endpoint therefore has to be
   written in the handler. RLS will not catch a mistake here the way it does for
   the signed-in page.

---

## 4. Permissions — what an application with no role model gets

MyJKKN scopes its own page per role through `fn_changelog_visible_modules()`,
which reproduces the multi-role merge, the `profiles.role` safety net, live
Director's Desk handover keys and the super-admin bypass. A sibling application
has none of that, and inventing a role model for it is not on offer.

> **Recommendation 4. An application with no permission system gets its own
> application's entries, in full, and nothing of MyJKKN's beyond the platform-wide
> band. Cross-app reading is an explicit per-key grant, default off.**

Why each half of that is safe:

**Its own entries, in full.** They describe changes to that application, written by
the people who ship it, shown to the people who use it. They carry no MyJKKN
module key, no permission namespace and no institution data. There is nothing in
that slice that its own audience is not already entitled to see, so a role model
would be gating the app's own news from the app's own readers.

**Nothing of MyJKKN's, by default.** This is the direction that actually hurts. An
API key reading the shared table with no filter would return the subjects of
Administration, AI Routines and Users & Roles changes — the precise set that
`fn_changelog_visible_modules()` was written to withhold from a signed-in learner,
one incident after the same set was withheld from the open internet. Since the B2A
path runs service-role, nothing else stops it. Default off is the only defensible
default.

**The one band that can be shared without a role model.** `changelog_modules.perm IS NULL`
means platform-wide — sign-in, navigation, mobile, speed — and
`fn_changelog_visible_modules()` already returns exactly that band to every
signed-in person regardless of role. It is the largest subset of MyJKKN's history
that is provably role-independent, which makes it the correct content for a
genuinely shared list if the Director wants one. Anything beyond it needs a
decision, not a default.

**Where an app's own takedown decision lives.** `hidden` is a row-level flag with
no notion of who may set it. If app B can hide app B's entry, that is a grant that
does not exist yet; if only MyJKKN's super admin can, then a sibling team must ask
us to take down their own line. That is decision 3, and it is a governance
question rather than a technical one.

---

## 5. Four defects the second writer will trip, found while writing this

These are on `main` now. They are not bugs today — they cannot fire with one
writer — and they all fire on the day a second application writes. Listing them
here so the build does not discover them one at a time.

1. **A small application can never seed.** `sync-changelog-db.mjs:98` sets
   `FIRST_SEED_FLOOR = 1000`, and the guard at line 202 refuses to write fewer
   than a thousand entries in a first sync. That floor is correct for MyJKKN,
   whose history holds 4,700-plus; it is fatal for a sibling repository with 300
   qualifying commits, which will be refused every morning with a message about
   stale remotes. The floor has to become per-app, or a declared expectation per
   app, before anything smaller than MyJKKN can join. See decision 6.

2. **MyJKKN's own sync will eventually abort forever.** The staleness guard at
   line 211 compares `entries.length` — one application's parsed history — against
   `existing`, which is read at line 187 as `count(*) FROM changelog_entries` with
   **no `app_key` filter**, i.e. the whole table across every application. Once
   other applications hold more than about 11% of the rows, MyJKKN's own history
   falls below 90% of the table and the job refuses to write, daily, with a
   message about shallow clones that will send whoever reads it in the wrong
   direction. The count needs the same `app_key` scoping the prune already has.

3. **The module dictionary is shared and last-writer-wins.** `changelog_modules`
   is keyed by `key` alone, and the sync upserts with
   `ON CONFLICT (key) DO UPDATE SET label, perm, href` (line 231). The 2026-09-07
   migration keyed *entries* by application and left the *dictionary* global, so a
   sibling application that also has a "billing" area silently rewrites MyJKKN's
   Billing label, its permission namespace and its href — and the namespace is
   what `fn_changelog_visible_modules()` gates on, so a dictionary collision is a
   permissions change. Either the dictionary is keyed by `(app_key, key)` too, or
   module keys are namespaced per application by convention and the convention is
   enforced at ingest.

4. **The freshness stamp is a singleton.** `changelog_sync` is one row by
   construction (`singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton)`),
   so "last synced at" becomes whichever application synced most recently. The
   script already anticipates this in a comment at line 305: *"If a second app ever
   writes here and the stamp needs to be per-app, that row becomes per-app too."*
   It does need to be, or every app's screen will claim the freshness of whichever
   app ran last.

---

## 6. Decisions only the Director can make

Each of these changes what gets built. None of them has a defensible default.

1. **Does every app show the same list, or only its own news?**
   "One shared list, seen from every app" can mean one pool everyone reads, or one
   pool each app reads its own slice of. This specification assumes the second —
   own slice by default, sharing by exception — because the first hands a small
   application MyJKKN's internal change descriptions. If the first was meant,
   sections 3 and 4 change substantially.

2. **Should the changelog be readable by anyone on the internet, or only by people
   who sign in?** The current answer is sign-in, from 2026-09-05. A public answer
   is legitimate — many products publish their changelog — and it would make the
   simplest option in section 3 available again. It is also irreversible in
   practice: what has been public cannot be made unread.

3. **If an app wants one of its own lines taken down, who presses the button?**
   That app's own team, or only a MyJKKN super admin?

4. **Should another app's news appear on MyJKKN's own What's New page?**
   For example, should somebody reading MyJKKN see "Library: fixed overdue
   reminders"? Yes gives one place to look; no keeps MyJKKN's page about MyJKKN.

5. **Which of the 17 names in section 1 are actually ours?**
   Your figure is roughly 10 and the Hub capture yields 17 non-MATLAB, non-tracker
   names. Confirming them once — or having each Hub entry declare itself per
   recommendation 1 — settles it permanently.

6. **If a sibling app has only 40 changes in its whole history, should it still
   appear?** Today the machinery refuses anything under a thousand. Answering this
   decides whether the smaller apps are in the programme at all.

---

## What I could not determine from the repository

Stated plainly rather than papered over.

- **The live Hub catalogue.** It is production data in the `applications` table.
  Everything in section 1 rests on a June 2026 console capture committed as bug
  evidence and on the Director's own count. The three-entry difference between
  them is unexplained.
- **Which Hub entries are built by us.** No column value, seed or manifest in this
  repository states it. `application_type` exists as a field; whether it is
  maintained I could not check.
- **Whether sibling applications keep their history in git at all**, or in
  repositories under the same organisation. The whole of section 2 assumes they
  do; if one of them is a no-code or hosted product, it has no commit history to
  parse and needs a different door entirely.
- **Line drift in an existing comment.** `app/api/whats-new/route.ts` cites the
  static-asset pattern as `proxy.ts:258`. On `22b2563e35` it is defined at
  `proxy.ts:274` and used at `proxy.ts:288`. The pattern itself is unchanged; only
  the line number moved. Cited here at its current position.
