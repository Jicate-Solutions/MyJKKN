import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AI_ROUTINES } from '@/lib/ai-routines/registry';

// ---------------------------------------------------------------------------
// Cron wiring invariants for the AI-routine dispatcher.
//
// The dispatcher (app/api/cron/ai-routine-dispatcher/route.ts) resolves each
// due ai_routine_schedules row against this registry and SKIPS it outright:
//
//     if (!routine || !routine.triggerPath) { ...continue }
//
// So a migration can seed a perfectly valid schedule row for a route that
// exists and returns 200 when curled by hand, and the routine will still never
// fire — silently, forever, with a green build and a populated
// /admin/ai-routines page. Nothing else in the build gate covers this:
// check:reachability guards pages reachable from nav, not API cron routes.
//
// These tests close that gap from the side that is actually checkable. The
// reverse direction (every app/api/cron/* dir must be registered) is NOT
// asserted on purpose: 118 cron route dirs exist against 32 registered
// triggerPaths, because most are raw vercel.json crons rather than dispatcher
// routines. Asserting it would fail on long-standing state and teach everyone
// to skip the file.
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

/** routine_ids seeded into ai_routine_schedules by any migration (VALUES form). */
function seededRoutineIds(): { id: string; file: string }[] {
  const found: { id: string; file: string }[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    // Strip -- comments first: several migrations DISCUSS ai_routine_schedules
    // in a header comment that sits in the same statement as an unrelated seed,
    // which a looser matcher reads as a schedule seed it is not.
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');
    // Anchor on the INSERT target and stay inside one statement ([^;]), so the
    // captured id is the routine_id and not some other table's first column.
    const pattern = /INTO\s+(?:public\.)?ai_routine_schedules\b[^;]*?VALUES\s*\(\s*'([a-z0-9_-]+)'/gi;
    for (const m of sql.matchAll(pattern)) found.push({ id: m[1], file });
  }
  return found;
}

describe('AI routine registry — cron wiring', () => {
  it('registers every routine_id that a migration seeds into ai_routine_schedules', () => {
    const registered = new Set(AI_ROUTINES.map((r) => r.id));
    const orphans = seededRoutineIds().filter((s) => !registered.has(s.id));

    // An orphan seeds a schedule the dispatcher can never resolve — the routine
    // is dead on arrival while looking fully configured in the admin UI.
    expect(
      orphans.map((o) => `${o.id} (seeded by ${o.file}, missing from AI_ROUTINES)`),
    ).toEqual([]);
  });

  it('points every registered /api/cron triggerPath at a route that exists on disk', () => {
    const broken = AI_ROUTINES.filter(
      (r) => r.triggerPath?.startsWith('/api/cron/') &&
        !existsSync(join(REPO_ROOT, 'app', r.triggerPath, 'route.ts')),
    ).map((r) => `${r.id} -> ${r.triggerPath}`);

    expect(broken).toEqual([]);
  });

  it('keeps routine ids unique across the merged registry', () => {
    const seen = new Set<string>();
    const duplicates = AI_ROUTINES.map((r) => r.id).filter((id) => !seen.add(id));

    // getRoutineById() takes the first match, so a duplicate silently shadows.
    expect(duplicates).toEqual([]);
  });

  it('wires the event-feedback NAAC 7.3.f evidence routine end to end', () => {
    const routine = AI_ROUTINES.find((r) => r.id === 'event-feedback-naac-evidence');

    expect(routine).toBeDefined();
    expect(routine?.triggerPath).toBe('/api/cron/event-feedback-naac-evidence');
    expect(routine?.type).toBe('cron');
    expect(routine?.callsClaude).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, 'app/api/cron/event-feedback-naac-evidence/route.ts')),
    ).toBe(true);
  });
});
