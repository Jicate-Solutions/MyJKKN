import { BosMember, CreateBosMemberDto, UpdateBosMemberDto } from '@/types/bos';

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

  static async removeMember(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to remove member' }));
      throw new Error(err.error ?? 'Failed to remove member');
    }
  }
}
