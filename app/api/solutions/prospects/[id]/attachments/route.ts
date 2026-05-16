// app/api/solutions/prospects/[id]/attachments/route.ts
// REST endpoint for prospect attachments.
//   GET  ?signedUrlFor=<storage_path>  -> { signedUrl }
//   GET                                 -> ProspectAttachment[]
//   POST  multipart (file, kind)        -> created ProspectAttachment
//   DELETE ?attachmentId=<uuid>         -> 204
//
// All gated by withAuth (session or API key) AND the underlying RLS policies
// from the C1a migration (sh_has_management_access / sh_is_staff).

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  ProspectAttachmentsService,
  type AttachmentKind,
  ATTACHMENT_KINDS,
} from '@/lib/services/solutions/prospect-attachments-service';
import {
  successApiResponse,
  createdResponse,
  errorResponse,
  noContentResponse,
} from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
]);

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ----------------------------------------------------------------------------
// GET: list attachments OR resolve a signed URL for one storage_path.
// ----------------------------------------------------------------------------
export const GET = withAuth(
  async (request, _auth, context) => {
    const { id: prospectId } = await context!.params!;
    const url = new URL(request.url);
    const signedUrlFor = url.searchParams.get('signedUrlFor');

    if (signedUrlFor) {
      // Defensive: ensure the requested object actually belongs to this prospect.
      // RLS on the table will block cross-prospect rows, but this avoids an
      // accidental leak via a misconstructed query.
      const rows = await ProspectAttachmentsService.listByProspect(prospectId);
      const owned = rows.some((r) => r.storage_path === signedUrlFor);
      if (!owned) {
        return errorResponse(
          'Attachment not found for this prospect',
          404
        );
      }
      const signedUrl = await ProspectAttachmentsService.getSignedUrl(
        signedUrlFor
      );
      return successApiResponse({ signedUrl });
    }

    const attachments = await ProspectAttachmentsService.listByProspect(
      prospectId
    );
    return successApiResponse(attachments);
  },
  { requiredPermission: 'read' }
);

// ----------------------------------------------------------------------------
// POST: multipart upload. FormData fields: file (File), kind (AttachmentKind).
// ----------------------------------------------------------------------------
export const POST = withAuth(async (request, auth, context) => {
  const { id: prospectId } = await context!.params!;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('Expected multipart/form-data body', 400);
  }

  const file = formData.get('file');
  const kindRaw = formData.get('kind');

  if (!(file instanceof File)) {
    return errorResponse('Missing "file" in form data', 400);
  }
  if (file.size === 0) {
    return errorResponse('File is empty', 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(
      `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
      400
    );
  }
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return errorResponse(`File type "${file.type}" is not allowed`, 400);
  }

  const kind = (typeof kindRaw === 'string' ? kindRaw : 'other') as AttachmentKind;
  if (!ATTACHMENT_KINDS.includes(kind)) {
    return errorResponse(
      `kind must be one of: ${ATTACHMENT_KINDS.join(', ')}`,
      400
    );
  }

  const created = await ProspectAttachmentsService.upload({
    prospectId,
    file,
    kind,
    uploadedBy: auth.user.id,
  });

  return createdResponse(created);
});

// ----------------------------------------------------------------------------
// DELETE ?attachmentId=<uuid>
// ----------------------------------------------------------------------------
export const DELETE = withAuth(async (request, _auth, context) => {
  const { id: prospectId } = await context!.params!;
  const url = new URL(request.url);
  const attachmentId = url.searchParams.get('attachmentId');

  if (!attachmentId) {
    return errorResponse('Missing "attachmentId" query param', 400);
  }

  // Defensive: confirm the attachment belongs to this prospect before deletion.
  const rows = await ProspectAttachmentsService.listByProspect(prospectId);
  const owned = rows.some((r) => r.id === attachmentId);
  if (!owned) {
    return errorResponse('Attachment not found for this prospect', 404);
  }

  await ProspectAttachmentsService.delete(attachmentId);
  return noContentResponse();
});
