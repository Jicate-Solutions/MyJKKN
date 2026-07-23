/**
 * The 8 program categories the "Show by category" view collapses the 8
 * institutions into. Order matters — chart legend renders in this order.
 *
 * Categories match the SQL helper fn `_yoy_program_category` exactly; if
 * you add/rename a category here, update the SQL fn in migration
 * 20260602233000_fn_yoy_drill_down_rpcs.sql.
 */
export const CATEGORIES = [
  'UG ENG',
  'PG ENG',
  'B.Ed',
  'Nursing',
  'Pharmacy',
  'Dental',
  'Allied Health',
  'Arts & Sci',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Color per category. Earth tones intentionally — match the chart's
 * editorial aesthetic. Director's locked palette avoids default Tailwind
 * blues/greens/purples to escape AI-slop aesthetics.
 */
export const CATEGORY_COLOURS: Record<Category, string> = {
  'UG ENG':        '#c8553d', // terracotta
  'PG ENG':        '#a8453c', // deeper terracotta
  'B.Ed':          '#7a8c5a', // sage
  'Nursing':       '#5a7548', // forest moss
  'Pharmacy':      '#8b6c42', // burnt sienna
  'Dental':        '#a07b56', // warm caramel
  'Allied Health': '#c4baaa', // warm taupe
  'Arts & Sci':    '#7c8a93', // slate
};
