// Entity metadata for command-palette record search.
//
// The database function fn_global_record_search() deliberately returns
// entity + id and NOT a URL: route shapes drift with the app, and a database
// function is expensive to re-deploy every time a route moves. The mapping
// from entity to href therefore lives here, next to the rest of the
// navigation layer.
//
// Each `permission` below is the SAME key the RPC gates that entity on, and
// the same key lib/sidebarMenuLink.ts maps to the detail route. Keeping the
// three in agreement is what stops the palette from offering a result that
// bounces the user off a locked page when they click it.

export type RecordEntity = 'learner' | 'staff' | 'lead' | 'course';

export interface RecordHit {
  entity: RecordEntity;
  recordId: string;
  title: string;
  subtitle: string | null;
  institutionName: string | null;
  matchRank: number;
}

interface RecordEntityMeta {
  /** Plural heading shown above the group in the palette. */
  label: string;
  /** lucide-react icon name, resolved through ICON_MAP like page results. */
  iconName: string;
  /** Permission key gating this entity — mirrors the RPC and the route map. */
  permission: string;
  /** Detail route for one record. */
  href: (id: string) => string;
  /** Stable render order in the palette. */
  order: number;
}

export const RECORD_ENTITIES: Record<RecordEntity, RecordEntityMeta> = {
  learner: {
    label: 'Learners',
    iconName: 'GraduationCap',
    permission: 'learners.profiles.view',
    href: (id) => `/learners/profiles/${id}`,
    order: 1,
  },
  staff: {
    label: 'Staff',
    iconName: 'Users',
    permission: 'staff.view',
    href: (id) => `/staff/list/${id}`,
    order: 2,
  },
  lead: {
    label: 'Admission Leads',
    iconName: 'UserPlus',
    permission: 'admission.leads.view',
    href: (id) => `/admission/leads/${id}`,
    order: 3,
  },
  course: {
    label: 'Courses',
    iconName: 'BookOpen',
    permission: 'courses.view',
    href: (id) => `/courses/${id}`,
    order: 4,
  },
};

export const RECORD_ENTITY_ORDER: RecordEntity[] = (
  Object.keys(RECORD_ENTITIES) as RecordEntity[]
).sort((a, b) => RECORD_ENTITIES[a].order - RECORD_ENTITIES[b].order);

/** True when the RPC handed back an entity this build knows how to render. */
export function isRecordEntity(value: unknown): value is RecordEntity {
  return typeof value === 'string' && value in RECORD_ENTITIES;
}

/** Group hits by entity, preserving the RPC's within-entity ordering. */
export function groupRecordHits(
  hits: RecordHit[]
): Array<{ entity: RecordEntity; meta: RecordEntityMeta; hits: RecordHit[] }> {
  return RECORD_ENTITY_ORDER.map((entity) => ({
    entity,
    meta: RECORD_ENTITIES[entity],
    hits: hits.filter((h) => h.entity === entity),
  })).filter((group) => group.hits.length > 0);
}
