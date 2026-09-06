export const dynamic = 'force-dynamic';

// ============================================
// STAFF INCOMPLETE PROFILES — FILTER OPTIONS
// ============================================
// Created: 2026-08-10
// Dropdown lists for the incomplete-profiles filter bar.
//
// Only lists that must be DERIVED FROM DATA live here: designation (183
// distinct values in production), blood group, gender and marital status are
// free-text columns with no lookup table, and the biometric machines are only
// discoverable through the staff rows that reference them. Institution,
// department and employment category come from their own services on the
// client, which is how the rest of the app builds those pickers.
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FIELD_MISSING } from '@/lib/utils/staff/incomplete-profile-filters';
import type { IncompleteStaffFilterOptions, StaffFilterOption } from '@/types/staff';

/** Enough to cover every distinct value at current scale with headroom. */
const MAX_ROWS = 5000;

/** Distinct, non-blank, alphabetically ordered options from a column. */
function distinctOptions(rows: any[], column: string): StaffFilterOption[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row?.[column];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((value) => ({ value, label: value }));
}

/** 'full_time' -> 'Full Time'. These columns store lowercase snake_case. */
function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const institutionIdParam = request.nextUrl.searchParams.get('institutionId');
    // The Institution picker offers no "Not set" option, so this route never
    // sees FIELD_MISSING from the UI today — but treat it as "no explicit
    // institution" rather than passing it into a uuid .eq(), which would 500
    // (Postgres invalid-uuid error surfaced as a 400). Mirrors the guard the
    // sibling incomplete-profiles route already needs for uuid columns.
    const institutionId =
      institutionIdParam && institutionIdParam !== FIELD_MISSING ? institutionIdParam : null;

    let query = supabase
      .from('staff')
      .select('designation, blood_group, gender, marital_status, biometric_institution_id')
      .limit(MAX_ROWS);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    } else if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('[api/staff/incomplete-profiles/options] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch filter options', details: error.message },
        { status: 500 }
      );
    }

    const safeRows = rows || [];

    // A truncated scan yields dropdowns that silently omit real values — a
    // designation that exists in the data simply is not offered, with no signal
    // anywhere. Mirrors the PHASE_1_HARD_CAP warning in the sibling route.
    if (safeRows.length >= MAX_ROWS) {
      console.warn(
        '[api/staff/incomplete-profiles/options] Hit the %d-row cap; filter option lists may be incomplete.',
        MAX_ROWS
      );
    }

    // Only machines actually referenced by an employee in scope — the
    // institutions table also holds real colleges, which are not machines.
    const machineIds = Array.from(
      new Set(
        safeRows
          .map((row: any) => row.biometric_institution_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    let biometricMachines: StaffFilterOption[] = [];
    if (machineIds.length > 0) {
      const { data: machines, error: machineError } = await supabase
        .from('institutions')
        .select('id, name')
        .in('id', machineIds)
        .order('name', { ascending: true });

      if (machineError) {
        // A missing machine list must not cost the user every other dropdown.
        console.error('[api/staff/incomplete-profiles/options] Machine lookup error:', machineError);
      } else {
        biometricMachines = (machines || []).map((machine: any) => ({
          value: machine.id,
          label: machine.name,
        }));
      }
    }

    const payload: IncompleteStaffFilterOptions = {
      designations: distinctOptions(safeRows, 'designation'),
      bloodGroups: distinctOptions(safeRows, 'blood_group'),
      genders: distinctOptions(safeRows, 'gender').map((option) => ({
        value: option.value,
        label: titleCase(option.value),
      })),
      maritalStatuses: distinctOptions(safeRows, 'marital_status').map((option) => ({
        value: option.value,
        label: titleCase(option.value),
      })),
      biometricMachines,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[api/staff/incomplete-profiles/options] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch filter options',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
