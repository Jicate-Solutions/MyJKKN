# Plan — the five scanned-card destinations that have no screen of their own

**Date:** 2026-08-06
**Amended:** 2026-08-07 — the sweep undercounted; see "Correction" below
**Status:** plan only, no code written
**Ranked as:** item 8 of the 2026-08-06 card-scanner brief
**Supersedes the framing of:** "build five proper list pages (suppliers, industry partners, mentors, solutions prospects, internship site contacts)"

---

## The headline: it is not five pages

The item was written as five greenfield modules. A production sweep says otherwise — **three
of the five already have working pages**, and they are invisible on the Scanned Contacts
screen for a one-line reason, not a missing-module reason.

`app/api/contacts/card-scan/saved/route.ts` decides "does this destination have a screen of
its own" from a four-entry map:

```ts
const TABLE_HREF: Record<string, string> = {
  admission_leads:       '/admission/leads',
  cdc_recruiters:        '/cdc/admin/recruiters',
  event_sponsors:        '/events',
  internship_preceptors: '/internships/sites',
};
```

`card-routing.ts` defines **nine** destinations. Nine minus four is the five in question. But
the map is missing entries for pages that **exist on `main` today**.

## What actually exists, per destination

| Destination | Table | Rows today | Existing UI on `main` | Real gap |
|---|---|---|---|---|
| Solutions prospect | `sh_prospects` | 0 | **Full module** — `/solutions/pipeline/list`, `/solutions/pipeline/[id]`, `/[id]/edit`, `/analytics`, plus a board view — 6 pages. 8 API routes under `app/api/solutions/prospects/`, a service, and 3 hooks (re-counted 2026-08-07). | **One `TABLE_HREF` line** |
| Supplier | `ims_suppliers` | 4 | **List page with a real table** — `/ims/settings/suppliers` | **One `TABLE_HREF` line** |
| Internship site contact | `internship_site_contacts` | 0 | Sites module exists; `/internships/sites/[id]` references contacts 8 times | **Confirm, then deep-link** to the parent site |
| Industry partner | `industry_partners` | 1 | **None.** `/cdc/industry-mentors` looks like a match but reads a *different* table (`industry_mentors`). | Genuine build |
| `Student-support mentor` | `ss_mentors` | 0 | **Full module** — `/startup-studio/mentors` and `/startup-studio/mentors/[id]`, backed by `lib/services/startup-studio/mentor-service.ts` (13 `from('ss_mentors')` calls). Already in `MENU_PERMISSIONS` under `startup_studio.analytics.view`. | **One `TABLE_HREF` line** |

Row counts are a point-in-time reading taken from production on 2026-08-06 — context for
sizing, not a fixture. Re-read them before acting on any sizing claim here; nine panes write
this database and the scanner itself keeps adding rows.

## Correction — why the first sweep said "None found" for `ss_mentors`

The 2026-08-06 sweep searched the **human label**. `card-routing.ts` calls that destination
`Student-support mentor`, so the sweep looked for a support/counselling module and found
nothing. The prefix `ss` does not mean support — it means **Startup Studio**
(`supabase/migrations/20260326000002_ss_mentor_ecosystem.sql`, "Mentor Ecosystem … Part of
Incubation Management Enhancement Phase 2"). The mentors in that table are startup mentors
matched to incubated ventures.

**The lesson, worth carrying past this plan:** when checking whether a destination already
has a screen, follow the **table name** into `lib/services`, not the human label. The label is
authored for the person holding the card; the table name is what the code is organised
around. One `git grep` for the table name would have found the module immediately —
`git ls-tree jicate/main -r --name-only | grep ss_mentor` returns the migration, and
`git grep -l ss_mentors -- lib/services` returns the service that owns it.

That is also the shape of the miss: a plan can be right about every row count and still be
wrong about what exists, because the counts were queried by table and the modules were
searched by name.

## The question this raises, which the item did not ask

At the 2026-08-06 reading, four of the five tables were **empty**, and the fifth held a
single row: the one industry partner created by the scanner two days earlier. Three of those
tables have a module that *can* write to them — but on that reading **the card scanner was
the only writer that had actually produced a row.**

The correction above narrows this question rather than removing it. It now applies to exactly
one table, `industry_partners`, and it is sharper for that: *is a module page the right answer
for a destination with one row and no second writer?* The Scanned Contacts screen
already lists them and already flags what is missing. A full page earns its place when
someone needs to find a row they did **not** scan — and today nobody can, because there is
one row and it came from a scan.

That is a Director call, not a technical one. It is put in front of you at the start of
phase 3 rather than assumed either way.

## Phases

### Phase 1 — wire what already exists  *(small, no risk, do first)*

Add the three missing entries:

```ts
sh_prospects:  '/solutions/pipeline/list',
ims_suppliers: '/ims/settings/suppliers',
ss_mentors:    '/startup-studio/mentors',
```

…but **not for everybody**. That was the first attempt, and it was wrong.

#### The trap: the permission relation has a direction

The obvious check is "can the people who hold this key scan a card?" — and for all three the answer
was yes. That is `holders ⊆ scanners`, and it is the wrong way round. The link is rendered **to
scanners**, so what has to hold is the reverse: `scanners ⊆ holders`.

Measured live on 2026-08-07: **197 accounts can scan a card**; roughly **20** hold
`solutions.pipeline.view` or `startup_studio.analytics.view`. So wiring those two unconditionally
handed ~177 people a link into a `PermissionError` page — the exact dead end this phase exists to
prevent.

The same mistake also inverted the risk judgement. An earlier draft of this plan singled out
`ims.settings.suppliers.manage` as the risky one, because it is a *manage* key. In fact suppliers is
the **most** reachable of the three (105 of 197 scanners hold the broader `ims.view` that gates that
layout); the two it recommended are the least reachable. The flagged target was the safest one.

#### The fix: decide the href per viewer

`app/api/contacts/card-scan/saved/route.ts` already authenticates the caller, so it can ask whether
**this** viewer holds the destination's key and emit the href only then:

```ts
const { data } = await supabase.rpc('user_has_permission', { permission_name: key })
```

- Resolve the key from `MENU_PERMISSIONS`, keyed by the same href — one source of truth, so retuning
  a route's permission cannot drift from a second hardcoded copy.
- **Fail closed**: a lookup error emits no link. A missing link is safe; a link into a denial page is not.
- One lookup per distinct key, not one per card.

This dissolves the reachability question instead of arbitrating it: it stops being *"do most scanners
hold this key"* and becomes *"does this scanner hold it"*. All three destinations become wireable,
suppliers included, and no viewer is ever shown a link they cannot open.

- **Files:** `app/api/contacts/card-scan/saved/route.ts`
- **Done when:** for the same destination, a viewer holding its key sees a working link and a viewer
  without it sees "this page is the only view" — and a test asserts exactly that pair. Beware the
  tautology: `only_view_here === (href === null)` is computed from one expression on both sides and
  can never fail.
- Shipped as PR #2909.

### Phase 2 — internship site contacts  *(small, needs one read first)*

`/internships/sites/[id]` already mentions contacts. Read it and establish whether site
contacts are rendered there.

- **If yes:** the destination needs a deep link to the parent site, not a page. That is a
  slightly larger change than phase 1 because `TABLE_HREF` is keyed by table alone and this
  link needs the row's `site_id` — so it becomes a per-row href, not a per-group one.
- **If no:** it joins phase 3.

### Phase 3 — the one genuinely missing module  *(gated on the question above)*

`industry_partners`, and only that. `ss_mentors` moved to phase 1 once the correction landed,
so there is no second module here and nothing to sequence — the "build them one at a time so
the first sets the pattern" instruction in the original draft no longer applies.

Only start after the Director answers whether this warrants a page at all given one row.

If yes: **`industry_partners`** — 1 row at the 2026-08-06 reading. Columns already written by
the scanner: `company_name`, `company_website`, `contact_person`, `contact_designation`,
`contact_email`, `contact_phone`, `city`, `pincode`, `institution_id`. Before designing it,
read `lib/services/pde-employer-briefing-service.ts` and
`app/api/pde/placement-signals/route.ts` — both already read this table, so a list page is
joining an existing reader, not introducing the first one.

The module needs: list page + detail, a `MENU_PERMISSIONS` entry, a permission key in
`lib/constants/permissions.ts`, RLS following the standard
`is_super_admin() OR is_admin() OR (user_has_permission(...) AND role_has_institution_access(institution_id))`
pattern, and the `TABLE_HREF` entry. One PR.

## Constraints carried in

- **`institution_id` is a hard field** on `industry_partners` (`hardFields` in
  `card-routing.ts`), so every list must be institution-scoped, and any picker must offer
  only institutions the viewer can actually reach — an unscoped picker fabricates absence.
- **Do not trust a CHECK sweep for column legality.** Enums do not appear as CHECK
  constraints; a sweep wrongly reported `sh_prospects.source_type` as accepting `'card_scan'`
  when the enum rejects it.
- **The only reliable proof for a multi-table write path is a rolled-back INSERT per
  destination table** (`BEGIN; … ROLLBACK;`). That method found three defects that typecheck,
  20 CI checks and a clean build all passed.
- Every new page must satisfy `check-menu-permissions-coverage` and
  `check-permissions-catalog` — both read from stdout, not the exit code.

## What this plan deliberately does not do

It does not write code, and it does not assume all five destinations need the same treatment.
Three are a one-line wire; one is a read away from being decided; one is a real build whose
value depends on a judgement about a near-empty table that belongs to the Director.

It also no longer assumes its own sweep was complete. The `ss_mentors` correction is left in
the document rather than edited away, because the next person sizing a "we need N new pages"
item should see how a sweep by human label undercounted by a whole module.
