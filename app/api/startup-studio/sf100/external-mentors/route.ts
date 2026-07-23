import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  createExternalContact,
  listExternalContacts,
  listAllTeams,
  type ExternalRole,
} from '@/lib/services/startup-studio/sf100-mentor-assign-service';
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

const PERM = 'startup_studio.sf100.member.create';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** GET — external contacts (with code status + assignment count) + all teams. */
export const GET = withAuth(
  async () => {
    const [contacts, teams] = await Promise.all([
      listExternalContacts(),
      listAllTeams(),
    ]);
    return successApiResponse({ contacts, teams });
  },
  { requiredPermission: 'read', requirePermission: PERM }
);

/** POST { name, role, email?, phone?, organization? } — create an external contact. */
export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json();
    const name = (body.name ?? '').trim();
    const role = (body.role ?? 'mentor').trim() as ExternalRole;
    if (!name) return errorResponse('name is required', 400);
    if (role !== 'mentor' && role !== 'investor') {
      return errorResponse('role must be "mentor" or "investor"', 400);
    }
    if (!body.email && !body.phone) {
      return errorResponse('An email or phone is required (used to log in)', 400);
    }
    const result = await createExternalContact({
      name,
      role,
      email: body.email,
      phone: body.phone,
      organization: body.organization,
      domainExpertise: Array.isArray(body.domainExpertise) ? body.domainExpertise : [],
      createdBy: auth.user.id,
    });
    if (!result.ok) return errorResponse(result.message || 'Failed to create contact', 500);
    return createdResponse({ mentorId: result.mentorId });
  },
  { requirePermission: PERM }
);
