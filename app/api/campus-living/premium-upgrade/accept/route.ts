export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  acceptUpgrade,
  type AcceptUpgradeInput,
} from '@/lib/services/campus-living/premium-upgrade-service';
import {
  learnerFacingError,
  logWithReference,
} from '@/lib/services/campus-living/error-sanitize';

/** Roles allowed to accept an upgrade on behalf of a learner (warden / admin). */
const STAFF_ROLES = ['warden', 'admin', 'super_admin', 'administrator'];

/**
 * POST /api/campus-living/premium-upgrade/accept
 *
 * Accept a Premium-vacancy upgrade offer. WRITES: reassigns the learner's bed
 * to the Premium bed, bills the differential (or ₹0 if a pending entitlement is
 * held), and marks the vacancy 'filled'.
 *
 * Auth: the acting user must be the learner themselves OR a warden/admin.
 *
 * Body: { vacancyId, learnerId, hostelYearId }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<AcceptUpgradeInput>;
    if (!body.vacancyId || !body.learnerId || !body.hostelYearId) {
      return NextResponse.json(
        { error: 'vacancyId, learnerId and hostelYearId are required' },
        { status: 400 }
      );
    }

    // Authorisation: self-service (acting user IS the learner) OR warden/admin.
    if (user.id !== body.learnerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = (profile as { role?: string } | null)?.role ?? '';
      if (!STAFF_ROLES.includes(role)) {
        return NextResponse.json(
          { error: 'You may only accept an upgrade for yourself, or you must be a warden/admin.' },
          { status: 403 }
        );
      }
    }

    const result = await acceptUpgrade({
      vacancyId: body.vacancyId,
      learnerId: body.learnerId,
      hostelYearId: body.hostelYearId,
    });

    if (!result.success) {
      // Map idempotency / contention reasons to 409; bad input to 400; else 422.
      const conflictReasons = ['vacancy_not_open', 'bed_locked_by_other', 'bed_unavailable'];
      const notFoundReasons = ['vacancy_not_found', 'hostel_year_not_found'];
      const status = conflictReasons.includes(result.reason ?? '')
        ? 409
        : notFoundReasons.includes(result.reason ?? '')
          ? 404
          : 422;
      return NextResponse.json(
        { error: result.detail ?? 'Upgrade could not be completed.', reason: result.reason },
        { status }
      );
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    // Never surface raw database/driver text to a learner — log the full error
    // server-side, return a plain sentence + reference (2026-08-07).
    const reference = logWithReference('campus-living', 'premium-upgrade accept route error', e);
    return NextResponse.json(
      { error: learnerFacingError('processing your upgrade', reference), reference },
      { status: 500 }
    );
  }
}
