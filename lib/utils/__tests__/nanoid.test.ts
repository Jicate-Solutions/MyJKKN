import { describe, it, expect } from 'vitest';
import { generateCampaignToken } from '../nanoid';

describe('generateCampaignToken', () => {
  it('produces a string of exactly 8 characters', () => {
    const token = generateCampaignToken();
    expect(token).toHaveLength(8);
  });

  it('only uses URL-safe characters [A-Za-z0-9_-]', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCampaignToken()).toMatch(/^[A-Za-z0-9_-]{8}$/);
    }
  });

  it('generates unique tokens', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateCampaignToken());
    expect(set.size).toBe(1000);
  });
});
