// lib/services/bos/bos-taxonomy-master-service.ts
// Client-side service for the master taxonomy registry (Bloom's, Fink's, custom).
// Calls the proxy API routes under /api/bos/taxonomies; never touches Supabase
// directly so RLS + permission checks stay server-side.

import {
  BosListResponse,
  BosTaxonomy,
  BosTaxonomyFilters,
  BosTaxonomySummary,
  BosTaxonomyWithLevels,
  CreateBosTaxonomyDto,
  UpdateBosTaxonomyDto,
} from '@/types/bos';

export class BosTaxonomyMasterService {
  private static baseUrl = '/api/bos/taxonomies';

  static async list(
    filters: BosTaxonomyFilters = {}
  ): Promise<BosListResponse<BosTaxonomySummary>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const res = await fetch(`${this.baseUrl}?${params.toString()}`);
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to fetch taxonomies' }));
      throw new Error(err.error ?? 'Failed to fetch taxonomies');
    }
    return res.json();
  }

  static async get(id: string): Promise<BosTaxonomyWithLevels> {
    const res = await fetch(`${this.baseUrl}/${id}`);
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Taxonomy not found' }));
      throw new Error(err.error ?? 'Taxonomy not found');
    }
    return res.json();
  }

  static async create(data: CreateBosTaxonomyDto): Promise<BosTaxonomyWithLevels> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to create taxonomy' }));
      throw new Error(err.error ?? 'Failed to create taxonomy');
    }
    return res.json();
  }

  static async update(
    id: string,
    data: UpdateBosTaxonomyDto
  ): Promise<BosTaxonomyWithLevels> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to update taxonomy' }));
      throw new Error(err.error ?? 'Failed to update taxonomy');
    }
    return res.json();
  }

  static async remove(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res
        .json()
        .catch(() => ({ error: 'Failed to delete taxonomy' }));
      throw new Error(err.error ?? 'Failed to delete taxonomy');
    }
  }
}

// Re-export for convenience
export type {
  BosTaxonomy,
  BosTaxonomySummary,
  BosTaxonomyWithLevels,
  BosTaxonomyFilters,
  CreateBosTaxonomyDto,
  UpdateBosTaxonomyDto,
};
