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
 *   - always recorded: tagName, id, role, how many elements the selector
 *     matches, and the `data-testid` / `data-slot` /
 *     `data-radix-*` hooks, which are authored by us and name UI, not people.
 *   - text: ONLY a CONTROL's authored `aria-label` (button, a, input, select,
 *     textarea, summary, or role=button/link/tab/menuitem), capped at 60
 *     characters. NEVER a control's visible text (review, 27 Sep): a
 *     textarea's text IS what the person typed, a select's text is every
 *     option in it (often people's names), and a link or button in a record
 *     list is routinely the learner's own name ("RAVI KUMAR →").
 *   - never, for anything: visible text, an input's value or placeholder,
 *     table cell contents, or any attribute whose name contains "value".
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

/** An accessible name longer than this is cut; labels are UI copy, not prose. */
export const ACCESSIBLE_NAME_MAX_CHARS = 60;

/** The CSS path carries the element plus at most this many ancestors. */
export const SELECTOR_MAX_ANCESTORS = 4;

/** Tags that are controls, and whose accessible name is therefore UI copy. */
const CONTROL_TAGS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary'
]);

/** Roles that make a non-control tag behave as a control. */
const CONTROL_ROLES = new Set(['button', 'link', 'tab', 'menuitem']);

/** Structural hooks worth recording. `data-radix-*` is matched by prefix. */
const STRUCTURAL_ATTRS = new Set(['data-testid', 'data-slot']);
const STRUCTURAL_ATTR_PREFIX = 'data-radix-';

export interface LastInteractionDescriptor {
  /** Lower-cased tag name, e.g. 'button'. */
  tagName: string;
  /** Short CSS path, resolvable with document.querySelector. */
  selector: string;
  id?: string;
  role?: string;
  /** Accessible name — present only for controls, capped at 60 chars. */
  name?: string;
  /** data-testid / data-slot / data-radix-* names and values. */
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

function quoteAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** `#id` when the id is a plain identifier, `[id="..."]` when it is not. */
function idSelector(id: string): string {
  return /^[A-Za-z_-][\w-]*$/.test(id)
    ? `#${id}`
    : `[id="${quoteAttrValue(id)}"]`;
}

function isControl(el: Element): boolean {
  if (CONTROL_TAGS.has(el.tagName.toLowerCase())) return true;
  const role = el.getAttribute('role');
  return !!role && CONTROL_ROLES.has(role.toLowerCase());
}

/**
 * Structural hooks only, and never an attribute whose name mentions "value" —
 * `data-radix-*` internals occasionally carry the selected value of a control.
 */
function collectStructuralAttributes(
  el: Element
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const names = el.getAttributeNames ? el.getAttributeNames() : [];

  for (const rawName of names) {
    const name = rawName.toLowerCase();
    if (name.includes('value')) continue;
    const isStructural =
      STRUCTURAL_ATTRS.has(name) || name.startsWith(STRUCTURAL_ATTR_PREFIX);
    if (!isStructural) continue;
    out[name] = el.getAttribute(rawName) ?? '';
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The authored `aria-label` of a CONTROL. Returns undefined for everything
 * else — see the text rule at the top of this file. Never reads visible text,
 * value or placeholder.
 */
function accessibleName(el: Element): string | undefined {
  if (!isControl(el)) return undefined;

  const raw = el.getAttribute('aria-label') ?? '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return undefined;

  return collapsed.slice(0, ACCESSIBLE_NAME_MAX_CHARS);
}

function selectorPartFor(el: Element): string {
  const tag = el.tagName.toLowerCase();

  const id = el.getAttribute('id');
  if (id) return `${tag}${idSelector(id)}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `${tag}[data-testid="${quoteAttrValue(testId)}"]`;

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

    // An id is document-unique; nothing above it adds precision.
    if (node.getAttribute('id')) break;

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

  const id = el.getAttribute('id');
  if (id) descriptor.id = id;

  const role = el.getAttribute('role');
  if (role) descriptor.role = role;

  const name = accessibleName(el);
  if (name) descriptor.name = name;

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
