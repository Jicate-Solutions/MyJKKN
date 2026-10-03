// lib/services/instasolver/reference-service.ts
//
// Reference data for InstaSolver: categories and maintenance teams (module-
// owned), plus MyJKKN's own institutions and people. Categories and teams are
// deactivated, never deleted; team membership is the one link row that is.

import type {
  Category,
  CategoryKind,
  InstitutionRef,
  MaintenanceTeam,
  PersonRef,
  SaveCategoryDto,
  SaveTeamDto,
  TeamWithMembers
} from '@/types/instasolver';
import { db, PERSON_COLUMNS, sanitiseSearch, unwrap } from './shared';

export class InstaSolverReferenceService {
  static async institutions(): Promise<InstitutionRef[]> {
    return (unwrap(
      await db().from('institutions').select('id, name').eq('is_active', true).order('name')
    ) ?? []) as InstitutionRef[];
  }

  static async categories(kind: CategoryKind, activeOnly = true): Promise<Category[]> {
    let q = db().from('instasolver_categories').select('*').eq('kind', kind);
    if (activeOnly) q = q.eq('is_active', true);
    return (unwrap(await q.order('sort_order').order('name')) ?? []) as Category[];
  }

  static async saveCategory(dto: SaveCategoryDto, id?: number): Promise<void> {
    const row = { ...dto, name: dto.name.trim() };
    unwrap(
      id
        ? await db().from('instasolver_categories').update(row).eq('id', id)
        : await db().from('instasolver_categories').insert(row)
    );
  }

  // ---------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------
  static async teams(activeOnly = true): Promise<MaintenanceTeam[]> {
    let q = db()
      .from('instasolver_maintenance_teams')
      .select('*, institution:institutions(id, name), category:instasolver_categories(id, name)');
    if (activeOnly) q = q.eq('is_active', true);
    return (unwrap(await q.order('name')) ?? []) as MaintenanceTeam[];
  }

  static async teamsWithMembers(activeOnly = false): Promise<TeamWithMembers[]> {
    let q = db()
      .from('instasolver_maintenance_teams')
      .select(
        `*, institution:institutions(id, name), category:instasolver_categories(id, name),
         members:instasolver_team_members(team_id, user_id, is_team_lead, created_at,
           person:profiles!instasolver_team_members_user_id_fkey(${PERSON_COLUMNS}, email))`
      );
    if (activeOnly) q = q.eq('is_active', true);
    return (unwrap(await q.order('name')) ?? []) as TeamWithMembers[];
  }

  static async saveTeam(dto: SaveTeamDto, id?: number): Promise<void> {
    const row = {
      ...dto,
      name: dto.name.trim(),
      institution_id: dto.institution_id || null,
      category_id: dto.category_id || null,
      email: dto.email?.trim() || null
    };
    unwrap(
      id
        ? await db().from('instasolver_maintenance_teams').update(row).eq('id', id)
        : await db().from('instasolver_maintenance_teams').insert(row)
    );
  }

  static async addMember(teamId: number, userId: string, isLead = false): Promise<void> {
    unwrap(
      await db()
        .from('instasolver_team_members')
        .upsert({ team_id: teamId, user_id: userId, is_team_lead: isLead }, { onConflict: 'team_id,user_id' })
    );
  }

  static async setLead(teamId: number, userId: string, isLead: boolean): Promise<void> {
    unwrap(
      await db()
        .from('instasolver_team_members')
        .update({ is_team_lead: isLead })
        .eq('team_id', teamId)
        .eq('user_id', userId)
    );
  }

  static async removeMember(teamId: number, userId: string): Promise<void> {
    unwrap(await db().from('instasolver_team_members').delete().eq('team_id', teamId).eq('user_id', userId));
  }

  // ---------------------------------------------------------------------------
  // People — MyJKKN profiles. Used by the assignee picker and team editor.
  // ---------------------------------------------------------------------------
  static async searchPeople(term: string, limit = 20): Promise<PersonRef[]> {
    const t = sanitiseSearch(term);
    if (t.length < 2) return [];
    return (unwrap(
      await db()
        .from('profiles')
        .select(`${PERSON_COLUMNS}, email`)
        .eq('is_active', true)
        .not('role', 'in', '(student,parent,guest)')
        .or(`full_name.ilike.%${t}%,email.ilike.%${t}%`)
        .order('full_name')
        .limit(limit)
    ) ?? []) as PersonRef[];
  }

  /** Members of every active team covering a category — offered by name first. */
  static async membersForCategory(categoryId: number): Promise<
    { team_id: number; team_name: string; person: PersonRef; is_team_lead: boolean }[]
  > {
    const rows = (unwrap(
      await db()
        .from('instasolver_maintenance_teams')
        .select(
          `id, name, members:instasolver_team_members(is_team_lead,
             person:profiles!instasolver_team_members_user_id_fkey(${PERSON_COLUMNS}))`
        )
        .eq('is_active', true)
        .eq('category_id', categoryId)
    ) ?? []) as {
      id: number;
      name: string;
      members: { is_team_lead: boolean; person: PersonRef | null }[];
    }[];
    return rows.flatMap((t) =>
      t.members
        .filter((m) => m.person)
        .map((m) => ({ team_id: t.id, team_name: t.name, person: m.person as PersonRef, is_team_lead: m.is_team_lead }))
    );
  }
}
