/**
 * Report categories, shared by the bug-reporter widget and POST /api/bug-reports.
 *
 * The widget once offered 'question' while the API's enum did not accept it, so
 * every "Question" report was refused with a 400 and lost (0 rows since 1 Sep
 * 2026). Both sides now read this one list.
 */

/** The three choices the widget shows at the top of the form. */
export const WIDGET_TOP_CATEGORIES = ['question', 'feature_request', 'bug'] as const;

/** Every category the API accepts (a superset of what the widget shows). */
export const REPORT_CATEGORIES = [
  'bug',
  'feature_request',
  'question',
  'ui_design',
  'performance',
  'security',
  'other',
] as const;
