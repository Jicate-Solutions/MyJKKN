import { describe, expect, it } from 'vitest';
import { bestNameGuess, itemKeyOf, knownNamesFor, quotedKey, recall, recallItem, type ItemAlias } from '../item-aliases';

const alias = (p: Partial<ItemAlias>): ItemAlias => ({
  supplier_id: 'v1',
  quoted_name: 'Whatman No.1 125mm',
  quoted_key: quotedKey('Whatman No.1 125mm'),
  item_key: 'name:filter paper',
  item_name: 'Filter paper',
  same: true,
  ...p,
});

describe('quotedKey', () => {
  it('drops pack sizes so one product name is one key', () => {
    expect(quotedKey('Ninhydrin 100ml')).toBe(quotedKey('NINHYDRIN 125 ML'));
    expect(quotedKey('Sodium Hydroxide Pellets AR 500g')).toBe('sodium hydroxide pellets ar');
  });

  it('keeps sizes that are not packs (125mm paper is a different product from 90mm)', () => {
    expect(quotedKey('Whatman No.1 125mm')).not.toBe(quotedKey('Whatman No.1 90mm'));
  });
});

describe('itemKeyOf', () => {
  it('prefers the item master id', () => {
    expect(itemKeyOf({ item_name: 'Filter paper', domain_item_id: 'abc' })).toBe('item:abc');
    expect(itemKeyOf({ item_name: 'Filter  Paper', domain_item_id: null })).toBe('name:filter paper');
  });
});

describe('recall', () => {
  it('remembers a yes for the same vendor and for other vendors', () => {
    const mem = [alias({})];
    expect(recall(mem, 'v1', 'WHATMAN NO.1 125MM', 'name:filter paper')).toBe(true);
    expect(recall(mem, 'v2', 'Whatman No.1 125mm', 'name:filter paper')).toBe(true);
  });

  it("lets this vendor's own no win over another vendor's yes", () => {
    const mem = [alias({}), alias({ supplier_id: 'v2', same: false })];
    expect(recall(mem, 'v2', 'Whatman No.1 125mm', 'name:filter paper')).toBe(false);
    // A third vendor with dealers disagreeing: ask again.
    expect(recall(mem, 'v3', 'Whatman No.1 125mm', 'name:filter paper')).toBeNull();
  });

  it('knows nothing about a name never answered', () => {
    expect(recall([alias({})], 'v1', 'Filter paper Grade 4', 'name:filter paper')).toBeNull();
  });

  it('finds which requested item a remembered name belongs to', () => {
    expect(recallItem([alias({})], 'v1', 'Whatman No.1 125mm', ['name:pen', 'name:filter paper'])).toBe('name:filter paper');
  });
});

describe('bestNameGuess', () => {
  it('takes the best-fitting line, not the first one sharing a word', () => {
    const lines = [{ name: 'Sodium chloride AR' }, { name: 'Sodium hydroxide pellets' }];
    expect(bestNameGuess('Sodium hydroxide', lines)?.name).toBe('Sodium hydroxide pellets');
  });

  it('guesses nothing when only half the name fits', () => {
    expect(bestNameGuess('Sodium hydroxide', [{ name: 'Sodium chloride AR' }])).toBeNull();
  });
});

describe('knownNamesFor', () => {
  it('lists confirmed names once each, never the no answers', () => {
    const mem = [alias({}), alias({ supplier_id: 'v2' }), alias({ quoted_name: 'Grade 4', quoted_key: 'grade 4', same: false })];
    expect(knownNamesFor(mem, 'name:filter paper')).toEqual(['Whatman No.1 125mm']);
  });
});

describe('namesAgree', () => {
  it('needs every key word of the requested name', async () => {
    const { namesAgree } = await import('../item-name-match');
    expect(namesAgree('Molisch Reagent', "MOLISCH'S REAGENT (MOLYCHEM)-100ML")).toBe(true);
    expect(namesAgree('Magnesium sulphate', 'CUPRIC SULPHATE PENTAHYDRATE LR 500GM')).toBe(false);
    expect(namesAgree('Copper Sulphate', 'Cupric sulphate')).toBe(false);
  });
});
