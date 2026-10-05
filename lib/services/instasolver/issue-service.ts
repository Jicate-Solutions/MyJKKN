// lib/services/instasolver/issue-service.ts
//
// InstaSolver issues — facility faults. Every write here is checked again by
// instasolver_issues_guard in the database; status moves carry an
// `.eq('status', from)` guard so two people acting on one row cannot both win.

import type {
  CreateIssueDto,
  Issue,
  IssueFilters,
  IssueStatus,
  ListResponse,
  NextStepGroup,
  NextSteps,
  TriageFilters,
  TriageIssueDto,
  TriagedIssue,
  UpdateIssueDto,
  WorkTab
} from '@/types/instasolver';
import { OPEN_ISSUE_STATUSES, PAGE_SIZE } from '@/lib/instasolver/constants';
import {
  currentUserId,
  db,
  pageMetadata,
  pageRange,
  PERSON_COLUMNS,
  sanitiseSearch,
  unwrap,
  type Db
} from './shared';

export const ISSUE_SELECT = `
  *,
  reporter:profiles!instasolver_issues_reported_by_fkey(${PERSON_COLUMNS}),
  assignee:profiles!instasolver_issues_assigned_to_fkey(${PERSON_COLUMNS}),
  assigner:profiles!instasolver_issues_assigned_by_fkey(${PERSON_COLUMNS}),
  team:instasolver_maintenance_teams(id, name),
  institution:institutions(id, name),
  category:instasolver_categories(id, name)
`;

 
function applyIssueFilters(query: any, filters: IssueFilters, uid: string, teamIds: number[]) {
  let q = query;
  if (filters.status?.length) q = q.in('status', filters.status);
  if (filters.severity?.length) q = q.in('severity', filters.severity);
  if (filters.priority?.length) q = q.in('priority', filters.priority);
  if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
  if (filters.category_id) q = q.eq('category_id', filters.category_id);
  if (filters.unassigned) q = q.is('assigned_to', null).is('assigned_team_id', null);
  if (filters.disputed) q = q.not('resolution_disputed_at', 'is', null).eq('status', 'completed');

  switch (filters.scope) {
    case 'mine':
      q = q.eq('reported_by', uid);
      break;
    case 'assigned_to_me':
      q = q.eq('assigned_to', uid);
      break;
    case 'my_teams':
      q = teamIds.length ? q.in('assigned_team_id', teamIds) : q.eq('id', -1);
      break;
  }

  const term = sanitiseSearch(filters.search);
  if (term) {
    q = q.or(`title.ilike.%${term}%,reference_no.ilike.%${term}%,location.ilike.%${term}%`);
  }
  return q;
}

async function myTeamIds(client: Db): Promise<number[]> {
  const rows = unwrap<number[] | null>(await client.rpc('instasolver_my_team_ids'));
  return (rows ?? []).map((r) => Number(r));
}

export class InstaSolverIssueService {
  /** RLS-scoped list: a reporter sees their own, a CAO sees everything. */
  static async list(filters: IssueFilters = {}): Promise<ListResponse<Issue>> {
    const client = db();
    const uid = await currentUserId(client);
    const teamIds = filters.scope === 'my_teams' ? await myTeamIds(client) : [];
    const { from, to, page, limit } = pageRange(filters.page, filters.limit ?? PAGE_SIZE);

    let query = client.from('instasolver_issues').select(ISSUE_SELECT, { count: 'exact' });
    query = applyIssueFilters(query, filters, uid, teamIds);
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
    unwrap({ data, error });
    return { data: (data ?? []) as Issue[], metadata: pageMetadata(count, page, limit) };
  }

  static async getById(id: number): Promise<Issue | null> {
    const client = db();
    const { data, error } = await client.from('instasolver_issues').select(ISSUE_SELECT).eq('id', id).maybeSingle();
    unwrap({ data, error });
    return (data as Issue) ?? null;
  }

  static async create(dto: CreateIssueDto): Promise<Pick<Issue, 'id' | 'reference_no'>> {
    const client = db();
    const uid = await currentUserId(client);
    const row = {
      ...dto,
      title: dto.title.trim(),
      details: dto.details.trim(),
      location: dto.location.trim(),
      image_urls: dto.image_urls ?? [],
      reported_by: uid
    };
    return unwrap(
      await client.from('instasolver_issues').insert(row).select('id, reference_no').single()
    ) as Pick<Issue, 'id' | 'reference_no'>;
  }

  /** The reporter's own edit, while the issue is still awaiting triage. */
  static async update(id: number, dto: UpdateIssueDto): Promise<void> {
    const rows = unwrap<{ id: number }[] | null>(
      await db().from('instasolver_issues').update(dto).eq('id', id).eq('status', 'pending').select('id')
    );
    if (!rows?.length) throw new Error('This issue has already been triaged, so it can no longer be edited.');
  }

  static async withdraw(id: number): Promise<void> {
    await this.move(id, 'pending', { status: 'withdrawn' });
  }

  // ---------------------------------------------------------------------------
  // Triage (CAO / Super Admin)
  // ---------------------------------------------------------------------------
  static async triageQueue(filters: TriageFilters = {}): Promise<ListResponse<TriagedIssue>> {
    const client = db();
    const { from, to, page, limit } = pageRange(filters.page, filters.limit ?? PAGE_SIZE);
    let query = client.from('instasolver_issue_triage_queue').select('*', { count: 'exact' });

    const disputed = 'and(status.eq.completed,resolution_disputed_at.not.is.null)';
    if (filters.view === 'decide' || !filters.view) {
      query = query.or(`status.eq.pending,${disputed}`);
    } else if (filters.view === 'open') {
      query = query.or(`status.in.(${OPEN_ISSUE_STATUSES.join(',')}),${disputed}`);
    }
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);

    const { data, error, count } = await query
      .order('triage_score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to);
    unwrap({ data, error });
    const rows = (data ?? []) as TriagedIssue[];
    await this.attachRefs(client, rows);
    return { data: rows, metadata: pageMetadata(count, page, limit) };
  }

  /** Assign (and prioritise) a pending issue — one statement, one audit event. */
  static async triage(id: number, dto: TriageIssueDto): Promise<void> {
    await this.move(id, 'pending', {
      status: 'assigned',
      priority: dto.priority,
      assigned_to: dto.assigned_to ?? null,
      assigned_team_id: dto.assigned_team_id ?? null
    });
  }

  static async bulkTriage(ids: number[], dto: TriageIssueDto): Promise<{ ok: number; failed: string[] }> {
    const results = await Promise.allSettled(ids.map((id) => this.triage(id, dto)));
    const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`#${ids[i]}: ${(r.reason as Error).message}`] : []));
    return { ok: results.length - failed.length, failed };
  }

  static async setPriority(id: number, priority: Issue['priority']): Promise<void> {
    unwrap(await db().from('instasolver_issues').update({ priority }).eq('id', id));
  }

  /** Move already-assigned work to another person or team. */
  static async reassign(id: number, target: { assigned_to: string | null; assigned_team_id: number | null }): Promise<void> {
    unwrap(await db().from('instasolver_issues').update(target).eq('id', id));
  }

  /** Reject with a reason the reporter can read (a visible note). */
  static async reject(id: number, from: IssueStatus, reason: string): Promise<void> {
    await this.move(id, from, { status: 'rejected' });
    await InstaSolverIssueService.addNote(id, `Rejected: ${reason.trim()}`, false);
  }

  static async reopen(id: number, reason?: string): Promise<void> {
    await this.move(id, 'completed', { status: 'in_progress' });
    if (reason?.trim()) await InstaSolverIssueService.addNote(id, `Reopened: ${reason.trim()}`, true);
  }

  // ---------------------------------------------------------------------------
  // Maintenance work
  // ---------------------------------------------------------------------------
  /** Starting unclaimed team work claims it in the same statement. */
  static async start(issue: Pick<Issue, 'id' | 'assigned_to'>): Promise<void> {
    const client = db();
    const uid = await currentUserId(client);
    const patch: Record<string, unknown> = { status: 'in_progress' };
    if (!issue.assigned_to) patch.assigned_to = uid;
    await this.move(issue.id, 'assigned', patch, client);
  }

  /** Claim team work (or take over a teammate's — the UI asks first, by name). */
  static async claim(id: number): Promise<void> {
    const client = db();
    const uid = await currentUserId(client);
    unwrap(await client.from('instasolver_issues').update({ assigned_to: uid }).eq('id', id));
  }

  static async complete(id: number, notes: string, photoUrls: string[] = []): Promise<void> {
    await this.move(id, 'in_progress', {
      status: 'completed',
      resolution_notes: notes.trim(),
      resolution_image_urls: photoUrls
    });
  }

  static async workQueue(tab: WorkTab, page = 1): Promise<ListResponse<Issue>> {
    const client = db();
    const uid = await currentUserId(client);
    const { from, to, limit } = pageRange(page, PAGE_SIZE);
    let query = client.from('instasolver_issues').select(ISSUE_SELECT, { count: 'exact' });
    query = await this.applyWorkTab(client, query, tab, uid);
    const ordered =
      tab === 'completed'
        ? query.order('completed_at', { ascending: false })
        : query.order('priority', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
    const { data, error, count } = await ordered.range(from, to);
    unwrap({ data, error });
    return { data: (data ?? []) as Issue[], metadata: pageMetadata(count, page, limit) };
  }

  static async workTabCounts(): Promise<Record<WorkTab, number>> {
    const client = db();
    const uid = await currentUserId(client);
    const tabs: WorkTab[] = ['assigned', 'in_progress', 'to_claim', 'completed'];
    const counts = await Promise.all(
      tabs.map(async (tab) => {
        const q = await this.applyWorkTab(
          client,
          client.from('instasolver_issues').select('id', { count: 'exact', head: true }),
          tab,
          uid
        );
        const { count, error } = await q;
        unwrap({ data: null, error });
        return count ?? 0;
      })
    );
    return Object.fromEntries(tabs.map((t, i) => [t, counts[i]])) as Record<WorkTab, number>;
  }

   
  private static async applyWorkTab(client: Db, query: any, tab: WorkTab, uid: string) {
    switch (tab) {
      case 'assigned':
        return query.eq('assigned_to', uid).eq('status', 'assigned');
      case 'in_progress':
        return query.eq('assigned_to', uid).eq('status', 'in_progress');
      case 'completed':
        return query.eq('assigned_to', uid).eq('status', 'completed');
      case 'to_claim': {
        const teamIds = await myTeamIds(client);
        if (!teamIds.length) return query.eq('id', -1);
        return query.is('assigned_to', null).in('assigned_team_id', teamIds).in('status', ['assigned', 'in_progress']);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dashboard — "Your next step" (ported from the standalone IssueService.nextSteps)
  // Each group is a count plus its first item, so the dashboard can open THAT
  // item when it is the only one. All RLS-scoped.
  // ---------------------------------------------------------------------------
  static async nextSteps(want: { manager: boolean; maintenance: boolean; reporter: boolean }): Promise<NextSteps> {
    const client = db();
    const uid = await currentUserId(client);
    const teamIds = want.maintenance ? await myTeamIds(client) : [];
    const cols = 'id, title, assigned_to';

     
    const group = async (build: (q: any) => any): Promise<NextStepGroup> => {
      const { data, error, count } = await build(
        client.from('instasolver_issues').select(cols, { count: 'exact' })
      ).limit(1);
      unwrap({ data, error });
      return { count: count ?? 0, first: (data?.[0] as NextStepGroup['first']) ?? null };
    };
    const empty: NextStepGroup = { count: 0, first: null };

    const [toConfirm, disputed, needsPriority, toStart, inProgress] = await Promise.all([
      want.reporter
        ? group((q) =>
            q.eq('reported_by', uid).eq('status', 'completed')
              .is('resolution_confirmed_at', null).is('resolution_disputed_at', null)
              .order('completed_at', { ascending: true }))
        : empty,
      want.manager
        ? group((q) =>
            q.eq('status', 'completed').not('resolution_disputed_at', 'is', null)
              .order('resolution_disputed_at', { ascending: true }))
        : empty,
      want.manager
        ? group((q) => q.eq('status', 'pending').order('created_at', { ascending: true }))
        : empty,
      want.maintenance
        ? group((q) => {
            const mine = teamIds.length
              ? `assigned_to.eq.${uid},and(assigned_to.is.null,assigned_team_id.in.(${teamIds.join(',')}))`
              : `assigned_to.eq.${uid}`;
            // Urgent first: priority is an enum declared urgent → low.
            return q.eq('status', 'assigned').or(mine)
              .order('priority', { ascending: true, nullsFirst: false })
              .order('created_at', { ascending: true });
          })
        : empty,
      want.maintenance
        ? group((q) =>
            q.eq('status', 'in_progress').eq('assigned_to', uid).order('created_at', { ascending: true }))
        : empty
    ]);
    return { toConfirm, disputed, needsPriority, toStart, inProgress };
  }

  /** "Your work by status": issues with your name or your team on them. */
  static async workStatusCounts(): Promise<Record<'assigned' | 'in_progress' | 'completed', number>> {
    const client = db();
    const uid = await currentUserId(client);
    const teamIds = await myTeamIds(client);
    const mine = teamIds.length
      ? `assigned_to.eq.${uid},assigned_team_id.in.(${teamIds.join(',')})`
      : `assigned_to.eq.${uid}`;
    const statuses = ['assigned', 'in_progress', 'completed'] as const;
    const counts = await Promise.all(
      statuses.map(async (s) => {
        const { count, error } = await client
          .from('instasolver_issues')
          .select('id', { count: 'exact', head: true })
          .eq('status', s)
          .or(mine);
        unwrap({ data: null, error });
        return count ?? 0;
      })
    );
    return { assigned: counts[0], in_progress: counts[1], completed: counts[2] };
  }

  // ---------------------------------------------------------------------------
  // Reporter feedback — a judgement, not a transition. Status does not change.
  // ---------------------------------------------------------------------------
  static async confirmFix(id: number): Promise<void> {
    unwrap(
      await db()
        .from('instasolver_issues')
        .update({ resolution_confirmed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'completed')
    );
  }

  static async disputeFix(id: number, reason: string): Promise<void> {
    unwrap(
      await db()
        .from('instasolver_issues')
        .update({ resolution_disputed_at: new Date().toISOString(), resolution_dispute_reason: reason.trim() })
        .eq('id', id)
        .eq('status', 'completed')
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private static async addNote(id: number, note: string, isInternal: boolean): Promise<void> {
    const client = db();
    const uid = await currentUserId(client);
    unwrap(
      await client
        .from('instasolver_admin_notes')
        .insert({ entity_type: 'issue', entity_id: id, author_id: uid, note, is_internal: isInternal })
    );
  }

  /**
   * A status move guarded on the status the caller saw. Zero rows back means
   * somebody else moved it first (or RLS hid it) — said out loud, not ignored.
   */
  private static async move(
    id: number,
    from: IssueStatus,
    patch: Record<string, unknown>,
    client: Db = db()
  ): Promise<void> {
    const rows = unwrap<{ id: number }[] | null>(
      await client.from('instasolver_issues').update(patch).eq('id', id).eq('status', from).select('id')
    );
    if (!rows?.length) {
      throw new Error('This issue changed while you were looking at it. Refresh and try again.');
    }
  }

  /** Resolve names for view rows (the triage view carries ids only). */
  private static async attachRefs(client: Db, rows: TriagedIssue[]): Promise<void> {
    if (!rows.length) return;
    const uniq = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
    const people = uniq(rows.flatMap((r) => [r.reported_by, r.assigned_to]));
    const insts = uniq(rows.map((r) => r.institution_id));
    const cats = uniq(rows.map((r) => r.category_id));
    const teams = uniq(rows.map((r) => r.assigned_team_id));

    const [p, i, c, t] = await Promise.all([
      people.length ? client.from('profiles').select('id, full_name, avatar_url').in('id', people) : { data: [] },
      insts.length ? client.from('institutions').select('id, name').in('id', insts) : { data: [] },
      cats.length ? client.from('instasolver_categories').select('id, name').in('id', cats) : { data: [] },
      teams.length ? client.from('instasolver_maintenance_teams').select('id, name').in('id', teams) : { data: [] }
    ]);
     
    const byId = (list: any[] | null) => new Map((list ?? []).map((x) => [x.id, x]));
    const pm = byId(p.data), im = byId(i.data), cm = byId(c.data), tm = byId(t.data);
    for (const r of rows) {
      r.reporter = pm.get(r.reported_by) ?? null;
      r.assignee = r.assigned_to ? pm.get(r.assigned_to) ?? null : null;
      r.institution = im.get(r.institution_id) ?? null;
      r.category = cm.get(r.category_id) ?? null;
      r.team = r.assigned_team_id ? tm.get(r.assigned_team_id) ?? null : null;
    }
  }
}
