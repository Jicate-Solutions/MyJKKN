import { describe, expect, it } from 'vitest';
import { comparePacks, parsePack, requestedPack } from '@/lib/procurement/pack-size';

// Strings taken from RFQ-261002-00002, where a 100 ml price won against 500 ml prices.
describe('parsePack', () => {
  it.each([
    ['500 g', 'mass', 500],
    ['10%, 500 g', 'mass', 500],
    ['500gm', 'mass', 500],
    ['1 kg', 'mass', 1000],
    ['Aqueous, 500 ml', 'volume', 500],
    ['125ml', 'volume', 125],
    ['2.5 L', 'volume', 2500],
    ['A & B, 500 ml', 'volume', 500],
  ])('%s', (text, dim, base) => {
    expect(parsePack(text)).toMatchObject({ dim, base });
  });

  it.each(['0.1N', '4N Conc.', '10% W/V', '0.1 MOL/L', '1 Nos', '1 Pack', 'N/10', '', null])('ignores %s', (text) => {
    expect(parsePack(text)).toBeNull();
  });
});

describe('comparePacks', () => {
  const chem = { soldByMeasure: true };

  it('scales a smaller pack up to the requested one', () => {
    expect(comparePacks(parsePack('500 ml'), parsePack('100ml'), chem)).toEqual({ kind: 'scaled', factor: 5 });
  });

  it('scales a bigger pack down', () => {
    expect(comparePacks(parsePack('250 g'), parsePack('500gm'), chem)).toEqual({ kind: 'scaled', factor: 0.5 });
  });

  it('treats kg and g as the same measure', () => {
    expect(comparePacks(parsePack('1 kg'), parsePack('1000 g'), chem)).toEqual({ kind: 'same' });
  });

  it('stops on a solid quoted as a solution', () => {
    expect(comparePacks(parsePack('500 g'), parsePack('500ml'), chem).kind).toBe('mismatch');
  });

  it('never scales a counted item — a smaller bottle is not a fraction of a bigger one', () => {
    expect(comparePacks(parsePack('500 ml'), parsePack('125 ml'), { soldByMeasure: false }).kind).toBe('mismatch');
  });

  it('leaves it alone when either side has no pack', () => {
    expect(comparePacks(parsePack('500 ml'), null, chem)).toEqual({ kind: 'unknown' });
    expect(comparePacks(null, parsePack('500 ml'), chem)).toEqual({ kind: 'unknown' });
  });

  it('reads the pack from the item name when the specification has none', () => {
    expect(requestedPack({ item_name: 'NaOH 500 g', item_spec: '' })).toMatchObject({ base: 500 });
  });
});
