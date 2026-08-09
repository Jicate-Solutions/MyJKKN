// Shared near-duplicate collapsing for notification lists — used by BOTH the
// full inbox (notification-center) and the header bell dropdown so they fold
// identically. Extracted 2026-07-26: the bell was showing every raw repeat (20+
// copies of "AI runner appears down") while the inbox already folded them.

/** Minimum repeats before a group collapses. Below this, showing the cards
 *  individually is clearer than showing a stack of 2. Matches the admin grid. */
export const MIN_STACK = 3;

/** Strip digit sequences to derive a stable grouping key, so
 *  "HR brief — 4 active recruitment" and "HR brief — 2 active recruitment"
 *  collapse together. Mirrors the admin grid's stripDigits exactly. */
export function stripDigits(title: string): string {
  return title.replace(/\d+/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Prettified pattern for a collapsed stack: digits become "#". */
export function prettifyPattern(title: string): string {
  return title.replace(/\d+/g, '#');
}

/** The emitter-assigned event id for a notification, if it has one. */
export function eventOf(item: any): string | null {
  const notif = item?.notification || item || {};
  const event = notif?.metadata?.event;
  return typeof event === 'string' && event ? event : null;
}

/**
 * Grouping key for near-duplicate collapsing.
 *
 * Prefers `metadata.event` — the identity the emitter actually assigned. A title
 * is not an identity: the Instagram-silence rows stack only because their titles
 * happen to be byte-identical, and a title change naming each department would
 * shatter that single rollup. stripDigits() is the mirror hazard — it would fuse
 * genuinely distinct handles (jkkn_bba2, jkkn_bba3) into one stack.
 *
 * The title key stays as the MANDATORY fallback: many rows carry no
 * metadata.event at all. Keying on the event also lets old and new rows of the
 * same event co-group regardless of how their titles were worded at the time.
 */
export function stackKeyOf(item: any): string {
  const event = eventOf(item);
  if (event) return `event|${event}`;
  const notif = item.notification || item;
  return `title|${(notif.category || 'uncategorized').toLowerCase()}|${stripDigits(
    notif.title || ''
  )}`;
}

/** The category a notification was filed under, normalised for display. */
export function categoryOf(item: any): string {
  const notif = item?.notification || item || {};
  const category = notif?.category;
  return typeof category === 'string' && category.trim()
    ? category.trim()
    : 'general';
}

/**
 * Generic single-pass fold. One implementation so every list in the app stacks
 * identically — callers differ only in the key they group on.
 *
 * Composable on purpose: `__stackCount` SUMS the counts already carried by its
 * inputs (`__stackCount || 1`) and `__stackItems` flattens theirs, so folding a
 * second time (e.g. duplicates, then category) still reports the number of
 * underlying LOADED rows rather than the number of intermediate groups. On raw
 * input every item counts 1, which is exactly the previous behaviour.
 *
 * Input order is preserved (feed is already newest-first), and the newest item
 * of each group becomes the representative.
 */
export function collapseBy(
  items: any[],
  keyOf: (item: any) => string,
  options: {
    minStack?: number;
    decorate?: (group: any[]) => Record<string, any>;
  } = {}
): any[] {
  const minStack = options.minStack ?? MIN_STACK;
  const map = new Map<string, any[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  const out: any[] = [];
  for (const key of order) {
    const group = map.get(key)!;
    if (group.length >= minStack) {
      out.push({
        ...group[0],
        // LOADED occurrences only — used to decide "is this a stack" and whether
        // every occurrence is read; NEVER rendered as a global total.
        __stackCount: group.reduce(
          (sum, item) => sum + (item?.__stackCount || 1),
          0
        ),
        __stackItems: group.flatMap((item) => item?.__stackItems || [item]),
        ...(options.decorate ? options.decorate(group) : {})
      });
    } else {
      out.push(...group);
    }
  }
  return out;
}

/**
 * Collapse runs of near-duplicates into a single representative item carrying
 * __stackCount/__stackItems. Groups smaller than MIN_STACK pass through
 * untouched, so normal mail is unaffected.
 */
export function collapseDuplicates(items: any[]): any[] {
  return collapseBy(items, stackKeyOf, {
    decorate: (group) => ({
      __stackEvent: eventOf(group[0]),
      __stackPattern: prettifyPattern(
        (group[0].notification || group[0]).title || ''
      )
    })
  });
}

/**
 * Collapse a run of same-CATEGORY rows into one representative.
 *
 * Coarser than collapseDuplicates on purpose: a backlog can be dominated by a
 * single category whose titles are all different (244 distinct 'Alert' rows),
 * which the duplicate fold cannot touch because no two titles or events match.
 * Intended to run AFTER collapseDuplicates so the inner counts survive.
 *
 * The resulting __stackCount is still LOADED occurrences — the number of rows
 * actually fetched into this list — never the global per-category total.
 */
export function collapseByCategory(
  items: any[],
  minStack: number = MIN_STACK
): any[] {
  return collapseBy(items, (item) => `category|${categoryOf(item).toLowerCase()}`, {
    minStack,
    decorate: (group) => ({ __stackCategory: categoryOf(group[0]) })
  });
}
