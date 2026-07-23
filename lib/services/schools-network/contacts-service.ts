// lib/services/schools-network/contacts-service.ts
// ============================================================================
// SchoolContactsService — list / add / edit / delete school-side contacts
// (Headmaster, Principal, teachers, alternates). Contacts whose role has
// can_login_to_portal=TRUE can sign in to /schools-portal via magic-link.
//
// No RPC defined for contacts CRUD in the spec — direct table writes guarded
// by RLS (`is_super_admin OR is_admin OR (permission AND ownership-check)`).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  SchoolContact,
  SchoolContactRow,
} from '@/lib/types/schools-network';

const LOG = 'schools-network/contacts';

function mapContactRow(row: SchoolContactRow): SchoolContact {
  return {
    id: row.id,
    schoolId: row.school_id,
    roleId: row.role_id,
    roleCode: row.school_contact_roles?.code,
    roleLabel: row.school_contact_roles?.label,
    name: row.name,
    phone: row.phone,
    email: row.email,
    isPrimary: row.is_primary,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateContactInput {
  roleId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

export type UpdateContactInput = Partial<CreateContactInput>;

export class SchoolContactsService {
  static async listForSchool(
    supabase: SupabaseClient,
    schoolId: string
  ): Promise<{ rows: SchoolContact[]; error: string | null }> {
    const { data, error } = await supabase
      .from('school_contacts')
      .select('*, school_contact_roles(code, label)')
      .eq('school_id', schoolId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      logger.error(LOG, 'listForSchool failed', error);
      return { rows: [], error: error.message };
    }
    return {
      rows: (data ?? []).map((r) => mapContactRow(r as SchoolContactRow)),
      error: null,
    };
  }

  static async create(
    supabase: SupabaseClient,
    schoolId: string,
    input: CreateContactInput
  ): Promise<{ id: string | null; error: string | null }> {
    if (!input.name) return { id: null, error: 'name is required' };
    if (!input.roleId) return { id: null, error: 'roleId is required' };
    if (!input.email && !input.phone) {
      return { id: null, error: 'email or phone is required' };
    }

    const row = {
      school_id: schoolId,
      role_id: input.roleId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      is_primary: input.isPrimary ?? false,
      notes: input.notes ?? null,
    };

    const { data, error } = await supabase
      .from('school_contacts')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logger.error(LOG, 'create failed', error);
      return { id: null, error: error.message };
    }
    return { id: (data as { id: string }).id, error: null };
  }

  static async update(
    supabase: SupabaseClient,
    contactId: string,
    input: UpdateContactInput
  ): Promise<{ ok: boolean; error: string | null }> {
    const patch: Record<string, unknown> = {};
    if (input.roleId !== undefined) patch.role_id = input.roleId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.isPrimary !== undefined) patch.is_primary = input.isPrimary;
    if (input.notes !== undefined) patch.notes = input.notes;

    if (Object.keys(patch).length === 0) return { ok: true, error: null };
    patch.updated_at = new Date().toISOString();

    const { error } = await supabase.from('school_contacts').update(patch).eq('id', contactId);
    if (error) {
      logger.error(LOG, 'update failed', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  }

  static async delete(
    supabase: SupabaseClient,
    contactId: string
  ): Promise<{ ok: boolean; error: string | null }> {
    const { error } = await supabase.from('school_contacts').delete().eq('id', contactId);
    if (error) {
      logger.error(LOG, 'delete failed', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  }
}
