import {
  BosBoard,
  BosBoardFilters,
} from '@/types/bos';

/**
 * Service for Board reference data.
 *
 * Uses fetch() to call MyJKKN's proxy API route (app/api/bos/boards/).
 * The proxy route authenticates the user, then calls COE's REST API endpoints.
 * This keeps the COE API credentials server-side only.
 *
 * Note: Boards are reference data (stable, small set). API returns simple array (no pagination).
 */
export class BosBoardService {
  private static baseUrl = '/api/bos/boards';

  static async getBoards(
    filters?: BosBoardFilters
  ): Promise<BosBoard[]> {
    const params = new URLSearchParams();
    if (filters?.institutionsId) {
      params.set('institutionsId', filters.institutionsId);
    }

    const url = params.toString()
      ? `${this.baseUrl}?${params.toString()}`
      : this.baseUrl;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch boards' }));
      throw new Error(err.error ?? 'Failed to fetch boards');
    }
    // Route returns { data: BosBoard[], count } — unwrap so callers see a plain array
    // matching the declared return type. Tolerate older shapes for safety.
    const json = await res.json();
    if (Array.isArray(json)) return json as BosBoard[];
    return (json?.data ?? []) as BosBoard[];
  }

  static async getBoard(id: string): Promise<BosBoard> {
    // Fetch all boards and find by id (simple approach for small reference data)
    const boards = await this.getBoards();
    const board = boards.find(b => b.id === id);
    if (!board) {
      throw new Error('Board not found');
    }
    return board;
  }
}
