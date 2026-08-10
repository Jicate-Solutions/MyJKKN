/**
 * GET /api/calendar/coe-calendar
 *
 * Proxies COE's `/api/v1/coe-calendar` and returns rows already shaped as
 * `CalendarItem[]`, so the calendar grid can concat them onto the
 * `fn_calendar_items` result with no special-casing.
 *
 * WHY A PROXY: the COE API key is server-only (COE_API_KEY_ID / COE_API_SECRET)
 * and the key's scope is far wider than any one viewer's. This route is the
 * narrowing layer — it pins the request to the viewer's institution scope and to
 * the COE audience tags their role may read, so COE_OFFICE-internal rows never
 * reach a learner or an ordinary staff member.
 *
 * Gated on `calendar.coe_calendar.view` (granted to all staff roles, not
 * learners — migration 20260805130000).
 *
 * Query params:
 *   start, end        YYYY-MM-DD window (required)
 *   institutionIds    csv of MyJKKN institution UUIDs; omitted = viewer's scope
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import { resolveInstitutionScope } from '@/lib/auth/institution-scope';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  coeTagsForViewer,
  toCalendarItemFromCoeCalendar,
  type CoeCalendarRow,
} from '@/lib/services/calendar/coe-feeds';
import type { CalendarItem } from '@/types/calendar';

function csv(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * Every role_key the caller holds, not just `profiles.role` — a user whose
 * teaching role lives in `user_roles` would otherwise be mapped as a learner.
 */
async function roleKeysFor(auth: AuthContext): Promise<string[]> {
  const keys = new Set<string>();
  if (auth.user.role) keys.add(auth.user.role);
  try {
    const { data } = await auth.supabase.rpc('get_user_roles_with_details', {
      p_user_id: auth.user.id,
    });
    for (const r of (data ?? []) as { role_key?: string }[]) {
      if (r?.role_key) keys.add(r.role_key);
    }
  } catch {
    // Fall back to profiles.role only — coeTagsForViewer still narrows correctly.
  }
  return Array.from(keys);
}

export const GET = withAuth(
  async (request: NextRequest, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const start = searchParams.get('start');
      const end = searchParams.get('end');

      if (!start || !end) {
        return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
      }

      // `is_super_admin` is a flag as well as a role — it decides both the
      // institution scope and whether COE_OFFICE-tagged rows are readable.
      const { data: isSuperAdmin } = await auth.supabase.rpc('is_super_admin');

      const explicitIds = csv(searchParams.get('institutionIds'));
      const institutionIds = resolveInstitutionScope(
        {
          role: auth.user.role,
          is_super_admin: isSuperAdmin,
          institution_id: auth.user.institution_id,
        },
        explicitIds,
      );

      const roleKeys = await roleKeysFor(auth);
      const tags = coeTagsForViewer({ roleKeys, isSuperAdmin });

      const client = CoeRestClient.create();
      const response = await client.get<{ data: CoeCalendarRow[] }>('/api/v1/coe-calendar', {
        from: start,
        to: end,
        roles: tags.join(','),
        // COE stores the MyJKKN ids as an array and matches by overlap, so a
        // single CAS sibling id resolves the shared COE row without any
        // counselling_code expansion on our side.
        myjkkn_institution_ids: institutionIds?.length ? institutionIds.join(',') : undefined,
        status: 'ACTIVE',
        limit: '2000',
      });

      const items: CalendarItem[] = (response.data ?? []).map((row) =>
        toCalendarItemFromCoeCalendar(row, institutionIds),
      );

      return NextResponse.json({ data: items });
    } catch (error) {
      // A COE outage must not blank the whole calendar — the other eight feeds
      // come from a separate query and are already on screen. Report the failure
      // and let the client render the rest.
      if (error instanceof CoeApiError) {
        console.error('[calendar/coe-calendar] COE error:', error.status, error.message);
        return NextResponse.json({ data: [], error: error.message }, { status: 200 });
      }
      console.error('[calendar/coe-calendar] error:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch COE calendar' },
        { status: 200 },
      );
    }
  },
  { requiredPermission: 'read', requirePermission: 'calendar.coe_calendar.view' },
);
