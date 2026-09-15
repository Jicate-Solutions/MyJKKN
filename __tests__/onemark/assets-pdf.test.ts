/**
 * OneMark Wave 3 Lane D — a diagram in the printed paper.
 *
 * What these hold on to, in order of how much damage a regression does:
 *   1. A question with NO picture renders exactly the markup Lane P shipped —
 *      this lane must not move a single item on any paper printed today.
 *   2. A picture prints ONCE, between the stems and the options, and a
 *      bilingual question shares it (PRD Physics §5.2: one logical question,
 *      Tamil block then English block, numbered once).
 *   3. The image is INLINE. A network URL would race Chromium's `load` wait
 *      and print a hole, and the bucket is private on purpose.
 *   4. When the bytes could not be read, the description prints in the figure's
 *      place — a candidate can still answer, and the missing figure is visible.
 *   5. The answer key is unchanged: no picture, no data: URI, no growth.
 *   6. Alt text is escaped like any other authored string.
 */
import { describe, it, expect } from 'vitest';
import { answerKeyHtml, questionPaperHtml } from '@/lib/onemark/pdf/document';
import { arrangeForSeries } from '@/lib/onemark/pdf/layout';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER, withoutAnswers } from '@/lib/onemark/pdf/samples';
import { paperCss } from '@/lib/onemark/pdf/styles';
import type { PaperAsset, PaperModel } from '@/lib/onemark/pdf/types';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg';

function withFirstItemAsset(model: PaperModel, asset: PaperAsset | null): PaperModel {
  return {
    ...model,
    items: model.items.map((it, i) => (i === 0 ? { ...it, assets: asset ? [asset] : [] } : { ...it, assets: [] })),
  };
}

function paperHtml(model: PaperModel): string {
  return questionPaperHtml(arrangeForSeries(withoutAnswers(model), 'A'));
}

describe('a question with no picture is untouched', () => {
  it('renders identically whether `assets` is absent or empty', () => {
    const absent: PaperModel = {
      ...SAMPLE_PHYSICS_PAPER,
      items: SAMPLE_PHYSICS_PAPER.items.map(({ assets: _drop, ...rest }) => rest),
    };
    const empty = withFirstItemAsset(SAMPLE_PHYSICS_PAPER, null);
    expect(paperHtml(absent)).toBe(paperHtml(empty));
  });

  it('keeps Lane P’s one-block-per-language shape when there is no figure', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, null));
    // stem and its options inside the SAME language div, as Lane P wrote it
    expect(html).toMatch(/<div class="lang ta"><div class="stem">[\s\S]*?<div class="opts /);
    expect(html).not.toContain('class="figures"');
  });
});

describe('a question with a picture', () => {
  const asset: PaperAsset = {
    id: 'a-1',
    dataUri: TINY_PNG,
    alt: 'Two NAND gates feeding an OR gate.',
    sortOrder: 1,
  };

  it('prints the figure once, even on a bilingual question', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, asset));
    expect(html.split('class="figures"').length - 1).toBe(1);
    expect(html.split(TINY_PNG).length - 1).toBe(1);
  });

  it('puts the figure after both stems and before the options', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, asset));
    const taStem = html.indexOf('<div class="lang ta"><div class="stem">');
    const enStem = html.indexOf('<div class="lang en"><div class="stem">');
    const figure = html.indexOf('class="figures"');
    const firstOptions = html.indexOf('<div class="opts ');
    expect(taStem).toBeGreaterThan(-1);
    expect(enStem).toBeGreaterThan(taStem);
    expect(figure).toBeGreaterThan(enStem);
    expect(firstOptions).toBeGreaterThan(figure);
  });

  it('inlines the image rather than linking to the bucket', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, asset));
    expect(html).toContain(`src="${TINY_PNG}"`);
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it('carries the description as the image’s alt attribute', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, asset));
    expect(html).toContain('alt="Two NAND gates feeding an OR gate."');
  });

  it('escapes a description containing markup', () => {
    const html = paperHtml(
      withFirstItemAsset(SAMPLE_PHYSICS_PAPER, { ...asset, alt: 'A <b>circuit</b> & a "cell"' }),
    );
    expect(html).toContain('&lt;b&gt;circuit&lt;/b&gt;');
    expect(html).not.toContain('<b>circuit</b>');
  });

  it('prints the description in the figure’s place when the bytes are missing', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, { ...asset, dataUri: null }));
    expect(html).toContain('figure missing');
    expect(html).toContain('figure not available');
    expect(html).toContain('Two NAND gates feeding an OR gate.');
    expect(html).not.toContain('<img');
  });

  it('prints several pictures in sort order', () => {
    const model: PaperModel = {
      ...SAMPLE_PHYSICS_PAPER,
      items: SAMPLE_PHYSICS_PAPER.items.map((it, i) =>
        i === 0
          ? {
              ...it,
              assets: [
                { id: 'b', dataUri: 'data:image/png;base64,BBB', alt: 'second', sortOrder: 2 },
                { id: 'a', dataUri: 'data:image/png;base64,AAA', alt: 'first', sortOrder: 1 },
              ],
            }
          : { ...it, assets: [] },
      ),
    };
    const html = paperHtml(model);
    expect(html.indexOf('AAA')).toBeLessThan(html.indexOf('BBB'));
  });

  it('works on a monolingual English paper too', () => {
    const html = paperHtml(withFirstItemAsset(SAMPLE_ENGLISH_PAPER, asset));
    expect(html.split('class="figures"').length - 1).toBe(1);
    expect(html).not.toContain('lang ta');
  });
});

describe('the answer key is unchanged by this lane', () => {
  it('never carries a picture or a data: URI', () => {
    const asset: PaperAsset = { id: 'a-1', dataUri: TINY_PNG, alt: 'a diagram', sortOrder: 1 };
    const withPicture = answerKeyHtml(arrangeForSeries(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, asset), 'A'));
    const without = answerKeyHtml(arrangeForSeries(withFirstItemAsset(SAMPLE_PHYSICS_PAPER, null), 'A'));
    expect(withPicture).toBe(without);
    expect(withPicture).not.toContain('data:image');
    expect(withPicture).not.toContain('class="figures"');
  });
});

describe('the figure stylesheet', () => {
  it('caps a diagram at the text column and keeps it on one page', () => {
    const css = paperCss();
    expect(css).toContain('.figures');
    expect(css).toContain('max-width: 100%');
    expect(css).toContain('break-inside: avoid');
  });
});

describe('the eyeball fixtures carry one picture per subject (rule #25)', () => {
  it('Physics ships an SVG gate diagram with a description', () => {
    const first = SAMPLE_PHYSICS_PAPER.items[0];
    expect(first.assets?.length).toBe(1);
    expect(first.assets?.[0].dataUri).toMatch(/^data:image\/svg\+xml,/);
    expect((first.assets?.[0].alt ?? '').length).toBeGreaterThan(10);
  });

  it('English ships a real PNG with a description', () => {
    const first = SAMPLE_ENGLISH_PAPER.items[0];
    expect(first.assets?.length).toBe(1);
    expect(first.assets?.[0].dataUri).toMatch(/^data:image\/png;base64,/);
    expect((first.assets?.[0].alt ?? '').length).toBeGreaterThan(10);
  });
});
