# MyJKKN Design System

> Source of truth for **tokens, surfaces, colour, radius, and the shipped `components/ui` primitives**. Brand: **JKKN Green**.
> **Default theme: LIGHT.** `app/layout.tsx:232` sets `defaultTheme='light'` (with `enableSystem` and `storageKey='theme-preference'`). Dark is the secondary theme, reached **only** when the user explicitly selects *Dark*, or selects *System* on a dark-mode OS — `enableSystem` does **not** make OS preference the default, so a first-time visitor with no stored `theme-preference` gets light regardless of their OS. The dark theme's Ultrahuman-style deep-surface aesthetic applies to dark **only** — it is not the product default.

### How to use this document

- **Light is what ships.** Every value table below leads with the light column. If you read only one column, read that one.
- **Both themes must be checked before shipping.** A page is not done until it has been viewed in light *and* dark. Section 11 gates this.
- **Token values mirror `app/globals.css`,** which is the machine-readable source and the only file in the repo that defines these tokens. Light `:root` = lines 77–120, `.dark` = 122–179; glass `:root` = 185–205, glass `.dark` = 207–227 — **these are `jicate/main` line numbers.** They differ in the diverged `omm-dev` checkout (there the four blocks open at 36 / 81 / 144 / 166), so **search for `:root {` rather than jumping to a line.** Token *values* are identical in both. If a table here disagrees with that file, the file wins — fix the table.
- **Where this doc disagrees with shipped code, shipped code wins.** Contradictions are called out inline rather than hidden.
- **A rule that is true in only one theme says so on the same line.** Unqualified rules are universal.

---

## 1. Surface Elevation System

The depth mechanism is **theme-dependent** and the two themes are opposites:

- **Light (default): depth via border + shadow.** `--background`, `--card` and `--popover` are all `0 0% 100%` — the same white. There is no background contrast to work with, so a card separates from the page using a border and a shadow. This is not a compromise; it is the only mechanism light mode has.
- **Dark: depth via background colour.** The surfaces form a real lightness ladder — `2% → 3% → 8% → 10% → 12% → 15% → 17%` — so borders and shadows are **not required** for depth in dark. They are not forbidden either: the shipped primitives keep both. See the *Shipped reality* note below. (The dark table below is ordered by token role, not by lightness.)

### Light surfaces (default theme — `:root`)

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| `surface-0` | `--background` | `0 0% 100%` | `#FFFFFF` | App background |
| `surface-1` | `--sidebar-background` | `0 0% 98%` | `#FAFAFA` | Sidebar, secondary panels (only a 2% delta from the page — the sidebar border does the real separating) |
| `surface-2` | `--card` | `0 0% 100%` | `#FFFFFF` | Cards — **identical to `--background`**; needs `border` + `shadow` to be visible |
| `surface-2.5` | `--popover` | `0 0% 100%` | `#FFFFFF` | Popovers, dropdowns, tooltips — **also identical**; floats via shadow |
| `surface-3` | `--secondary` | `47.9 95.8% 53.1%` | `#FACC15` | ⚠️ **Saturated yellow, not a neutral surface.** Do not use for pills/tags/hover — use `bg-muted` |
| `surface-muted` | `--muted` | `210 40% 96.1%` | `#F1F5F9` | The real neutral interactive surface in light mode (3,352 shipped uses) |
| `surface-accent` | `--accent` | `210 40% 96.1%` | `#F1F5F9` | Subtle highlight, hover surface |
| `surface-input` | `--input` | `214.3 31.8% 91.4%` | `#E2E8F0` | ⚠️ A visible border-grey, **not** a field fill. Inputs are transparent with this as their border |
| `surface-sidebar-accent` | `--sidebar-accent` | `240 4.8% 95.9%` | `#F4F4F5` | Sidebar hover + active-nav surface. Pair with `text-sidebar-accent-foreground` (§8) |

### Dark surfaces (`.dark`)

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| `surface-0` | `--background` | `240 10% 2%` | `#050506` | App background, deepest layer |
| `surface-1` | `--sidebar-background` | `240 10% 3%` | `#070708` | Sidebar, secondary panels |
| `surface-2` | `--card` | `240 7% 8%` | `#131316` | The **intended** card surface — but ⚠️ **not what `components/ui/card.tsx:12` uses**; that primitive is `bg-background`. This token applies only where you write `bg-card` by hand (§6) |
| `surface-2.5` | `--popover` | `240 7% 10%` | `#18181B` | Popovers, dropdowns, tooltips |
| `surface-3` | `--secondary` | `240 5% 17%` | `#29292E` | Pills/tags/hover **in dark only** — but do **NOT** write `bg-secondary`: it is unprefixed and renders `#FACC15` saturated yellow in light. Use `bg-muted` (neutral in both themes). See §9 |
| `surface-muted` | `--muted` | `240 5% 12%` | `#1D1D20` | Muted surface — sits **above** `--card` (12% vs card's 8%), i.e. between L2 and L3. (The `globals.css:146` comment reading "Between L1 and L2" is stale.) |
| `surface-accent` | `--accent` | `240 5% 15%` | `#242428` | Subtle highlight, hover surface |
| `surface-input` | `--input` | `240 5% 15%` | `#242428` | ⚠️ Input field **BORDERS**, not a fill — same as light (see §4). Shipped `input.tsx:13` is `bg-transparent border border-input` in both themes; production has 110 `border-input` uses against 1 `bg-input` |
| `surface-sidebar-accent` | `--sidebar-accent` | `240 5% 10%` | `#18181B` | Sidebar hover + active-nav surface (same hex as `--popover`, different HSL) |

### Rules
- **Light:** cards need `border` + `shadow-sm` — `bg-card` on `bg-background` is white on white and renders an invisible card.
- **Light elevation primitive:** the `--glass-shadow-sm/md/lg/xl` ramp in the light `:root` (`globals.css:197–204`) is the **sanctioned light-mode elevation primitive**. It already exists in CSS. Use it, or plain `shadow-sm`/`shadow-md`, wherever a light surface needs to lift off the page. No rule in this document bans shadows in light. (Full ramp values in §7.)
- **Dark:** a **hand-written** `bg-card` card sits on `surface-2` over `surface-0`, and that contrast creates perceived depth — so `dark:shadow-none` is safe *on that snippet*. It is **not** a rule to retrofit: the shipped `<Card>` is `bg-background` and reads by its border + shadow instead (§6).
- **Dark:** background-colour elevation is **available, not mandatory**. Do not add `dark:border-0` / `dark:shadow-none` overrides to existing components — see *Shipped reality* below and §9.
- Sidebar uses `surface-1` in both themes, but in light the 2% delta is imperceptible — `border-sidebar-border` carries the separation.
- Popovers use `surface-2.5`: a true float in dark, a shadow-driven float in light.
- **Never** treat `--secondary` as a neutral surface. It is neutral grey in dark and saturated yellow in light. Shipped code has largely abandoned it (33 uses vs `bg-muted`'s 3,352).

> **Shipped reality:** `components/ui/card.tsx:12` is `'rounded-xl border bg-background text-card-foreground shadow'` — border *and* shadow, and note `bg-background`, **not** `bg-card`. **2,068 files** under `app/` + `components/` import this primitive. Against it there is exactly **1** `dark:shadow-none` in the entire repo (`components/Sidebar/Sidebar.tsx:24`), versus several hundred unprefixed `shadow-*` utilities that therefore render in dark too (~350 counting only plain `shadow-sm|md|lg|xl|none` inside class strings, ~670 if variant prefixes such as `hover:` are included — that figure is regex-sensitive; the `1` is exact). The code is right; a doc that banned shadows outright was wrong.

---

## 2. Text Hierarchy

### Light text (default theme — `:root`)

| Role | CSS Variable | HSL | Hex | Usage |
|------|-------------|-----|-----|-------|
| Primary | `--foreground` | `222.2 84% 4.9%` | `#020817` | Near-black. Headings, values, primary content |
| Secondary | `--muted-foreground` | `215.4 16.3% 46.9%` | `#64748B` | Sublabels, descriptions, helper text |
| Tertiary | `--muted-foreground` @ 70% | `text-muted-foreground/70` | — | Units, timestamps, captions |
| Disabled | `--muted-foreground` @ 50% | `text-muted-foreground/50` | — | Locked/disabled state text |

### Dark text (`.dark`)

| Role | CSS Variable | HSL | Hex | Usage |
|------|-------------|-----|-----|-------|
| Primary | `--foreground` | `0 0% 95%` | `#F2F2F2` | Headings, values, primary content |
| Secondary | `--muted-foreground` | `240 4% 63%` | `#9D9DA4` | Sublabels, descriptions, helper text |
| Tertiary | `--muted-foreground` @ 70% | `text-muted-foreground/70` | — | Units, timestamps, captions |
| Disabled | `--muted-foreground` @ 50% | `text-muted-foreground/50` | — | Locked/disabled state text |

> There is **no** `--text-tertiary` or `--text-disabled` custom property in `app/globals.css`. Earlier revisions of this doc listed hardcoded dark hexes for both; they were unenforceable and illegible on white. Use the opacity modifiers above — they invert with the theme automatically.

### Foreground-on-surface tokens (both themes)

| CSS Variable | Light | Dark | Pair with |
|-------------|-------|------|-----------|
| `--card-foreground` | `222.2 84% 4.9%` / `#020817` | `0 0% 95%` / `#F2F2F2` | `bg-card` |
| `--popover-foreground` | `222.2 84% 4.9%` / `#020817` | `0 0% 95%` / `#F2F2F2` | `bg-popover` |
| `--secondary-foreground` | `26 83.3% 14.1%` / `#422006` | `0 0% 90%` / `#E6E6E6` | `bg-secondary` |
| `--accent-foreground` | `222.2 47.4% 11.2%` / `#0F172A` | `0 0% 95%` / `#F2F2F2` | `bg-accent` |
| `--destructive-foreground` | `210 40% 98%` / `#F8FAFC` | `0 0% 100%` / `#FFFFFF` | `bg-destructive` |
| `--sidebar-foreground` | `240 5.3% 26.1%` / `#3F3F46` | `0 0% 90%` / `#E6E6E6` | `bg-sidebar` |
| `--sidebar-accent-foreground` | `240 5.9% 10%` / `#18181B` | `0 0% 90%` / `#E6E6E6` | `bg-sidebar-accent` |

### Rules
*(Token-based and theme-neutral — these invert correctly on their own.)*
- **Page titles**: `text-foreground` + `text-xl font-semibold` or `text-2xl font-bold`
- **Section headers**: `text-foreground` + `text-lg font-semibold`
- **Card labels**: `text-muted-foreground` + `text-xs font-medium uppercase tracking-wider`
- **Metric values**: `text-foreground` + `text-3xl font-bold tracking-tight`
- **Body text**: `text-foreground` + `text-sm` or `text-base`
- **Captions**: `text-muted-foreground` + `text-xs`

---

## 3. Color Tokens

### Brand Colors (identical in both themes — no light/dark split)

| Role | CSS Variable | HSL | Hex | Usage |
|------|-------------|-----|-----|-------|
| Primary | `--primary` | `150 78% 26%` | `#0F7642` | JKKN green — CTAs, active nav, brand elements |
| Primary FG | `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary buttons |
| Ring | `--ring` | `150 78% 26%` | `#0F7642` | Focus outline |
| Sidebar primary | `--sidebar-primary` | `150 78% 26%` | `#0F7642` | Sidebar brand accents |
| Sidebar primary FG | `--sidebar-primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text/icon on `bg-sidebar-primary` |
| Sidebar ring | `--sidebar-ring` | `150 78% 26%` | `#0F7642` | Focus outline inside the sidebar |

> `#0F7642` is the brand green. Any other green in the repo — `#0b6d41`, `#0E8345`, `#0f8f56` — is wrong. `#0E8345` in particular was this document's own miscalculation of `150 78% 26%`; do not eyedrop it into logos or print.

### Semantic / Status Colors — ⚠️ the chart tokens do NOT carry stable meaning across themes

The `--chart-*` slots hold **completely different colours per theme**. A "Success" wired to `--chart-1` is green in dark and **orange** in light. Only `--destructive` keeps its meaning in both.

| Role | CSS Variable | Light HSL / Hex | Dark HSL / Hex | Verdict |
|------|-------------|-----------------|----------------|---------|
| Danger | `--destructive` | `0 84.2% 60.2%` / `#EF4444` | `0 72% 51%` / `#DC2828` | ✅ Safe — red in both |
| chart-1 | `--chart-1` | `12 76% 61%` / `#E76E50` (orange) | `145 80% 42%` / `#15C15D` (green) | ❌ Not "Success" in light |
| chart-2 | `--chart-2` | `173 58% 39%` / `#2A9D90` (teal) | `217 91% 60%` / `#3C83F6` (blue) | ❌ Not "Info" in light |
| chart-3 | `--chart-3` | `197 37% 24%` / `#274754` (dark slate) | `38 92% 50%` / `#F59F0A` (amber) | ❌ Not "Warning" in light |
| chart-4 | `--chart-4` | `43 74% 66%` / `#E8C468` (yellow) | `280 68% 60%` / `#B054DE` (purple) | ❌ Hue flips |
| chart-5 | `--chart-5` | `27 87% 67%` / `#F4A462` (orange) | `340 75% 55%` / `#E23670` (pink) | ❌ Hue flips |

**Use the chart tokens for charts only** (where the set is tuned as a palette per theme, and consistency within one chart is what matters). For status, use explicit theme-paired utilities — see Section 6.

### Rules
- **Never** use brand green (`--primary`) for status/health indicators — they are separate concerns.
- Status colors should always be paired with text or icon (never color-only).
- **Never** map a semantic name (Success / Warning / Info) to a `--chart-*` slot. The meaning does not survive a theme switch.
- Chart palettes are pre-tuned per theme — do not hand-adjust them, but do not assume dark's hues in light either.
- There is no `--success` or `--warning` token in `app/globals.css`. If you need one, add it to **both** `:root` and `.dark` — do not invent it in a component.

---

## 4. Border & Divider System

### Light borders (default theme — `:root`)

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| Default border | `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` | Card borders, dividers — **visible at rest, and that is correct** |
| Input border | `--input` | `214.3 31.8% 91.4%` | `#E2E8F0` | Input field borders |
| Sidebar border | `--sidebar-border` | `220 13% 91%` | `#E5E7EB` | Sidebar edge separator — carries the separation light's 2% surface delta cannot |

### Dark borders (`.dark`)

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| Default border | `--border` | `240 5% 12%` | `#1D1D20` | Card borders, dividers — barely visible until focus |
| Input border | `--input` | `240 5% 15%` | `#242428` | Input field borders |
| Sidebar border | `--sidebar-border` | `240 5% 12%` | `#1D1D20` | Sidebar edge separator |

### Rules
- **Light:** cards need a visible border (`border` = `border-border`). Elevation cannot do the work — see Section 1.
- **Dark:** prefer no visible border on cards; let surface elevation do the work.
- **Dividers use `border-border`, `border-border/50`, or `divide-y`** — all theme-aware. Do **not** use `border-white/[0.06]` or `border-white/[0.12]`: they are invisible on light's white surfaces, and they appear **zero** times in shipped `app/` + `components/` code (they existed only in earlier revisions of this doc).
- Input borders: `border-border` / `border-input` — visible at rest in light, near-invisible in dark, in both cases correct for the theme.
- Focus ring: `ring-ring` (brand green) for keyboard navigation — identical in both themes. Prefer `focus-visible:ring-ring` (88 shipped uses) over `focus:ring-ring` (10).

---

## 5. Spacing & Radius

*(Theme-neutral. `--radius` is declared once in `:root` and is not overridden in `.dark`.)*

### Spacing Scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | `4px` | Inner icon padding, tight gaps |
| `space-2` | `8px` | Icon-to-label, tight component gaps |
| `space-3` | `12px` | Card internal content gaps |
| `space-4` | `16px` | Card padding, section gaps |
| `space-5` | `20px` | Page horizontal padding |
| `space-6` | `24px` | Between major sections |
| `space-8` | `32px` | Top/bottom page margins |

### Border Radius

| Token | Tailwind | Value | Usage |
|-------|----------|-------|-------|
| `radius-control` | `rounded-md` | `6px` | **Buttons, inputs, select triggers** — `calc(var(--radius) - 2px)` via `tailwind.config.ts:70`. This is what every shipped control primitive uses |
| `radius-sm` | `rounded-lg` | `8px` | Tabs list (`tabs.tsx`), dialogs (`sm:rounded-lg`), badges — this is `var(--radius)` itself |
| `radius-md` | `rounded-xl` | `12px` | **Cards** (the shipped `<Card>`), metric tiles, small panels |
| `radius-lg` | `rounded-2xl` | `16px` | Standalone hero panels only — **not** standard cards (see Rules) |
| `radius-xl` | `rounded-3xl` | `24px` | Hero sections |
| `radius-full` | `rounded-full` | `9999px` | Pills, avatars, toggle buttons |

### Rules
- **Cards: `rounded-xl` (12px)** — matches the shipped `components/ui/card.tsx:12` primitive that 2,068 files inherit. `rounded-2xl` (16px) is acceptable for a standalone hero panel, but do not mix within one page. This rule is authoritative over the `radius-lg` table row above.
- **Buttons, inputs and select triggers: `rounded-md` (6px)** — matches the shipped `components/ui/button.tsx:8`, `components/ui/input.tsx:13` and `components/ui/select.tsx:27`, which all derive from `--radius` via `tailwind.config.ts:70` (`calc(var(--radius) - 2px)`). Use `rounded-full` for pills. Do **not** hand-roll `rounded-xl` buttons or inputs — that is double the radius of every shipped control beside them on the page.
- The `--radius` CSS variable is `0.5rem` (8px) — shadcn components derive from this. `tailwind.config.ts:68-72` maps only `lg` (8px) / `md` (6px) / `sm` (4px) from it; `xl`/`2xl`/`3xl`/`full` are Tailwind stock (12/16/24/9999px).

---

## 6. Component Patterns

Every snippet below carries both themes. Light first.

### Metric Card
```
className="rounded-xl border bg-card p-4 space-y-3 shadow-sm dark:shadow-none"
```
- Label: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- Value: `text-3xl font-bold text-foreground`
- **Light:** the `border` + `shadow-sm` are what make the card visible — `bg-card` equals `bg-background` (both `#FFFFFF`).
- **Dark:** `dark:shadow-none` removes the shadow; elevation comes from `bg-card` (`#131316`) sitting on `bg-background` (`#050506`).
- ⚠️ Or use `<Card>` from `components/ui/card` — but it is **not equivalent** to the snippet above. It ships as `rounded-xl border bg-background text-card-foreground shadow`: **`bg-background`, not `bg-card`**, plus an *unprefixed* `shadow`. In **light** the two are identical (both `#FFFFFF`). In **dark** `<Card>` gives the card **no surface lift** (`#050506` on `#050506`) and reads only by its border (`#1D1D20`) and that shadow. That is the shipped treatment 2,068 files already inherit and it is **accepted** — do not "fix" it with `dark:border-0` / `dark:shadow-none`. If you specifically want the dark surface ladder, use the hand-rolled `bg-card` string above and keep `dark:shadow-none`.

### Data List Item
```
className="flex items-center justify-between py-3 border-b border-border last:border-0"
```
or, for a whole list, `divide-y divide-border` on the container. (245 shipped uses of bare `divide-y`, but only **25** pair it with `divide-border` — the other 220 inherit the global `* { @apply border-border }` at `globals.css:230–233` and so happen to be correct anyway. Write the pair explicitly.)
- Title: `text-sm text-foreground`
- Value: `text-lg font-semibold text-foreground`
- Status badge: see below

### Section Header
```
className="text-lg font-semibold text-foreground mb-4"
```
*(Theme-neutral — both tokens invert correctly.)*

### Status Badge
Tailwind's 400-weight ramp is tuned for dark surfaces and **fails WCAG on white**: `emerald-400` = 1.92:1, `amber-400` = 1.67:1, `red-400` = 2.77:1 against `#FFFFFF` — all far below 4.5:1.

**The 600 ramp is not the remedy either.** Measured against the installed Tailwind 3.4 palette on `#FFFFFF`: `green-600` (`#16A34A`) = **3.30:1** and `amber-600` (`#D97706`) = **3.19:1** both still fail; only `red-600` (`#DC2626`) = 4.83:1 passes. Status badges are `text-xs font-medium`, so the 3:1 large-text exemption does **not** apply. Use the **700** weight for green and amber:
```
// Success — green-700 #15803D = 5.02:1 on white ✅
className="text-xs font-medium text-green-700 dark:text-emerald-400"
// Warning — amber-700 #B45309 = 5.02:1 on white ✅
className="text-xs font-medium text-amber-700 dark:text-amber-400"
// Danger  — red-600   #DC2626 = 4.83:1 on white ✅
className="text-xs font-medium text-red-600 dark:text-red-400"
```
⚠️ Shipped code does **not** yet do this: `text-green-600` appears 1,099 times against `text-emerald-400`'s 152. Those 1,099 are **existing accessibility debt, not an endorsement** — new work uses `text-green-700`.

> §9 lists "`text-green-700` for brand" as an anti-pattern. That is about **brand** green only — the brand token is `--primary` `#0F7642`. Using `green-700` as a **status** colour is correct and is not that anti-pattern.

### Interactive Pills / Tags
```
className="bg-muted text-foreground rounded-full px-3 py-1 text-xs font-medium"
```
- Do **not** use `bg-secondary` here. It is neutral grey in dark but `#FACC15` **saturated yellow** in light, with `#422006` brown text. `bg-muted` is neutral in both.

### Buttons
```
// Primary action — brand green, correct in both themes
<Button>Save changes</Button>
// Secondary / cancel action
<Button variant="outline">Cancel</Button>
```
- ⚠️ **Never use `<Button variant="secondary">`.** `components/ui/button.tsx:19–20` defines it as `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80` — which in the **default light theme** is a `#FACC15` saturated-yellow button with `#422006` brown text. Use `variant="outline"` or `variant="ghost"` for a secondary or cancel action. This is the single most likely place to hit the `--secondary` trap on a settings or form page.
- Radius is `rounded-md` (6px), set by the primitive (`button.tsx:8`). Do not override it to `rounded-xl` — see §5.

### Form Controls
Use the shipped primitives; they are already token-correct in both themes. The two traps are `--secondary` (above) and radius (§5).

| Control | Shipped primitive | Base tokens |
|---------|------------------|-------------|
| Input | `components/ui/input.tsx:13` | `bg-transparent border border-input rounded-md` — `--input` is the **border**; the field itself is transparent |
| Select trigger | `components/ui/select.tsx:27` | identical to Input: `bg-transparent border border-input rounded-md` |
| Select content | `components/ui/select.tsx` | `bg-popover text-popover-foreground border shadow-md rounded-md` |
| Switch | `components/ui/switch.tsx:14` | checked `bg-primary`, unchecked `bg-input` — the **only** place in the app where `--input` is used as a fill rather than a border |
| Tabs | `components/ui/tabs.tsx` | list `bg-muted text-muted-foreground rounded-lg`; active trigger `bg-background` + `shadow` |
| Dialog | `components/ui/dialog.tsx:41` | `bg-background border shadow-lg sm:rounded-lg` — like `<Card>` it is `bg-background`, so in dark it separates by border + shadow, not by surface lift |
| Label | `components/ui/label.tsx` | inherits `text-foreground`; pair helper text with `text-muted-foreground` |

### Gradient Hero (use sparingly — max 1 per page)
```
className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-[#1E3A5F] dark:to-[#0A1628] rounded-2xl p-6"
```
- The dark navy pair is dark-only. Unprefixed, it renders a dark slab on a white page.

---

## 7. Glass & Elevation Primitives (both themes)

`.glass-card` is a **dual-theme** utility, and the `--glass-shadow-*` ramp it depends on exists in **both** themes. Light is documented first, per this document's convention. Its full shipped definition (`app/globals.css:421–425`):

```css
.glass-card {
  @apply backdrop-blur-xl bg-white/70 dark:bg-black/40;
  @apply border border-white/20 dark:border-white/10;
  box-shadow: var(--glass-shadow-md);
}
```

- **Light half — the default theme:** `bg-white/70` + `border-white/20`, and `--glass-shadow-md` is a real two-layer drop shadow — `0 4px 16px -4px rgba(0,0,0,0.12), 0 8px 32px -8px rgba(0,0,0,0.08)`. This is a genuine elevation treatment, not a muted one.
- **Dark half:** `bg-black/40` + `border-white/10`, with `--glass-shadow-md` deliberately downgraded to `0 2px 8px -2px rgba(0,0,0,0.5)` plus a faint inset highlight — minimal, by design. The "premium glass over near-black, shadows kept to a minimum to avoid visual noise" aesthetic is **dark only** and does not describe the light theme.

The `--glass-shadow-sm/md/lg/xl` ramp is defined in the light `:root` at `globals.css:197–204` and again in `.dark` at `219–226`. **The light ramp is the sanctioned light-mode elevation primitive** — it is also stated in §1's Rules, which is where an agent looking for light card elevation will actually look.

Use glass sparingly in either theme — it is effectively unused in shipped code: **1 live use** (`app/(routes)/dashboard/classic/_components/widgets/shared/widget-container.tsx:35`). The only other mention is a comment in `principal-dashboard.tsx:26` recording that glass was evaluated and deliberately **not** used.

---

## 8. Navigation

### Sidebar
- Background: `bg-sidebar` — `#FAFAFA` light / `#070708` dark. **Light:** only a 2% delta from the page, so the border below is what actually separates it.
- Border: `border-sidebar-border` — `#E5E7EB` light (visible, load-bearing) / `#1D1D20` dark (ultra-subtle).
- Shadow: `shadow-md dark:shadow-none` — **light keeps the shadow**, dark drops it. This is the shipped line (`components/Sidebar/Sidebar.tsx:24`) and the only `dark:shadow-none` in the entire app.
- Active item: shipped code uses the shadcn Button `secondary` variant (`components/Navbar/menu.tsx:534`), which resolves to `bg-secondary text-secondary-foreground shadow-sm` — **which renders yellow in light mode**. Prefer `bg-sidebar-accent text-sidebar-accent-foreground`, or `bg-primary/10 text-primary` for a brand-tinted active state.
- Inactive: `text-sidebar-foreground` with hover `bg-sidebar-accent`. ⚠️ Shipped code currently uses `dark:text-gray-400` here (`menu.tsx:537`, `CollapseMenuButton.tsx:81`) — that is this document's own Section 9 anti-pattern and is known debt, not a pattern to copy.

### Top Navbar
- Background: `bg-background` with `border-b border-border`
- Shadow: `shadow-sm dark:shadow-secondary` — light gets a real shadow, dark gets a very subtle one. Matches `components/Navbar/Navbar.tsx:89` exactly.
- Keep the `dark:` prefix on `shadow-secondary`: unprefixed it would resolve to a **yellow** shadow in light (`--secondary` = `#FACC15`, Tailwind `yellow-400`).

### Bottom Mobile Nav
- Background: `bg-background border-t border-border` — blends with the page in both themes.
- Active state is a **container** treatment, not an icon colour: `bg-primary/10 ring-1 ring-primary/20`, plus `ring-2 ring-primary/40 ring-offset-1` when active.
- Label carries the state: active `font-semibold text-primary`, inactive `text-muted-foreground`.
- ⚠️ Do **not** signal active state with a white icon. Shipped icons are unconditionally `text-white` over a coloured container (`bg-primary/10`); a bare white icon on `bg-background` is invisible in light mode. If you need an icon to carry state, use `text-primary` / `text-muted-foreground`.

---

## 9. Anti-Patterns (Never Do)

### Universal — wrong in both themes

| Bad | Good | Why |
|-----|------|-----|
| `dark:bg-gray-900` | `bg-sidebar` or `bg-card` | Hardcoded colors bypass the theme system |
| `dark:border-gray-700` | `border-border` or `border-sidebar-border` | Same — use tokens |
| `dark:text-gray-400` | `text-muted-foreground` | Maintains consistency across theme changes |
| `text-green-700` **for brand** | `text-primary` or `text-sidebar-primary` | Brand colour must come from tokens. ⚠️ Scope: *brand only*. `text-green-700` **is** the correct **status** green in light (§6) — that is not this anti-pattern |
| Multiple gradients per page | Max 1 gradient hero section | Overuse looks cheap |
| `bg-secondary` for pills/tags/hover | `bg-muted` | Unprefixed, so it hits the **default** theme, where `--secondary` is `#FACC15` yellow with `#422006` brown text. `bg-muted` is neutral in both |
| `<Button variant="secondary">` | `variant="outline"` or `variant="ghost"` | The `secondary` variant is `bg-secondary text-secondary-foreground` (`button.tsx:19–20`) = a `#FACC15` yellow button with brown text in the default light theme |
| `--chart-*` as a semantic status color | Theme-paired utilities (§6) | Chart hues are completely different per theme |
| `border-white/[0.06]` dividers | `border-border` or `divide-y` | Unprefixed white-alpha is invisible on light's white surfaces. (Dark's glass tokens *do* use `rgba(255,255,255,0.06)` — but that is a CSS token, `--glass-border-light` at `globals.css:215`, not a utility class) |
| Defining `--primary` outside `app/globals.css` | Edit `app/globals.css` | One source of truth; rival palettes exist in several skill docs and are all wrong |

### Dark mode only

| Bad | Good | Why |
|-----|------|-----|
| `dark:shadow-zinc-800` and other **coloured** shadows in dark | `dark:shadow-none`, or simply leave the unprefixed `shadow` | A tinted shadow on a near-black surface reads as noise. Removing it entirely is optional — see the row below |
| Adding `dark:border-0` / `dark:shadow-none` **to existing components** | Leave them as they are | Dark elevation via the surface ladder is **available, not required**. The shipped `<Card>` keeps its border **and** an unprefixed `shadow` in both themes, and 2,068 files inherit that. Production has exactly **1** `dark:shadow-none` against several hundred unprefixed shadows — retrofitting the rest is mass churn against the primitive this document endorses |
| Assuming a dark `<Card>` has surface elevation | Check it | `card.tsx:12` is `bg-background`, not `bg-card` — a dark `<Card>` is page-coloured and reads by its border + shadow (§6) |

### Light mode only (the default)

| Bad | Good | Why |
|-----|------|-----|
| Borderless, shadowless cards **in light** | `border` + `shadow-sm` | `--card` equals `--background` (`#FFFFFF`) — the card is invisible without them |
| `text-emerald-400` / `amber-400` / `red-400` on white — **and also `text-green-600` / `text-amber-600`** | `text-green-700` / `text-amber-700` / `text-red-600` | The 400 ramp is 1.7–2.8:1 on white. The 600 ramp is **not** the fix either: `green-600` = 3.30:1 and `amber-600` = 3.19:1 still fail. WCAG needs 4.5:1; `green-700` and `amber-700` measure 5.02:1, `red-600` 4.83:1. See §6 |
| Relying on the sidebar's surface delta for separation | `border-sidebar-border` | `#FAFAFA` on `#FFFFFF` is a 2% delta — imperceptible |

---

## 10. Tailwind Class Quick Reference

### Surfaces
```
                        LIGHT (default)          DARK
bg-background        →  #FFFFFF                  #050506 surface-0 (deepest)
bg-card              →  #FFFFFF (= background!)  #131316 surface-2 (elevated)
bg-popover           →  #FFFFFF (= background!)  #18181B surface-2.5 (floating)
bg-secondary         →  #FACC15 YELLOW ⚠️        #29292E surface-3 (interactive)
bg-muted             →  #F1F5F9 (use this)       #1D1D20 surface-muted
bg-accent            →  #F1F5F9 subtle highlight #242428 surface-accent
bg-sidebar           →  #FAFAFA                  #070708 sidebar surface
bg-sidebar-accent    →  #F4F4F5 nav hover/active #18181B nav hover/active
```
In light, the first three are the same white — a card or popover needs `border` + `shadow` to read as elevated.
⚠️ `bg-card` is **not** what `<Card>` uses; that primitive is `bg-background`, so a dark `<Card>` has no surface lift (§6).

### Text
```
                            LIGHT (default)    DARK
text-foreground          →  near-black         near-white
text-muted-foreground    →  slate gray         gray
text-primary             →  brand green        brand green (same)
text-destructive         →  error red          error red
text-card-foreground     →  #020817 near-black #F2F2F2 near-white  (set by the Card primitive; rarely written by hand)
text-sidebar-foreground  →  #3F3F46            #E6E6E6             (text in the sidebar)
```

### Borders
```
                            LIGHT (default)    DARK
border-border           →  #E2E8F0 visible    #1D1D20 near-invisible
border-sidebar-border   →  #E5E7EB            #1D1D20
border-input            →  #E2E8F0            #242428
divide-y divide-border  →  list separators (theme-aware — use this)
```
⚠️ `border-white/[0.06]` and `border-white/[0.12]` are **not** part of this system. They are invisible on white and appear zero times in shipped code.

### Interactive States
```
hover:bg-accent         → hover surface
hover:bg-muted          → hover surface (more common in shipped code)
focus-visible:ring-ring → focus outline (brand green, both themes)
active:bg-muted         → pressed state
```

---

## 11. Checklist Before Shipping Any Page

- [ ] **Viewed the page in BOTH themes** — light is the default; dark is one toggle away
- [ ] No hardcoded gray utilities, **prefixed or not** — `bg-gray-*`, `dark:bg-gray-*`, `text-gray-*`, `dark:text-gray-*` — use semantic tokens
- [ ] Cards are visible in **light**: `border` + `shadow-sm` (or the `<Card>` primitive)
- [ ] Cards are visible in **dark** too: `<Card>` ships `bg-background`, so a dark card is page-coloured and reads only by its border + shadow. If you hand-rolled a card and added `dark:shadow-none`, confirm it still separates — that only works with `bg-card`
- [ ] Text hierarchy uses `text-foreground` / `text-muted-foreground` — not gray-*
- [ ] Borders and dividers use `border-border` / `divide-y` — not gray-*, not `border-white/[...]`
- [ ] Status colours are theme-paired (`text-green-700 dark:text-emerald-400`) — NOT brand green, NOT `--chart-*`, and NOT the 600 ramp for green/amber (it fails 4.5:1)
- [ ] No `bg-secondary` on pills, tags, hover states, or `<Button variant="secondary">` (all yellow in light)
- [ ] Maximum 1 gradient section per page, and any hardcoded dark hexes are `dark:`-prefixed
- [ ] Sidebar uses `bg-sidebar` tokens with a visible `border-sidebar-border`
- [ ] All interactive elements have hover/focus states
- [ ] **Contrast ratio >= 4.5:1 for all text — measured, not assumed.** The palette does not guarantee it: on white, Tailwind's 400 ramp is 1.7–2.8:1 and `green-600` (3.30:1) / `amber-600` (3.19:1) fail too. Verified passes: `green-700` 5.02:1, `amber-700` 5.02:1, `red-600` 4.83:1
- [ ] Buttons, inputs and selects use `rounded-md` (6px) — not hand-rolled `rounded-xl` (§5)
