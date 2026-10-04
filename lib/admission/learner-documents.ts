// Shared by the staff upload (browser client) and the self-fill link's server
// route, so neither imports the other's Supabase client.

/** Private bucket for a learner's admission papers (20270611100000). A file lives
 *  at <learner_id>/<doc_type>-<timestamp>.<ext>; storage policies admit only
 *  people who can see that learner's admission documents. */
export const LEARNER_DOCUMENTS_BUCKET = 'learner-admission-documents';

/** The two postgraduate papers (Director ruling 2026-09-30). */
export const PG_DEGREE_DOC_TYPES = {
  pg_degree_mark_sheet: 'Degree mark sheet',
  pg_entrance_scorecard: 'Entrance exam scorecard',
} as const;
export type PgDegreeDocType = keyof typeof PG_DEGREE_DOC_TYPES;

export const LEARNER_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEARNER_DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
