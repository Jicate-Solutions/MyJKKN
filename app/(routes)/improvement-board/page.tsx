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
        institutionId={profile.institution_id || ''}
        initialAreas={areaList}
        initialIdeas={ideas}
      />
    </ContentLayout>
  );
}
