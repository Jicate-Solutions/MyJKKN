// @vitest-environment jsdom
/**
 * The row you can actually tap.
 *
 * The Director, on his iPhone: "Nothing is clickable, if clicked doesn't take
 * me to the institutions." On `/organizations/institutions` the only tap target
 * in a row was the name `<Link>`, measured at 172x17 CSS px — Apple's minimum is
 * 44. Every other cell (type, contact, status, date) was dead.
 *
 * These tests assert the BEHAVIOUR of the fix, not that the code exists:
 * they build a real `<tr>` with a real tick box, a real overflow button and a
 * real anchor, then fire the handlers with those real nodes as the event target
 * so `closest()` does the same work it does in a browser.
 *
 * The two guarantees under test:
 *   1. With an href, a tap on a plain cell opens the row — and a tap that
 *      starts on the tick box / menu / link does NOT.
 *   2. Without an href, the props are IDENTICAL to what the row carried before
 *      row navigation existed. That is the no-op promise the other 17 list
 *      pages are relying on.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  getRowNavigationProps,
  hasTextSelection,
  isInteractiveTarget,
  ROW_NAV_INTERACTIVE_SELECTOR
} from '@/components/data-table/utils/row-navigation';

const HREF = '/organizations/institutions/abc-123';

/**
 * A row shaped like the real institutions row: tick box column, a name that is
 * a genuine anchor, dead cells, and the overflow menu trigger.
 */
function buildRow() {
  document.body.innerHTML = `
    <table><tbody>
      <tr id="row" tabindex="0">
        <td id="cell-select">
          <button type="button" role="checkbox" id="tickbox" aria-checked="false"></button>
        </td>
        <td id="cell-code"><a id="code-link" href="${HREF}">JKKNCAS</a></td>
        <td id="cell-name"><a id="name-link" href="${HREF}"><span id="name-text">JKKN College</span></a></td>
        <td id="cell-type"><span id="type-badge">Institution</span></td>
        <td id="cell-plain">someone@jkkn.ac.in</td>
        <td id="cell-actions">
          <button type="button" id="menu-trigger">...</button>
        </td>
      </tr>
    </tbody></table>
  `;
  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  return {
    row: byId('row'),
    tickbox: byId('tickbox'),
    codeLink: byId('code-link'),
    nameLink: byId('name-link'),
    nameText: byId('name-text'),
    typeBadge: byId('type-badge'),
    plainCell: byId('cell-plain'),
    menuTrigger: byId('menu-trigger')
  };
}

function clickEvent(target: EventTarget | null, overrides: Record<string, unknown> = {}) {
  return {
    target,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides
  } as never;
}

function keyEvent(
  target: EventTarget | null,
  key: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    target,
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides
  } as never;
}

function navigableProps() {
  const navigate = vi.fn();
  const props = getRowNavigationProps({ href: HREF, navigate });
  return { navigate, props };
}

describe('row navigation — a tap on the row opens the row', () => {
  it('navigates when the tap lands on a plain, non-interactive cell', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('navigates when the tap lands on a non-interactive element inside a cell', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.typeBadge));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('navigates when the tap lands on the row itself', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.row));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('marks the row as pointer-affording so it reads as tappable', () => {
    const { props } = navigableProps();
    expect(props.className).toBe('cursor-pointer');
  });
});

describe('row navigation — the bail-out keeps the row’s own controls working', () => {
  it('does NOT navigate when the tap starts on the tick box', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.tickbox));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate when the tap starts on the overflow menu button', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.menuTrigger));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate when the tap starts on a real anchor — the link owns it', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.nameLink));
    props.onClick?.(clickEvent(dom.codeLink));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('bails out for a tap on a SPAN NESTED inside the anchor, not just the anchor', () => {
    // The realistic thumb tap lands on the text node's element, not the <a>.
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.nameText));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('isInteractiveTarget agrees with the selector on each node', () => {
    const dom = buildRow();
    expect(isInteractiveTarget(dom.tickbox)).toBe(true);
    expect(isInteractiveTarget(dom.menuTrigger)).toBe(true);
    expect(isInteractiveTarget(dom.nameText)).toBe(true);
    expect(isInteractiveTarget(dom.plainCell)).toBe(false);
    expect(isInteractiveTarget(dom.typeBadge)).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });

  it('honours the [data-no-row-nav] escape hatch', () => {
    const dom = buildRow();
    dom.typeBadge.setAttribute('data-no-row-nav', '');
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.typeBadge));

    expect(navigate).not.toHaveBeenCalled();
    expect(ROW_NAV_INTERACTIVE_SELECTOR).toContain('[data-no-row-nav]');
  });
});

describe('row navigation — modified clicks belong to the browser', () => {
  const modifiers = [
    ['cmd (new tab on macOS)', { metaKey: true }],
    ['ctrl (new tab elsewhere)', { ctrlKey: true }],
    ['shift (new window)', { shiftKey: true }],
    ['alt (download)', { altKey: true }],
    ['middle button', { button: 1 }]
  ] as const;

  for (const [label, overrides] of modifiers) {
    it(`does NOT router.push on a ${label} click`, () => {
      const dom = buildRow();
      const { navigate, props } = navigableProps();

      props.onClick?.(clickEvent(dom.plainCell, overrides));

      expect(navigate).not.toHaveBeenCalled();
    });
  }
});

describe('row navigation — a tappable row is reachable without a mouse', () => {
  it('Enter on a focused row navigates', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onKeyDown?.(keyEvent(dom.row, 'Enter'));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('Space on a focused row navigates and prevents the page scrolling', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();
    const e = keyEvent(dom.row, ' ') as unknown as {
      preventDefault: { mock: { calls: unknown[] } };
    };

    props.onKeyDown?.(e as never);

    expect(navigate).toHaveBeenCalledWith(HREF);
    expect(e.preventDefault.mock.calls.length).toBe(1);
  });

  it('Enter pressed while focus is inside the row’s menu button does NOT navigate', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onKeyDown?.(keyEvent(dom.menuTrigger, 'Enter'));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('Enter pressed on the tick box does NOT navigate', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();

    props.onKeyDown?.(keyEvent(dom.tickbox, 'Enter'));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('any other key is left alone — no navigation, no preventDefault', () => {
    const dom = buildRow();
    const { navigate, props } = navigableProps();
    const e = keyEvent(dom.row, 'a') as unknown as {
      preventDefault: { mock: { calls: unknown[] } };
    };

    props.onKeyDown?.(e as never);

    expect(navigate).not.toHaveBeenCalled();
    expect(e.preventDefault.mock.calls.length).toBe(0);
  });
});

describe('the no-op guarantee for the other 17 list pages', () => {
  it('with no href the row gets NO className, NO onClick and NO onKeyDown', () => {
    const props = getRowNavigationProps({ href: null, navigate: vi.fn() });

    expect(props).toEqual({});
    expect(props.className).toBeUndefined();
    expect(props.onClick).toBeUndefined();
    expect(props.onKeyDown).toBeUndefined();
  });

  it('undefined href behaves the same as null', () => {
    expect(
      getRowNavigationProps({ href: undefined, navigate: vi.fn() })
    ).toEqual({});
  });

  it('with no href, enableClickRowSelect still toggles selection and nothing else', () => {
    const dom = buildRow();
    const onSelect = vi.fn();
    const props = getRowNavigationProps({
      href: null,
      navigate: vi.fn(),
      onSelect
    });

    props.onClick?.(clickEvent(dom.plainCell));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(props.className).toBeUndefined();
    expect(props.onKeyDown).toBeUndefined();
  });

  it('a row whose rowHref returns null for THIS row is inert, even on an opted-in table', () => {
    const dom = buildRow();
    const navigate = vi.fn();
    const props = getRowNavigationProps({ href: null, navigate });

    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('with an href, the row-wide select-on-click is dropped — navigation wins', () => {
    // Selection is not lost: the tick box is [role=checkbox], so it bails out
    // of navigation and toggles itself. A row cannot both open and toggle.
    const dom = buildRow();
    const onSelect = vi.fn();
    const navigate = vi.fn();
    const props = getRowNavigationProps({ href: HREF, navigate, onSelect });

    props.onClick?.(clickEvent(dom.plainCell));
    props.onClick?.(clickEvent(dom.tickbox));

    expect(onSelect).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(HREF);
  });
});

/**
 * Dragging across an email address in a row to copy it ends in a `mouseup`, and
 * the browser fires a `click` immediately after. Before the selection guard,
 * that click opened the row and the selection was gone before it could be
 * copied — so on an opted-in table the row's own text was, in practice,
 * uncopyable. The Director: "Let people copy text."
 *
 * These use jsdom's real Selection API — a real Range over a real text node —
 * rather than a stub, so `toString()` does the same work it does in a browser.
 */
describe('row navigation — a drag to copy text does not open the row', () => {
  afterEach(() => {
    // Restore FIRST: a test that stubbed getSelection into throwing would
    // otherwise take this cleanup down with it and leak into the next test.
    vi.restoreAllMocks();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* nothing to clear */
    }
  });

  /** Select the contents of a node the way a drag across it would. */
  function selectContentsOf(node: Node) {
    const selection = window.getSelection();
    if (!selection) throw new Error('jsdom gave no Selection to test with');
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }

  it('navigates when nothing is selected (the collapsed, everyday case)', () => {
    const dom = buildRow();
    window.getSelection()?.removeAllRanges();
    const { navigate, props } = navigableProps();

    expect(hasTextSelection()).toBe(false);

    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('does NOT navigate when the click ends a real selection of the row’s text', () => {
    const dom = buildRow();
    const selection = selectContentsOf(dom.plainCell);
    const { navigate, props } = navigableProps();

    // Guard the guard: prove jsdom really made a non-collapsed selection with
    // text in it, so a green test cannot be an artefact of an empty one.
    expect(selection.isCollapsed).toBe(false);
    expect(selection.toString()).toContain('@jkkn.ac.in');
    expect(hasTextSelection()).toBe(true);

    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('still navigates after the selection is cleared', () => {
    const dom = buildRow();
    selectContentsOf(dom.plainCell);
    window.getSelection()?.removeAllRanges();
    const { navigate, props } = navigableProps();

    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('a whitespace-only selection is not a copy worth protecting — it navigates', () => {
    document.body.innerHTML =
      '<table><tbody><tr id="row"><td id="blank">   </td></tr></tbody></table>';
    const blank = document.getElementById('blank') as HTMLElement;
    const selection = selectContentsOf(blank);
    const { navigate, props } = navigableProps();

    expect(selection.isCollapsed).toBe(false);
    expect(hasTextSelection()).toBe(false);

    props.onClick?.(clickEvent(blank));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('an absent getSelection does not throw and does not block navigation', () => {
    const dom = buildRow();
    const original = window.getSelection;
    // Deliberately remove the API the guard has to survive.
    delete (window as Partial<Window>).getSelection;

    try {
      expect(() => hasTextSelection()).not.toThrow();
      expect(hasTextSelection()).toBe(false);

      const { navigate, props } = navigableProps();
      props.onClick?.(clickEvent(dom.plainCell));
      expect(navigate).toHaveBeenCalledWith(HREF);
    } finally {
      window.getSelection = original;
    }
  });

  it('a getSelection that returns null does not throw and does not block navigation', () => {
    const dom = buildRow();
    vi.spyOn(window, 'getSelection').mockReturnValue(null);

    expect(() => hasTextSelection()).not.toThrow();
    expect(hasTextSelection()).toBe(false);

    const { navigate, props } = navigableProps();
    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('a getSelection that throws is treated as "no selection", not as an error', () => {
    const dom = buildRow();
    vi.spyOn(window, 'getSelection').mockImplementation(() => {
      throw new Error('no browsing context');
    });

    expect(() => hasTextSelection()).not.toThrow();
    expect(hasTextSelection()).toBe(false);

    const { navigate, props } = navigableProps();
    props.onClick?.(clickEvent(dom.plainCell));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });

  it('the keyboard path is deliberately NOT selection-guarded — Enter still opens the row', () => {
    // A drag-to-copy always ends in a click, never in Enter. Blocking Enter
    // while a selection happens to be lying around would only make the
    // keyboard look broken.
    const dom = buildRow();
    selectContentsOf(dom.plainCell);
    const { navigate, props } = navigableProps();

    expect(hasTextSelection()).toBe(true);

    props.onKeyDown?.(keyEvent(dom.plainCell, 'Enter'));

    expect(navigate).toHaveBeenCalledWith(HREF);
  });
});
