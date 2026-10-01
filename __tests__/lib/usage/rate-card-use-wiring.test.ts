import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-006178 (third key) — recording a consultant rate-card payment counted
 * nothing for the adoption loop. The line must sit AFTER the insert's error
 * check, so a refused payment is never counted and the count can never stop
 * a payment from saving. Comments are stripped before matching.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('adoption loop — consultant rate-card payment records its use', () => {
  it('counts the use only after the payment insert succeeded', () => {
    const src = stripComments(
      readFileSync(join(process.cwd(), 'lib/services/admission/consultant-service.ts'), 'utf8'),
    );
    const start = src.indexOf('static async createRateCardPayment(');
    const end = src.indexOf('static async updateRateCardPayment(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toMatch(
      /if\s*\(error\)\s*throw new Error\(error\.message\);\s*await recordFeatureUse\(\s*supabase\s*,\s*'admission\.consultant_rate_card'\s*\)/,
    );
  });
});
