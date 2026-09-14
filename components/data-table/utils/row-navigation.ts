import type { KeyboardEvent, MouseEvent } from 'react';

/**
 * Row-level navigation for the shared `DataTable`.
 *
 * A list row on a phone is expected to open when you tap it anywhere. Ours did
 * not: the only tap target was the name `<Link>`, whose box measured 172x17 CSS
 * px on `/organizations/institutions` — a quarter of Apple's 44px minimum. With
 * a mouse a 17px line is hittable; with a thumb it reads as "nothing is
 * clickable".
 *
 * This module is the whole behaviour, kept out of `data-table.tsx` so it can be
 * exercised directly against real DOM nodes instead of only through a mounted
 * table.
 *
 * Opt-in by design: `getRowNavigationProps` returns the table's PREVIOUS props
 * verbatim when no href is supplied, so every table that does not pass
 * `rowHref` renders exactly what it rendered before.
 */

/**
 * Anything inside a row that owns its own click. A tap that starts inside one
 * of these must NOT also open the row.
 *
 *   a               - a real link (the name cell) already navigates, and
 *                     right-click / cmd-click / open-in-new-tab must keep working
 *   button          - the row's overflow (...) trigger, inline actions, and
 *                     Radix primitives which all render as <button>
 *   input           - a native checkbox or any inline editor
 *   label           - clicking a label forwards the click to its control
 *   select/textarea - inline form controls
 *   [role=checkbox] - Radix <Checkbox> renders a <button role="checkbox">; this
 *                     is the entry that keeps the tick box selecting instead of
 *                     navigating
 *   [role=menuitem] - an open dropdown's items are portalled, but a menu nested
 *                     inline must not fall through to the row
 *   [role=menu]     - the menu surface itself, for the same reason
 *   [data-no-row-nav] - the escape hatch for anything else a page needs to
 *                     carve out without editing this list
 */
export const ROW_NAV_INTERACTIVE_SELECTOR =
  'a,button,input,label,select,textarea,[role="checkbox"],[role="menuitem"],[role="menu"],[data-no-row-nav]';

/** True when the event started inside something that owns its own click. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') {
    return false;
  }
  return (target as Element).closest(ROW_NAV_INTERACTIVE_SELECTOR) !== null;
}

/**
 * True when the reader currently has text selected on the page.
 *
 * Dragging across an email address or a phone number to copy it ends in a
 * `mouseup` inside the row, and the browser fires a `click` straight after. With
 * only the interactive-target and modified-click bail-outs, that click opened
 * the row and the selection was destroyed before it could be copied — so on an
 * opted-in table the row's own text was, in practice, uncopyable. The Director:
 * "Let people copy text."
 *
 * Deliberately defensive, because this runs inside a click handler where a throw
 * would break the row entirely:
 *   - `window` may be absent (SSR / a Node test environment)
 *   - `getSelection` may be absent (older or partial DOM implementations)
 *   - `getSelection()` may return null (a document with no browsing context)
 *   - anything unexpected is swallowed and treated as "no selection"
 *
 * In every one of those cases the answer is `false`: an unknown selection state
 * must never block navigation, only a selection we can positively see does.
 *
 * The content is trimmed before it counts. A drag that lands on padding produces
 * a non-collapsed range holding nothing but whitespace, and that is not a copy
 * the reader is trying to protect.
 *
 * Exported on its own so it can be asserted directly, without mounting a table
 * or synthesising a click.
 */
export function hasTextSelection(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (typeof window.getSelection !== 'function') return false;

    const selection = window.getSelection();
    if (!selection) return false;
    if (selection.rangeCount === 0) return false;
    if (selection.isCollapsed) return false;

    return selection.toString().trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * A modified click is the browser's own gesture (new tab, new window, download,
 * range-select) and must reach the real `<a>` rather than be swallowed by a
 * router push.
 */
function isModifiedClick(e: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
}): boolean {
  return Boolean(
    e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (typeof e.button === 'number' && e.button !== 0)
  );
}

export interface RowNavigationProps {
  className?: string;
  onClick?: (e: MouseEvent<HTMLTableRowElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTableRowElement>) => void;
}

export interface RowNavigationOptions {
  /** Destination for this row, or null/undefined for "no row navigation". */
  href: string | null | undefined;
  /** Usually `router.push`. */
  navigate: (href: string) => void;
  /**
   * The row's pre-existing select-on-click handler (`enableClickRowSelect`),
   * or undefined. Used ONLY when there is no href.
   */
  onSelect?: () => void;
}

/**
 * The props a data `TableRow` should spread.
 *
 * No href -> `{ onClick: onSelect }` or `{}`: byte-for-byte the props the row
 * carried before this module existed.
 *
 * With an href -> `cursor-pointer`, a click handler that opens the row unless
 * the tap started on something interactive, carried a modifier, or ended a text
 * selection, and a keyboard handler so Enter/Space follow the same href under
 * the same rules.
 *
 * The text-selection bail-out is on the CLICK path only. A drag-to-copy always
 * ends in a click, which is the gesture that was destroying selections; pressing
 * Enter is a deliberate activation and no selection is lost on the way to it, so
 * blocking it there would only make the keyboard look broken.
 *
 * Selection-vs-navigation, when `enableClickRowSelect` is on AND an href is
 * given: the tick box wins (it is `[role=checkbox]`, so it bails out and
 * toggles selection itself) and every other cell navigates. The row-wide
 * select-on-click is dropped, because a row cannot both open and toggle.
 */
export function getRowNavigationProps({
  href,
  navigate,
  onSelect
}: RowNavigationOptions): RowNavigationProps {
  if (!href) {
    return onSelect ? { onClick: () => onSelect() } : {};
  }

  return {
    className: 'cursor-pointer',
    onClick: (e) => {
      if (isInteractiveTarget(e.target)) return;
      if (isModifiedClick(e)) return;
      // The reader was copying something out of this row. Let them.
      if (hasTextSelection()) return;
      navigate(href);
    },
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (isInteractiveTarget(e.target)) return;
      if (isModifiedClick(e)) return;
      // Stop Space scrolling the page / Enter double-firing a nested default.
      e.preventDefault();
      navigate(href);
    }
  };
}
