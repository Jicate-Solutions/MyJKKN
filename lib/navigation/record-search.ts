// Entity metadata for command-palette record search.
//
// The database function fn_global_record_search() deliberately returns
// entity + id and NOT a URL: route shapes drift with the app, and a database
// function is expensive to re-deploy every time a route moves. The mapping
// from entity to href therefore lives here, next to the rest of the
// navigation layer.
//
// The permission key that gates each entity is deliberately NOT repeated here.
// It already exists in two places that must agree — the migration's
// user_has_permission() call and MENU_PERMISSIONS for the detail route — and a
// third copy in this file would be one more thing to drift. The drift guard in
// __tests__/lib/navigation/global-record-search-keys.test.ts derives the key
// from the route map and pins it against the SQL.

export type RecordEntity =
  | 'learner'
  | 'staff'
  | 'lead'
  | 'course'
  | 'department'
  | 'program'
  | 'institution';

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
  /** Detail route for one record. */
  href: (id: string) => string;
  /** Stable render order in the palette. */
  order: number;
}

export const RECORD_ENTITIES: Record<RecordEntity, RecordEntityMeta> = {
  learner: {
    label: 'Learners',
    iconName: 'GraduationCap',
    href: (id) => `/learners/profiles/${id}`,
    order: 1,
  },
  staff: {
    label: 'Team Members',
    iconName: 'Users',
    href: (id) => `/staff/list/${id}`,
    order: 2,
  },
  lead: {
    label: 'Admission Leads',
    iconName: 'UserPlus',
    href: (id) => `/admission/leads/${id}`,
    order: 3,
  },
  course: {
    label: 'Courses',
    iconName: 'BookOpen',
    href: (id) => `/courses/${id}`,
    order: 4,
  },
  // The three organisational kinds sit below the people and courses a user
  // searches all day: they are a much smaller set, and someone typing a name
  // is far more often after a learner than after the department they sit in.
  department: {
    label: 'Departments',
    // Every iconName here must be a key of ICON_MAP (lib/navigation/page-registry).
    // An unknown name does not fail loudly — it silently falls back to a
    // generic icon, so 'School' and 'Library', which are not registered, would
    // have shipped looking like a rendering bug.
    iconName: 'FolderTree',
    href: (id) => `/organizations/departments/${id}`,
    order: 5,
  },
  program: {
    label: 'Programmes',
    iconName: 'BookOpenCheck',
    href: (id) => `/organizations/programs/${id}`,
    order: 6,
  },
  institution: {
    label: 'Institutions',
    iconName: 'Building2',
    href: (id) => `/organizations/institutions/${id}`,
    order: 7,
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
