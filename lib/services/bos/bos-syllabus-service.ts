import {
  BosCourseSyllabus,
  BosSyllabusFilters,
  BosSyllabusListResponse,
  CreateBosSyllabusDto,
  UpdateBosSyllabusDto,
  BosSyllabusDuplicateRequest,
  BosSyllabusHistory,
  BosRegulationTaxonomy,
} from '@/types/bos';

/**
 * Service for Course Syllabus Management.
 *
 * Uses fetch() to call MyJKKN's proxy API routes (app/api/bos/syllabi/).
 * The proxy routes authenticate the user, then query MyJKKN Supabase database.
 * This keeps business logic on the backend.
 *
 * Features:
 * - Full CRUD for syllabi
 * - Batch duplication across regulations
 * - Course revision workflow (new version = new row)
 * - Version history tracking
 * - Taxonomy management per regulation
 */
export class BosSyllabusService {
  private static baseUrl = '/api/bos/syllabi';

  // ── CRUD Operations ─────────────────────────────────────────────────

  /**
   * Fetch all syllabi for the authenticated user's institution.
   * Supports filtering and pagination.
   */
  static async getSyllabi(
    filters: BosSyllabusFilters = {}
  ): Promise<BosSyllabusListResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const res = await fetch(`${this.baseUrl}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch syllabi' }));
      throw new Error(err.error ?? 'Failed to fetch syllabi');
    }
    return res.json();
  }

  /**
   * Fetch a single syllabus by ID with all content.
   */
  static async getSyllabus(id: string): Promise<BosCourseSyllabus> {
    const res = await fetch(`${this.baseUrl}/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Syllabus not found' }));
      throw new Error(err.error ?? 'Syllabus not found');
    }
    return res.json();
  }

  /**
   * Create a new syllabus (draft version).
   */
  static async createSyllabus(data: CreateBosSyllabusDto): Promise<BosCourseSyllabus> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create syllabus' }));
      throw new Error(err.error ?? 'Failed to create syllabus');
    }
    return res.json();
  }

  /**
   * Update syllabus content.
   * Note: Updates to is_latest, version_number, etc. are restricted.
   */
  static async updateSyllabus(
    id: string,
    data: UpdateBosSyllabusDto
  ): Promise<BosCourseSyllabus> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update syllabus' }));
      throw new Error(err.error ?? 'Failed to update syllabus');
    }
    return res.json();
  }

  /**
   * Delete a syllabus (soft delete: set is_archived=true).
   */
  static async deleteSyllabus(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete syllabus' }));
      throw new Error(err.error ?? 'Failed to delete syllabus');
    }
  }

  // ── Duplication & Revision ──────────────────────────────────────────

  /**
   * Duplicate multiple courses to a new regulation.
   * Example: R-2024 courses (24UGTA01-04) → R-2025 courses (25UGTA01-04)
   *
   * @param request - Contains source/target regulation and course code mapping
   * @returns Array of newly created syllabi
   */
  static async duplicateRegulation(
    request: BosSyllabusDuplicateRequest
  ): Promise<BosCourseSyllabus[]> {
    const res = await fetch(`${this.baseUrl}/duplicate-regulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Duplication failed' }));
      throw new Error(err.error ?? 'Failed to duplicate courses');
    }
    return res.json();
  }

  /**
   * Create a new revision of an existing course within the same regulation.
   * Example: 24UGTA01 (v1) → 24UGTA01 (v2)
   *
   * Sets old version is_latest=false, creates new version with is_latest=true
   * Tracks revised_from_syllabus_id relationship.
   *
   * @param id - Syllabus ID to revise
   * @param updated_content - Updated course content
   * @param notes - Revision notes (e.g., "Updated per board feedback")
   * @returns Newly created revision
   */
  static async reviseSyllabus(
    id: string,
    updated_content: Record<string, unknown>,
    notes?: string
  ): Promise<BosCourseSyllabus> {
    const res = await fetch(`${this.baseUrl}/${id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updated_content,
        notes,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Revision failed' }));
      throw new Error(err.error ?? 'Failed to revise syllabus');
    }
    return res.json();
  }

  /**
   * Get full version history of a course.
   * Returns: current version, previous version, and all versions.
   */
  static async getSyllabusHistory(courseCode: string): Promise<BosSyllabusHistory> {
    const res = await fetch(`${this.baseUrl}/history/${courseCode}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'History not found' }));
      throw new Error(err.error ?? 'Failed to fetch syllabus history');
    }
    return res.json();
  }

  // ── Comparison & Reporting ──────────────────────────────────────────

  /**
   * Compare two versions of a syllabus.
   * Returns: diff summary and changed fields.
   */
  static async compareSyllabi(
    syllabus_id_1: string,
    syllabus_id_2: string
  ): Promise<{
    changed_fields: string[];
    diff_summary: string;
  }> {
    const res = await fetch(`${this.baseUrl}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syllabus_id_1,
        syllabus_id_2,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Comparison failed' }));
      throw new Error(err.error ?? 'Failed to compare syllabi');
    }
    return res.json();
  }

  /**
   * Export syllabus to PDF.
   * Formats: 'official' (full), 'meeting_summary' (changes), 'obe' (for lesson plans)
   */
  static async exportToPdf(
    id: string,
    format: 'official' | 'meeting_summary' | 'obe',
    options?: {
      include_mappings?: boolean;
      include_references?: boolean;
      include_pedagogy?: boolean;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams({
      format,
      ...Object.fromEntries(
        Object.entries(options || {}).map(([k, v]) => [k, String(v)])
      ),
    });

    const res = await fetch(`${this.baseUrl}/${id}/export-pdf?${params.toString()}`);
    if (!res.ok) {
      throw new Error('Failed to export PDF');
    }
    return res.blob();
  }

  // ── Taxonomy Management ────────────────────────────────────────────

  /**
   * Fetch taxonomy for a regulation.
   */
  static async getTaxonomy(regulationId: string): Promise<BosRegulationTaxonomy> {
    const res = await fetch(`/api/bos/taxonomy/${regulationId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Taxonomy not found' }));
      throw new Error(err.error ?? 'Failed to fetch taxonomy');
    }
    return res.json();
  }

  /**
   * Create or update taxonomy for a regulation.
   */
  static async saveTaxonomy(regulationId: string, taxonomy: Omit<BosRegulationTaxonomy, 'id' | 'created_at'>): Promise<BosRegulationTaxonomy> {
    const res = await fetch(`/api/bos/taxonomy/${regulationId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taxonomy),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save taxonomy' }));
      throw new Error(err.error ?? 'Failed to save taxonomy');
    }
    return res.json();
  }
}
