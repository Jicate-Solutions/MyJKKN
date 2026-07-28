// __tests__/lib/id-cards/template-editor-helpers.test.tsx
// 2026-07-25 — pure-helper coverage for the template editor's response
// parsing: the policy envelope ({ data: policy } with sides at data.sides)
// and the per-template mappings envelope.

import { describe, it, expect, vi } from 'vitest';

// The component's import chain reaches createClientSupabaseClient at module
// init (policy-shell → use-permissions → role-service), which throws without
// Supabase env vars. Only the pure helpers are under test — stub the client.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}) as never,
}));

import {
  parseSidesFromPolicyResponse,
  toMappingRows,
} from '@/components/admin/id-cards/id-card-template-editor';

describe('parseSidesFromPolicyResponse', () => {
  it('reads sides from the { data: policy } envelope', () => {
    expect(parseSidesFromPolicyResponse({ data: { sides: 2 } })).toBe(2);
    expect(parseSidesFromPolicyResponse({ data: { sides: 1 } })).toBe(1);
  });

  it('does NOT read a top-level sides key (the old buggy shape)', () => {
    // The endpoint never returns this shape; a top-level read was the bug
    // that pinned the badge to "Single-sided".
    expect(parseSidesFromPolicyResponse({ sides: 2 })).toBe(1);
  });

  it('fails soft to 1 on malformed input', () => {
    expect(parseSidesFromPolicyResponse(null)).toBe(1);
    expect(parseSidesFromPolicyResponse(undefined)).toBe(1);
    expect(parseSidesFromPolicyResponse('two')).toBe(1);
    expect(parseSidesFromPolicyResponse({ data: null })).toBe(1);
    expect(parseSidesFromPolicyResponse({ data: { sides: '2' } })).toBe(1);
    expect(parseSidesFromPolicyResponse({ error: { message: 'x' } })).toBe(1);
  });
});

describe('toMappingRows', () => {
  it('maps envelope entries to rows keyed by card_field, in card order', () => {
    const rows = toMappingRows({
      data: {
        template_id: 't1',
        mappings: [
          { card_field: 'photo', db_column: 'learners_profiles.student_photo_url' },
          { card_field: 'name_line_1', db_column: 'learners_profiles.first_name' },
        ],
      },
    });
    expect(rows).toEqual([
      {
        id: 'name_line_1',
        card_field: 'name_line_1',
        db_column: 'learners_profiles.first_name',
      },
      {
        id: 'photo',
        card_field: 'photo',
        db_column: 'learners_profiles.student_photo_url',
      },
    ]);
  });

  it('drops malformed, unknown-field, and duplicate entries', () => {
    const rows = toMappingRows({
      data: {
        mappings: [
          { card_field: 'roll_number', db_column: 'learners_profiles.roll_number' },
          { card_field: 'roll_number', db_column: 'learners_profiles.register_number' },
          { card_field: 'not_a_field', db_column: 'x.y' },
          { card_field: 'course' }, // missing db_column
          'garbage',
          null,
        ],
      },
    });
    expect(rows).toEqual([
      {
        id: 'roll_number',
        card_field: 'roll_number',
        db_column: 'learners_profiles.roll_number',
      },
    ]);
  });

  it('returns [] for non-envelope shapes', () => {
    expect(toMappingRows(null)).toEqual([]);
    expect(toMappingRows([])).toEqual([]);
    expect(toMappingRows({ data: {} })).toEqual([]);
    expect(toMappingRows({ data: { mappings: 'nope' } })).toEqual([]);
  });
});
