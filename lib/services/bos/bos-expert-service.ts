import {
  BosExternalExpert,
  BosExpertFilters,
  BosListResponse,
  CreateBosExpertDto,
  UpdateBosExpertDto,
} from '@/types/bos';

/**
 * Service for External Expert Directory.
 *
 * Uses fetch() to call MyJKKN's own proxy API routes (app/api/bos/experts/).
 * The proxy routes authenticate the user, then query the COE Supabase database.
 * This keeps the COE service-role key server-side only.
 */
export class BosExpertService {
  private static baseUrl = '/api/bos/experts';

  static async getExperts(
    filters: BosExpertFilters = {}
  ): Promise<BosListResponse<BosExternalExpert>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const res = await fetch(`${this.baseUrl}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch experts' }));
      throw new Error(err.error ?? 'Failed to fetch experts');
    }
    return res.json();
  }

  static async getExpert(id: string): Promise<BosExternalExpert> {
    const res = await fetch(`${this.baseUrl}/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Expert not found' }));
      throw new Error(err.error ?? 'Expert not found');
    }
    return res.json();
  }

  static async createExpert(data: CreateBosExpertDto): Promise<BosExternalExpert> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create expert' }));
      throw new Error(err.error ?? 'Failed to create expert');
    }
    return res.json();
  }

  static async updateExpert(id: string, data: UpdateBosExpertDto): Promise<BosExternalExpert> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update expert' }));
      throw new Error(err.error ?? 'Failed to update expert');
    }
    return res.json();
  }

  static async deleteExpert(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete expert' }));
      throw new Error(err.error ?? 'Failed to delete expert');
    }
  }
}
