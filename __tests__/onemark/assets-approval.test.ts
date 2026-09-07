/**
 * OneMark Wave 3 Lane D — the alt-text rule (ruling #4).
 *
 *   "alt text is MANDATORY and the review queue must refuse to approve an item
 *    whose image lacks it."
 *
 * These hold the rule itself. The routes are the enforcement point — POST and
 * PATCH both call `altTextProblem` and refuse — so an approved item carrying a
 * picture nobody can read has no path through the application.
 */
import { describe, it, expect } from 'vitest';
import {
  ALT_TEXT_BLOCKER,
  altTextProblem,
  assetApprovalBlockers,
  isUsableAltText,
} from '@/lib/onemark/assets/approval';
import {
  ONEMARK_ALT_TEXT_MAX_LENGTH,
  ONEMARK_ALT_TEXT_MIN_LENGTH,
  uploadableTypeForMime,
} from '@/lib/onemark/assets/constants';

const GOOD_ALT = 'A circuit with two resistors in parallel across a six volt cell.';

describe('a picture with no description blocks approval', () => {
  it('lets an item with no picture through', () => {
    expect(assetApprovalBlockers([])).toEqual([]);
    expect(assetApprovalBlockers(null)).toEqual([]);
    expect(assetApprovalBlockers(undefined)).toEqual([]);
  });

  it('lets a described picture through', () => {
    expect(
      assetApprovalBlockers([{ asset_type: 'png', storage_path: 'i/1.png', alt_text: GOOD_ALT }]),
    ).toEqual([]);
  });

  it.each([[null], [''], ['   '], ['ok']])('blocks on alt text %j', (alt) => {
    expect(
      assetApprovalBlockers([{ asset_type: 'png', storage_path: 'i/1.png', alt_text: alt as string | null }]),
    ).toEqual([ALT_TEXT_BLOCKER]);
  });

  it('blocks once, however many pictures are undescribed', () => {
    expect(
      assetApprovalBlockers([
        { asset_type: 'png', storage_path: 'i/1.png', alt_text: null },
        { asset_type: 'svg', storage_path: 'i/2.svg', alt_text: '' },
      ]),
    ).toEqual([ALT_TEXT_BLOCKER]);
  });

  it('does not ask a katex_block for alt text — it is notation, already readable', () => {
    expect(
      assetApprovalBlockers([{ asset_type: 'katex_block', storage_path: null, alt_text: null }]),
    ).toEqual([]);
  });

  it('does not ask a row with no stored object for alt text', () => {
    expect(assetApprovalBlockers([{ asset_type: 'png', storage_path: null, alt_text: null }])).toEqual([]);
  });
});

describe('what counts as a usable description', () => {
  it('rejects an empty one with a sentence about who reads it', () => {
    const problem = altTextProblem('');
    expect(problem).toBeTruthy();
    expect(problem).toContain('screen reader');
  });

  it(`rejects anything shorter than ${ONEMARK_ALT_TEXT_MIN_LENGTH} characters`, () => {
    expect(isUsableAltText('ab')).toBe(false);
    expect(altTextProblem('ab')).toContain(String(ONEMARK_ALT_TEXT_MIN_LENGTH));
  });

  it('rejects one longer than the column can hold', () => {
    const long = 'x'.repeat(ONEMARK_ALT_TEXT_MAX_LENGTH + 1);
    expect(isUsableAltText(long)).toBe(false);
    expect(altTextProblem(long)).toContain(String(ONEMARK_ALT_TEXT_MAX_LENGTH));
  });

  it('accepts a real sentence and ignores surrounding whitespace', () => {
    expect(isUsableAltText(`  ${GOOD_ALT}  `)).toBe(true);
    expect(altTextProblem(`  ${GOOD_ALT}  `)).toBeNull();
  });
});

describe('what the upload route will accept', () => {
  it('takes PNG and SVG', () => {
    expect(uploadableTypeForMime('image/png')).toBe('png');
    expect(uploadableTypeForMime('image/svg+xml')).toBe('svg');
    expect(uploadableTypeForMime('image/svg+xml; charset=utf-8')).toBe('svg');
  });

  it('refuses JPEG — onemark_question_assets.asset_type has nowhere to put it', () => {
    expect(uploadableTypeForMime('image/jpeg')).toBeNull();
    expect(uploadableTypeForMime('image/jpg')).toBeNull();
  });

  it('refuses anything that is not an image', () => {
    expect(uploadableTypeForMime('application/pdf')).toBeNull();
    expect(uploadableTypeForMime('text/html')).toBeNull();
    expect(uploadableTypeForMime('')).toBeNull();
  });
});
