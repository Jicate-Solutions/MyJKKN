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

/**
 * Collapse runs of near-duplicates into a single representative item carrying
 * __stackCount/__stackItems. Groups smaller than MIN_STACK pass through
 * untouched, so normal mail is unaffected.
 *
 * Input order is preserved (feed is already newest-first), and the newest item
 * of each group becomes the representative.
 */
export function collapseDuplicates(items: any[]): any[] {
  const map = new Map<string, any[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = stackKeyOf(item);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  const out: any[] = [];
  for (const key of order) {
    const group = map.get(key)!;
    if (group.length >= MIN_STACK) {
      out.push({
        ...group[0],
        // LOADED occurrences only — used to decide "is this a stack" and whether
        // every occurrence is read; NEVER rendered as a global total.
        __stackCount: group.length,
        __stackItems: group,
        __stackEvent: eventOf(group[0]),
        __stackPattern: prettifyPattern(
          (group[0].notification || group[0]).title || ''
        )
      });
    } else {
      out.push(...group);
    }
  }
  return out;
}
