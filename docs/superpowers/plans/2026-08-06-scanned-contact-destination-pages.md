# Plan — the five scanned-card destinations that have no screen of their own

**Date:** 2026-08-06
**Status:** plan only, no code written
**Ranked as:** item 8 of the 2026-08-06 card-scanner brief
**Supersedes the framing of:** "build five proper list pages (suppliers, industry partners, mentors, solutions prospects, internship site contacts)"

---

## The headline: it is not five pages

The item was written as five greenfield modules. A production sweep says otherwise — **two of
the five already have working pages**, and they are invisible on the Scanned Contacts screen
for a one-line reason, not a missing-module reason.

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
| Solutions prospect | `sh_prospects` | 0 | **Full module** — `/solutions/pipeline/list`, `/solutions/pipeline/[id]`, `/[id]/edit`, `/analytics`, plus a board view. 8 API routes, a service and hooks. | **One `TABLE_HREF` line** |
| Supplier | `ims_suppliers` | 4 | **List page with a real table** — `/ims/settings/suppliers` | **One `TABLE_HREF` line** |
| Internship site contact | `internship_site_contacts` | 0 | Sites module exists; `/internships/sites/[id]` references contacts 8 times | **Confirm, then deep-link** to the parent site |
| Industry partner | `industry_partners` | 1 | **None.** `/cdc/industry-mentors` looks like a match but reads a *different* table (`industry_mentors`). | Genuine build |
| Student-support mentor | `ss_mentors` | 0 | **None found** | Genuine build |

Row counts read from production on 2026-08-06. They are context for sizing, not a fixture —
they will move.

## The question this raises, which the item did not ask

Four of the five tables are **empty**, and the fifth holds a single row: the one industry
partner created by the scanner two days ago. **The card scanner is currently the only writer
to any of them.**

So before building two new CRUD modules, the honest question is: *is a module page the right
answer for a destination with no data and no second writer?* The Scanned Contacts screen
already lists them and already flags what is missing. A full page earns its place when
someone needs to find a row they did **not** scan — and today nobody can, because there are
none.

That is a Director call, not a technical one. It is put in front of you at the start of
phase 3 rather than assumed either way.

## Phases

### Phase 1 — wire what already exists  *(small, no risk, do first)*

Add the two missing entries:

```ts
sh_prospects:  '/solutions/pipeline/list',
ims_suppliers: '/ims/settings/suppliers',
```

Those two destinations stop rendering as `only_view_here: true` and start deep-linking to
their real modules.

- **Files:** `app/api/contacts/card-scan/saved/route.ts` (one map)
- **Check before shipping:** open each target as a role that holds its permission
  (`solutions.prospects.view`, and whatever gates `/ims/settings/suppliers`) and confirm it
  loads. A link to a page the viewer cannot open is worse than no link — it turns a
  read-only screen into a dead end.
- **Done when:** a scan routed to Solutions prospect or Supplier shows a working link, and
  the other three still say "this page is the only view".

### Phase 2 — internship site contacts  *(small, needs one read first)*

`/internships/sites/[id]` already mentions contacts. Read it and establish whether site
contacts are rendered there.

- **If yes:** the destination needs a deep link to the parent site, not a page. That is a
  slightly larger change than phase 1 because `TABLE_HREF` is keyed by table alone and this
  link needs the row's `site_id` — so it becomes a per-row href, not a per-group one.
- **If no:** it joins phase 3.

### Phase 3 — the two genuinely missing modules  *(gated on the question above)*

`industry_partners` and `ss_mentors`. Only start after the Director answers whether these
warrant pages at all given zero data.

If yes, build them one at a time, not in parallel — they are the same shape, and the first
sets the pattern the second copies:

1. **`industry_partners`** — 1 row. Columns already written by the scanner: `company_name`,
   `company_website`, `contact_person`, `contact_designation`, `contact_email`,
   `contact_phone`, `city`, `pincode`, `institution_id`.
2. **`ss_mentors`** — 0 rows.

Per module: list page + detail, a `MENU_PERMISSIONS` entry, a permission key in
`lib/constants/permissions.ts`, RLS following the standard
`is_super_admin() OR is_admin() OR (user_has_permission(...) AND role_has_institution_access(institution_id))`
pattern, and the `TABLE_HREF` entry. One PR each.

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
Two are a one-line wire; one is a read away from being decided; two are real builds whose
value depends on a judgement about empty tables that belongs to the Director.
