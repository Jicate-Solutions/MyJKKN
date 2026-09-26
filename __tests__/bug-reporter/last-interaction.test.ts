// @vitest-environment jsdom

/**
 * The PII rule is the point of this file.
 *
 * buildLastInteraction() runs on every tap on every page of an app that shows
 * learner records, marks, fee ledgers and parent phone numbers, and its output
 * is stored on a bug report that other people read. So these tests are not
 * really about the selector — they are about proving that the only text that
 * can ever escape is a control's own label, and that everything else on the
 * page stays on the page.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  buildLastInteraction,
  buildElementSelector,
  LAST_INTERACTION_MAX_BYTES,
  ACCESSIBLE_NAME_MAX_CHARS
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

describe('buildLastInteraction — what it records', () => {
  it('records a control by its aria-label', () => {
    const host = mount(
      '<button id="save-marks" aria-label="Save marks">Save</button>'
    );
    const el = host.querySelector('button')!;

    const d = buildLastInteraction(el);

    expect(d).not.toBeNull();
    expect(d!.tagName).toBe('button');
    expect(d!.id).toBe('save-marks');
    expect(d!.name).toBe('Save marks');
    expect(d!.selector).toBe('button#save-marks');
  });

  it('falls back to a control‘s trimmed text when there is no aria-label', () => {
    const host = mount('<button>  Add   learner </button>');
    const d = buildLastInteraction(host.querySelector('button'));

    expect(d!.name).toBe('Add learner');
  });

  it('caps a control name at 60 characters', () => {
    const long = 'x'.repeat(200);
    const host = mount(`<button aria-label="${long}">go</button>`);
    const d = buildLastInteraction(host.querySelector('button'));

    expect(d!.name).toHaveLength(ACCESSIBLE_NAME_MAX_CHARS);
  });

  it('records the data-testid / data-slot / data-radix hooks', () => {
    const host = mount(
      '<div data-testid="fee-panel" data-slot="card" data-radix-collection-item="" class="p-4">x</div>'
    );
    const d = buildLastInteraction(host.querySelector('[data-testid]'));

    expect(d!.data).toEqual({
      'data-testid': 'fee-panel',
      'data-slot': 'card',
      'data-radix-collection-item': ''
    });
    // class is not a structural hook we record
    expect(JSON.stringify(d)).not.toContain('p-4');
  });

  it('records role, and treats a role=button div as a control', () => {
    const host = mount('<div role="button" aria-label="Open menu">m</div>');
    const d = buildLastInteraction(host.querySelector('[role]'));

    expect(d!.role).toBe('button');
    expect(d!.name).toBe('Open menu');
  });
});

describe('buildLastInteraction — the PII rule', () => {
  it('records NO text for a non-control, however interesting the text is', () => {
    const host = mount(
      '<div class="cell">Anitha R — 9876543210 — fee due 42,500</div>'
    );
    const d = buildLastInteraction(host.querySelector('.cell'));

    expect(d).not.toBeNull();
    expect(d!.name).toBeUndefined();
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain('Anitha');
    expect(serialized).not.toContain('9876543210');
    expect(serialized).not.toContain('42,500');
  });

  it('records no text for a table cell, even inside a control-ish row', () => {
    const host = mount(
      '<table><tbody><tr><td id="c1">Anitha R</td></tr></tbody></table>'
    );
    const d = buildLastInteraction(host.querySelector('td'));

    expect(d!.name).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain('Anitha');
  });

  it('never yields an input‘s value or placeholder', () => {
    const host = mount(
      '<input id="parent-phone" placeholder="Parent mobile number" />'
    );
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = '9876543210';

    const d = buildLastInteraction(input);
    const serialized = JSON.stringify(d);

    expect(d!.tagName).toBe('input');
    expect(d!.name).toBeUndefined();
    expect(serialized).not.toContain('9876543210');
    expect(serialized).not.toContain('Parent mobile number');
  });

  it('skips any attribute whose name mentions value', () => {
    const host = mount(
      '<div data-testid="amount" data-radix-select-value="42,500">x</div>'
    );
    const d = buildLastInteraction(host.querySelector('[data-testid]'));

    expect(d!.data).toEqual({ 'data-testid': 'amount' });
    expect(JSON.stringify(d)).not.toContain('42,500');
  });

  it('drops an oversized descriptor entirely rather than truncating it', () => {
    const host = mount(
      `<div data-testid="${'d'.repeat(LAST_INTERACTION_MAX_BYTES + 100)}">x</div>`
    );
    const d = buildLastInteraction(host.querySelector('[data-testid]'));

    expect(d).toBeNull();
  });

  it('returns null for a non-element', () => {
    expect(buildLastInteraction(null)).toBeNull();
    expect(buildLastInteraction('button')).toBeNull();
    expect(buildLastInteraction(undefined)).toBeNull();
  });
});

describe('buildElementSelector', () => {
  it('never uses :nth-child for a row inside a table', () => {
    const host = mount(`
      <div id="learner-table">
        <table><tbody>
          <tr><td><span class="marks">41</span></td></tr>
          <tr><td><span class="marks">78</span></td></tr>
          <tr><td><span class="marks">92</span></td></tr>
        </tbody></table>
      </div>
    `);
    const third = host.querySelectorAll('span.marks')[2]!;

    const selector = buildElementSelector(third);

    expect(selector).not.toContain('nth-child');
    expect(selector).not.toContain('nth-of-type');
  });

  it('stops at the nearest id, because an id is document-unique', () => {
    const host = mount(
      '<section id="fees"><div><p><em>x</em></p></div></section>'
    );
    const em = host.querySelector('em')!;

    expect(buildElementSelector(em)).toBe('section#fees > div > p > em');
  });

  it('carries at most four ancestors', () => {
    const host = mount(
      '<div><div><div><div><div><div><span>x</span></div></div></div></div></div></div>'
    );
    const span = host.querySelector('span')!;

    const parts = buildElementSelector(span).split(' > ');
    expect(parts).toHaveLength(5); // the element + 4 ancestors
    expect(parts[parts.length - 1]).toBe('span');
  });

  it('prefers a data-testid over a bare tag, and resolves for real', () => {
    const host = mount(
      '<div data-testid="fee-panel"><div><button>Pay</button></div></div>'
    );
    const button = host.querySelector('button')!;

    const selector = buildElementSelector(button);
    expect(selector).toContain('[data-testid="fee-panel"]');
    expect(document.querySelector(selector)).toBe(button);
  });

  it('quotes an id that is not a plain identifier, and still resolves', () => {
    const host = mount('<div id="2026:fees.q1"><span>x</span></div>');
    const span = host.querySelector('span')!;

    const selector = buildElementSelector(span);
    expect(selector).not.toContain('#2026');
    expect(document.querySelector(selector)).toBe(span);
  });
});
