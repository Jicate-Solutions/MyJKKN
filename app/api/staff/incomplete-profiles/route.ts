// ============================================
// STAFF INCOMPLETE PROFILES API
// ============================================
// Created: 2026-02-09
// Purpose: Fetch staff members with incomplete profiles and their missing fields
// Used by: Staff Dashboard → Profiles Tab drill-down table
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { IncompleteStaffDetail } from '@/types/staff';

// Fields that define a complete staff profile
const REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'designation',
  'date_of_birth',
  'date_of_joining',
] as const;

const OPTIONAL_FIELDS = [
  'staff_id',
  'profile_picture',
  'address',
  'state',
  'district',
  'pincode',
  'institution_email',
  'blood_group',
] as const;

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

// Human-readable labels for field names
const FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  designation: 'Designation',
  date_of_birth: 'Date of Birth',
  date_of_joining: 'Date of Joining',
  staff_id: 'Staff ID',
  profile_picture: 'Profile Picture',
  address: 'Address',
  state: 'State',
  district: 'District',
  pincode: 'Pincode',
  institution_email: 'Institution Email',
  blood_group: 'Blood Group',
};

/**
 * GET /api/staff/incomplete-profiles
 *
 * Returns staff members with at least one missing field,
 * including which specific fields are missing.
 *
 * Query Parameters:
 * - institutionId: filter by institution
 * - departmentId: filter by department
 * - categoryId: filter by employment category
 * - requiredOnly: if 'true', only show staff missing required fields (default: false)
 * - limit: max results (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // Parse limit
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 100);

    const requiredOnly = searchParams.get('requiredOnly') === 'true';

    // Build query - fetch all fields + related data
    let query = supabase
      .from('staff')
      .select(
        `
        id,
        first_name,
        last_name,
        email,
        phone,
        designation,
        staff_id,
        institution_email,
        is_active,
        created_at,
        date_of_birth,
        date_of_joining,
        profile_picture,
        address,
        state,
        district,
        pincode,
        blood_group,
        institution:institutions(id, name),
        department:departments(id, department_name),
        category:employment_categories(id, category_name)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    const institutionId = searchParams.get('institutionId');
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    } else if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    const departmentId = searchParams.get('departmentId');
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    const categoryId = searchParams.get('categoryId');
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[api/staff/incomplete-profiles] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch staff profiles', details: error.message },
        { status: 500 }
      );
    }

    // Filter to staff with missing fields and compute which fields are missing
    const fieldsToCheck = requiredOnly ? REQUIRED_FIELDS : ALL_FIELDS;

    const incompleteProfiles: IncompleteStaffDetail[] = [];

    for (const row of data || []) {
      const missingFields: string[] = [];

      for (const field of fieldsToCheck) {
        const value = (row as any)[field];
        if (value === null || value === undefined || value === '') {
          missingFields.push(FIELD_LABELS[field] || field);
        }
      }

      // Only include staff with at least one missing field
      if (missingFields.length > 0) {
        incompleteProfiles.push({
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
          missingFields,
          institution_name: (row.institution as any)?.name ?? null,
          department_name: (row.department as any)?.department_name ?? null,
          category_name: (row.category as any)?.category_name ?? null,
        });
      }
    }

    // Sort by most missing fields first
    incompleteProfiles.sort((a, b) => b.missingFields.length - a.missingFields.length);

    // Apply limit after filtering
    const limited = incompleteProfiles.slice(0, limit);

    return NextResponse.json(
      {
        profiles: limited,
        total: incompleteProfiles.length,
        limit,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[api/staff/incomplete-profiles] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch incomplete staff profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
