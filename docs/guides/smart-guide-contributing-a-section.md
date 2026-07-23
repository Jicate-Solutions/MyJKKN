# Contributing a module guide section (the smart-guide composition convention)

How a MyJKKN module plugs its in-app help into the **one** platform Help FAB.

There is a single route-aware "? Help" FAB for the whole platform
(`components/guide/platform-guide-fab*`), mounted once in the root layout. It
opens the guide **lane that matches the page you're on**. Modules do **not** ship
their own FAB and do **not** invent their own persona set — they contribute
**sections** into the nine canonical persona lanes. This doc is the convention
for doing that. It is deliberately short: the whole point of the composition
layer is that adding a module's guide is a few edits, no new machinery.

## The model in one paragraph

A module owns plain-data guide **content** (`lib/<module>/guide/content.ts`). The
**registry** (`lib/guide/registry.ts`) re-keys that content from the module's own
roles onto the **canonical personas** and merges it, per persona, with every
other module's content. The **server resolver** (`lib/guide/resolve-persona.ts`)
decides which canonical lanes a viewer may see (fail-closed). The **FAB** opens
the right lane for the current route via the pure selector
(`lib/guide/pick-lane.ts`). You touch only the first two; the rest derive
automatically.

The nine canonical personas (closed set — never add to it):

```
learner · facilitator · unit-lead · coordinator · supervisor
module-admin · platform-admin · parent · external
```

## Steps to contribute

### 1. Author the module's content — `lib/<module>/guide/content.ts`

Export `GUIDES` (a `GuideBook`-shaped object: `lanes` keyed by *your module's*
roles, plus an optional `glossary`) and a `REQUIRES` map of the opaque permission
key that unlocks each non-open lane. Reuse the existing modules as templates
(`lib/ai-pulse/guide/content.ts`, `lib/campus-living/guide/content.ts`,
`lib/pde/guide/content.ts`). Write steps at a **12th-grade reading level**, give
each adoption-worthy step a `link` ("Take me there →"), and set a `startHere` on
each lane.

> **Permission keys are OPAQUE.** AI Pulse uses `:` (`aiPulse:cycles.manage`),
> others use `.` (`allocations.approve`). Never split or parse them. Whatever key
> your module's `user_has_permission` RPC checks is the key you use verbatim.

### 2. Add a `ModuleGuide` fragment to the registry — `lib/guide/registry.ts`

Map your module's roles onto canonical personas and add the fragment to
`REGISTRY`:

```ts
export const myModuleGuide: ModuleGuide = {
  module: "my-module",      // namespaces step keys → no cross-module collisions
  basePath: "/my-module",   // the FAB derives route→module from this (route-map.ts)
  lanes: {
    learner:        { sections: MY_GUIDES.lanes.student.sections,  startHere: MY_GUIDES.lanes.student.startHere },
    facilitator:    { sections: MY_GUIDES.lanes.teacher.sections,  startHere: MY_GUIDES.lanes.teacher.startHere },
    "module-admin": { sections: MY_GUIDES.lanes.admin.sections,    startHere: MY_GUIDES.lanes.admin.startHere },
  },
};

export const REGISTRY: ModuleGuide[] = [aiPulseGuide, campusLivingGuide, pdeGuide, myModuleGuide];

// TWO MORE maps in the SAME file — easy to miss, and a miss compiles GREEN but
// silently degrades the module-scoped guide (the "Open full guide" / contextual
// drawer that scopes to the page's module, #1413/#1415): a missing label shows
// the raw module id ("my-module") instead of a name, a missing glossary shows
// an empty "Words to know".
const MODULE_LABELS: Record<string, string> = {
  // …existing entries…
  "my-module": "My Module",              // banner: "Showing the My Module guide…"
};
const MODULE_GLOSSARIES: Record<string, GlossaryTerm[]> = {
  // …existing entries…
  "my-module": MY_GUIDES.glossary ?? [], // the module-scoped "Words to know"
};
```

So a module is **six** edits in `registry.ts`, not two: the `import`, the
`ModuleGuide` fragment, the `REGISTRY` array, the `PERSONA_REQUIRES` rows (step 3),
**`MODULE_LABELS`**, and **`MODULE_GLOSSARIES`**. The last two are invisible to
`tsc` — only an eyeball on the module-scoped guide catches a miss.

Rules:

- **Re-key, don't rewrite.** Spread the existing section content; only the
  persona key changes.
- **Collapsed lanes get `requires`.** If two of your roles map to the *same*
  canonical persona (e.g. warden + mess → `unit-lead`), wrap each group with
  `withRequires(sections, REQUIRES.<role>)` so a viewer sees only the sections
  their permission unlocks. Section-level gating is enforced **server-side**
  (`filterLaneSections`), so `can` never reaches the client.
- **`basePath` is the routing contract.** `route-map.ts` builds the
  route→module table from it automatically — no FAB edit needed.

### 3. Register the permission keys — `PERSONA_REQUIRES` (same file)

Add your module's keys to the persona rows so the resolver can grant the lane:

```ts
facilitator:    [AI_PULSE_REQUIRES.faculty, PDE_REQUIRES.faculty, MY_REQUIRES.teacher],
"module-admin": [AI_PULSE_REQUIRES.admin, CAMPUS_REQUIRES.admin, PDE_REQUIRES.admin, MY_REQUIRES.admin],
```

`learner` is open (everyone). `platform-admin` is super-admin only. `parent` /
`external` are role-based (`PARENT_ROLE_KEYS` / `EXTERNAL_ROLE_KEYS`). An empty
key list means "not grantable by permission" → fail-closed.

### 4. That's it — the rest is automatic

You do **not** add a FAB, a route fallback, or a persona. `composeLane` merges
your sections; `pick-lane.ts` opens your lane on your `basePath` routes and the
generic **platform overview** lane on routes no module owns; the resolver gates
visibility. A module with **no** fragment still shows the overview lane on its
routes — contributing a fragment is what upgrades those routes from "how to get
around" to your module's real steps.

### 5. Verify before you open the PR

`tsc` passing is necessary but not sufficient — these checks catch what it can't:

- **Every deep-link resolves.** Each `link.href` / `startHere.href` must hit a
  real `app/**/<route>/page.tsx` (strip `[id]` to the list route, or use the
  `:scopeId` token). A 404 link is a dead end the type-checker can't see. Quick
  sweep: `grep -oE "href: ['\"][^'\"]+" lib/<module>/guide/content.ts` → confirm
  each path has a matching page file.
- **Keys are verbatim + present.** Every `REQUIRES` value must exist in
  `lib/sidebarMenuLink.ts` `MENU_PERMISSIONS` exactly (opaque — don't normalize
  `:` vs `.`).
- **Eyeball the module-scoped guide.** Open `/guide?module=<module>&persona=<a
  lane your module fills>` and confirm: the banner shows your **label** (not the
  raw id), the **glossary** is your module's, and the lanes read right. This is
  the only check that catches a missing `MODULE_LABELS` / `MODULE_GLOSSARIES`
  entry. Keep it **draft** until this eyeball passes — the Visual Proof Gate
  skips drafts, so the screenshot is the un-draft gate.
- **Lane title/tagline are canonical, not yours.** They come from
  `CANONICAL_LANES`, shared across every module — so they must stay
  module-neutral. If your module makes a canonical lane's copy read oddly (e.g.
  the `learner` baseline on an HR/Billing page), fix the *canonical* text, never
  add a per-module title.

## Invariants (don't regress these)

1. **Closed persona set.** Nine canonical personas. Reuse them; never add one.
2. **Opaque permission keys.** Never split/parse a `requires` string.
3. **Re-key, never rewrite** section copy in the registry (spread, don't edit).
4. **Section gating is server-side.** `can` lives only in the server mount; only
   plain `PersonaGuide` data crosses to the client.
5. **Fail-closed.** Unknown/empty → deny. The learner lane is the floor.
6. **One FAB.** Modules contribute sections; they do not mount their own FAB.
7. **Namespacing is automatic** via `module` — keep step `id`s unique *within*
   your module; cross-module uniqueness is handled by `composeLane`.

## Where things live

| Concern | File |
|---|---|
| Shared contract (types, personas, helpers) | `lib/guide/types.ts` |
| Registry + composition + `PLATFORM_OVERVIEW` | `lib/guide/registry.ts` |
| Server resolver (who sees which lane) | `lib/guide/resolve-persona.ts` |
| Route → module map (from `basePath`) | `lib/guide/route-map.ts` |
| Pure lane selector ("match the page") | `lib/guide/pick-lane.ts` |
| Server-side section filtering | `lib/guide/filter.ts` |
| The one platform FAB (client + server mount) | `components/guide/platform-guide-fab*.tsx` |
| Progress + instrumentation server actions | `lib/guide/actions.ts` |
