import { describe, it, expect } from 'vitest';
import {
  convertLegacyTamilToUnicode,
  containsTamilUnicode,
  looksLikeLegacyTamil,
  TAMIL_LEGACY_ENCODINGS,
} from '@/lib/utils/tamil-legacy-encoding';

describe('Legacy Tamil font → Unicode', () => {
  describe('Bamini conversion', () => {
    it('converts a consonant+vowel-sign syllable', () => {
      // K = மு, "j;" = த், J = து
      expect(convertLegacyTamilToUnicode('Kj;J', 'bamini')).toBe('முத்து');
    });

    it('reorders pre-base vowel signs (legacy visual order → Unicode logical order)', () => {
      // The whole point of longest-match-first: `nf` is கெ, NOT ெ followed by க.
      expect(convertLegacyTamilToUnicode('nf', 'bamini')).toBe('கெ');
      expect(convertLegacyTamilToUnicode('Nf', 'bamini')).toBe('கே');
      expect(convertLegacyTamilToUnicode('if', 'bamini')).toBe('கை');
    });

    it('prefers the 3-char sequence over its 2-char and 1-char prefixes', () => {
      // `nfh` (கொ) must not be split into `nf` (கெ) + `h`.
      expect(convertLegacyTamilToUnicode('nfh', 'bamini')).toBe('கொ');
      expect(convertLegacyTamilToUnicode('nfs', 'bamini')).toBe('கௌ');
      expect(convertLegacyTamilToUnicode('Nfh', 'bamini')).toBe('கோ');
    });

    it('converts a multi-word name and preserves the space', () => {
      // "fkyh" = க+ம+ல+ா -> கமலா ; "Njtp" = தே+வ+ி -> தேவி
      expect(convertLegacyTamilToUnicode('fkyh Njtp', 'bamini')).toBe('கமலா தேவி');
    });

    it('passes unmapped characters through untouched', () => {
      expect(convertLegacyTamilToUnicode('123 - .', 'bamini')).toBe('123 - .');
    });

    it('returns empty input unchanged', () => {
      expect(convertLegacyTamilToUnicode('', 'bamini')).toBe('');
    });
  });

  describe('SunTommy differences', () => {
    it('shares the overwhelming majority of Bamini mappings', () => {
      expect(convertLegacyTamilToUnicode('Kj;J', 'suntommy')).toBe('முத்து');
      expect(convertLegacyTamilToUnicode('nfh', 'suntommy')).toBe('கொ');
    });

    it('uses its own codes for the three syllables that differ', () => {
      expect(convertLegacyTamilToUnicode('@', 'suntommy')).toBe('ளூ');
      expect(convertLegacyTamilToUnicode('#', 'suntommy')).toBe('சூ');
      expect(convertLegacyTamilToUnicode('q+', 'suntommy')).toBe('ஙூ');
    });

    it('does not honour the Bamini codes for those three syllables', () => {
      // `Sh` is ளூ in Bamini but not a SunTommy sequence, so it falls through
      // to the shorter matches S (ளு) + h (unmapped alone).
      expect(convertLegacyTamilToUnicode('Sh', 'bamini')).toBe('ளூ');
      expect(convertLegacyTamilToUnicode('Sh', 'suntommy')).not.toBe('ளூ');
    });
  });

  describe('detection helpers', () => {
    it('recognises text that already holds Unicode Tamil', () => {
      expect(containsTamilUnicode('முத்து')).toBe(true);
      expect(containsTamilUnicode('Kj;J')).toBe(false);
      expect(containsTamilUnicode('')).toBe(false);
    });

    it('flags ASCII-only text as needing conversion', () => {
      expect(looksLikeLegacyTamil('Kj;J')).toBe(true);
    });

    it('never flags already-converted Unicode (guards against double conversion)', () => {
      expect(looksLikeLegacyTamil('முத்து')).toBe(false);
    });

    it('ignores blank and punctuation-only input', () => {
      expect(looksLikeLegacyTamil('   ')).toBe(false);
      expect(looksLikeLegacyTamil('123')).toBe(false);
    });
  });

  describe('table integrity', () => {
    it('is idempotent on its own Unicode output', () => {
      for (const encoding of TAMIL_LEGACY_ENCODINGS) {
        const once = convertLegacyTamilToUnicode('Kj;J', encoding);
        expect(convertLegacyTamilToUnicode(once, encoding)).toBe(once);
      }
    });

    it('emits only Tamil codepoints for a fully-mapped name', () => {
      const result = convertLegacyTamilToUnicode('fkyh', 'bamini');
      expect(result).toMatch(/^[஀-௿]+$/);
    });
  });
});
