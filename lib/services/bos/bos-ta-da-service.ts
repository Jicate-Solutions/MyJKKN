import { BosTaDaClaim, BosClaimStatus } from '@/types/bos';

export interface CreateTaDaClaimDto {
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  expert_id: string;
  travel_mode?: string;
  travel_from?: string;
  travel_to?: string;
  travel_amount?: number;
  da_days?: number;
  da_rate?: number;
  da_amount?: number;
  other_amount?: number;
  other_description?: string;
  claim_status?: BosClaimStatus;
  bill_number?: string;
  payment_date?: string;
  payment_reference?: string;
  notes?: string;
}

export type UpdateTaDaClaimDto = Partial<CreateTaDaClaimDto>;

export class BosTaDaService {
  static async getClaims(params: {
    meetingId?: string;
    institutionsId?: string;
    claimStatus?: BosClaimStatus;
  }): Promise<BosTaDaClaim[]> {
    const p = new URLSearchParams();
    if (params.meetingId) p.set('meetingId', params.meetingId);
    if (params.institutionsId) p.set('institutionsId', params.institutionsId);
    if (params.claimStatus) p.set('claimStatus', params.claimStatus);

    const res = await fetch(`/api/bos/ta-da?${p.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch claims' }));
      throw new Error(err.error ?? 'Failed to fetch claims');
    }
    return res.json();
  }

  static async createClaim(data: CreateTaDaClaimDto): Promise<BosTaDaClaim> {
    const res = await fetch('/api/bos/ta-da', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create claim' }));
      throw new Error(err.error ?? 'Failed to create claim');
    }
    return res.json();
  }

  static async updateClaim(id: string, data: UpdateTaDaClaimDto): Promise<BosTaDaClaim> {
    const res = await fetch(`/api/bos/ta-da/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update claim' }));
      throw new Error(err.error ?? 'Failed to update claim');
    }
    return res.json();
  }

  static async deleteClaim(id: string): Promise<void> {
    const res = await fetch(`/api/bos/ta-da/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete claim' }));
      throw new Error(err.error ?? 'Failed to delete claim');
    }
  }
}
