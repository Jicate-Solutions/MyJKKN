// @vitest-environment jsdom

/**
 * The PII rule is the point of this file.
 *
 * buildLastInteraction() runs on every tap on every page of an app that shows
 * learner records, marks, fee ledgers and parent phone numbers, and its output
 * is stored on a bug report that other people read. These tests prove that NO
 * content escapes: no text (visible or aria-label), no element id (real ids are
 * photo filenames with roll numbers, option values…), no attribute other than
 * an authored data-testid / data-slot that looks like a UI name.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  buildLastInteraction,
  buildElementSelector,
  interactionForReport,
  isSafeHook,
  LAST_INTERACTION_MAX_BYTES
} from '@/components/bug-reporter/last-interaction';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

const leaks = (d: unknown, ...needles: string[]) => {
  const s = JSON.stringify(d);
  return needles.filter((n) => s.includes(n));
};

describe('buildLastInteraction — records structure, never content', () => {
  it('anchors a control by its authored data-testid', () => {
    const host = mount('<button data-testid="save-marks" aria-label="Save marks">Save</button>');
    const d = buildLastInteraction(host.querySelector('button'))!;
    expect(d.tagName).toBe('button');
    expect(d.selector).toBe('div > button[data-testid="save-marks"]');
    expect(d.data).toEqual({ 'data-testid': 'save-marks' });
    expect(document.querySelector(d.selector)).toBe(host.querySelector('button'));
  });

  it('never records an element id — here an uploaded photo filename carrying a roll number', () => {
    const host = mount('<section id="photo-24UZO1043.jpg"><button id="opt-24UZO1043">Pick</button></section>');
    const d = buildLastInteraction(host.querySelector('button'))!;
    expect(leaks(d, '24UZO1043', 'photo', 'opt-')).toEqual([]);
    expect(d.selector).toBe('div > section > button');
  });

  it('never records any text: visible text, aria-label, a textarea, a select', () => {
    const link = mount('<a href="/x" aria-label="Open RAVI KUMAR">RAVI KUMAR</a>');
    expect(leaks(buildLastInteraction(link.querySelector('a')), 'RAVI')).toEqual([]);
    const area = mount('<textarea>my phone is 9876543210</textarea>');
    expect(leaks(buildLastInteraction(area.querySelector('textarea')), '9876543210')).toEqual([]);
    const sel = mount('<select><option>RAVI KUMAR</option><option>PRIYA S</option></select>');
    expect(leaks(buildLastInteraction(sel.querySelector('select')), 'RAVI', 'PRIYA')).toEqual([]);
    const input = mount('<input value="42,500" placeholder="Amount" />');
    expect(leaks(buildLastInteraction(input.querySelector('input')), '42,500', 'Amount')).toEqual([]);
  });

  it('drops a data-testid / data-slot built from a record (digits, uuid) — on the element AND its ancestors', () => {
    const host = mount(
      '<tr data-testid="row-24UZO1043"><td data-slot="cell"><button data-testid="edit-3f9a2c1e-0b1d-4c2e-9a7f-1234567890ab">Edit</button></td></tr>'
        .replace(/^/, '<table><tbody>')
        .concat('</tbody></table>')
    );
    const d = buildLastInteraction(host.querySelector('button'))!;
    expect(leaks(d, '24UZO1043', '3f9a2c1e')).toEqual([]);
    expect(d.data).toBeUndefined();
    expect(d.selector).toContain('td[data-slot="cell"]');
  });

  it('isSafeHook accepts UI names only', () => {
    for (const ok of ['save-marks', 'dialog-content', 'Tab_Panel', 'x']) expect(isSafeHook(ok)).toBe(true);
    for (const bad of ['row-24', 'opt-24UZO1043', '3f9a2c1e-0b1d', 'a'.repeat(41), '', null, 'photo.jpg', 'x y'])
      expect(isSafeHook(bad as string | null)).toBe(false);
  });

  it('records a role only when it is a plain word', () => {
    const host = mount('<div role="button"><span>m</span></div>');
    expect(buildLastInteraction(host.querySelector('div[role]'))!.role).toBe('button');
  });

  it('a tap on the icon inside a button anchors the BUTTON, not the svg', () => {
    const host = mount('<button data-testid="delete-row"><svg><path d="M0 0"></path></svg></button>');
    const d = buildLastInteraction(host.querySelector('path'))!;
    expect(d.tagName).toBe('button');
    expect(d.selector.endsWith('button[data-testid="delete-row"]')).toBe(true);
  });

  it('says how many elements the selector matches, so a non-unique anchor is visible', () => {
    const host = mount('<ul><li><button>a</button></li><li><button>b</button></li></ul>');
    expect(buildLastInteraction(host.querySelectorAll('button')[1])!.matches).toBe(2);
    const unique = mount('<button data-testid="only-one">x</button>');
    expect(buildLastInteraction(unique.querySelector('button'))!.matches).toBe(1);
  });

  it('drops an oversized descriptor entirely rather than truncating it', () => {
    const deep = '<div data-slot="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">'.repeat(12);
    const host = mount(`${deep}<button data-testid="go">g</button>${'</div>'.repeat(12)}`);
    const d = buildLastInteraction(host.querySelector('button'));
    if (d) expect(new TextEncoder().encode(JSON.stringify(d)).length).toBeLessThanOrEqual(LAST_INTERACTION_MAX_BYTES);
  });

  it('returns null for a non-element', () => {
    expect(buildLastInteraction(null)).toBeNull();
    expect(buildLastInteraction('button')).toBeNull();
  });
});

describe('buildElementSelector', () => {
  it('never uses :nth-child for a row inside a table', () => {
    const host = mount('<table><tbody><tr><td>1</td></tr><tr><td><button>x</button></td></tr></tbody></table>');
    expect(buildElementSelector(host.querySelector('button')!)).not.toContain('nth');
  });

  it('carries at most four ancestors', () => {
    const host = mount('<div><div><div><div><div><div><span>deep</span></div></div></div></div></div></div>');
    expect(buildElementSelector(host.querySelector('span')!).split(' > ').length).toBeLessThanOrEqual(5);
  });
});

describe('interactionForReport — an anchor never crosses pages', () => {
  it('keeps the tap recorded on this page, drops one recorded on another', () => {
    const descriptor = { tagName: 'button', selector: 'button[data-testid="go"]' };
    expect(interactionForReport({ path: '/fees', descriptor }, '/fees')).toEqual(descriptor);
    expect(interactionForReport({ path: '/fees', descriptor }, '/marks')).toBeUndefined();
    expect(interactionForReport(null, '/fees')).toBeUndefined();
  });
});
