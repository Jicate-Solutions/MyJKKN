// lib/services/staff/staff-service.ts

import {
  createClientSupabaseClient,
  createAdminClient
} from '@/lib/supabase/client';
import { normalizeStaffNameFields } from '@/lib/utils/staff-name';
import type {
  Staff,
  StaffFilters,
  StaffListResponse,
  StaffDashboardFilters,
  StaffDashboardStats,
  StaffOverviewStats,
  StaffRegistrationTrend,
  StaffInstitutionStats,
  StaffDepartmentStats,
  StaffCategoryStats,
  StaffGeographicStats,
  StaffDemographicStats,
  StaffTenureAnalytics,
  StaffProfileAnalytics
} from '@/types/staff';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import {
  buildStaffSearchTokenGroups,
  resolveStaffFiltersForUser
} from '@/lib/utils/staff-search';
import { RESERVED_STAFF_ROLE_KEYS } from '@/types/staff';
import { generateSyntheticEmail } from './synthetic-email';

interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'bigender';
  date_of_birth: string;
  marital_status: 'single' | 'married' | 'divorced' | 'widow';
  blood_group?: string;
  // Optional for view-only staff (login_enabled=false). Service generates a
  // deterministic synthetic email at @nolog.jkkn.local when blank.
  email?: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  // Optional for view-only staff (same generation rule as email).
  institution_email?: string;
  category_id: string;
  institution_id: string;
  // Nullable: teaching staff require it, non-teaching must leave null
  department_id?: string | null;
  role_key: string;
  // Optional free-form labels (lowercased) for external-API filtering.
  tags?: string[];
  is_active: boolean;
  // Default true. Set false to mark this staff as "view-only" — they cannot
  // log in and their linked profile is deactivated by the DB trigger.
  login_enabled?: boolean;
}

interface UpdateStaffDto extends Partial<CreateStaffDto> {
  updated_at?: string;
}

export class StaffService {
  private static supabase = createClientSupabaseClient();
  private static adminClient = createAdminClient();

  /**
   * Who already holds this biometric code on this machine?
   *
   * `staff_biometric_uq` is UNIQUE on (biometric_institution_id,
   * fn_norm_biometric_code(biometric_id)), and the normaliser strips leading
   * zeros from all-digit codes — so 00002, 002 and 2 are one code. That makes
   * the 23505 genuinely baffling from the form: the operator typed a value
   * they have never seen before and the raw Postgres message names an index,
   * not a person. Resolving the holder turns it into an answer.
   *
   * Best-effort by design. Called only from an error path, so a failure here
   * must degrade to the generic message rather than mask the real error.
   */
  static async findBiometricConflict(
    biometricId: string,
    biometricInstitutionId: string
  ): Promise<{ id: string; staff_id: string | null; name: string } | null> {
    if (!biometricId?.trim() || !biometricInstitutionId) return null;

    // Normalise client-side with the same rule as fn_norm_biometric_code so
    // the lookup finds 00002 when the operator typed 2. Digit-only codes lose
    // leading zeros; anything else is upper-cased.
    const trimmed = biometricId.trim();
    const normalized = /^[0-9]{1,18}$/.test(trimmed)
      ? String(BigInt(trimmed))
      : trimmed.toUpperCase();

    const { data, error } = await this.supabase
      .from('staff')
      .select('id, staff_id, first_name, last_name, biometric_id')
      .eq('biometric_institution_id', biometricInstitutionId)
      .not('biometric_id', 'is', null)
      .limit(500);

    if (error) {
      console.warn('[StaffService] biometric conflict lookup failed:', error);
      return null;
    }

    const match = (data ?? []).find((row: Record<string, unknown>) => {
      const raw = String(row.biometric_id ?? '').trim();
      if (!raw) return false;
      const norm = /^[0-9]{1,18}$/.test(raw) ? String(BigInt(raw)) : raw.toUpperCase();
      return norm === normalized;
    });

    if (!match) return null;
    return {
      id: match.id as string,
      staff_id: (match.staff_id as string) ?? null,
      name:
        [match.first_name, match.last_name].filter(Boolean).join(' ').trim() ||
        'another staff member'
    };
  }

  /**
   * Resolve who already holds an ID, for the 23505 on `staff_staff_id_key`.
   *
   * `staff_id` is GLOBALLY unique, but the table's SELECT policy is
   * institution-scoped. So an HR user on 'own_institution' scope can collide
   * with a row they are not allowed to see — a plain table lookup
   * returns nothing and the operator is left retyping against an invisible
   * wall. `fn_staff_id_conflict` is SECURITY DEFINER and permission-gated, so
   * it can name the holder across that boundary.
   *
   * Best-effort by design, exactly like findBiometricConflict: called only
   * from an error path, so any failure degrades to the generic message.
   */
  static async findStaffIdConflict(
    staffId: string
  ): Promise<{ staff_id: string; name: string; institution: string; is_active: boolean } | null> {
    if (!staffId?.trim()) return null;

    const { data, error } = await (this.supabase as any).rpc('fn_staff_id_conflict', {
      p_staff_id: staffId.trim()
    });

    if (error) {
      console.warn('[StaffService] staff_id conflict lookup failed:', error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      staff_id: row.staff_id,
      name: row.full_name ?? 'another team member',
      institution: row.institution_name ?? 'another institution',
      is_active: !!row.is_active
    };
  }

  /**
   * Resolve who already holds an email, for the 23505 on staff_email_key or
   * staff_institution_email_key. Same RLS-blindness problem as
   * findStaffIdConflict — see that method's note.
   *
   * `matched_field` tells the caller WHICH column the address was found in,
   * which is not always the field the operator typed it into.
   */
  static async findStaffEmailConflict(
    email: string
  ): Promise<{
    matchedField: 'email' | 'institution_email';
    staff_id: string | null;
    name: string;
    institution: string;
    is_active: boolean;
  } | null> {
    if (!email?.trim()) return null;

    const { data, error } = await (this.supabase as any).rpc('fn_staff_email_conflict', {
      p_email: email.trim()
    });

    if (error) {
      console.warn('[StaffService] email conflict lookup failed:', error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      matchedField: row.matched_field === 'email' ? 'email' : 'institution_email',
      staff_id: row.staff_id ?? null,
      name: row.full_name ?? 'another team member',
      institution: row.institution_name ?? 'another institution',
      is_active: !!row.is_active
    };
  }

  static async createStaff(
    data: CreateStaffDto,
    suppressToast: boolean = false
  ): Promise<Staff> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      // Canonical staff name (UPPERCASE, trimmed, single-spaced). Applied here
      // rather than at the call site so BOTH the direct insert below and the
      // API-route fallback send the same value. The DB is still the guarantee
      // (trg_normalize_staff_names + the staff_*_name_canonical CHECKs); doing
      // it here keeps the returned record consistent with what was submitted.
      data = normalizeStaffNameFields(data);

      // Role key validation: must exist, must not be reserved.
      // Added: 2026-04-14 for dynamic staff role onboarding.
      if (!data.role_key) {
        throw new Error('role_key is required');
      }
      if (RESERVED_STAFF_ROLE_KEYS.has(data.role_key)) {
        throw new Error(
          `Role "${data.role_key}" cannot be assigned via staff onboarding`
        );
      }

      // View-only / labour staff: generate deterministic synthetic emails when
      // login_enabled=false and emails are blank. Synthetic domain is
      // @nolog.jkkn.local so Google OAuth (restricted to @jkkn.ac.in) cannot
      // match — and the DB trigger flips the linked profile to is_active=false.
      // Added: 2026-05-15. Spec: 2026-05-15-staff-bulk-upload-labour-employees-design.md
      const loginEnabled = data.login_enabled !== false; // default true
      if (!loginEnabled) {
        if (!data.email || data.email.trim() === '') {
          data.email = generateSyntheticEmail('personal', data.staff_id, data.phone);
        }
        if (!data.institution_email || data.institution_email.trim() === '') {
          data.institution_email = generateSyntheticEmail('institution', data.staff_id, data.phone);
        }
      } else {
        // Login staff require BOTH emails.
        //
        // 2026-08-28: institution_email used to be optional here, on the
        // reasoning that "the DB trigger already handles institution_email IS
        // NULL gracefully (skips profile-link)" (BUG-003989/3980/3962). It does
        // skip — and that is the bug, not the mitigation.
        // sync_staff_to_profiles wraps its whole body in a non-empty check on
        // institution_email and creates the profile with
        // `email = NEW.institution_email`, so a blank one means NO profile row,
        // profile_id stays NULL, and a staff member flagged login_enabled=true
        // silently has no login. Five staff were created that way between
        // 2026-08-17 and 2026-08-27.
        //
        // A staff member with no @jkkn.ac.in address belongs in the view-only
        // branch above, which mints a synthetic institution email precisely so
        // the trigger still runs.
        if (!data.email) {
          throw new Error('Email is required for login-enabled staff');
        }
        if (!data.institution_email || data.institution_email.trim() === '') {
          throw new Error(
            'Institution email is required for login-enabled staff — it becomes their login identity. Turn off "Login user" to create a view-only record instead.'
          );
        }
      }
      // Persist the flag through to the DB (default true if undefined).
      data.login_enabled = loginEnabled;

      // Normalize empty optional unique fields to null so Postgres UNIQUE
      // doesn't treat '' as a colliding value across rows.
      // (NULLs are distinct in a unique index; '' is not.)
      if (data.staff_id === '') data.staff_id = null as any;

      // Conditional department: non-teaching categories must not carry department_id.
      // The DB trigger auto-clears this, but we also clear client-side to match form semantics.
      const { data: category } = await this.supabase
        .from('employment_categories')
        .select('id, is_teaching')
        .eq('id', data.category_id)
        .single();

      if (category && (category as any).is_teaching === false) {
        data.department_id = null;
      } else if (category && (category as any).is_teaching === true && !data.department_id) {
        throw new Error('Department is required for teaching staff');
      }

      // Check if staff_id already exists
      if (data.staff_id) {
        const { data: existing } = await this.supabase
          .from('staff')
          .select('id')
          .eq('staff_id', data.staff_id)
          .single();

        if (existing) {
          throw new Error('staff_staff_id_key');
        }
      }

      // Check if a staff member with this institution_email already exists
      if (data.institution_email) {
        const { data: existingStaff } = await this.supabase
          .from('staff')
          .select('id, first_name, last_name, institution_email')
          .eq('institution_email', data.institution_email)
          .single();

        if (existingStaff) {
          throw new Error(
            `Staff member with email ${data.institution_email} already exists`
          );
        }
      }

      // First attempt: Try with regular authenticated client
      let { data: staff, error } = await (this.supabase as any)
        .from('staff')
        .insert([
          {
            ...data,
            created_by: userData.user.id,
            updated_by: userData.user.id
          }
        ])
        .select()
        .single();

      // Track which path produced `staff` so we know whether the server
      // already handled user_roles assignment (API route does it; the
      // direct-insert path does not).
      let usedApiRoute = false;

      // If we get a 403/RLS error, try using the API route instead
      if (
        error &&
        (error.code === '42501' ||
          error.message?.includes('row-level security'))
      ) {
        console.log('RLS error detected, attempting API route creation...');

        try {
          // Use fetch to call our API route which has proper service role access
          const response = await fetch('/api/staff', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API route failed');
          }

          staff = await response.json();
          error = null;
          usedApiRoute = true;
        } catch (apiError) {
          console.error('API route also failed:', apiError);
          // Fall back to original error
        }
      }

      if (error) throw error;

      // Assign role to the pre-registered profile via user_roles (multi-role table).
      // The sync_staff_to_profiles trigger has already created/updated profile and set
      // staff.profile_id and written profiles.role = NEW.role_key. We now mirror that
      // into user_roles so the merged-permission flow works for staff even before their
      // first OAuth login.
      // Added: 2026-04-14
      //
      // Updated: 2026-04-22 — switched from the RLS-blocked direct INSERT on
      // user_roles to the SECURITY DEFINER RPC mirror_staff_role_to_user_roles.
      // Rationale: the user_roles INSERT policy requires roles.create, but our
      // staff-creator roles (HOD/administrator/digital_coordinator) only have
      // staff.create by design. Going through the RPC keeps authorization tight
      // (it validates caller has staff.create AND target matches a staff row)
      // while letting the assignment itself bypass RLS.
      //
      // Skip when the API route was used: /api/staff already performed the
      // assignment via supabaseAdmin (signalled by _role_assignment_applied).
      const serverApplied =
        usedApiRoute && (staff as any)?._role_assignment_applied === true;
      if (!serverApplied && staff?.profile_id && staff?.role_key) {
        try {
          const { error: rpcError } = await (this.supabase as any).rpc(
            'mirror_staff_role_to_user_roles',
            {
              p_profile_id: staff.profile_id,
              p_role_key: staff.role_key
            }
          );
          if (rpcError) throw rpcError;
        } catch (roleAssignError) {
          // Non-fatal: profile.role still carries the role string; user_roles can be synced later.
          console.warn(
            '[StaffService] user_roles assignment failed (profile.role still set):',
            roleAssignError
          );
        }
      }

      // Profile auto-creation is handled by the database trigger (sync_staff_to_profiles)
      // The trigger creates/updates a profile when staff with institution_email is created.
      // For view-only staff (login_enabled=false) the trigger flips the profile to
      // is_active=false and is_login_disabled=true (added 2026-05-15).
      const isViewOnly = (staff as any)?.login_enabled === false;
      if (staff?.institution_email) {
        console.log(
          `✓ Staff created successfully. Profile auto-created by trigger for ${staff.institution_email}${
            isViewOnly ? ' (view-only — deactivated)' : ''
          }`
        );

        if (!suppressToast) {
          if (isViewOnly) {
            toast.success(`View-only staff added — no login created`);
          } else {
            toast.success(
              `Staff created successfully! User can now login with Google using ${staff.institution_email}`
            );
          }
        }
      } else {
        console.log(
          'No institution_email provided, profile will not be created'
        );
        if (!suppressToast) {
          toast.success(`Staff created successfully`);
        }
      }

      return staff;
    } catch (error) {
      console.error('Error creating staff:', error);
      throw error;
    }
  }

  static async updateStaff(id: string, data: UpdateStaffDto): Promise<Staff> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      // Canonical staff name — see createStaff. normalizeStaffNameFields only
      // touches keys that are PRESENT, so a partial update that omits
      // last_name does not gain an undefined last_name and blank a surname.
      data = normalizeStaffNameFields(data);

      // Normalize empty optional unique fields to null so the
      // staff_staff_id_not_empty CHECK constraint doesn't reject blanks
      // (mirrors the same coercion in createStaff).
      if ((data as any).staff_id === '') (data as any).staff_id = null;
      // Normalize blank institution_email to null (mirrors createStaff fix
      // for BUG-003989 — institution email is optional for all staff).
      if ((data as any).institution_email === '') (data as any).institution_email = null;

      // Get the current staff data before update
      let currentStaff: any = null;
      const { data: fetchedStaff, error: fetchError } = await this.supabase
        .from('staff')
        .select('institution_email, institution_id, role_key')
        .eq('id', id)
        .single();

      if (fetchError) {
        // RLS may block the read — try via API route
        console.warn('[staff-service] Direct fetch for pre-update data failed, will use API fallback');
      } else {
        currentStaff = fetchedStaff;
      }

      // First attempt: Try with regular authenticated client
      let { data: staff, error } = await (this.supabase
        .from('staff') as any)
        .update({
          ...data,
          updated_by: userData.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      // If we get a RLS/PGRST116 error, fall back to API route
      if (
        error &&
        (error.code === '42501' ||
          error.code === 'PGRST116' ||
          error.message?.includes('row-level security') ||
          error.message?.includes('0 rows'))
      ) {
        console.log('[staff-service] RLS error on update, attempting API route...');

        try {
          const response = await fetch(`/api/staff/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API route update failed');
          }

          staff = await response.json();
          error = null;
        } catch (apiError) {
          console.error('[staff-service] API route update also failed:', apiError);
          // Surface the API error instead of the generic PGRST116 so the user
          // sees a meaningful message (e.g. "Forbidden" or "Insufficient
          // permissions") rather than "JSON object requested, multiple (or no)
          // rows returned".
          if (apiError instanceof Error) {
            throw apiError;
          }
        }
      }

      if (error) throw error;

      // Only resync user_roles if role_key actually changed. The previous
      // version called assignRoles whenever data.role_key was truthy, which
      // triggered a DELETE+INSERT cycle even on no-op edits and surfaced
      // RLS errors for callers without user_roles INSERT permission.
      const previousRoleKey = (currentStaff as any)?.role_key
        ?? (staff as any)?.role_key;
      const roleKeyChanged =
        !!data.role_key
        && previousRoleKey !== undefined
        && data.role_key !== previousRoleKey;

      if (roleKeyChanged && staff?.profile_id) {
        try {
          const { data: roleRow } = await this.supabase
            .from('custom_roles')
            .select('id')
            .eq('role_key', data.role_key)
            .maybeSingle();

          if (roleRow?.id) {
            const { UserRolesService } = await import(
              '@/lib/services/users/user-roles-service'
            );
            await UserRolesService.assignRoles(
              staff.profile_id,
              [roleRow.id],
              roleRow.id
            );
          }
        } catch (roleAssignError) {
          console.warn(
            '[StaffService] user_roles resync failed on update:',
            roleAssignError
          );
        }
      }

      // If institution_id was updated and staff has an institution_email, update the profile
      const institutionEmail = currentStaff?.institution_email || staff?.institution_email;
      if (data.institution_id && institutionEmail) {
        try {
          const { error: profileUpdateError } = await (this.supabase
            .from('profiles') as any)
            .update({ institution_id: data.institution_id })
            .eq('email', institutionEmail);

          if (profileUpdateError) {
            console.warn(
              'Failed to update profile institution_id:',
              profileUpdateError
            );
            toast.error(
              'Staff updated but failed to sync user profile institution'
            );
          } else {
            console.log(
              `Updated institution_id in profile for ${institutionEmail}`
            );
          }
        } catch (profileError) {
          console.warn('Error updating profile institution_id:', profileError);
        }
      }

      return staff;
    } catch (error) {
      console.error('Error updating staff:', error);
      throw error;
    }
  }

  static async deleteStaff(id: string): Promise<void> {
    try {
      console.log(`Deleting staff ${id}. Profile will be auto-deleted by database trigger.`);

      // Delete the staff record
      // The database trigger (trg_delete_staff_profile) will automatically delete
      // the corresponding profile from the profiles table
      //
      // .select() is required here so we can detect the case where the RLS
      // "staff_delete_scope_aware" policy silently matches 0 rows (no error,
      // just an empty result) — without it a blocked delete looks identical
      // to a successful one and the UI reports false success.
      const { data, error } = await (this.supabase as any)
        .from('staff')
        .delete()
        .eq('id', id)
        .select('id');

      const deletedRow = Array.isArray(data) ? data[0] : null;

      // RLS-blocked deletes surface either as an explicit error or as a
      // silent 0-row result — fall back to the admin-bypass API route (same
      // pattern as updateStaff) so the caller gets a real permission error
      // instead of a misleading success toast.
      if (error || !deletedRow) {
        console.log('[staff-service] Direct delete blocked, attempting API route...');

        const response = await fetch(`/api/staff/${id}`, { method: 'DELETE' });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to delete staff member');
        }
      }

      console.log(`✓ Staff ${id} deleted successfully. Profile auto-deleted by trigger.`);
    } catch (error) {
      console.error('Error deleting staff:', error);
      throw error;
    }
  }

  static async bulkDeleteStaff(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteStaff(id);
        success.push(id);
      } catch (error) {
        console.error(`Error deleting staff ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getStaff(
    filters: StaffFilters = {}
  ): Promise<StaffListResponse> {
    try {
      const startTime = performance.now();

      // OPTIMIZATION: Use 'estimated' count instead of 'exact' for better performance
      // 'estimated' uses Postgres statistics instead of counting all rows
      //
      // The institutions embed is qualified with !staff_institution_id_fkey on
      // purpose, here and at every other staff -> institutions embed in the app.
      // PostgREST resolves embeds by RELATIONSHIP, not by column, so the moment
      // `staff` holds a second FK to `institutions` the bare `institutions(...)`
      // form becomes ambiguous and fails at query-planning time with PGRST201 —
      // no rows, no build error, ~20 call sites at once. That happened on
      // 2026-08-06 when staff.biometric_institution_id was added as an FK
      // (see 20260806140000_staff_biometric_drop_institution_fk.sql). The
      // constraint is gone, but the column is not, and the hint is what keeps
      // this query correct whether or not a second FK ever comes back — and
      // even while PostgREST is still serving a stale schema cache.
      let query = (this.supabase as any).from('staff').select(
        `
          *,
          category:employment_categories(
            id,
            category_name,
            is_teaching
          ),
          institution:institutions!staff_institution_id_fkey(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `,
        { count: 'estimated' }
      );

      // CRITICAL OPTIMIZATION: Apply institution_id filter FIRST to minimize RLS overhead
      // This reduces the dataset before applying other filters, dramatically improving performance
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
        console.log('[staff-service] Applied institution filter first:', filters.institution_id);
      }

      // Apply other filters AFTER institution filter
      if (filters.search) {
        // ONE .or() PER TOKEN, chained — PostgREST ANDs successive .or() calls,
        // which is what lets "DHINESHKUMAR B" match a row whose first_name and
        // last_name hold those words separately. A single flat .or() with the
        // whole term cannot match a full name at all.
        for (const group of buildStaffSearchTokenGroups(filters.search)) {
          query = query.or(group.join(','));
        }
      }

      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      // Added: 2026-04-14 - role_key & is_teaching filters for non-teaching staff listing.
      if ((filters as any).role_key) {
        query = query.eq('role_key', (filters as any).role_key);
      }
      if (typeof (filters as any).is_teaching === 'boolean') {
        // PostgREST can't filter by joined column on root select; fetch matching
        // category IDs first, then constrain staff.category_id by IN (...).
        const { data: catRows } = await this.supabase
          .from('employment_categories')
          .select('id')
          .eq('is_teaching', (filters as any).is_teaching);
        const ids = (catRows || []).map((c: any) => c.id);
        if (ids.length === 0) {
          // Explicit empty-result case — no categories match the flag.
          query = query.in('category_id', ['00000000-0000-0000-0000-000000000000']);
        } else {
          query = query.in('category_id', ids);
        }
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      // Execute with timeout to prevent indefinite hanging
      const {
        data: staff,
        error,
        count
      } = (await Promise.race([
        query,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Staff query timeout - please try filtering by institution or category')), 30000)
        )
      ])) as any;

      if (error) throw error;

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      // Log performance metrics
      console.log(`[staff-service] Query completed in ${queryTime.toFixed(2)}ms | Returned ${staff?.length || 0} records | Estimated total: ${count || 0}`);

      // Warn if query is slow
      if (queryTime > 5000) {
        console.warn(`[staff-service] SLOW QUERY WARNING: Query took ${queryTime.toFixed(2)}ms. Consider adding institution filter.`);
      }

      return {
        data: staff || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      // Log the MESSAGE, not the object. A Supabase PostgrestError is a plain
      // object and prints fine, but an Error instance (e.g. the 30s timeout
      // reject above) has non-enumerable message/stack and console.error prints
      // it as `{}` — which left the UI saying "check the console for details"
      // when the console had none.
      console.error('Error fetching staff:', getErrorMessage(error), error);
      throw error;
    }
  }

  // Enhanced method with automatic institution filtering for HOD/faculty users
  static async getStaffWithRoleBasedFiltering(
    filters: StaffFilters = {},
    userProfile?: {
      id?: string;
      email?: string;
      role: string;
      department_id?: string;
      institution_id?: string;
      is_super_admin?: boolean;
    }
  ): Promise<StaffListResponse> {
    try {
      const effectiveFilters = resolveStaffFiltersForUser(filters, {
        role: userProfile?.role || '',
        institution_id: userProfile?.institution_id
      });

      // Super admins see all staff
      if (userProfile?.is_super_admin) {
        return await this.getStaff(effectiveFilters);
      }

      // Faculty users can only view their own staff record
      if (userProfile?.role === 'faculty' && userProfile.id) {
        console.log(
          '[staff-service] Applied self-only record filter for profile:',
          userProfile.id
        );
        return await this.getStaffForFacultyUser(
          effectiveFilters,
          userProfile.id
        );
      }

      // If user is HOD and has an institution, automatically filter by their institution
      if (
        userProfile?.role === 'hod' &&
        userProfile.institution_id
      ) {
        console.log(
          'Applied HOD institution filter:',
          userProfile.institution_id
        );

        // For HOD users, use optimized query with explicit institution filtering
        return await this.getStaffOptimizedForHOD(
          effectiveFilters,
          userProfile.institution_id
        );
      }

      // Use the existing getStaff method with enhanced filters
      return await this.getStaff(effectiveFilters);
    } catch (error) {
      console.error(
        'Error fetching staff with role-based filtering:',
        getErrorMessage(error),
        error
      );
      throw error;
    }
  }

  // Faculty users see only their own staff record, matched by profile_id
  // (auth.uid()) — not institution_email, which can silently diverge from
  // the user's auth login email and hide their own row. Mirrors the
  // own_records scope in app/api/staff/route.ts.
  private static async getStaffForFacultyUser(
    filters: StaffFilters,
    profileId: string
  ): Promise<StaffListResponse> {
    try {
      const startTime = performance.now();

      let query = (this.supabase as any).from('staff').select(
        `
          *,
          category:employment_categories(
            id,
            category_name,
            is_teaching
          ),
          institution:institutions!staff_institution_id_fkey(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `,
        { count: 'exact' }
      );

      // Filter to only the faculty user's own record
      query = query.eq('profile_id', profileId);

      const { data: staff, error, count } = await query;

      if (error) throw error;

      const endTime = performance.now();
      console.log(
        `[staff-service] Faculty self-query completed in ${(endTime - startTime).toFixed(2)}ms | Found ${staff?.length || 0} record(s)`
      );

      return {
        data: staff || [],
        metadata: {
          total: count || 0,
          page: 1,
          limit: filters.limit || 10,
          totalPages: 1
        }
      };
    } catch (error) {
      console.error('[staff-service] Error in faculty self-query:', error);
      throw error;
    }
  }

  // Optimized query specifically for HOD users to avoid RLS performance issues
  private static async getStaffOptimizedForHOD(
    filters: StaffFilters,
    institutionId: string
  ): Promise<StaffListResponse> {
    try {
      const startTime = performance.now();
      console.log('[staff-service] Using optimized HOD query for institution:', institutionId);

      // OPTIMIZATION: Use 'estimated' count instead of 'exact' for better performance
      let query = (this.supabase as any).from('staff').select(
        `
          *,
          category:employment_categories(
            id,
            category_name,
            is_teaching
          ),
          institution:institutions!staff_institution_id_fkey(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `,
        { count: 'estimated' }
      );

      // Apply institution filter first to reduce dataset and minimize RLS overhead
      query = query.eq('institution_id', institutionId);

      // Apply other filters
      if (filters.search) {
        // ONE .or() PER TOKEN, chained — PostgREST ANDs successive .or() calls,
        // which is what lets "DHINESHKUMAR B" match a row whose first_name and
        // last_name hold those words separately. A single flat .or() with the
        // whole term cannot match a full name at all.
        for (const group of buildStaffSearchTokenGroups(filters.search)) {
          query = query.or(group.join(','));
        }
      }

      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Added: 2026-04-15 - role_key & is_teaching filters in role-based path
      if ((filters as any).role_key) {
        query = query.eq('role_key', (filters as any).role_key);
      }
      if (typeof (filters as any).is_teaching === 'boolean') {
        const { data: catRows } = await this.supabase
          .from('employment_categories')
          .select('id')
          .eq('is_teaching', (filters as any).is_teaching);
        const ids = (catRows || []).map((c: any) => c.id);
        if (ids.length === 0) {
          query = query.in('category_id', ['00000000-0000-0000-0000-000000000000']);
        } else {
          query = query.in('category_id', ids);
        }
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      // Execute with timeout
      const {
        data: staff,
        error,
        count
      } = (await Promise.race([
        query,
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error('Staff query timeout - please try filtering by category or reducing the page size')
              ),
            30000
          )
        )
      ])) as any;

      if (error) throw error;

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      // Log performance metrics
      console.log(`[staff-service] HOD query completed in ${queryTime.toFixed(2)}ms | Returned ${staff?.length || 0} records | Estimated total: ${count || 0}`);

      return {
        data: staff || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('[staff-service] Error in optimized HOD staff query:', error);
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(
          'Staff query timed out. Please try filtering by category or reducing the page size.'
        );
      }
      throw error;
    }
  }

  static async getStaffById(id: string): Promise<Staff> {
    try {
      const { data: staff, error } = await this.supabase
        .from('staff')
        .select(
          `
          *,
          category:employment_categories(
            id,
            category_name,
            is_teaching
          ),
          institution:institutions!staff_institution_id_fkey(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      // Type assertion: gender is stored as string but should be typed as Gender enum
      // Also: category relation returns partial data, full type includes additional fields
      return staff as unknown as Staff;
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }

  /**
   * Lightweight staff query for dropdowns/selection components
   * - No count operation (faster)
   * - Minimal fields only
   * - Optimized for large lists
   * Updated: 2025-11-07
   */
  static async getStaffForSelection(
    filters: StaffFilters = {}
  ): Promise<Array<{ id: string; first_name: string; last_name: string; staff_id: string; email: string }>> {
    try {
      let query = this.supabase
        .from('staff')
        .select('id, first_name, last_name, staff_id, email');

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Limit to reasonable number for dropdowns
      const limit = filters.limit || 1000;
      query = query.limit(limit).order('first_name', { ascending: true });

      // Execute WITHOUT timeout race (we removed heavy joins and count)
      const { data: staff, error } = await query;

      if (error) throw error;

      return staff || [];
    } catch (error) {
      console.error('[staff-service] Error fetching staff for selection:', error);
      throw error;
    }
  }

  /**
   * Distinct tags currently in use across staff, powering the tags-input
   * autocomplete. Optionally scoped to one institution. Backed by the
   * staff_distinct_tags SECURITY DEFINER RPC (returns label strings only).
   */
  static async getDistinctTags(institutionId?: string): Promise<string[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'staff_distinct_tags',
        { p_institution_id: institutionId ?? null }
      );
      if (error) throw error;
      return (data as string[] | null) ?? [];
    } catch (error) {
      console.error('[staff-service] Error fetching distinct tags:', error);
      // Non-fatal: suggestions are a convenience; an empty list just means the
      // user types tags free-form without autocomplete.
      return [];
    }
  }

  /**
   * Get staff using API route (bypasses RLS for performance)
   * Use this method for components that need to fetch large numbers of staff
   * like the staff search selector
   */
  static async getStaffViaAPI(
    filters: StaffFilters = {}
  ): Promise<StaffListResponse> {
    try {
      const params = new URLSearchParams();

      if (filters.institution_id) params.append('institution_id', filters.institution_id);
      if (filters.search) params.append('search', filters.search);
      if (filters.category_id) params.append('category_id', filters.category_id);
      if (filters.department_id) params.append('department_id', filters.department_id);
      if (filters.isActive !== undefined) params.append('isActive', String(filters.isActive));
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.page) params.append('page', String(filters.page));
      if (filters.for_teaching_assignment) params.append('for_teaching_assignment', 'true');

      const response = await fetch(`/api/staff?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch staff');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching staff via API:', error);
      throw error;
    }
  }

  /**
   * Utility function to sync institution_id for existing staff profiles
   * This should be called to fix profiles that were created without institution_id
   */
  static async syncStaffProfileInstitutions(): Promise<{
    success: number;
    failed: { staff_id: string; email: string; error: string }[];
  }> {
    try {
      const success: string[] = [];
      const failed: { staff_id: string; email: string; error: string }[] = [];

      // Get all staff with institution_email
      const { data: staffList, error: staffError } = await this.supabase
        .from('staff')
        .select('id, institution_email, institution_id')
        .not('institution_email', 'is', null);

      if (staffError) throw staffError;

      // Process each staff member
      for (const staff of staffList || []) {
        try {
          // Check if profile exists and has null institution_id
          const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .select('id, institution_id')
            .eq('email', (staff as any).institution_email)
            .single();

          if (profileError) {
            failed.push({
              staff_id: (staff as any).id,
              email: (staff as any).institution_email,
              error: `Profile not found: ${profileError.message}`
            });
            continue;
          }

          // Update profile if institution_id is null
          if (!(profile as any).institution_id && (staff as any).institution_id) {
            const { error: updateError } = await (this.supabase
              .from('profiles') as any)
              .update({ institution_id: (staff as any).institution_id })
              .eq('email', (staff as any).institution_email);

            if (updateError) {
              failed.push({
                staff_id: (staff as any).id,
                email: (staff as any).institution_email,
                error: `Update failed: ${updateError.message}`
              });
            } else {
              success.push((staff as any).id);
            }
          }
        } catch (error) {
          failed.push({
            staff_id: (staff as any).id,
            email: (staff as any).institution_email,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return { success: success.length, failed };
    } catch (error) {
      console.error('Error syncing staff profile institutions:', error);
      throw error;
    }
  }

  // Dashboard Analytics Methods

  // Column union required by all nine dashboard sections. Kept explicit (never
  // select('*')) so the 13 JSONB array columns (badges, qualifications, specialisations,
  // experience_entries, research_focus_areas, publications, funded_projects,
  // certifications, awards, memberships, phd_scholars_list, faqs, achievements) and the
  // markdown text fields (qualification_summary, professional_summary,
  // mentoring_description) added by the staff-extended-faculty-fields work stay out of
  // the payload. Measured: `select *` is 872 KB across 856 rows; this list is ~90 KB.
  private static readonly DASHBOARD_STAFF_COLUMNS = [
    // grouping / filter dimensions
    'is_active',
    'institution_id',
    'department_id',
    'category_id',
    // dates (tenure, age groups, hiring trends)
    'date_of_joining',
    'date_of_birth',
    // profile-completion required fields
    'first_name',
    'last_name',
    'email',
    'phone',
    'designation',
    // profile-completion optional fields — includes blood_group: removing
    // it here silently reintroduces a completion-calculation bug (Task 11),
    // since getOverviewStats/getProfileAnalytics read it as a completion field.
    'staff_id',
    'profile_picture',
    'address',
    'state',
    'district',
    'pincode',
    'institution_email',
    // attendance enrolment — a missing code means this person's punches cannot be
    // resolved by the biometric import, so the Profiles tab tracks them as fields.
    'biometric_id',
    'biometric_institution_id',
    'blood_group',
    // demographics
    'gender',
    'marital_status',
    // embedded display names
    'institution:institutions!staff_institution_id_fkey(id, name)',
    'department:departments(id, department_name)',
    'category:employment_categories(id, category_name)'
  ].join(', ');

  static async getDashboardStats(
    filters: StaffDashboardFilters = {}
  ): Promise<StaffDashboardStats> {
    try {
      // Use the standard client to respect RLS policies
      const supabase = createClientSupabaseClient();

      // ONE unfiltered staff read; all nine sections are then derived in memory.
      //
      // This used to be nine parallel SELECTs against `staff`. Each was an unbounded
      // full-table scan, and an unbounded `staff` scan is expensive because of the
      // table's SELECT RLS policies -- measured at 1245 ms / 33,766 shared buffers for
      // an own_institution user (hod / principal / office_assistant, the page's primary
      // audience) and 408 ms for a super admin, on a table that is only ~154 pages.
      // The dashboard paid that nine times over, which is what produced the multi-second
      // "Loading Dashboard..." overlay. The RLS side is fixed in
      // supabase/migrations/optimize_staff_select_rls_dashboard_perf.sql; this collapses
      // the 9x fan-out that multiplied it.
      //
      // Why the fetch is UNFILTERED: six sections apply the full filter set, but three
      // deliberately drop their own dimension -- institutionStats ignores institutionId,
      // departmentStats ignores departmentId, categoryStats ignores categoryId -- so
      // each chart still shows every slice of its own axis. Fetching the superset once
      // and re-applying each section's filters in memory reproduces all nine result sets
      // exactly, at the cost of a single scan. Filtering 856 objects in JS is
      // sub-millisecond; another RLS scan is not.
      const [allStaff, profileActiveByEmail] = await Promise.all([
        this.fetchDashboardStaff(supabase),
        this.fetchProfileActiveByEmail(supabase)
      ]);

      return {
        overview: this.getOverviewStats(filters, allStaff, profileActiveByEmail),
        registrationTrends: this.getRegistrationTrends(filters, allStaff),
        institutionStats: this.getInstitutionStats(filters, allStaff),
        departmentStats: this.getDepartmentStats(filters, allStaff),
        categoryStats: this.getCategoryStats(filters, allStaff),
        geographicStats: this.getGeographicStats(filters, allStaff),
        demographicStats: this.getDemographicStats(filters, allStaff),
        tenureAnalytics: this.getTenureAnalytics(filters, allStaff),
        profileAnalytics: this.getProfileAnalytics(filters, allStaff)
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  /** Single RLS-scoped read backing every dashboard section. */
  private static async fetchDashboardStaff(
    supabase: ReturnType<typeof createClientSupabaseClient>
  ): Promise<any[]> {
    const { data, error } = await (supabase as any)
      .from('staff')
      .select(this.DASHBOARD_STAFF_COLUMNS);
    if (error) throw error;
    return (data as any[]) || [];
  }

  /**
   * profiles.is_active keyed by email — backs overview's staffWithProfiles /
   * staffWithoutProfiles / inactiveProfiles counts. Separate table, cheap scan
   * (7220 rows, ~3 ms: the profiles SELECT policy is just an auth.uid() null check),
   * so it stays its own round trip and runs alongside the staff read.
   */
  private static async fetchProfileActiveByEmail(
    supabase: ReturnType<typeof createClientSupabaseClient>
  ): Promise<Map<string, boolean>> {
    const { data, error } = await supabase.from('profiles').select('email, is_active');
    if (error) throw error;
    return new Map((data || []).map((p: any) => [p.email, p.is_active]));
  }

  /**
   * In-memory equivalent of the `.eq()` chains the nine per-section queries used to
   * build. `dims` names which dimensions this section filters on — sections omit their
   * own grouping dimension on purpose (see getDashboardStats).
   */
  private static filterDashboardStaff(
    staff: any[],
    filters: StaffDashboardFilters,
    dims: {
      institution?: boolean;
      department?: boolean;
      category?: boolean;
      status?: boolean;
    }
  ): any[] {
    // .in('is_active', ['active'] -> [true]) semantics; no staff row has a NULL
    // is_active, so a plain boolean compare matches the SQL exactly.
    const allowedActive =
      dims.status && filters.status && filters.status.length > 0
        ? filters.status.map((s) => s === 'active')
        : null;

    return staff.filter((s: any) => {
      if (dims.institution && filters.institutionId && s.institution_id !== filters.institutionId) {
        return false;
      }
      if (dims.department && filters.departmentId && s.department_id !== filters.departmentId) {
        return false;
      }
      if (dims.category && filters.categoryId && s.category_id !== filters.categoryId) {
        return false;
      }
      if (allowedActive && !allowedActive.includes(!!s.is_active)) {
        return false;
      }
      return true;
    });
  }

  private static getOverviewStats(
    filters: StaffDashboardFilters,
    allStaff: any[],
    profileActiveByEmail: Map<string, boolean>
  ): StaffOverviewStats {
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true,
      category: true,
      status: true
    });

    const currentDate = new Date();
    const currentMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    const totalStaff = staff?.length || 0;
    const activeStaff = staff?.filter((s: any) => s.is_active).length || 0;
    const inactiveStaff = totalStaff - activeStaff;

    const newHires =
      staff?.filter((s: any) => {
        const joiningDate = new Date(s.date_of_joining);
        return joiningDate >= currentMonth;
      }).length || 0;

    // Calculate profile completion rate
    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'designation',
      'date_of_birth',
      'date_of_joining'
    ];
    const optionalFields = [
      'staff_id',
      'profile_picture',
      'address',
      'state',
      'district',
      'pincode',
      'institution_email',
      'blood_group',
      'biometric_id',
      'biometric_institution_id'
    ];

    let totalFieldsExpected = 0;
    let totalFieldsCompleted = 0;

    staff?.forEach((s: any) => {
      requiredFields.forEach((field) => {
        totalFieldsExpected++;
        if (s[field as keyof Staff]) totalFieldsCompleted++;
      });
      optionalFields.forEach((field) => {
        totalFieldsExpected++;
        if (s[field as keyof Staff]) totalFieldsCompleted++;
      });
    });

    const profileCompletionRate =
      totalStaff > 0 ? (totalFieldsCompleted / totalFieldsExpected) * 100 : 0;

    // Calculate average tenure
    const totalTenure =
      staff?.reduce((sum: any, s: any) => {
        const joiningDate = new Date(s.date_of_joining);
        const tenure =
          (currentDate.getTime() - joiningDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365.25);
        return sum + tenure;
      }, 0) || 0;

    const averageTenure = totalStaff > 0 ? totalTenure / totalStaff : 0;

    // Get staff with/without profiles (map is fetched once in getDashboardStats)
    const staffWithProfiles =
      staff?.filter(
        (s: any) => s.institution_email && profileActiveByEmail.has(s.institution_email)
      ).length || 0;
    const staffWithoutProfiles = totalStaff - staffWithProfiles;
    // Profiles the staff-sync trigger deactivated (e.g. view-only/no-login
    // staff), distinct from inactiveStaff which tracks staff.is_active.
    const inactiveProfiles =
      staff?.filter(
        (s: any) =>
          s.institution_email &&
          profileActiveByEmail.get(s.institution_email) === false
      ).length || 0;

    return {
      totalStaff,
      activeStaff,
      inactiveStaff,
      newHires,
      profileCompletionRate,
      averageTenure,
      staffWithProfiles,
      staffWithoutProfiles,
      inactiveProfiles
    };
  }

  private static getRegistrationTrends(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffRegistrationTrend[] {
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true,
      category: true
    });

    // Group by date and calculate trends for the last 30 days
    const trends: { [key: string]: number } = {};
    const endDate = filters.dateRange?.to || new Date();
    const startDate =
      filters.dateRange?.from ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Initialize all dates in range with 0
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split('T')[0];
      trends[dateStr] = 0;
    }

    // Count staff joined on each date
    staff?.forEach((s: any) => {
      const joiningDate = new Date(s.date_of_joining);
      if (joiningDate >= startDate && joiningDate <= endDate) {
        const dateStr = joiningDate.toISOString().split('T')[0];
        trends[dateStr] = (trends[dateStr] || 0) + 1;
      }
    });

    // Convert to array and calculate cumulative
    let cumulative = 0;
    return Object.entries(trends)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => {
        cumulative += count;
        return { date, count, cumulative };
      });
  }

  private static getInstitutionStats(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffInstitutionStats[] {
    // institutionId is intentionally NOT applied: this chart is the institution axis,
    // so it keeps showing every institution even while one is selected.
    // Active-only, matching the previous .eq('is_active', true).
    const staff = this.filterDashboardStaff(allStaff, filters, {
      department: true,
      category: true
    }).filter((s: any) => s.is_active === true);

    return this.calculateDistribution(
      staff || [],
      'institution_id',
      (item: any) => ({
        id: item.institution?.id || item.institution_id,
        name: item.institution?.name || 'Unknown Institution'
      })
    ).map((stat: any) => ({
      ...stat,
      staffCount: stat.count,
      activeCount: stat.count,
      inactiveCount: 0
    }));
  }

  private static getDepartmentStats(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffDepartmentStats[] {
    // departmentId is intentionally NOT applied: this chart is the department axis.
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      category: true
    });

    return this.calculateDistribution(
      staff || [],
      'department_id',
      (item: any) => ({
        id: item.department?.id || item.department_id,
        name: item.department?.department_name || 'Unknown Department',
        institutionId: item.institution_id,
        institutionName: item.institution?.name || 'Unknown Institution'
      })
    ).map((stat: any) => ({
      ...stat,
      staffCount: stat.count, // Map count to staffCount
      activeCount:
        staff?.filter((s: any) => s.department_id === stat.id && s.is_active)
          .length || 0,
      inactiveCount:
        staff?.filter((s: any) => s.department_id === stat.id && !s.is_active)
          .length || 0
    }));
  }

  private static getCategoryStats(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffCategoryStats[] {
    // categoryId is intentionally NOT applied: this chart is the category axis.
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true
    });

    const currentDate = new Date();

    return this.calculateDistribution(
      staff || [],
      'category_id',
      (item: any) => ({
        id: item.category?.id || item.category_id,
        name: item.category?.category_name || 'Unknown Category'
      })
    ).map((stat: any) => {
      const categoryStaff =
        staff?.filter((s: any) => s.category_id === stat.id) || [];
      const totalTenure = categoryStaff.reduce((sum: any, s: any) => {
        const joiningDate = new Date(s.date_of_joining);
        const tenure =
          (currentDate.getTime() - joiningDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365.25);
        return sum + tenure;
      }, 0);

      return {
        ...stat,
        staffCount: stat.count, // Map count to staffCount
        activeCount: categoryStaff.filter((s: any) => s.is_active).length,
        inactiveCount: categoryStaff.filter((s: any) => !s.is_active).length,
        averageTenure:
          categoryStaff.length > 0 ? totalTenure / categoryStaff.length : 0
      };
    });
  }

  private static getGeographicStats(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffGeographicStats {
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true,
      category: true
    });

    return this.calculateGeographicStats(staff || []);
  }

  private static getDemographicStats(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffDemographicStats {
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true,
      category: true
    });

    const currentDate = new Date();

    return {
      genderDistribution: this.calculateDistribution(staff || [], 'gender'),
      maritalStatusDistribution: this.calculateDistribution(
        staff || [],
        'marital_status',
        (item: any) => ({
          name: item.marital_status || 'Not Specified'
        })
      ),
      ageGroups: this.calculateAgeGroups(staff || [], currentDate)
    };
  }

  private static getTenureAnalytics(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffTenureAnalytics {
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true,
      category: true
    });

    const currentDate = new Date();

    // Calculate tenure distribution
    const tenureRanges = [
      '0-1 years',
      '1-3 years',
      '3-5 years',
      '5-10 years',
      '10+ years'
    ];
    const tenureDistribution = tenureRanges.map((range) => ({
      range,
      count: 0,
      percentage: 0
    }));

    staff?.forEach((s: any) => {
      const joiningDate = new Date(s.date_of_joining);
      const tenure =
        (currentDate.getTime() - joiningDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);

      if (tenure < 1) tenureDistribution[0].count++;
      else if (tenure < 3) tenureDistribution[1].count++;
      else if (tenure < 5) tenureDistribution[2].count++;
      else if (tenure < 10) tenureDistribution[3].count++;
      else tenureDistribution[4].count++;
    });

    const totalStaff = staff?.length || 0;
    tenureDistribution.forEach((item) => {
      item.percentage = totalStaff > 0 ? (item.count / totalStaff) * 100 : 0;
    });

    // Calculate average tenure by category
    const categoryTenure: { [key: string]: { total: number; count: number } } =
      {};
    staff?.forEach((s: any) => {
      const categoryName = (s.category as any)?.category_name || 'Unknown';
      const joiningDate = new Date(s.date_of_joining);
      const tenure =
        (currentDate.getTime() - joiningDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);

      if (!categoryTenure[categoryName]) {
        categoryTenure[categoryName] = { total: 0, count: 0 };
      }
      categoryTenure[categoryName].total += tenure;
      categoryTenure[categoryName].count++;
    });

    const averageTenureByCategory = Object.entries(categoryTenure).map(
      ([categoryName, data]) => ({
        categoryName,
        averageTenure: data.count > 0 ? data.total / data.count : 0
      })
    );

    // Calculate average tenure by department
    const departmentTenure: {
      [key: string]: { total: number; count: number; institutionName: string };
    } = {};
    staff?.forEach((s: any) => {
      const departmentName =
        (s.department as any)?.department_name || 'Unknown';
      const institutionName = (s.institution as any)?.name || 'Unknown';
      const joiningDate = new Date(s.date_of_joining);
      const tenure =
        (currentDate.getTime() - joiningDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);

      if (!departmentTenure[departmentName]) {
        departmentTenure[departmentName] = {
          total: 0,
          count: 0,
          institutionName
        };
      }
      departmentTenure[departmentName].total += tenure;
      departmentTenure[departmentName].count++;
    });

    const averageTenureByDepartment = Object.entries(departmentTenure).map(
      ([departmentName, data]) => ({
        departmentName,
        institutionName: data.institutionName,
        averageTenure: data.count > 0 ? data.total / data.count : 0
      })
    );

    // Calculate new hires trend for last 12 months
    const newHiresTrend = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1
      );
      const nextMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i + 1,
        1
      );

      const count =
        staff?.filter((s: any) => {
          const joiningDate = new Date(s.date_of_joining);
          return joiningDate >= month && joiningDate < nextMonth;
        }).length || 0;

      newHiresTrend.push({
        month: month.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short'
        }),
        count
      });
    }

    return {
      tenureDistribution,
      averageTenureByCategory,
      averageTenureByDepartment,
      newHiresTrend
    };
  }

  private static getProfileAnalytics(
    filters: StaffDashboardFilters,
    allStaff: any[]
  ): StaffProfileAnalytics {
    // Previously `select('*')` — the single heaviest payload on the page (872 KB for
    // 856 rows) even though only the field list below plus category.category_name is
    // ever read. DASHBOARD_STAFF_COLUMNS covers all of them.
    const staff = this.filterDashboardStaff(allStaff, filters, {
      institution: true,
      department: true,
      category: true
    });

    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'designation',
      'date_of_birth',
      'date_of_joining'
    ];
    const optionalFields = [
      'staff_id',
      'profile_picture',
      'address',
      'state',
      'district',
      'pincode',
      'institution_email',
      'blood_group',
      // Both halves of the biometric enrolment are tracked, not just the code.
      // staff_biometric_scope_chk only forces a machine when a code is present, so
      // "machine set, code blank" is a legal state the pair-count exposes; today
      // the two numbers are identical, and any divergence is a real gap.
      'biometric_id',
      'biometric_institution_id'
    ];
    const allFields = [...requiredFields, ...optionalFields];

    // Profile completion breakdown
    const profileCompletionBreakdown = allFields.map((field) => {
      const completedCount =
        staff?.filter((s: any) => s[field as keyof Staff]).length || 0;
      const totalCount = staff?.length || 0;
      return {
        field,
        completedCount,
        totalCount,
        percentage: totalCount > 0 ? (completedCount / totalCount) * 100 : 0
      };
    });

    // Profile completion by category
    const categoryCompletion: {
      [key: string]: { completed: number; total: number };
    } = {};
    staff?.forEach((s: any) => {
      const categoryName = s.category?.category_name || 'Unknown';
      if (!categoryCompletion[categoryName]) {
        categoryCompletion[categoryName] = { completed: 0, total: 0 };
      }
      categoryCompletion[categoryName].total++;

      const completedFields = allFields.filter(
        (field) => s[field as keyof Staff]
      ).length;
      if (completedFields >= allFields.length * 0.8) {
        // 80% completion threshold
        categoryCompletion[categoryName].completed++;
      }
    });

    const profileCompletionByCategory = Object.entries(categoryCompletion).map(
      ([categoryName, data]) => ({
        categoryName,
        completedCount: data.completed,
        totalCount: data.total,
        percentage: data.total > 0 ? (data.completed / data.total) * 100 : 0
      })
    );

    // Missing fields analysis
    const missingFields = allFields
      .map((field) => {
        const missingCount =
          staff?.filter((s: any) => !s[field as keyof Staff]).length || 0;
        const totalCount = staff?.length || 0;
        return {
          field,
          missingCount,
          percentage: totalCount > 0 ? (missingCount / totalCount) * 100 : 0
        };
      })
      .filter((item) => item.missingCount > 0)
      .sort((a, b) => b.missingCount - a.missingCount);

    return {
      profileCompletionBreakdown,
      profileCompletionByCategory,
      missingFields
    };
  }

  // Helper methods
  private static calculateDistribution<T>(
    data: T[],
    key: keyof T,
    transform?: (item: T) => any
  ): Array<{
    name: string;
    count: number;
    percentage: number;
  }> {
    const distribution: { [key: string]: any } = {};

    data.forEach((item) => {
      const value = String(item[key] || 'Not Specified');
      if (!distribution[value]) {
        const transformed = transform ? transform(item) : { name: value };
        distribution[value] = {
          name: value,
          ...transformed,
          count: 0
        };
      }
      distribution[value].count++;
    });

    const total = data.length;
    return Object.values(distribution).map((item: any) => ({
      ...item,
      name: item.name || 'Not Specified',
      count: item.count,
      percentage: total > 0 ? (item.count / total) * 100 : 0
    }));
  }

  private static calculateAgeGroups(staff: any[], currentDate: Date) {
    const ageGroups = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
    const distribution = ageGroups.map((group) => ({
      name: group,
      count: 0,
      percentage: 0
    }));

    staff.forEach((s) => {
      if (s.date_of_birth) {
        const birthDate = new Date(s.date_of_birth);
        const age = currentDate.getFullYear() - birthDate.getFullYear();

        if (age <= 25) distribution[0].count++;
        else if (age <= 35) distribution[1].count++;
        else if (age <= 45) distribution[2].count++;
        else if (age <= 55) distribution[3].count++;
        else if (age <= 65) distribution[4].count++;
        else distribution[5].count++;
      }
    });

    const total = staff.length;
    distribution.forEach((item) => {
      item.percentage = total > 0 ? (item.count / total) * 100 : 0;
    });

    return distribution;
  }

  private static calculateGeographicStats(staff: any[]): StaffGeographicStats {
    const stateDistribution: { [key: string]: number } = {};
    const districtDistribution: {
      [key: string]: { state: string; count: number };
    } = {};

    staff.forEach((s) => {
      const state = s.state || 'Not Specified';
      const district = s.district || 'Not Specified';

      stateDistribution[state] = (stateDistribution[state] || 0) + 1;

      const districtKey = `${state}-${district}`;
      if (!districtDistribution[districtKey]) {
        districtDistribution[districtKey] = { state, count: 0 };
      }
      districtDistribution[districtKey].count++;
    });

    const total = staff.length;

    const states = Object.entries(stateDistribution).map(([state, count]) => ({
      name: state,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));

    const districts = Object.entries(districtDistribution).map(
      ([key, data]) => {
        const district = key.split('-')[1];
        return {
          name: district,
          count: data.count,
          percentage: total > 0 ? (data.count / total) * 100 : 0
        };
      }
    );

    return {
      stateDistribution: states,
      districtDistribution: districts
    };
  }
}
