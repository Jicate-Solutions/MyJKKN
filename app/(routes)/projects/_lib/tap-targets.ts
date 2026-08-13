/**
 * Minimum touch-target sizing for the Projects module.
 *
 * A touch target needs to be at least 44x44 CSS px to be reliably hit with a
 * thumb. The shadcn primitives this module is built from all render smaller
 * than that: Button/Input/SelectTrigger are 36px, size="sm" buttons 32px,
 * TabsTrigger 28px, and a breadcrumb link is only as tall as its 20px line box.
 *
 * These constants raise the *hit area* without redesigning anything:
 *   - Controls grow only below `md` (768px), so desktop stays pixel-identical.
 *   - Breadcrumb links keep their text size and their place in the row: the
 *     padding that makes them 44px tall is pulled straight back out with an
 *     equal negative margin, so the row's own height never changes.
 *
 * Apply with `cn()` so a call site can still add its own classes.
 */

/** Buttons, inputs, select triggers, tab triggers, toggle items. Phones only. */
export const TAP_TARGET = 'max-md:min-h-[44px]';

/**
 * TabsList is a fixed-height pill (h-9). Let it grow around its now-44px
 * triggers on phones instead of clipping them.
 */
export const TAP_TARGET_TABS_LIST = 'max-md:h-auto';

/**
 * Applied to `<Breadcrumb>`: expands every crumb link in the trail to a 44px
 * tall hit area. Layout-neutral (padding in, equal negative margin out), so it
 * is safe to apply at every breakpoint.
 */
export const TAP_TARGET_BREADCRUMB =
  '[&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:items-center [&_a]:py-3 [&_a]:-my-3';
