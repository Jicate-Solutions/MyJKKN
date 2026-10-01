/**
 * What the reporter was last looking at, reduced to STRUCTURE ONLY.
 *
 * WHY THERE IS A TEXT RULE IN HERE
 * --------------------------------
 * This descriptor is built by a pointerdown listener that fires on EVERY tap on
 * EVERY page of MyJKKN, and the result is stored on a bug report that is then
 * read by admins who are not the person who filed it. Those pages carry learner
 * records, marks, fee ledgers and parent phone numbers, so any text scraped off
 * the DOM is potentially somebody's personal data leaving the screen it was
 * meant for. A phone number is not a person at JKKN, and a table row is not a
 * label — identity must not be reconstructable out of this object.
 *
 * So the rule is: record structure, never content.
 *   - recorded: the tag, `role` (when it passes isSafeHook), how many
 *     elements the selector matches, and
 *     two AUTHORED hooks — `data-testid` and `data-slot` — only when the value
 *     looks like a UI name (letters, dashes, underscores; no run of 3+ digits,
 *     no uuid, at most 40 characters). The same rule applies to every ancestor
 *     in the selector.
 *   - NEVER recorded (W12 blind review, 27 Sep): element ids — real controls
 *     use uploaded learner-photo filenames (they carry roll numbers) and option
 *     values as ids; any text, visible or aria-label (a label can be built from
 *     a record, "Remove RAVI"); an input's value or placeholder; data-radix-*
 *     and every other attribute.
 *
 * A tap usually lands on an icon or a span INSIDE the control; the descriptor
 * is built for the nearest control around the tap (see interactionTarget), so
 * the anchor names the button, not its <svg>.
 *
 * The whole serialized descriptor is capped at 512 bytes and DROPPED (not
 * truncated) when it exceeds that, because half a selector is worse than none.
 */

/** A descriptor larger than this is dropped outright rather than truncated. */
export const LAST_INTERACTION_MAX_BYTES = 512;

/** The CSS path carries the element plus at most this many ancestors. */
export const SELECTOR_MAX_ANCESTORS = 4;

/** The only attributes ever recorded — authored hooks that name UI. */
const STRUCTURAL_ATTRS = ['data-testid', 'data-slot'] as const;

/**
 * An authored hook names UI ("save-marks", "dialog-content"); a value built
 * from a record carries digits or an id. Only the former is recorded.
 */
export function isSafeHook(value: string | null): value is string {
  return (
    !!value &&
    value.length <= 40 &&
    /^[A-Za-z][A-Za-z_-]*[A-Za-z]$|^[A-Za-z]$/.test(value)
  );
}

export interface LastInteractionDescriptor {
  /** Lower-cased tag name, e.g. 'button'. */
  tagName: string;
  /** Short CSS path, resolvable with document.querySelector. */
  selector: string;
  role?: string;
  /** data-testid / data-slot values that pass isSafeHook. */
  data?: Record<string, string>;
  /** How many elements `selector` matched when recorded; 1 = a unique anchor. */
  matches?: number;
}

/** Duck-typed Element check — survives cross-realm elements (iframes). */
function isElementLike(value: unknown): value is Element {
  const el = value as Element | null;
  return (
    !!el &&
    typeof el === 'object' &&
    typeof (el as Element).tagName === 'string' &&
    typeof (el as Element).getAttribute === 'function'
  );
}

/** The authored hooks on an element that pass isSafeHook. */
function collectStructuralAttributes(
  el: Element
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const name of STRUCTURAL_ATTRS) {
    const value = el.getAttribute(name);
    if (isSafeHook(value)) out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function selectorPartFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute('data-testid');
  if (isSafeHook(testId)) return `${tag}[data-testid="${testId}"]`;
  const slot = el.getAttribute('data-slot');
  if (isSafeHook(slot)) return `${tag}[data-slot="${slot}"]`;
  return tag;
}

/**
 * A short, human-readable CSS path. Deliberately never uses `:nth-child`: on a
 * list of records that index identifies a ROW, which both leaks position and
 * goes stale the moment the data changes.
 */
export function buildElementSelector(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let hops = 0;

  while (node && hops <= SELECTOR_MAX_ANCESTORS) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') break;

    parts.unshift(selectorPartFor(node));

    node = node.parentElement;
    hops += 1;
  }

  return parts.length > 0 ? parts.join(' > ') : el.tagName.toLowerCase();
}

const CONTROL_SELECTOR =
  'button, a, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';

/**
 * The element a tap MEANT: the nearest control around the tapped node (a tap on
 * a button lands on its <svg>, <path> or <span>), else the tapped node itself.
 */
export function interactionTarget(target: unknown): unknown {
  if (!isElementLike(target)) return target;
  const control = typeof target.closest === 'function' ? target.closest(CONTROL_SELECTOR) : null;
  return control ?? target;
}

function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

/**
 * Build the descriptor for one element, or null when there is nothing safe and
 * useful to record (not an element, or over the byte cap).
 */
export function buildLastInteraction(
  tapped: unknown
): LastInteractionDescriptor | null {
  const target = interactionTarget(tapped);
  if (!isElementLike(target)) return null;
  const el = target;

  const descriptor: LastInteractionDescriptor = {
    tagName: el.tagName.toLowerCase(),
    selector: buildElementSelector(el)
  };

  // A role is recorded only when it passes the same isSafeHook test as a data
  // hook (letters, - and _, no digits) — ARIA roles are single words, so this
  // admits every real role and nothing built from a record.
  const role = el.getAttribute('role');
  if (role && isSafeHook(role)) descriptor.role = role;

  const data = collectStructuralAttributes(el);
  if (data) descriptor.data = data;

  // How many elements the selector matches right now. Without :nth-child (see
  // buildElementSelector) a selector can match several — say so rather than
  // let a verifier's link land on the first one as if it were the one.
  const doc = el.ownerDocument;
  if (doc && typeof doc.querySelectorAll === 'function') {
    try {
      descriptor.matches = doc.querySelectorAll(descriptor.selector).length;
    } catch {
      /* an unresolvable selector just carries no count */
    }
  }

  // Over the cap it is dropped, not trimmed — a half selector resolves to the
  // wrong element, which is worse than having no anchor at all.
  if (byteLength(JSON.stringify(descriptor)) > LAST_INTERACTION_MAX_BYTES) {
    return null;
  }

  return descriptor;
}

/** The last interaction, stored with the page path it was recorded on. */
export interface StoredInteraction {
  path: string;
  descriptor: LastInteractionDescriptor;
}

/**
 * What goes on a report filed at `pathname`: the stored descriptor only if it
 * was recorded on this same page. A tap on the page before is not the anchor
 * of a report about this one.
 */
export function interactionForReport(
  stored: StoredInteraction | null,
  pathname: string
): LastInteractionDescriptor | undefined {
  return stored && stored.path === pathname ? stored.descriptor : undefined;
}
