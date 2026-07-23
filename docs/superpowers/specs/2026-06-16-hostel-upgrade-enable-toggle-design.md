# Hostel Category Upgrade — per-category "Allow upgrades" toggle

**Date:** 2026-06-16
**Status:** Approved design — pending implementation plan
**Related:** category upgrade module (`fn_my_upgrade_*`, `fn_self_upgrade_*`), My Hostel page, hostel/mess category settings.

## Problem

The self-service category-upgrade feature on the My Hostel page is currently shown to **every** hosteller whose current category has a higher-fee tier available. There is no way for an admin to control, per category, whether residents in that category may see/use the upgrade feature. Operationally this is needed to close over-subscribed tiers (e.g. the Premium Room rush that was just reset) and to roll the feature out gradually.

## Goal

Give admins a per-category on/off switch that controls whether the upgrade options appear on My Hostel.

**Confirmed decisions:**
- **Gate basis = the learner's CURRENT category (source gate).** If the category the learner is *in* has upgrades enabled, they see the upgrade card with all higher options; if disabled, they see only their current category (no upgrade card).
- **Default = OFF (opt-in).** New flag defaults to disabled. After deploy, no learner sees upgrade options until an admin enables it per category — a clean slate on top of the waitlist reset (mig `20260616050000`).
- **Scope = Room **and** Mess.** Independent flags on `hostel_categories` and `mess_categories`.
- **First-booking is exempt.** The room card is shared between first-booking (`mode='book'`) and upgrades; the gate must never block a brand-new resident from booking their first room.

## Approach (chosen)

**Client gates visibility + server enforces on entry actions.**
- The My Hostel tab hides the upgrade cards when the current category's flag is off (the category-summary card still renders → "current category only").
- The upgrade *entry* action RPCs reject a disabled-category upgrade as defense-in-depth, while exempting first-booking.

Rejected alternatives: gating inside the shared room *list* RPC (risks breaking first-booking, needs has-allocation logic threaded in); pure client gate (violates the repo's never-trust-the-client norm).

## Design

### 1. Data model
Add to **both** tables:
```sql
ALTER TABLE public.hostel_categories ADD COLUMN upgrades_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.mess_categories   ADD COLUMN upgrades_enabled boolean NOT NULL DEFAULT false;
```
- `NOT NULL DEFAULT false` → existing rows backfill to `false` (opt-in default).
- Register the new column on both tables in `types/supabase.ts` (Row/Insert/Update).
- Mirror into `supabase/setup/01_tables.sql`.

### 2. Admin UI
- **Room** — `app/(routes)/campus-living/settings/categories/_components/hostel-category-form-dialog.tsx`: add an "Allow upgrades" `Switch` (mirror the existing `is_active` switch). Thread through the zod schema, `defaultValues`, `form.reset` (create + edit), and the create/update payload.
- **Mess** — `app/(routes)/campus-living/mess/categories/_components/mess-category-form-dialog.tsx`: same `Switch` + wiring.
- Update the `HostelCategory` / mess-category TS types and the `useHostelCategories` / mess-categories create+update service calls to carry `upgrades_enabled`.
- (Out of v1 scope: an inline toggle in the categories data-table row.)

### 3. Learner visibility — `app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx`
- Render `<RoomCategoryUpgradeCard mode='upgrade'>` only when `currentCategory?.upgrades_enabled === true`.
- Render `<MessCategoryUpgradeCard>` only when `messCategory?.upgrades_enabled === true`.
- The "Your Category Assignment" summary card always renders.
- The `showBook` first-booking path is unchanged.
- `getMyHostelSummary` (`use-my-hostel` hook/service) must include `upgrades_enabled` in the `hostelCategory` and `messCategory` objects it returns.

### 4. Server enforcement (entry actions only)
Reject upgrades from a disabled **source** category in:
- `fn_self_upgrade_room_category` — only when the learner has an active allocation (so first-booking, where `v_has_alloc` is false, is exempt).
- `fn_self_upgrade_category_only` — gate on the current category's flag.
- `fn_self_join_upgrade_waitlist` — gate on the current category's flag.
- `fn_self_upgrade_mess_category` — gate on the current **mess** category's flag.

`fn_self_leave_upgrade_waitlist` is **NOT** gated — a learner must always be able to cancel an existing hold after the category is disabled.

Each gate raises a clear exception, e.g. `Upgrades are currently disabled for your category`. Mirror the updated function bodies into `supabase/setup/02_functions.sql` (note: that file has known duplicate/stale copies — update the live definition, don't blindly append).

### 5. Permissions / RLS
No new permission key. Editing the flag rides on the existing category-edit permission and RLS (only a new column on tables admins already update). Learner-facing reads already pass RLS; the added column needs no policy change.

## Edge cases (deliberate)
- **Disabled category → no message, just hidden.** Matches "show current category only"; no "upgrades disabled" banner.
- **Pre-existing pending upgrade + category later disabled.** The pending badge still shows (informational); the upgrade card is hidden; the learner can still pay or cancel the existing hold (`leave` is ungated; payment confirmation engine is unaffected).
- **Auto-category resident awaiting first allocation** (`allocation_mode='auto'`, no allocation) — client hides the upgrade card when their category flag is off; the action RPC does not block their first booking (`v_has_alloc=false`).
- **Learner with NULL current category** — no flag to satisfy → no upgrade card (consistent with opt-in default).

## Out of scope
- Inline data-table toggle (could be a fast follow).
- Any change to the upgrade *fee*, threshold, hold, or billing logic.
- Mess "book" flow (mess has no first-booking card).

## Verification
- `mcp__ide__getDiagnostics` clean on every touched TS file.
- Browser smoke (super-admin): toggle off for a category → that category's residents see the summary but no upgrade card; toggle on → card returns. Confirm first-booking still works for a manual-category resident with no allocation.
- Direct-RPC check: calling `fn_self_upgrade_room_category` for an allocated learner whose category is disabled raises the exception; `fn_self_leave_upgrade_waitlist` still succeeds.
