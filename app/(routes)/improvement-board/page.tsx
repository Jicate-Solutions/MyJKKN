/**
 * MBA Improvement Board — server entry.
 * Loads the active areas + the ideas the viewer is allowed to see (RLS-scoped)
 * and hands them to the client kanban. Empty-state is rendered by the client so
 * that eligible users still see the "File an idea" affordance on an empty board.
 */

import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { ImprovementBoardClient } from './_components/improvement-board-client';
import type {
  ImprovementArea,
  ImprovementIdeaEnriched
} from '@/lib/services/improvement/improvement-service';

export const dynamic = 'force-dynamic';

export default async function ImprovementBoardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to access the Improvement Board.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, institution_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to access the Improvement Board.
        </p>
      </div>
    );
  }

  // Active areas for the filter + create form.
  const { data: areas } = await supabase
    .from('improvement_areas')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // Departments the viewer can target, scoped to their own institution so the
  // picker stays a short, meaningful list instead of every department in the
  // cluster. RLS (`departments_select_by_role`) admits
  // `role_has_institution_access(institution_id)`, so any signed-in member of
  // the institution — a learner included — can read this list.
  const institutionId = profile.institution_id || '';
  let departments: { id: string; name: string }[] = [];
  if (institutionId) {
    const { data: departmentRows, error: departmentError } = await supabase
      .from('departments')
      .select('id, department_name')
      .eq('is_active', true)
      .eq('institution_id', institutionId)
      .order('department_order', { ascending: true })
      .order('department_name', { ascending: true });

    // Never swallow this read. An empty list renders as "Not specific" only —
    // byte-identical to the bug this page is fixing, with no type error and no
    // runtime error. That silence is exactly how the picker shipped dead and
    // stayed dead for 55 ideas, so a failed read has to say so somewhere.
    if (departmentError) {
      console.error(
        '[improvement-board] department fetch failed; the target picker will be empty',
        departmentError
      );
    }

    // The label is `department_name`, NOT `display_name`. Verified against
    // production 2026-09-12: in the one institution that has ever used this
    // board, CSE and CSE-PG carry the SAME display_name ("Computer Science and
    // Engineering") but distinct department_names ("…" and "… (PG)"). Preferring
    // display_name renders two byte-identical options the filer cannot tell
    // apart; department_name is unique across all 8 active departments there and
    // is also the string anyone reading the stored id back will see.
    departments = ((departmentRows || []) as {
      id: string;
      department_name: string | null;
    }[]).map((d) => ({
      id: d.id,
      name: d.department_name || 'Unnamed department'
    }));
  }

  // Ideas the viewer can see (RLS enforces open/sensitive scoping).
  const { data: rawIdeas } = await supabase
    .from('improvement_ideas')
    .select('*')
    .order('created_at', { ascending: false });

  const ideaRows = (rawIdeas || []) as any[];

  // Enrich with area labels + finder/fixer names via batched lookups.
  const areaList = (areas || []) as ImprovementArea[];
  const areaById = new Map(areaList.map((a) => [a.id, a]));

  // Authors (finders) AND resolvers (fixers) resolve in ONE batched lookup.
  const personIds = Array.from(
    new Set(
      [
        ...ideaRows.map((i) => i.author_id),
        ...ideaRows.map((i) => i.resolved_by)
      ].filter(Boolean)
    )
  ) as string[];

  const nameById = new Map<string, string | null>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', personIds);
    for (const a of (people || []) as { id: string; full_name: string | null }[]) {
      nameById.set(a.id, a.full_name);
    }
  }

  const ideas: ImprovementIdeaEnriched[] = ideaRows.map((i) => {
    const area = i.area_id ? areaById.get(i.area_id) : undefined;
    return {
      ...i,
      area_label: area?.label ?? null,
      area_key: area?.key ?? null,
      author_name: i.author_id ? nameById.get(i.author_id) ?? null : null,
      resolver_name: i.resolved_by ? nameById.get(i.resolved_by) ?? null : null
    };
  });

  return (
    <ContentLayout title="Improvement Board">
      <ImprovementBoardClient
        userId={profile.id}
        userName={profile.full_name || 'You'}
        institutionId={institutionId}
        initialAreas={areaList}
        initialDepartments={departments}
        initialIdeas={ideas}
      />
    </ContentLayout>
  );
}
