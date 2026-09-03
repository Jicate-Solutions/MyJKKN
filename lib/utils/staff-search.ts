import type { StaffFilters } from '@/types/staff';

interface StaffUserProfile {
  role: string;
  institution_id?: string;
}

/**
 * Every column a staff search looks at. One list, always applied — there is no
 * per-field opt-in any more.
 *
 * The old UI exposed five separate inputs plus checkboxes, and its defaults had
 * staffId and designation switched OFF. So typing a staff ID or a designation
 * found nothing until you opened a popover and ticked a box, which read as
 * "search is broken". Searching everything by default is both simpler and what
 * people actually expect.
 */
const SEARCH_COLUMNS = [
  'first_name',
  'last_name',
  'staff_id',
  'legacy_staff_id',
  'email',
  'institution_email',
  'designation',
  'phone',
] as const;

/**
 * A pasted sentence would otherwise build a URL with one .or() per word and
 * blow past the request line limit.
 */
const MAX_TOKENS = 5;

/**
 * Strip the characters that terminate a PostgREST or() expression.
 *
 * or() takes `col.op.value,col.op.value` — an unescaped comma or parenthesis
 * inside the value silently splits the filter into nonsense, so searching
 * "Kumar, S" produced a malformed query rather than a result. Removing them is
 * safe here because the term is tokenised on whitespace anyway: "Kumar, S"
 * becomes the tokens Kumar and S, which is exactly the intended search.
 *
 * Dots are deliberately kept — the value is everything after the second dot, so
 * "MR." and "DR." survive intact and still match the stored names.
 */
function sanitiseToken(token: string): string {
  return token.replace(/[,()"\\]/g, '').trim();
}

/**
 * Build one OR-group per whitespace token, for the caller to chain as separate
 * .or() calls.
 *
 * WHY GROUPS RATHER THAN ONE FLAT LIST. Matching the whole term against each
 * column individually cannot match a full name: "DHINESHKUMAR B" returns zero
 * rows for the staff member whose first_name is DHINESHKUMAR and last_name is
 * B, because no single column contains that string. PostgREST ANDs successive
 * .or() calls on the same query, so emitting one .or() per token gives
 * "(token1 matches some column) AND (token2 matches some column)" — one token
 * can land on first_name while another lands on last_name.
 *
 * Free properties: order-independent ("B DHINESHKUMAR" works too), and mixed
 * terms like "DHINESH CET012" (name fragment + staff ID) narrow the result
 * instead of failing.
 *
 * A single token produces exactly one group, i.e. the previous behaviour.
 */
export function buildStaffSearchTokenGroups(search: string): string[][] {
  const tokens = (search ?? '')
    .trim()
    .split(/\s+/)
    .map(sanitiseToken)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);

  return tokens.map((token) =>
    SEARCH_COLUMNS.map((column) => `${column}.ilike.%${token}%`)
  );
}

export function resolveStaffFiltersForUser(
  filters: StaffFilters,
  userProfile?: StaffUserProfile
): StaffFilters {
  if (userProfile?.role !== 'hod' || !userProfile.institution_id) {
    return { ...filters };
  }

  return {
    ...filters,
    institution_id: userProfile.institution_id
  };
}
