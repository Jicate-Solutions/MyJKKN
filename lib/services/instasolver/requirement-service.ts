// lib/services/instasolver/requirement-service.ts
//
// InstaSolver requirements — procurement requests. One approval, by the CAO
// (spec §2: no second level, no cost tier). The database enforces who may move
// a requirement and that a rejection carries a reason.

import type {
  CreateRequirementDto,
  ListResponse,
  Requirement,
  RequirementFilters,
  RequirementStatus,
  UpdateRequirementDto
} from '@/types/instasolver';
import { PAGE_SIZE } from '@/lib/instasolver/constants';
import { currentUserId, db, pageMetadata, pageRange, PERSON_COLUMNS, sanitiseSearch, unwrap } from './shared';

export const REQUIREMENT_SELECT = `
  *,
  requester:profiles!instasolver_requirements_requested_by_fkey(${PERSON_COLUMNS}),
  reviewer:profiles!instasolver_requirements_reviewed_by_fkey(${PERSON_COLUMNS}),
  institution:institutions(id, name),
  category:instasolver_categories(id, name)
`;

export class InstaSolverRequirementService {
  static async list(filters: RequirementFilters = {}): Promise<ListResponse<Requirement>> {
    const client = db();
    const { from, to, page, limit } = pageRange(filters.page, filters.limit ?? PAGE_SIZE);
    let query = client.from('instasolver_requirements').select(REQUIREMENT_SELECT, { count: 'exact' });

    if (filters.status?.length) query = query.in('status', filters.status);
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.category_id) query = query.eq('category_id', filters.category_id);
    if (filters.mine) query = query.eq('requested_by', await currentUserId(client));
    const term = sanitiseSearch(filters.search);
    if (term) query = query.or(`item_requested.ilike.%${term}%,reference_no.ilike.%${term}%`);

    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
    unwrap({ data, error });
    return { data: (data ?? []) as Requirement[], metadata: pageMetadata(count, page, limit) };
  }

  static async getById(id: number): Promise<Requirement | null> {
    const { data, error } = await db()
      .from('instasolver_requirements')
      .select(REQUIREMENT_SELECT)
      .eq('id', id)
      .maybeSingle();
    unwrap({ data, error });
    return (data as Requirement) ?? null;
  }

  static async create(dto: CreateRequirementDto): Promise<Pick<Requirement, 'id' | 'reference_no'>> {
    const client = db();
    const uid = await currentUserId(client);
    return unwrap(
      await client
        .from('instasolver_requirements')
        .insert({
          ...dto,
          item_requested: dto.item_requested.trim(),
          image_urls: dto.image_urls ?? [],
          requested_by: uid
        })
        .select('id, reference_no')
        .single()
    ) as Pick<Requirement, 'id' | 'reference_no'>;
  }

  /** The requester's own edit, while it still awaits review. */
  static async update(id: number, dto: UpdateRequirementDto): Promise<void> {
    const rows = unwrap<{ id: number }[] | null>(
      await db().from('instasolver_requirements').update(dto).eq('id', id).eq('status', 'pending').select('id')
    );
    if (!rows?.length) throw new Error('This requirement is no longer awaiting review, so it can no longer be edited.');
  }

  static async withdraw(id: number): Promise<void> {
    await this.move(id, 'pending', { status: 'withdrawn' });
  }

  static async approve(id: number, notes?: string): Promise<void> {
    await this.move(id, 'pending', { status: 'approved', review_notes: notes?.trim() || null });
  }

  static async reject(id: number, reason: string): Promise<void> {
    await this.move(id, 'pending', { status: 'rejected', review_notes: reason.trim() });
  }

  static async fulfil(id: number): Promise<void> {
    await this.move(id, 'approved', { status: 'fulfilled' });
  }

  private static async move(id: number, from: RequirementStatus, patch: Record<string, unknown>): Promise<void> {
    const rows = unwrap<{ id: number }[] | null>(
      await db().from('instasolver_requirements').update(patch).eq('id', id).eq('status', from).select('id')
    );
    if (!rows?.length) {
      throw new Error('This requirement changed while you were looking at it. Refresh and try again.');
    }
  }
}
