// lib/services/solutions/clients-service.ts
// CRUD operations for sh_clients table

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  Client,
  ClientReferral,
  SourceType,
  PartnerStatus,
  CreateClientInput,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface ClientFilters extends PaginationParams {
  partner_status?: PartnerStatus;
  industry?: string;
  source_type?: SourceType;
  is_active?: boolean;
}

export interface UpdateClientInput {
  name?: string;
  industry?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  company_size?: string;
  source_type?: SourceType;
  source_department_id?: string;
  source_contact_name?: string;
  partner_status?: PartnerStatus;
  partner_since?: string;
  is_active?: boolean;
}

export interface ClientStats {
  total: number;
  active: number;
  byPartnerStatus: Record<PartnerStatus, number>;
  bySourceType: Record<SourceType, number>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeSearchString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

function calculatePartnerDiscount(status: PartnerStatus): number {
  switch (status) {
    case 'yi':
    case 'alumni':
    case 'mou':
    case 'referral':
      return 0.5; // 50% discount
    case 'standard':
    default:
      return 0;
  }
}

// ============================================
// SERVICE CLASS
// ============================================

export class ClientsService extends BaseService {
  /**
   * Get all clients with optional filters and pagination
   */
  static async getClients(filters?: ClientFilters): Promise<BaseListResponse<Client>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_clients')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true });

    // Apply filters
    if (filters?.partner_status) {
      query = query.eq('partner_status', filters.partner_status);
    }

    if (filters?.industry) {
      query = query.eq('industry_sector', filters.industry);
    }

    if (filters?.source_type) {
      query = query.eq('source_type', filters.source_type);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(
        `name.ilike.%${escaped}%,contact_person.ilike.%${escaped}%,contact_email.ilike.%${escaped}%,contact_phone.ilike.%${escaped}%`
      );
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch clients: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as Client[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single client by ID
   */
  static async getClientById(id: string): Promise<Client | null> {
    const { data, error } = await (this.supabase as any).from('sh_clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch client: ${error.message}`);
    }

    return data as Client;
  }

  /**
   * Get client by email
   */
  static async getClientByEmail(email: string): Promise<Client | null> {
    const { data, error } = await (this.supabase as any).from('sh_clients')
      .select('*')
      .eq('contact_email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch client: ${error.message}`);
    }

    return data as Client;
  }

  /**
   * Create a new client
   */
  static async createClient(input: CreateClientInput): Promise<Client> {
    const partnerDiscount = calculatePartnerDiscount(input.partner_status || 'standard');

    const { data, error } = await (this.supabase as any).from('sh_clients')
      .insert({
        name: input.name,
        industry: input.industry,
        contact_person: input.contact_person,
        contact_email: input.contact_email,
        contact_phone: input.contact_phone,
        address: input.address,
        city: input.city,
        company_size: input.company_size,
        source_type: input.source_type || 'direct',
        source_department_id: input.source_department_id,
        source_contact_name: input.source_contact_name,
        partner_status: input.partner_status || 'standard',
        partner_discount: partnerDiscount,
        partner_since: input.partner_since,
        is_active: true,
        referral_count: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create client: ${error.message}`);
    return data as Client;
  }

  /**
   * Update an existing client
   */
  static async updateClient(id: string, input: UpdateClientInput): Promise<Client> {
    const updateData: Record<string, unknown> = { ...input };

    // Recalculate partner discount if partner_status is being updated
    if (input.partner_status) {
      updateData.partner_discount = calculatePartnerDiscount(input.partner_status);
    }

    const { data, error } = await (this.supabase as any).from('sh_clients')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update client: ${error.message}`);
    return data as Client;
  }

  /**
   * Soft-delete a client (set is_active to false)
   */
  static async deactivateClient(id: string): Promise<Client> {
    return this.updateClient(id, { is_active: false });
  }

  /**
   * Reactivate a client
   */
  static async reactivateClient(id: string): Promise<Client> {
    return this.updateClient(id, { is_active: true });
  }

  /**
   * Increment referral count - auto-upgrades to partner status when >= 2
   */
  static async incrementReferralCount(id: string): Promise<Client> {
    const { data: currentClient, error: fetchError } = await (this.supabase as any).from('sh_clients')
      .select('referral_count, partner_status')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(`Failed to fetch client: ${fetchError.message}`);

    const newReferralCount = (currentClient.referral_count || 0) + 1;

    const updateData: Record<string, unknown> = {
      referral_count: newReferralCount,
      updated_at: new Date().toISOString(),
    };

    // Auto-upgrade to referral partner status if >= 2 referrals and not already a partner
    if (newReferralCount >= 2 && currentClient.partner_status === 'standard') {
      updateData.partner_status = 'referral';
      updateData.partner_discount = 0.5;
      updateData.partner_since = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any).from('sh_clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update client: ${error.message}`);
    return data as Client;
  }

  /**
   * Get unique industries from all clients
   */
  static async getClientIndustries(): Promise<string[]> {
    const { data, error } = await (this.supabase as any).from('sh_clients')
      .select('industry')
      .not('industry', 'is', null);

    if (error) throw new Error(`Failed to fetch industries: ${error.message}`);

    const industriesSet = new Set<string>();
    data?.forEach((c) => {
      if (c.industry) industriesSet.add(c.industry);
    });
    return Array.from(industriesSet).sort();
  }

  /**
   * Get client statistics
   */
  static async getClientStats(): Promise<ClientStats> {
    const { data, error } = await (this.supabase as any).from('sh_clients')
      .select('partner_status, source_type, is_active');

    if (error) throw new Error(`Failed to fetch client stats: ${error.message}`);

    const stats: ClientStats = {
      total: data?.length || 0,
      active: 0,
      byPartnerStatus: {
        standard: 0,
        yi: 0,
        alumni: 0,
        mou: 0,
        referral: 0,
      },
      bySourceType: {
        placement: 0,
        alumni: 0,
        clinical: 0,
        referral: 0,
        direct: 0,
        yi: 0,
        intent: 0,
      },
    };

    data?.forEach((client) => {
      if (client.is_active) stats.active++;
      if (client.partner_status) {
        stats.byPartnerStatus[client.partner_status as PartnerStatus]++;
      }
      if (client.source_type) {
        stats.bySourceType[client.source_type as SourceType]++;
      }
    });

    return stats;
  }

  /**
   * Check if a client is a partner
   */
  static isPartner(client: Client): boolean {
    return client.partner_status !== 'standard';
  }

  /**
   * Get partner discount percentage
   */
  static getPartnerDiscountPercent(client: Client): number {
    return client.partner_discount * 100;
  }

  // ============================================
  // REFERRAL MANAGEMENT
  // ============================================

  /**
   * Create a client referral record
   */
  static async createReferral(input: {
    client_id: string;
    referring_department_id: string;
    executing_department_id: string;
    bonus_percentage?: number;
  }): Promise<ClientReferral> {
    const { data, error } = await (this.supabase as any).from('sh_client_referrals')
      .insert({
        client_id: input.client_id,
        referring_department_id: input.referring_department_id,
        executing_department_id: input.executing_department_id,
        bonus_percentage: input.bonus_percentage || 5,
        bonus_paid: false,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create referral: ${error.message}`);
    return data as ClientReferral;
  }

  /**
   * Get referrals for a client
   */
  static async getClientReferrals(clientId: string): Promise<ClientReferral[]> {
    const { data, error } = await (this.supabase as any).from('sh_client_referrals')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch referrals: ${error.message}`);
    return data as ClientReferral[];
  }

  /**
   * Mark referral bonus as paid
   */
  static async markReferralPaid(
    referralId: string,
    bonusAmount: number
  ): Promise<ClientReferral> {
    const { data, error } = await (this.supabase as any).from('sh_client_referrals')
      .update({
        bonus_amount: bonusAmount,
        bonus_paid: true,
        paid_at: new Date().toISOString(),
      })
      .eq('id', referralId)
      .select()
      .single();

    if (error) throw new Error(`Failed to mark referral paid: ${error.message}`);
    return data as ClientReferral;
  }
}

// Export singleton instance methods
export const clientsService = {
  getClients: ClientsService.getClients.bind(ClientsService),
  getClientById: ClientsService.getClientById.bind(ClientsService),
  getClientByEmail: ClientsService.getClientByEmail.bind(ClientsService),
  createClient: ClientsService.createClient.bind(ClientsService),
  updateClient: ClientsService.updateClient.bind(ClientsService),
  deactivateClient: ClientsService.deactivateClient.bind(ClientsService),
  reactivateClient: ClientsService.reactivateClient.bind(ClientsService),
  incrementReferralCount: ClientsService.incrementReferralCount.bind(ClientsService),
  getClientIndustries: ClientsService.getClientIndustries.bind(ClientsService),
  getClientStats: ClientsService.getClientStats.bind(ClientsService),
  isPartner: ClientsService.isPartner.bind(ClientsService),
  getPartnerDiscountPercent: ClientsService.getPartnerDiscountPercent.bind(ClientsService),
  createReferral: ClientsService.createReferral.bind(ClientsService),
  getClientReferrals: ClientsService.getClientReferrals.bind(ClientsService),
  markReferralPaid: ClientsService.markReferralPaid.bind(ClientsService),
};
