import { BosTaDaClaim, BosClaimStatus } from '@/types/bos';

/**
 * Updatable fields on a TA/DA claim.
 *
 * Note (2026-05-21 SOP redesign): claim CREATE and DELETE are no longer
 * user-facing — claims are auto-generated from attendance and auto-cleaned
 * on attendance reversal. The service intentionally exposes only GET and
 * UPDATE so admins can still adjust bank/NEFT details, mark as paid, etc.
 * Amount fields (honorarium_*, travel_amount) are deliberately included for
 * back-compat with admin overrides; the natural workflow leaves them alone.
 */
export interface UpdateTaDaClaimDto {
  travel_mode?: string;
  travel_from?: string;
  travel_to?: string;
  travel_amount?: number;
  honorarium_units?: number;
  honorarium_rate?: number;
  honorarium_amount?: number;
  other_amount?: number;
  other_description?: string;
  claim_status?: BosClaimStatus;
  bill_number?: string;
  payment_date?: string;
  payment_reference?: string;
  notes?: string;
}

export class BosTaDaService {
  static async getClaims(params: {
    meetingId?: string;
    /**
     * Legacy single UUID. Server expands via institution_code if no
     * `institutionsIds` (plural CSV) is provided. Prefer `institutionsIds`
     * for new callers — it carries the full CAS sibling pair.
     */
    institutionsId?: string;
    /**
     * Full CAS-sibling UUID set resolved client-side via
     * `useBosInstitutionScope`. Sent as a CSV — matches the convention used
     * by /api/bos/lookup/facilitators and /bos/compositions.
     */
    institutionsIds?: string[];
    boardId?: string;
    claimStatus?: BosClaimStatus;
  }): Promise<BosTaDaClaim[]> {
    const p = new URLSearchParams();
    if (params.meetingId) p.set('meetingId', params.meetingId);
    if (params.institutionsIds && params.institutionsIds.length > 0) {
      p.set('institutionsIds', params.institutionsIds.join(','));
    } else if (params.institutionsId) {
      p.set('institutionsId', params.institutionsId);
    }
    if (params.boardId) p.set('boardId', params.boardId);
    if (params.claimStatus) p.set('claimStatus', params.claimStatus);

    const res = await fetch(`/api/bos/ta-da?${p.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch claims' }));
      throw new Error(err.error ?? 'Failed to fetch claims');
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
}
