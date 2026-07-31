import {
  BosMember,
  BosMemberRefreshResult,
  CreateBosMemberDto,
  UpdateBosMemberDto,
} from '@/types/bos';

export class BosMemberService {
  private static baseUrl = '/api/bos/members';

  static async getMembers(compositionId: string): Promise<BosMember[]> {
    const res = await fetch(`${this.baseUrl}?compositionId=${compositionId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch members' }));
      throw new Error(err.error ?? 'Failed to fetch members');
    }
    return res.json();
  }

  static async addMember(data: CreateBosMemberDto): Promise<BosMember> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add member' }));
      throw new Error(err.error ?? 'Failed to add member');
    }
    return res.json();
  }

  static async updateMember(id: string, data: UpdateBosMemberDto): Promise<BosMember> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update member' }));
      throw new Error(err.error ?? 'Failed to update member');
    }
    return res.json();
  }

  /**
   * Re-pull the denormalized display_* / email / contact_no snapshot from the
   * source row (staff for internal members, bos_external_experts for external).
   *
   * Manual by design — the snapshot preserves how a member was titled at the
   * time of past meetings, so it must only move when an operator says so.
   * Omit `memberIds` to refresh the whole composition; pass a committee's
   * member ids for the committee-wise button.
   */
  static async refreshMembers(
    compositionId: string,
    memberIds?: string[],
  ): Promise<BosMemberRefreshResult> {
    const res = await fetch(`${this.baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        composition_id: compositionId,
        ...(memberIds && memberIds.length > 0 ? { member_ids: memberIds } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to refresh member details' }));
      throw new Error(err.error ?? 'Failed to refresh member details');
    }
    return res.json();
  }

  /**
   * Persist the roster's display order into bos_members.sort_order.
   *
   * `orderedIds` must be the FULL roster of the composition in render order
   * (committee → member-type group → member) — the API writes 1..n across the
   * whole composition so flat consumers (notices, minutes, attendance sheets)
   * print members in the same order the roster shows them.
   */
  static async reorderMembers(
    compositionId: string,
    orderedIds: string[],
  ): Promise<{ updated: number; total: number }> {
    const res = await fetch(`${this.baseUrl}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition_id: compositionId, ordered_ids: orderedIds }),
    });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to save member order' }));
      throw new Error(err.error ?? 'Failed to save member order');
    }
    return res.json();
  }

  static async removeMember(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to remove member' }));
      throw new Error(err.error ?? 'Failed to remove member');
    }
  }
}
