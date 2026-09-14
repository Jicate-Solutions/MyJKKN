// hooks/events/use-event-academic-types.ts
// The academic event-type catalogue, as a picker sees it.
//
// WHY A QUERY AND NOT A CONST ARRAY. Its sibling pickers in
// edit-general-event-dialog.tsx (SCOPES, VISIBILITIES) are hard-coded arrays,
// and copying that shape here would be wrong: `event_academic_types` is a
// CRUDable master table. Its unique index is scoped on
// (COALESCE(institution_id, …), lower(code)) precisely so a college can add a
// kind the cluster-wide list does not carry. A hard-coded list would make that
// column decorative.
//
// WHAT A CALLER SEES. The 23 cluster-wide rows (institution_id IS NULL) plus
// the caller's own college's rows, in the PDF's published order, with 'Other'
// last. A college's own entries are flagged so the picker can mark them —
// Director's decision 2026-09-13: a coordinator must be able to tell the
// institution's agreed list from one their own college invented, because
// accreditation cares about that difference.
//
// NEVER another college's rows. The events-side trigger
// (trg_events_academic_type_tenant_guard) refuses such a write anyway, but a
// picker that offers an option the database will reject is a worse experience
// than one that never offers it.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export type EventAcademicType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  display_order: number;
  /** True when this kind belongs to the caller's own college, not the shared list. */
  isOwnCollege: boolean;
};

export const EVENT_ACADEMIC_TYPES_KEY = (institutionId: string | null | undefined) =>
  ['event-academic-types', institutionId ?? 'cluster'] as const;

/**
 * The kinds an event at `institutionId` may be labelled with.
 *
 * Pass the EVENT's institution, not the viewer's: an admin editing another
 * college's event must see that college's options, and the database will only
 * accept those.
 */
export function useEventAcademicTypes(institutionId: string | null | undefined) {
  return useQuery({
    queryKey: EVENT_ACADEMIC_TYPES_KEY(institutionId),
    // A catalogue, not live data — 23 rows that change when someone edits the
    // master list, which is rare. Refetching it on every dialog open would be
    // noise.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EventAcademicType[]> => {
      const supabase = createClientSupabaseClient();

      // `institution_id.is.null` alone would drop the college's own rows;
      // filtering by institution alone would drop the shared 23. Both, always.
      const filter = institutionId
        ? `institution_id.is.null,institution_id.eq.${institutionId}`
        : 'institution_id.is.null';

      const { data, error } = await supabase
        .from('event_academic_types')
        .select('id, code, label, description, display_order, institution_id')
        .or(filter)
        .order('display_order', { ascending: true });

      if (error) throw new Error(error.message);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        code: r.code as string,
        label: r.label as string,
        description: (r.description as string | null) ?? null,
        display_order: r.display_order as number,
        isOwnCollege: r.institution_id != null,
      }));
    },
  });
}
