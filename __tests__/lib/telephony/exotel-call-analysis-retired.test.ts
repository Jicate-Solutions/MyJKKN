import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-006180 — the Exotel call-analysis pipeline was rejected on 9 May 2026
 * but kept running: a cron every 15 minutes and a settings flag that
 * defaulted to on. Exotel refused all 4,660 submissions. These checks keep
 * it off: nothing schedules the sweeper, and the flag is off for every
 * existing and future settings row.
 */
const root = process.cwd();

describe('Exotel call analysis stays retired', () => {
  it('no cron in vercel.json schedules the analyze-calls sweeper', () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      crons?: { path: string }[];
    };
    const paths = (vercel.crons ?? []).map((c) => c.path);
    expect(paths.length).toBeGreaterThan(0); // the file really was read
    expect(paths.filter((p) => p.includes('/api/cron/analyze-calls'))).toEqual([]);
    // The voice-memo pipeline that replaced it must still be scheduled.
    expect(paths.some((p) => p.includes('/api/cron/analyze-voice-memos'))).toBe(true);
  });

  it('the migration switches the flag off, makes off the default, and closes only never-accepted records', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20261228090000_retire_exotel_call_analysis.sql'),
      'utf8',
    ).replace(/^\s*--.*$/gm, '');
    expect(sql).toMatch(/UPDATE public\.institution_call_settings\s+SET auto_transcribe_enabled = false/);
    expect(sql).toMatch(/ALTER COLUMN auto_transcribe_enabled SET DEFAULT false/);
    expect(sql).toMatch(/SET analyze_status = 'failed'[\s\S]*analyze_job_id IS NULL/);
  });
});

describe('Exotel call analysis — the code fallback is off too', () => {
  it('an institution with no settings row does not switch the analysis back on', () => {
    const src = readFileSync(join(root, 'lib/services/telephony/call-pipeline-service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).toMatch(/auto_transcribe_enabled:\s*false,/);
    expect(src).not.toMatch(/auto_transcribe_enabled:\s*true,/);
  });
});
