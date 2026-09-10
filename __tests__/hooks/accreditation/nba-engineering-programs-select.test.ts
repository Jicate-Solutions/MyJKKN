import { describe, it, expect } from 'vitest';
import { ENGINEERING_PROGRAM_SELECT } from '@/hooks/accreditation/use-nba-dashboard';

// ---------------------------------------------------------------------------
// The bug these tests encode, measured on production 2026-09-09 (sha 562907d7a6):
//
//   useEngineeringPrograms selected 'id, program_name, program_code,
//   institution_id' from `programs`. There is no `program_code` column on that
//   table — the code-like column is `program_id`. Measured against production:
//
//     SELECT id, program_name, program_code, institution_id FROM programs LIMIT 1
//       -> ERROR 42703: column "program_code" does not exist
//
//     GET /rest/v1/programs?select=id,program_name,program_code,institution_id
//       -> {"code":"42703","message":"column programs.program_code does not exist"}
//
//   The hook does `if (pErr) throw pErr`, so React Query held `undefined` and
//   /accreditation/nba rendered "No engineering programs found" with "Eligible
//   programs 0" — while 12 engineering programmes existed, all active, all with
//   a program_id code (CSE, CSE-SH, ECE, ECE-SH, EEE, EEE-SH, IT, IT-SH, MBA,
//   MECH, MECH-SH, PCSE at JKKN College of Engineering and Technology).
//
// WHY A UNIT TEST DID NOT AND COULD NOT CATCH IT BEFORE. The Supabase client is
// cast `as any` in this hook, so the select string is an untyped string literal:
// it type-checks, it builds (next.config.ts sets ignoreBuildErrors), and it only
// fails at REQUEST time. The repo's schema-drift guard covers exactly this class
// but its `paths:` filter is scoped to lib/services/solutions/** and never sees
// hooks/accreditation/**.
//
// So the real ratchet is the `satisfies readonly (keyof
// Database['public']['Tables']['programs']['Row'])[]` constraint in the hook —
// verified 2026-09-09 by putting 'program_code' back and getting
// "TS2820: Type '\"program_code\"' is not assignable to ... Did you mean
// '\"program_order\"'?" from the PR-scoped typecheck gate.
//
// This suite pins the runtime half: that the constraint is actually what the
// query sends, and that the known-bad name cannot come back through it.
// ---------------------------------------------------------------------------

describe('ENGINEERING_PROGRAM_SELECT', () => {
  it('never names program_code — the column that does not exist', () => {
    expect(ENGINEERING_PROGRAM_SELECT).not.toContain('program_code');
  });

  it('reads program_id, the real code-like column on programs', () => {
    const columns = ENGINEERING_PROGRAM_SELECT.split(',').map((c) => c.trim());
    expect(columns).toContain('program_id');
  });

  it('requests exactly the four columns the hook maps, and no others', () => {
    const columns = ENGINEERING_PROGRAM_SELECT.split(',').map((c) => c.trim());
    expect(columns).toEqual([
      'id',
      'program_name',
      'program_id',
      'institution_id',
    ]);
  });

  it('is a PostgREST-shaped select list: no empty or whitespace-only columns', () => {
    // A trailing comma or a doubled separator produces an empty column name,
    // which PostgREST rejects for the whole request.
    const columns = ENGINEERING_PROGRAM_SELECT.split(',');
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(column.trim()).not.toBe('');
    }
  });
});
