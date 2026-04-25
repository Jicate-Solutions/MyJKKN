import {
  BosComposition,
  BosCompositionFilters,
  BosListResponse,
  CreateBosCompositionDto,
  UpdateBosCompositionDto,
} from '@/types/bos';

export class BosCompositionService {
  private static baseUrl = '/api/bos/compositions';

  static async getCompositions(
    filters: BosCompositionFilters = {}
  ): Promise<BosListResponse<BosComposition>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const res = await fetch(`${this.baseUrl}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch compositions' }));
      throw new Error(err.error ?? 'Failed to fetch compositions');
    }
    return res.json();
  }

  static async getComposition(id: string): Promise<BosComposition> {
    const res = await fetch(`${this.baseUrl}/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Composition not found' }));
      throw new Error(err.error ?? 'Composition not found');
    }
    return res.json();
  }

  static async createComposition(data: CreateBosCompositionDto): Promise<BosComposition> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create composition' }));
      throw new Error(err.error ?? 'Failed to create composition');
    }
    return res.json();
  }

  static async updateComposition(
    id: string,
    data: UpdateBosCompositionDto
  ): Promise<BosComposition> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update composition' }));
      throw new Error(err.error ?? 'Failed to update composition');
    }
    return res.json();
  }

  static async deleteComposition(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete composition' }));
      throw new Error(err.error ?? 'Failed to delete composition');
    }
  }
}
