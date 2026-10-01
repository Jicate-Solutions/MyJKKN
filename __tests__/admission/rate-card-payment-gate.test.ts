import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recording money against the rate card is super-admin only
 * (Director, 2026-09-21: "tighten who can record a payment to super admins only").
 *
 * Rehearsed on production inside a rolled-back transaction, as the real accounts:
 *   before -> director ALLOWED, admission_staff ALLOWED, ceo ALLOWED
 *   after  -> director ALLOWED, admission_staff refused, ceo refused
 *   reading unchanged for a non-super-admin.
 *
 * What these tests defend is that nobody quietly widens it again.
 */

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|--).*$/gm, '');

const migration = strip(
  readFileSync(
    join(process.cwd(), 'supabase/migrations/20270101090000_rate_card_payments_super_admin_only.sql'),
    'utf8'
  )
);

const panel = strip(
  readFileSync(
    join(process.cwd(), 'app/(routes)/admission/consultants/[id]/_components/rate-card-panel.tsx'),
    'utf8'
  )
);

describe('the database refuses everyone but a super admin', () => {
  it('the write policy is is_super_admin and nothing else', () => {
    const policy = migration.slice(migration.indexOf('CREATE POLICY commission_rate_card_payments_write'));
    expect(policy).toMatch(/USING\s*\(\(SELECT is_super_admin\(\)\)\)/);
    expect(policy).toMatch(/WITH CHECK\s*\(\(SELECT is_super_admin\(\)\)\)/);
  });

  it('no looser check survives in the write policy', () => {
    const policy = migration.slice(migration.indexOf('CREATE POLICY commission_rate_card_payments_write'));
    expect(policy).not.toMatch(/is_admin\(\)/);
    expect(policy).not.toMatch(/commissions\.manage/);
  });

  it('covers every kind of write, so an advance cannot slip through a gap', () => {
    const policy = migration.slice(migration.indexOf('CREATE POLICY commission_rate_card_payments_write'));
    expect(policy).toMatch(/FOR ALL/);
  });

  it('leaves reading alone — the people watching the money still see it', () => {
    // Touching the read policy here would blank the screen for every viewer.
    expect(migration).not.toMatch(/commission_rate_card_payments_read/);
  });
});

describe('the screen offers no button the database will refuse', () => {
  it('gates recording money on isSuperAdmin', () => {
    expect(panel).toMatch(/const canManage = isSuperAdmin\b/);
  });

  it('no longer gates it on the permission 41 people held', () => {
    expect(panel).not.toMatch(/canManage = can\(/);
    expect(panel).not.toMatch(/can\('admission\.consultants\.commissions\.manage'\)/);
  });

  it('keeps setting a rate on the looser admin rule, which is a separate decision', () => {
    // Deliberately NOT evened up. The Director was told about the asymmetry.
    expect(panel).toMatch(/const canSetRates =\s*\n?\s*isSuperAdmin \|\|/);
  });
});
