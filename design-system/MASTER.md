# MyJKKN Design System — Dark Cinema Theme

> Source of Truth for all UI development. Inspired by Ultrahuman's premium dark interface.
> Default theme: **Dark Mode** | Brand: **JKKN Green**

---

## 1. Surface Elevation System

The core principle: **depth via background color, NOT shadows or borders**.

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| `surface-0` | `--background` | `240 10% 2%` | `#050506` | App background, deepest layer |
| `surface-1` | `--sidebar-background` | `240 10% 3%` | `#080809` | Sidebar, secondary panels |
| `surface-2` | `--card` | `240 7% 8%` | `#141416` | Cards, metric tiles, elevated content |
| `surface-2.5` | `--popover` | `240 7% 10%` | `#191A1C` | Popovers, dropdowns, tooltips |
| `surface-3` | `--secondary` | `240 5% 17%` | `#2A2A2E` | Pills, tags, interactive surfaces, hover states |
| `surface-input` | `--input` | `240 5% 15%` | `#242428` | Input field backgrounds |

### Rules
- Cards sit on `surface-2`, background is `surface-0` — the contrast creates perceived depth
- NO `box-shadow` in dark mode — use background color elevation only
- Sidebar uses `surface-1` (darker than main) for visual separation
- Popovers use `surface-2.5` to float above cards

---

## 2. Text Hierarchy

| Role | CSS Variable | HSL | Hex | Opacity | Usage |
|------|-------------|-----|-----|---------|-------|
| Primary | `--foreground` | `0 0% 95%` | `#F2F2F2` | 100% | Headings, values, primary content |
| Secondary | `--muted-foreground` | `240 4% 63%` | `#9E9EA6` | ~65% | Sublabels, descriptions, helper text |
| Tertiary | — | `240 4% 43%` | `#6B6B73` | ~40% | Units, timestamps, captions |
| Disabled | — | `240 4% 27%` | `#404048` | ~25% | Locked/disabled state text |

### Rules
- **Page titles**: `text-foreground` + `text-xl font-semibold` or `text-2xl font-bold`
- **Section headers**: `text-foreground` + `text-lg font-semibold`
- **Card labels**: `text-muted-foreground` + `text-xs font-medium uppercase tracking-wider`
- **Metric values**: `text-foreground` + `text-3xl font-bold tracking-tight`
- **Body text**: `text-foreground` + `text-sm` or `text-base`
- **Captions**: `text-muted-foreground` + `text-xs`

---

## 3. Color Tokens

### Brand Colors

| Role | CSS Variable | HSL | Hex | Usage |
|------|-------------|-----|-----|-------|
| Primary | `--primary` | `150 78% 26%` | `#0E8345` | JKKN green — CTAs, active nav, brand elements |
| Primary FG | `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary buttons |

### Semantic / Status Colors

| Role | CSS Variable | HSL | Hex | Usage |
|------|-------------|-----|-----|-------|
| Success | `--chart-1` | `145 80% 42%` | `#22C55E` | Positive status, "Within Range", completion |
| Info | `--chart-2` | `217 91% 60%` | `#3B82F6` | Informational, neutral data, links |
| Warning | `--chart-3` | `38 92% 50%` | `#F59E0B` | Caution, "Borderline", pending states |
| Danger | `--destructive` | `0 72% 51%` | `#EF4444` | Errors, "Out of Range", destructive actions |
| Purple | `--chart-4` | `280 68% 60%` | `#A855F7` | Secondary metrics, categories |
| Pink | `--chart-5` | `340 75% 55%` | `#EC4899` | Highlights, tertiary categories |

### Rules
- **Never** use brand green (`--primary`) for status/health indicators — they are separate concerns
- Status colors should always be paired with text or icon (never color-only)
- Chart colors are pre-tuned for dark backgrounds — no further adjustment needed

---

## 4. Border & Divider System

| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| Default border | `--border` | `240 5% 12%` | Card borders, input borders, dividers |
| Sidebar border | `--sidebar-border` | `240 5% 12%` | Sidebar edge separator |
| Hairline divider | — | `rgba(255,255,255,0.06)` | Ultra-subtle list item separators |
| Strong divider | — | `rgba(255,255,255,0.12)` | Section separators |

### Rules
- Prefer **no visible border** on cards — let surface elevation do the work
- Use hairline dividers (`border-white/[0.06]`) only for list items within a card
- Input borders: `border-border` which is barely visible until focus
- Focus ring: `ring-ring` (brand green) for keyboard navigation

---

## 5. Spacing & Radius

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
| `radius-sm` | `rounded-lg` | `8px` | Badges, tags, small inputs |
| `radius-md` | `rounded-xl` | `12px` | Buttons, inputs, small cards |
| `radius-lg` | `rounded-2xl` | `16px` | Cards, metric tiles, panels |
| `radius-xl` | `rounded-3xl` | `20px` | Hero sections, modals |
| `radius-full` | `rounded-full` | `999px` | Pills, avatars, toggle buttons |

### Rules
- Cards: always `rounded-2xl` (16px) in dark mode
- Buttons: `rounded-xl` (12px) for action buttons, `rounded-full` for pills
- The `--radius` CSS variable is `0.5rem` (8px) — shadcn components derive from this

---

## 6. Component Patterns

### Metric Card
```
className="bg-card rounded-2xl p-4 space-y-3"
```
- Label: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- Value: `text-3xl font-bold text-foreground`
- No border, no shadow — elevation via `bg-card` on `bg-background`

### Data List Item
```
className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0"
```
- Title: `text-sm text-foreground`
- Value: `text-lg font-semibold text-foreground`
- Status badge: colored text matching semantic palette

### Section Header
```
className="text-lg font-semibold text-foreground mb-4"
```

### Status Badge
```
// Success
className="text-xs font-medium text-emerald-400"
// Warning
className="text-xs font-medium text-amber-400"
// Danger
className="text-xs font-medium text-red-400"
```

### Interactive Pills / Tags
```
className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium"
```

### Gradient Hero (use sparingly — max 1 per page)
```
className="bg-gradient-to-b from-[#1E3A5F] to-[#0A1628] rounded-2xl p-6"
```

---

## 7. Glassmorphism (Dark Mode)

Use glass effects sparingly for premium elevated surfaces:

```
className="glass-card"
// Resolves to: backdrop-blur-xl bg-black/40 border border-white/10
```

Glass shadows are intentionally minimal in dark mode to avoid visual noise.

---

## 8. Navigation

### Sidebar
- Background: `bg-sidebar` (surface-1, darker than main)
- Active item: `bg-sidebar-accent text-sidebar-accent-foreground`
- Inactive: `text-sidebar-foreground` with hover `bg-sidebar-accent`
- Border: `border-sidebar-border` (ultra-subtle)
- No shadow in dark mode (`dark:shadow-none`)

### Top Navbar
- Background: `bg-background` with `border-b border-border`
- Shadow: `dark:shadow-secondary` (very subtle)

### Bottom Mobile Nav
- Background should blend with the page — same `bg-background`
- Active icon: white, Inactive: muted

---

## 9. Anti-Patterns (Never Do)

| Bad | Good | Why |
|-----|------|-----|
| `dark:bg-gray-900` | `bg-sidebar` or `bg-card` | Hardcoded colors bypass the theme system |
| `dark:border-gray-700` | `border-border` or `border-sidebar-border` | Same — use tokens |
| `dark:text-gray-400` | `text-muted-foreground` | Maintains consistency across theme changes |
| `dark:shadow-zinc-800` | `dark:shadow-none` | Dark mode uses elevation, not shadows |
| `text-green-700` for brand | `text-primary` or `text-sidebar-primary` | Brand color must come from tokens |
| `box-shadow` on cards | Background color difference | Ultrahuman-style depth perception |
| Borders on every card | Borderless cards with bg elevation | Cleaner, more premium look |
| Multiple gradients per page | Max 1 gradient hero section | Overuse looks cheap |

---

## 10. Tailwind Class Quick Reference

### Surfaces
```
bg-background        → surface-0 (deepest)
bg-card              → surface-2 (elevated)
bg-popover           → surface-2.5 (floating)
bg-secondary         → surface-3 (interactive)
bg-muted             → between L1-L2
bg-accent            → subtle highlight
bg-sidebar           → sidebar surface
```

### Text
```
text-foreground          → primary text (white-ish)
text-muted-foreground    → secondary text (gray)
text-primary             → brand green
text-destructive         → error red
text-card-foreground     → text on cards
text-sidebar-foreground  → text in sidebar
```

### Borders
```
border-border           → default subtle border
border-sidebar-border   → sidebar edge
border-input            → input field border
border-white/[0.06]     → hairline divider
border-white/[0.12]     → strong divider
```

### Interactive States
```
hover:bg-accent         → hover surface
hover:bg-secondary      → stronger hover
focus:ring-ring         → focus outline (brand green)
active:bg-secondary     → pressed state
```

---

## 11. Checklist Before Shipping Any Page

- [ ] No hardcoded `dark:bg-gray-*` or `dark:text-gray-*` — use semantic tokens
- [ ] Cards use `bg-card rounded-2xl` with no shadow in dark mode
- [ ] Text hierarchy uses `text-foreground` / `text-muted-foreground` — not gray-*
- [ ] Borders use `border-border` or `border-white/[0.06]` — not gray-*
- [ ] Status colors use semantic palette (green/amber/red) — NOT brand green
- [ ] Maximum 1 gradient section per page
- [ ] Sidebar uses `bg-sidebar` tokens
- [ ] All interactive elements have hover/focus states
- [ ] Contrast ratio >= 4.5:1 for all text (auto-met with this palette)
- [ ] No `box-shadow` on cards in dark mode
