export const dynamic = 'force-dynamic';

// ============================================
// STAFF INCOMPLETE PROFILES API
// ============================================
// Created: 2026-02-09
// Rewritten: 2026-08-10 — advanced filters + server-side paging
//
// Two-phase by design:
//
//   Phase 1 fetches a NARROW projection (no embeds, no count) with every
//   SQL-expressible filter applied, then computes missing fields in JS. That
//   gives an exact total for free — the previous version asked PostgREST for
//   count:'exact' and threw the answer away, paying for an unbounded RLS scan
//   on every request, then fetched every matching row WITH three embedded joins
//   only to slice off the first 50.
//
//   Phase 2 hydrates institution / department / category names for just the
//   ids on the visible page.
//
// "Incomplete" cannot move into SQL wholesale: the default ordering is by how
// many fields a row is missing, which is not a column. See the 2026-08-10
// design doc, section 3.2, for the alternatives considered.
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeMissingFields,
  fieldsForScope,
} from '@/lib/utils/staff/incomplete-profile-fields';
import {
  parseIncompleteStaffParams,
  missingColumnFilter,
  matchesSearch,
  compareIncompleteRows,
  FIELD_MISSING,
  FIELD_ASSIGNED,
} from '@/lib/utils/staff/incomplete-profile-filters';
import type { IncompleteStaffDetail } from '@/types/staff';

/** Narrow projection for phase 1: completion fields + everything filterable. */
const NARROW_COLUMNS = `
  id,
  first_name, last_name, email, phone, designation, staff_id,
  institution_email, date_of_birth, date_of_joining, profile_picture,
  address, state, district, pincode, blood_group,
  institution_id, department_id, category_id,
  is_active, status, gender, marital_status, created_at,
  biometric_id, biometric_institution_id
`;

const HYDRATE_COLUMNS = `
  id,
  institution:institutions!staff_institution_id_fkey(id, name),
  department:departments(id, department_name),
  category:employment_categories(id, category_name)
`;

// PostgREST's project-level "Max rows" (default 1000) would otherwise cap
// phase 1 silently — total/totalPages are derived from narrowRows.length, so
// a silent cap produces a confidently wrong page count with no error. `staff`
// is ~866 rows today; 5000 is headroom, not a real limit, and the warning
// below makes a future breach loud instead of silent.
const PHASE_1_HARD_CAP = 5000;

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

    const params = parseIncompleteStaffParams(request.nextUrl.searchParams);

    // A specific missing field is a SQL predicate, so it narrows the fetch
    // itself rather than being re-checked row by row below. Only honour it when
    // the field is inside the active scope — "required only" plus "missing
    // Blood Group" is a contradiction, and answering it with rows would be a lie.
    //
    // Checked BEFORE the query runs, not after: an out-of-scope missingField
    // can only ever match nothing, so awaiting the (widest, no-predicate)
    // phase-1 fetch first would pay for a full `staff` scan — against
    // `authenticated`'s 8s statement_timeout — purely to throw the result away.
    const scopeFields = fieldsForScope(params.fieldScope);
    const missingFieldInScope =
      params.missingField && scopeFields.includes(params.missingField)
        ? params.missingField
        : undefined;

    if (params.missingField && !missingFieldInScope) {
      // totalPages: 1 (not 0) to match the shape of every other empty result —
      // the normal path's Math.max(1, ceil(0/limit)) is also 1, and a table
      // rendering "Page 1 of N" should not have to special-case which kind of
      // empty response it got.
      return NextResponse.json(
        { profiles: [], total: 0, page: params.page, limit: params.limit, totalPages: 1 },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // ---------- Phase 1: narrow fetch ----------
    let query = supabase
      .from('staff')
      .select(NARROW_COLUMNS)
      .range(0, PHASE_1_HARD_CAP - 1);

    // Equality filter that also understands the "not set" sentinel. Every
    // column whose picker can emit FIELD_MISSING must go through this — both
    // uuid columns (institution_id, department_id, ...) and text columns
    // (designation, gender, ...) share one rule here; missingColumnFilter is
    // what decides `.is.null` alone (uuid/date/timestamp/boolean) versus the
    // dual `.is.null,.eq.` (text). A uuid/text fork of this helper is exactly
    // how the original bug shipped: three columns got a bare `.eq()` and
    // their "Not set" option silently queried for the literal string
    // `__missing__`.
    const applyEqOrMissing = (column: string, value: string | undefined) => {
      if (!value) return;
      if (value === FIELD_MISSING) {
        query = query.or(missingColumnFilter(column));
      } else {
        query = query.eq(column, value);
      }
    };

    // An explicit institution wins; otherwise confine to the caller's own.
    // Falling through to RLS unscoped is intentional for callers with no
    // institution_id — that is the behaviour this route already had.
    if (params.institutionId) {
      applyEqOrMissing('institution_id', params.institutionId);
    } else if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    applyEqOrMissing('department_id', params.departmentId);
    applyEqOrMissing('category_id', params.categoryId);
    applyEqOrMissing('biometric_institution_id', params.biometricMachineId);

    applyEqOrMissing('designation', params.designation);
    // recordStatus's picker offers no "Not set" sentinel, so this stays a
    // bare .eq() rather than going through applyEqOrMissing.
    if (params.recordStatus) query = query.eq('status', params.recordStatus);
    applyEqOrMissing('gender', params.gender);
    applyEqOrMissing('marital_status', params.maritalStatus);
    applyEqOrMissing('blood_group', params.bloodGroup);

    // is_active is nullable. A plain .eq(false) would make a null row invisible
    // under BOTH Active and Inactive — a row that exists but no filter reaches.
    if (params.isActive === 'active') {
      query = query.eq('is_active', true);
    } else if (params.isActive === 'inactive') {
      query = query.or('is_active.eq.false,is_active.is.null');
    }

    if (params.joinedFrom) query = query.gte('date_of_joining', params.joinedFrom);
    if (params.joinedTo) query = query.lte('date_of_joining', params.joinedTo);

    if (params.staffId) {
      if (params.staffId === FIELD_MISSING) {
        query = query.or(missingColumnFilter('staff_id'));
      } else {
        query = query.ilike('staff_id', `%${params.staffId}%`);
      }
    }

    if (params.biometricCode) {
      if (params.biometricCode === FIELD_MISSING) {
        query = query.or(missingColumnFilter('biometric_id'));
      } else if (params.biometricCode === FIELD_ASSIGNED) {
        query = query.not('biometric_id', 'is', null).neq('biometric_id', '');
      } else {
        query = query.ilike('biometric_id', `%${params.biometricCode}%`);
      }
    }

    if (missingFieldInScope) {
      query = query.or(missingColumnFilter(missingFieldInScope));
    }

    const { data: narrowRows, error } = await query;

    if (error) {
      console.error('[api/staff/incomplete-profiles] Phase 1 query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch employee profiles', details: error.message },
        { status: 500 }
      );
    }

    if ((narrowRows?.length ?? 0) >= PHASE_1_HARD_CAP) {
      console.warn(
        '[api/staff/incomplete-profiles] Phase 1 hit the %d-row cap; total and totalPages are undercounts.',
        PHASE_1_HARD_CAP
      );
    }

    // ---------- Compute, filter, sort in JS ----------
    const computed = (narrowRows || [])
      .map((row: any) => {
        const missingFields = computeMissingFields(row, params.fieldScope);
        return { ...row, missingFields, missing_count: missingFields.length };
      })
      .filter((row) => row.missing_count > 0)
      .filter((row) => matchesSearch(row, params.search));

    computed.sort((a, b) => compareIncompleteRows(a, b, params.sortBy, params.sortOrder));

    const total = computed.length;
    const totalPages = Math.max(1, Math.ceil(total / params.limit));
    const offset = (params.page - 1) * params.limit;
    const pageRows = computed.slice(offset, offset + params.limit);

    // ---------- Phase 2: hydrate the visible page only ----------
    const nameById = new Map<string, any>();
    const machineNameById = new Map<string, string>();

    if (pageRows.length > 0) {
      const pageIds = pageRows.map((row) => row.id);

      const { data: hydrated, error: hydrateError } = await supabase
        .from('staff')
        .select(HYDRATE_COLUMNS)
        .in('id', pageIds);

      if (hydrateError) {
        // Degrade to un-named rows rather than failing the page: the missing
        // fields, which are the point of this table, are already computed.
        console.error('[api/staff/incomplete-profiles] Phase 2 hydrate error:', hydrateError);
      } else {
        for (const row of hydrated || []) nameById.set((row as any).id, row);
      }

      // Biometric machines are institution-type entities with no FK from
      // staff (dropped 2026-08-06), so they need their own lookup.
      const machineIds = Array.from(
        new Set(pageRows.map((row) => row.biometric_institution_id).filter(Boolean))
      ) as string[];

      if (machineIds.length > 0) {
        const { data: machines, error: machineError } = await supabase
          .from('institutions')
          .select('id, name')
          .in('id', machineIds);

        if (machineError) {
          console.error('[api/staff/incomplete-profiles] Machine lookup error:', machineError);
        } else {
          for (const machine of machines || []) {
            machineNameById.set(machine.id, machine.name);
          }
        }
      }
    }

    const profiles: IncompleteStaffDetail[] = pageRows.map((row) => {
      const joined: any = nameById.get(row.id) ?? {};
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        designation: row.designation,
        staff_id: row.staff_id,
        institution_email: row.institution_email,
        is_active: row.is_active,
        created_at: row.created_at,
        missingFields: row.missingFields,
        missing_count: row.missing_count,
        institution_name: joined.institution?.name ?? null,
        department_name: joined.department?.department_name ?? null,
        category_name: joined.category?.category_name ?? null,
        biometric_id: row.biometric_id ?? null,
        biometric_machine_name: row.biometric_institution_id
          ? machineNameById.get(row.biometric_institution_id) ?? null
          : null,
      };
    });

    return NextResponse.json(
      { profiles, total, page: params.page, limit: params.limit, totalPages },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[api/staff/incomplete-profiles] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch incomplete employee profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
