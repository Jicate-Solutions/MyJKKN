import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  generateAccessCode,
  deactivateAccessCode,
  getAccessStatus,
} from '@/lib/services/startup-studio/external-access-service';
import { successApiResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

// Coordinator/NIF surface: manage the login code of an EXTERNAL mentor/investor.
// Gated by the canonical triad via requirePermission (admins + nif_coordinator).
const PERM = 'startup_studio.sf100.member.create';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Status of the mentor's access code (never returns the code or its hash). */
export const GET = withAuth(
  async (_request, _auth, context) => {
    const { id } = await context!.params!;
    const status = await getAccessStatus(id);
    return successApiResponse(status);
  },
  { requiredPermission: 'read', requirePermission: PERM }
);

/** Generate (or regenerate) a 6-digit code. Returns the raw code ONCE. */
export const POST = withAuth(
  async (_request, auth, context) => {
    const { id } = await context!.params!;
    const result = await generateAccessCode(id, auth.user.id);
    if (!result.ok) {
      if (result.reason === 'not_found') return errorResponse('Mentor not found', 404);
      return errorResponse(
        'This mentor has a JKKN account and logs in via staff sign-in — no access code needed.',
        400
      );
    }
    // The ONLY time the raw code is ever exposed. Coordinator shares it out-of-band.
    return successApiResponse({ code: result.code });
  },
  { requirePermission: PERM }
);

/** Deactivate the code (revoke access). */
export const DELETE = withAuth(
  async (_request, auth, context) => {
    const { id } = await context!.params!;
    const result = await deactivateAccessCode(id, auth.user.id);
    if (!result.ok) return errorResponse('No active access code for this mentor', 404);
    return successApiResponse({ deactivated: true });
  },
  { requirePermission: PERM }
);
