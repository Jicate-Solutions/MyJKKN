/**
 * GET /api/academic/privileges/card/[memberId]
 *
 * Streams a printable Privilege Card PDF for the caller's active privileges.
 * One card bundles ALL active memberships the learner has (inspired by
 * Vijay's TVK Citizen Privilege Card — bundling > fragmentation).
 *
 * Auth: session-only (cookies). No API key access.
 * Authorization:
 *   - super_admin / admin: may generate any learner's card.
 *   - everyone else: may generate ONLY their own card
 *     (profile.learner_id must match the member's learner_id).
 *
 * Idempotent. No DB mutations.
 *
 * Created: 2026-04-21
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { corsHeaders } from '@/lib/api-keys/cors';
import { errorResponse } from '@/lib/api/response';
import { generatePrivilegeCardPDF } from '@/lib/services/privileges/card-generator-service';
import { logger } from '@/lib/utils/enhanced-logger';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const GET = withAuth(
  async (request, auth, context) => {
    const params = (await context?.params) as { memberId?: string } | undefined;
    const memberId = params?.memberId;

    if (!memberId || !isUuidLike(memberId)) {
      return errorResponse('Invalid member id', 400);
    }

    // ── Authorization check ─────────────────────────────────────────────────
    // Look up the member's learner_id. Super admin / admin can generate for
    // any learner; everyone else must own the membership.
    const role = (auth.user.role || '').toLowerCase();
    const isAdminish = ['super_admin', 'admin', 'administrator'].includes(role);

    if (!isAdminish) {
      // Read from the unified view so lc_members-sourced memberships (virtual
      // IDs) resolve too — not just rows in privilege_members.
      const { data: member, error: memberErr } = await auth.supabase
        .from('v_privilege_memberships_effective')
        .select('learner_id')
        .eq('id', memberId)
        .maybeSingle();

      if (memberErr || !member) {
        return errorResponse('Membership not found', 404);
      }

      // Resolve the caller's learner_id from profiles (AuthUser doesn't carry it).
      const { data: profile } = await auth.supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', auth.user.id)
        .maybeSingle();

      const callerLearnerId = (profile as any)?.learner_id ?? null;
      if (!callerLearnerId || callerLearnerId !== member.learner_id) {
        return errorResponse('You can only download your own Privilege Card', 403);
      }
    }

    // ── Build verification URL base ─────────────────────────────────────────
    const reqUrl = new URL(request.url);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${reqUrl.protocol}//${reqUrl.host}`;

    // ── Generate PDF ────────────────────────────────────────────────────────
    try {
      const result = await generatePrivilegeCardPDF(memberId, auth.supabase, baseUrl);
      if (!result) {
        return errorResponse('Unable to generate Privilege Card', 404);
      }

      return new NextResponse(result.bytes as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (err) {
      logger.error('privileges/card', 'PDF generation failed', err);
      return errorResponse('Failed to generate Privilege Card', 500);
    }
  },
  { requiredPermission: 'read', allowApiKey: false },
);

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
