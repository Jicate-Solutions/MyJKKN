import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HostelEmergencyContact } from '@/types/campus-living';

/**
 * Emergency contacts service — hostel-scoped phone/email contacts used by
 * /campus-living/safety/emergency-contacts. Free-form `contact_type` taxonomy
 * (medical/fire/police/warden/anti_ragging/family/other). All reads/writes
 * institution-scoped; super-admin path passes `undefined` to bypass scope.
 */
export class EmergencyContactsService {
  // ── List contacts ────────────────────────────────────────────────────
  static async getContacts(
    institutionId: string | undefined,
    filters?: {
      block_id?: string;
      contact_type?: string;
      is_primary?: boolean;
    }
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_emergency_contacts')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.contact_type) query = query.eq('contact_type', filters.contact_type);
      if (filters?.is_primary !== undefined) query = query.eq('is_primary', filters.is_primary);

      query = query
        .order('contact_type', { ascending: true, nullsFirst: false })
        .order('is_primary', { ascending: false, nullsFirst: false })
        .order('contact_name', { ascending: true });

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/emergency-contacts', 'Failed to fetch contacts', error);
        throw error;
      }
      return { data: (data ?? []) as HostelEmergencyContact[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/emergency-contacts', 'Unexpected error in getContacts', error);
      throw error;
    }
  }

  // ── Single contact ───────────────────────────────────────────────────
  static async getContact(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_emergency_contacts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/emergency-contacts', 'Failed to fetch contact', error);
        throw error;
      }
      return data as HostelEmergencyContact | null;
    } catch (error) {
      logger.error('campus-living/emergency-contacts', 'Unexpected error in getContact', error);
      throw error;
    }
  }

  // ── Create contact ───────────────────────────────────────────────────
  static async createContact(
    payload: Omit<HostelEmergencyContact, 'id' | 'created_at' | 'updated_at'>
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_emergency_contacts')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/emergency-contacts', 'Failed to create contact', error);
        throw error;
      }
      return data as HostelEmergencyContact;
    } catch (error) {
      logger.error('campus-living/emergency-contacts', 'Unexpected error in createContact', error);
      throw error;
    }
  }

  // ── Update contact ───────────────────────────────────────────────────
  static async updateContact(id: string, payload: Partial<HostelEmergencyContact>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_emergency_contacts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/emergency-contacts', 'Failed to update contact', error);
        throw error;
      }
      return data as HostelEmergencyContact;
    } catch (error) {
      logger.error('campus-living/emergency-contacts', 'Unexpected error in updateContact', error);
      throw error;
    }
  }

  // ── Delete contact ───────────────────────────────────────────────────
  static async deleteContact(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_emergency_contacts')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/emergency-contacts', 'Failed to delete contact', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/emergency-contacts', 'Unexpected error in deleteContact', error);
      throw error;
    }
  }
}
