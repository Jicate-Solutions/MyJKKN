// __tests__/meetings/meeting-embed-service.test.ts
//
// Unit suite for the pure parts of the M7 embed/theming service:
//   • buildEmbedSnippets — URL + iframe + popup snippet shape
//   • HEX_COLOR_RE       — the format guard shared by DB CHECK + UI
//   • DEFAULT_THEME_COLOR — the evergreen fallback
//
// readThemeColor is I/O (Supabase) and is exercised by the page integration,
// not here.

import { describe, expect, it } from 'vitest';
import {
  buildEmbedSnippets,
  DEFAULT_THEME_COLOR,
  HEX_COLOR_RE,
} from '@/lib/services/meetings/meeting-embed-service';

describe('HEX_COLOR_RE', () => {
  it('accepts #RRGGBB in either case', () => {
    expect(HEX_COLOR_RE.test('#0E4D34')).toBe(true);
    expect(HEX_COLOR_RE.test('#abcdef')).toBe(true);
    expect(HEX_COLOR_RE.test('#FFFFFF')).toBe(true);
  });

  it('rejects shorthand, missing #, wrong length, and non-hex', () => {
    expect(HEX_COLOR_RE.test('#FFF')).toBe(false); // shorthand
    expect(HEX_COLOR_RE.test('0E4D34')).toBe(false); // no hash
    expect(HEX_COLOR_RE.test('#0E4D3')).toBe(false); // 5 digits
    expect(HEX_COLOR_RE.test('#0E4D344')).toBe(false); // 7 digits
    expect(HEX_COLOR_RE.test('#GGGGGG')).toBe(false); // non-hex
    expect(HEX_COLOR_RE.test('')).toBe(false);
    expect(HEX_COLOR_RE.test('red')).toBe(false);
  });
});

describe('DEFAULT_THEME_COLOR', () => {
  it('is a valid evergreen hex', () => {
    expect(DEFAULT_THEME_COLOR).toBe('#0E4D34');
    expect(HEX_COLOR_RE.test(DEFAULT_THEME_COLOR)).toBe(true);
  });
});

describe('buildEmbedSnippets', () => {
  it('builds the canonical embed URL from origin + handle', () => {
    const { embedUrl } = buildEmbedSnippets('https://www.jkkn.ai', 'jane-doe');
    expect(embedUrl).toBe('https://www.jkkn.ai/embed/jane-doe');
  });

  it('strips a trailing slash from origin and lowercases/trims the handle', () => {
    const { embedUrl } = buildEmbedSnippets('https://www.jkkn.ai/', '  Jane-Doe  ');
    expect(embedUrl).toBe('https://www.jkkn.ai/embed/jane-doe');
  });

  it('iframe snippet contains the embed src and is a self-closing iframe', () => {
    const { iframe, embedUrl } = buildEmbedSnippets('https://x.test', 'h');
    expect(iframe).toContain(`src="${embedUrl}"`);
    expect(iframe).toContain('<iframe');
    expect(iframe).toContain('</iframe>');
    expect(iframe).toContain('loading="lazy"');
  });

  it('popup button opens the embed url in a named window', () => {
    const { popupButton, embedUrl } = buildEmbedSnippets('https://x.test', 'h');
    expect(popupButton).toContain('<button');
    expect(popupButton).toContain(`window.open('${embedUrl}'`);
    expect(popupButton).toContain('Book a meeting');
  });

  it('handles an empty origin without throwing (relative-ish url)', () => {
    const { embedUrl } = buildEmbedSnippets('', 'h');
    expect(embedUrl).toBe('/embed/h');
  });
});
