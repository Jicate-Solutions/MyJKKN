import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-003233/003234/003235 — "Team details not shown" on the Solve-for-100
 * team page reached from the public leaderboard.
 *
 * Director ruling 2026-09-22, by tap: show the TEAM NAME to every signed-in
 * person; members and submissions stay private, and the 6 July rule
 * (event_registrations_select, migration 20260706150000) stands.
 *
 * The earlier fix read the WHOLE registration embed with a service-role
 * client, which would have exposed members and submissions to any signed-in
 * visitor. These checks pin the narrow shape so that cannot come back
 * unnoticed. Comments are stripped first so prose cannot satisfy them.
 */
const src = readFileSync(
  join(process.cwd(), 'lib/services/startup-studio/sf100-service.ts'),
  'utf8',
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** The body of getEnrollment only. */
const body = (() => {
  const start = src.indexOf('static async getEnrollment(');
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf('\n  static ', start + 10);
  return src.slice(start, next > -1 ? next : undefined);
})();

describe('SF100 team detail exposes the team name and nothing more', () => {
  it('reads the enrollment as the caller, not with elevated rights', () => {
    // The RLS rule must still decide what an owner/admin sees.
    expect(body).toMatch(/const \{ data, error \} = await this\.supabase/);
    expect(body).not.toMatch(
      /await createServiceRoleClient\(\)\s*\.from\('sf100_enrollments'\)/,
    );
  });

  it('asks event_registrations for team_name and for no other column', () => {
    const selects = [...body.matchAll(/\.select\(\s*'([^']*)'\s*\)/g)].map((m) => m[1]);
    expect(selects).toContain('team_name');
    for (const forbidden of ['team_members', 'submission', 'owner_id', 'institution', 'team_code']) {
      expect(selects.join(' ')).not.toContain(forbidden);
    }
  });

  it('only reaches for the name when the caller could not see the registration', () => {
    expect(body).toMatch(/if \(enrollment\?\.registration\) return enrollment;/);
    // ...and hands back only the name, never a spread of the private row.
    expect(body).toMatch(/registration: \{ team_name: publicName\.team_name \}/);
    expect(body).not.toMatch(/registration: \{\s*\.\.\./);
  });

  it('still uses the elevated client for exactly one lookup', () => {
    expect((body.match(/createServiceRoleClient\(\)/g) || []).length).toBe(1);
  });
});
