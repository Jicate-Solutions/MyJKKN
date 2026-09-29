/**
 * Regression guard: fn_bug_stale_prompt_send never sends a reporter more than
 * 3 open "still happening?" prompts (E4). The first real send found a learner
 * with 65 old reports queued; without the cap one call would have put all 65
 * in front of them. Reads the newest migration that defines the function so it
 * survives unrelated future edits, and pins the three parts of the cap.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function newest(): { name: string; sql: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, files[i]), 'utf8');
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_bug_stale_prompt_send\s*\(/i.test(sql)) {
      return { name: files[i], sql };
    }
  }
  throw new Error('no migration defines public.fn_bug_stale_prompt_send');
}

describe('fn_bug_stale_prompt_send — at most 3 open still-open prompts per reporter', () => {
  const { name, sql } = newest();
  const body = sql.slice(sql.search(/fn_bug_stale_prompt_send\s*\(/i));

  it(`counts each reporter's open prompts (newest definition: ${name})`, () => {
    expect(body).toMatch(/status\s+IN\s*\(\s*'sent'\s*,\s*'delivered'\s*\)/i);
    expect(body).toMatch(/expires_at\s*>\s*now\(\)/i);
    expect(body).toMatch(/GROUP BY reporter_user_id/i);
  });

  it('ranks a reporter\'s queued rows oldest-first', () => {
    expect(body).toMatch(/PARTITION BY r\.reporter_user_id\s+ORDER BY r\.created_at ASC/i);
  });

  it('stops at 3 including what is already open', () => {
    expect(body).toMatch(/already_open\s*\+\s*rn\s*<=\s*3/i);
  });

  it('keeps the service-role gate and the total limit', () => {
    expect(body).toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
    expect(body).toMatch(/LIMIT GREATEST\(p_limit, 0\)/i);
  });
});
