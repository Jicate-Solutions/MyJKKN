/**
 * GET /api/calendar/exam-schedule
 *
 * Proxies COE's `/api/v1/exam-timetables` and returns rows already shaped as
 * `CalendarItem[]`, so the calendar grid can concat them onto the
 * `fn_calendar_items` result with no special-casing.
 *
 * Institution-wide by design: every viewer sees all published exams for the
 * institution in scope, matching how the rest of the calendar behaves with the
 * institution picker. Only `calendar.view` is required — the same key that
 * unlocks the page itself.
 *
 * Unpublished timetables are never requested: COE defaults `is_published=true`
 * and we do not override it. A draft timetable is still being edited and must
 * not surface anywhere in MyJKKN.
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
  toCalendarItemFromExamTimetable,
  type ExamTimetableRow,
} from '@/lib/services/calendar/coe-feeds';
import type { CalendarItem } from '@/types/calendar';

function csv(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
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

      // `is_super_admin` is a flag as well as a role — a user carrying the flag
      // under some other role_key would otherwise be pinned to their employer's
      // institution instead of seeing everything.
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

      const client = CoeRestClient.create();
      const response = await client.get<{ data: ExamTimetableRow[] }>('/api/v1/exam-timetables', {
        from: start,
        to: end,
        // COE resolves these through `institutions.myjkkn_institution_ids`, which
        // already collapses the CAS Self/Aided split — no sibling expansion here.
        myjkkn_institution_ids: institutionIds?.length ? institutionIds.join(',') : undefined,
        limit: '2000',
      });

      const items: CalendarItem[] = (response.data ?? []).map((row) =>
        toCalendarItemFromExamTimetable(row, institutionIds),
      );

      return NextResponse.json({ data: items });
    } catch (error) {
      // COE answers 404 "No institution matched the request scope" for a MyJKKN
      // institution it has never been mapped to (schools, non-academic units).
      // That is a normal state, not an error — return an empty feed so the chip
      // simply shows nothing instead of surfacing a scary message.
      if (error instanceof CoeApiError) {
        if (error.status !== 404) {
          console.error('[calendar/exam-schedule] COE error:', error.status, error.message);
        }
        return NextResponse.json(
          { data: [], error: error.status === 404 ? null : error.message },
          { status: 200 },
        );
      }
      console.error('[calendar/exam-schedule] error:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch exam schedule' },
        { status: 200 },
      );
    }
  },
  { requiredPermission: 'read', requirePermission: 'calendar.view' },
);
