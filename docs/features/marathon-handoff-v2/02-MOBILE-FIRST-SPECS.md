# KBM Marathon 2.0 — Mobile-First Responsive Specs

> **The #1 priority.** 95% of organizers will use MyJKKN on their phones — committee leads walking around campus, registration desk staff, checkpoint volunteers, race day coordinators.

## Design Principles

1. **Mobile-first** — design for 375px width, then adapt upward
2. **Card layouts** — replace all DataTable instances on mobile with tappable cards
3. **Touch targets** — minimum 44px for all interactive elements
4. **Thumb zone** — primary actions in bottom third of screen
5. **One-hand operation** — everything reachable with thumb
6. **Progressive disclosure** — show summary on card, detail on tap
7. **Offline-friendly** — race day may have patchy signal

## Page-by-Page Specifications

---

### 1. Events List (`/events/marathon/page.tsx`) — 357 lines

**Current:** DataTable with 7 columns (Name, Year, Date, Venue, Status, Target, Actions). Columns squeeze on mobile.

**Mobile redesign:**
- Replace DataTable with **vertical card list**
- Each event = one tappable card showing:
  - Status badge (top-left) + "3 days away" (top-right)
  - Event name (bold, 16px)
  - Date + Time + Venue (icon + text, 14px)
  - Target registrations (bottom)
  - Chevron right (tap affordance)
- Tap card → navigate to dashboard
- "Create Event" button: `size="sm"` with abbreviated text on mobile ("New" vs "Create Event")
- Search bar: full-width, 44px height
- Status change: native `<select>` dropdown (not shadcn Select — easier on mobile)
- Delete: icon button within card (super admin only)

**Breakpoints:**
- `< 640px` (sm): Card list, compact header, abbreviated button text
- `>= 640px`: Same card list but wider cards, more spacing
- `>= 1024px` (lg): Optional — could switch to DataTable for desktop users

**Components to modify:** Just page.tsx. No sub-components.

---

### 2. Dashboard (`/events/marathon/[id]/dashboard/page.tsx`) — 749 lines

**Current:** 4-quadrant grid (Registrations, Sponsors, Tasks, Budget). Uses `grid grid-cols-1 md:grid-cols-2`. Already stacks on mobile.

**Mobile improvements needed:**
- **Remove breadcrumbs on mobile** — `hidden sm:flex` on `<PageBreadcrumb>`
- **Compact event header** — event name truncated to 1 line, status badge inline
- **Stat cards** — already use Cards, but:
  - Make the primary number larger (40px on mobile)
  - Progress bars should be taller (6px instead of 4px) for finger visibility
  - "View all" links should be 44px tap targets
- **Quick Navigation grid** — currently `grid-cols-3`. Good for mobile. But:
  - Icons should be 24px (currently 20px)
  - Tap area should be minimum 60x60px per icon
  - Labels should wrap properly on narrow screens
- **Registration Statistics section** — already uses responsive grid. Good.

**Effort:** Small — mostly CSS class adjustments, no structural changes.

---

### 3. Registrations (`/events/marathon/[id]/registrations/page.tsx`) — 1085 lines

**Current:** DataTable with columns (BIB, Name, Phone, Category, Status, Payment, Check-in, Actions). The largest and most used page.

**Mobile redesign:**
- **Replace DataTable with card list** on mobile:
  ```
  ┌─────────────────────────────┐
  │ KUM-2026-5K-0001    Paid ✓  │  ← BIB + payment badge
  │ KARTHIKA SYAMA T.S          │  ← Name (bold)
  │ 📱 9043222809 · 5 KM Run    │  ← Phone + category
  │ B.Tech IT, Sem IV · O+      │  ← Program + blood group
  │ ☐ Not checked in            │  ← Check-in status (tappable)
  └─────────────────────────────┘
  ```
- **Search bar** at top: search by name, BIB, or phone
- **Filter pills**: Category (10K/5K), Payment (Paid/Pending), Check-in (Yes/No)
- **Floating Action Button** (bottom-right): "+ Register" opens a bottom sheet form
- **Registration form** (currently a dialog): Convert to **full-screen bottom sheet** on mobile
  - Large input fields (48px height)
  - Category selection as big tappable cards (not dropdown)
  - Custom data fields: blood group, t-shirt size, emergency contact
  - Submit button: full-width, 48px, sticky at bottom
- **Check-in toggle**: Single tap on the card's check-in area marks as checked in (optimistic update)
- **Bulk check-in**: "Scan BIB" button that opens camera for QR/barcode scanning
- **Stats bar at top**: Total | Checked In | 10K | 5K — scrollable horizontal on mobile

**Breakpoints:**
- `< 640px`: Card list + bottom sheet form + floating action button
- `>= 640px`: Card list with wider cards, 2-column stats bar
- `>= 1024px`: Switch to DataTable (desktop users)

**This is the highest-effort page.** Estimated ~400 lines of changes.

---

### 4. Registration Detail (`/events/marathon/[id]/registrations/[regId]/page.tsx`) — 446 lines

**Current:** Detail view with participant info, payment details, checkpoint scans, result.

**Mobile improvements:**
- Stack all sections vertically (likely already done)
- **Check-in button**: Large, prominent, centered — 60px height
- **Call participant**: Phone number should be a `tel:` link (tappable to call)
- **Emergency contact**: Also a `tel:` link
- **Custom data** (blood group, t-shirt): Badge-style display, not table

---

### 5. Committees (`/events/marathon/[id]/committees/page.tsx`) — 1224 lines

**Current:** Accordion per committee with embedded task table.

**Mobile redesign:**
- **Committee cards** instead of accordion:
  ```
  ┌─────────────────────────────┐
  │ 🏥 First Aid & Refreshments │  ← Committee name
  │ Lead: MRS. RENUKA M         │  ← Lead name
  │ ████████░░ 1/3 tasks done   │  ← Progress bar
  │ ⚠ 1 critical task overdue   │  ← Alert if any
  └─────────────────────────────┘
  ```
- **Tap card** → expand inline to show task list
- **Task items** as checkable list:
  ```
  ☐ Confirm ambulance standby        CRITICAL  Apr 10
  ☐ Stock medical supplies            CRITICAL  Apr 11
  ☑ Prepare refreshment stations      HIGH      Apr 11
  ```
- **Tap checkbox** → mark task complete (optimistic update)
- **Long press task** → edit task details (bottom sheet)
- **"Add Task" button** per committee — bottom sheet form
- **Committee lead info**: Phone number as `tel:` link for one-tap call

**Breakpoints:**
- `< 640px`: Card list with inline task expansion
- `>= 1024px`: Side-by-side (committee list left, tasks right)

---

### 6. Budget (`/events/marathon/[id]/budget/page.tsx`) — 721 lines

**Current:** DataTable with budget items.

**Mobile redesign:**
- **Summary card at top**:
  ```
  ┌─────────────────────────────┐
  │ Total Budget: ₹6.19L        │
  │ Spent: ₹0 (0%)              │
  │ ████████████░░░░░░░ 0%      │
  └─────────────────────────────┘
  ```
- **Item cards** below:
  ```
  ┌─────────────────────────────┐
  │ 🏥 Medical          Planned │
  │ Ambulance, first aid kits   │
  │ Est: ₹30,000  Actual: ₹0   │
  └─────────────────────────────┘
  ```
- **Tap card** → edit (inline or bottom sheet)
- **"Add Item" floating button**
- **Category filter pills**: All, Refreshments, Printing, Stage, Medical, etc.

---

### 7. Live Ops (`/events/marathon/[id]/live/page.tsx`) — 379 lines + 8 components

**Current:** 3-state page (pre-race / live / post-race) with map, panels, and controls.

**Mobile redesign — This is the most critical race-day page:**
- **Pre-race state**: Countdown timer + "Start Race" button (full-width, 60px, red)
- **Live state**:
  - **Full-screen map** as background (fill viewport)
  - **Floating stats bar** at top: Tracking | On Course | Finished | Avg Pace
  - **Bottom sheet** (draggable) with 4 tabs:
    - Checkpoints (throughput)
    - Incidents (log/resolve)
    - Volunteers (check-in)
    - Alerts (stationary runners)
  - **"Report Incident" FAB** (red, bottom-right)
  - **Runner detail**: Tap dot on map → slide-over panel
- **Post-race state**: "End Race" button + "Import Results" button

**Components to modify:**
- `live/page.tsx` — layout restructure
- `race-controls.tsx` — larger buttons on mobile
- `live-runner-map.tsx` — full-viewport on mobile
- `runner-stats-bar.tsx` — horizontal scroll on mobile
- `checkpoint-panel.tsx` — card list
- `incident-panel.tsx` — card list + floating report button
- `volunteer-panel.tsx` — card list
- `stationary-alerts.tsx` — alert cards with medical dispatch button

---

### 8. Results (`/events/marathon/[id]/results/page.tsx`) — 589 lines

**Mobile redesign:**
- Card list instead of table (BIB, Name, Finish Time, Rank)
- "Import from GPS" button: prominent, full-width on mobile
- Manual entry: bottom sheet form
- Filter: Category dropdown + search by BIB/name

### 9. Sponsors (`/events/marathon/[id]/sponsors/page.tsx`) — 547 lines

**Mobile redesign:**
- Card list with pipeline stage badge (Lead → Contacted → Committed)
- Swipe left to see quick actions (call, email, note)
- "Add Sponsor" floating button

### 10. Analytics (`/events/marathon/[id]/analytics/page.tsx`) — 517 lines

**Mobile improvements:**
- Charts should be full-width with horizontal scroll if needed
- Race replay: full-screen map with play/pause overlay
- Already uses responsive Recharts — mostly OK

### 11. Certificates (`/events/marathon/[id]/certificates/page.tsx`) — 415 lines

**Mobile improvements:**
- Card list of certificate-eligible participants
- "Generate All" button: full-width
- Individual certificate preview: full-screen

### 12. Settings (`/events/marathon/[id]/settings/page.tsx`) — 1297 lines

**Mobile improvements:**
- Tab navigation should be scrollable horizontal (not wrapping)
- Form fields: full-width, 48px height
- Save button: sticky at bottom

### 13-14. New Event + Events Hub

- New event form: already form-based, needs larger inputs on mobile
- Events hub: simple page, minimal changes needed

---

## Implementation Order (by impact)

| Priority | Page | Lines | Effort | Impact |
|----------|------|-------|--------|--------|
| 1 | Registrations | 1085 | High | Used 50x/day by registration committee |
| 2 | Events List | 357 | Medium | Entry point, first impression |
| 3 | Committees | 1224 | High | 6 committee leads use daily |
| 4 | Live Ops | 379+800 | High | Race day critical |
| 5 | Dashboard | 749 | Low | Already mostly responsive |
| 6 | Budget | 721 | Medium | Finance team |
| 7 | Results | 589 | Medium | Post-race |
| 8-14 | Rest | ~3500 | Low | Less frequently used |

## Shared Mobile Patterns to Build

Create these reusable components (or use existing shadcn/ui + Tailwind patterns):

1. **MobileCardList** — replaces DataTable on `< 640px`, shows DataTable on `>= 1024px`
2. **BottomSheet** — slide-up form/panel (use Radix Dialog with mobile positioning)
3. **FloatingActionButton** — fixed bottom-right, 56px circle
4. **FilterPills** — horizontal scrollable badges for filtering
5. **StatsBar** — horizontal scrollable stat cards
6. **MobileChecklist** — checkbox + title + priority badge + due date

## CSS Utilities to Add

```css
/* Touch target enforcement */
.touch-target { min-height: 44px; min-width: 44px; }

/* Full-viewport map */
.map-fullscreen { position: fixed; inset: 0; z-index: 10; }

/* Bottom sheet positioning */
.bottom-sheet { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20; }

/* Floating action button */
.fab { position: fixed; bottom: 24px; right: 24px; z-index: 30; }
```
