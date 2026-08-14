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

/**
 * HEIGHT ONLY. Sets `min-height: 44px` and nothing else — despite the name,
 * it does not touch width.
 *
 * Use it for *wide* controls, which are already well over 44px across on their
 * own and only need to be made taller: full-width buttons, inputs, select
 * triggers, tab triggers, toggle items. Phones only.
 *
 * A square icon-only button is NOT wide enough for this one — it would end up
 * 44px tall and still ~28px across. Use `TAP_TARGET_ICON` for those.
 */
export const TAP_TARGET = 'max-md:min-h-[44px]';

/**
 * Square icon-only buttons: `size="icon"`, or a `size="sm"` button whose only
 * child is an icon. Sets BOTH min-height and min-width, because these controls
 * are as narrow as they are short.
 *
 * Phones only, so desktop table density is unchanged.
 */
export const TAP_TARGET_ICON = 'max-md:min-h-[44px] max-md:min-w-[44px]';

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
