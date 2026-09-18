// @vitest-environment jsdom

/**
 * The deep link half: a bug report's link carries ?bugFocus / ?bugScroll, and
 * this is what happens when the page opens.
 *
 * The rules that matter here are defensive. The selector comes from whatever
 * the reporter happened to be touching, so it can be invalid, or point at an
 * element that no longer exists — neither may break the page it is on, and
 * neither may leave the verifier at the top of a long screen with no clue.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  BugReportFocus,
  applyBugFocus,
  parseBugFocusParams,
  HIGHLIGHT_CLASS
} from '@/components/bug-reporter/bug-report-focus';

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn();
  Object.defineProperty(window, 'scrollTo', {
    value: scrollTo,
    writable: true,
    configurable: true
  });
  // jsdom has no scrollIntoView
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: vi.fn(),
    writable: true,
    configurable: true
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

function setSearch(search: string) {
  window.history.replaceState({}, '', `/fees${search}`);
}

describe('parseBugFocusParams', () => {
  it('reads both params', () => {
    expect(parseBugFocusParams('?bugFocus=%23save&bugScroll=840')).toEqual({
      focus: '#save',
      scroll: 840
    });
  });

  it('is empty when neither param is present', () => {
    expect(parseBugFocusParams('?tab=marks')).toEqual({
      focus: null,
      scroll: null
    });
  });

  it('refuses a non-integer scroll rather than guessing', () => {
    expect(parseBugFocusParams('?bugScroll=abc').scroll).toBeNull();
    expect(parseBugFocusParams('?bugScroll=12.5').scroll).toBeNull();
    expect(parseBugFocusParams('?bugScroll=-40').scroll).toBeNull();
    expect(parseBugFocusParams('?bugScroll=').scroll).toBeNull();
  });

  it('treats a blank selector as absent', () => {
    expect(parseBugFocusParams('?bugFocus=%20%20').focus).toBeNull();
  });
});

describe('applyBugFocus', () => {
  it('finds the element, scrolls it into view and outlines it', () => {
    document.body.innerHTML = '<button id="save-marks">Save</button>';
    const button = document.getElementById('save-marks')!;

    const highlighted = applyBugFocus({ focus: '#save-marks', scroll: 900 });

    expect(highlighted).toBe(button);
    expect(button.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'smooth'
    });
    expect(button.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
    // the element won — no blind jump
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('swallows a selector that throws, and falls back to bugScroll', () => {
    document.body.innerHTML = '<div>content</div>';

    expect(() =>
      applyBugFocus({ focus: 'div:has-bogus((', scroll: 640 })
    ).not.toThrow();
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('falls back to bugScroll when the element is simply gone', () => {
    document.body.innerHTML = '<div>content</div>';

    const highlighted = applyBugFocus({ focus: '#not-here', scroll: 320 });

    expect(highlighted).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith(0, 320);
  });

  it('does nothing at all when neither param is present', () => {
    document.body.innerHTML = '<div>content</div>';

    expect(applyBugFocus({ focus: null, scroll: null })).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing when the selector misses and there is no bugScroll', () => {
    document.body.innerHTML = '<div>content</div>';

    applyBugFocus({ focus: '#not-here', scroll: null });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('uses behavior auto when the viewer prefers reduced motion', () => {
    document.body.innerHTML = '<button id="save-marks">Save</button>';
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: true }),
      writable: true,
      configurable: true
    });

    applyBugFocus({ focus: '#save-marks', scroll: null });

    expect(
      document.getElementById('save-marks')!.scrollIntoView
    ).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });
});

describe('<BugReportFocus />', () => {
  it('renders nothing', () => {
    setSearch('?bugFocus=%23save-marks');
    const { container } = render(<BugReportFocus />);

    expect(container.innerHTML).toBe('');
  });

  it('scrolls to bugScroll on mount', async () => {
    setSearch('?bugScroll=560');
    render(<BugReportFocus />);

    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 560));
  });

  it('never touches the page when neither param is present', async () => {
    setSearch('?tab=marks');
    render(<BugReportFocus />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the URL exactly as it found it', async () => {
    setSearch('?bugFocus=%23save-marks&bugScroll=200&tab=marks');
    document.body.innerHTML = '<button id="save-marks">Save</button>';
    const before = window.location.search;

    render(<BugReportFocus />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(window.location.search).toBe(before);
  });
});
