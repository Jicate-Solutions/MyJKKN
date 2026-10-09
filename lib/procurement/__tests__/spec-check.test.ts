import { describe, expect, it } from 'vitest';
import { specConflict } from '../spec-check';
import { parseCountPack, perPieceFactor } from '../pack-size';

describe('specConflict', () => {
  it('catches a different grade', () => {
    expect(specConflict('Sodium hydroxide pellets AR', 'Sodium Hydroxide Pellets LR 500g')).toBe('Asked AR grade, quoted LR');
  });

  it('catches a different strength', () => {
    expect(specConflict('Hydrochloric acid 0.1 N', 'HCl solution 1N 500 ml')).toBe('Asked 0.1 N, quoted 1 N');
    expect(specConflict('Ethanol 99%', 'Ethanol 70% 500ml')).toBe('Asked 99%, quoted 70%');
  });

  it('reads N/10 as 0.1 N', () => {
    expect(specConflict('Iodine solution N/10', 'Iodine 0.1N solution')).toBeNull();
    expect(specConflict('Oxalic acid 0.1N', 'Oxalic acid N/20 solution')).toBe('Asked 0.1 N, quoted 0.05 N');
  });

  it('is not a conflict when only one side names it, or both agree', () => {
    expect(specConflict('Sodium hydroxide', 'Sodium hydroxide LR')).toBeNull();
    expect(specConflict('Ethanol 99% AR', 'Absolute ethanol 99 % A.R. 2.5 L')).toBeNull();
    expect(specConflict('Molisch reagent 500 ml', 'Molisch reagent 100ml')).toBeNull();
  });
});

describe('counted packs', () => {
  it('reads how many pieces a pack holds', () => {
    expect(parseCountPack('Box of 100')).toBe(100);
    expect(parseCountPack('100 Nos/Pkt')).toBe(100);
    expect(parseCountPack('Pack of 10 pcs')).toBe(10);
    expect(parseCountPack('per dozen')).toBe(12);
    expect(parseCountPack('Bottle of 500 ml')).toBeNull();
    expect(parseCountPack('500ml bottle')).toBeNull();
  });

  it('prices per piece only for items counted singly without a pack of their own', () => {
    expect(perPieceFactor({ item_name: 'Nitrile gloves', unit_label: 'Nos' }, 'Box of 100')).toBe(0.01);
    expect(perPieceFactor({ item_name: 'Nitrile gloves', unit_label: 'Box' }, 'Box of 100')).toBeNull();
    expect(perPieceFactor({ item_name: 'Nitrile gloves', item_spec: 'box of 100', unit_label: 'Nos' }, 'Box of 100')).toBeNull();
  });
});
