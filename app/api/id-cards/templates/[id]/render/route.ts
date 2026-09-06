export const dynamic = 'force-dynamic';

// GET /api/id-cards/templates/:id/render?profile_id=<uuid>[&format=png|json][&side=front|back]
// Phase 2 — the real ID-card compositor (replaces the Phase 1C stub).
//
// side=back (DARK feature): renders the card BACK from back_layout_json.
// Every template in prod has back_layout_json NULL → side=back 404s with
// code 'back_not_configured' until a template explicitly opts in, and the
// default side=front path is untouched. The Windows print bridge still
// prints fronts only — duplex is a future box-side change.
//
// Pipeline:
//   1. Auth: user session (super_admin / registrar / admission) OR agent-token.
//   2. Fetch the template (layout + field mappings) and the person's data
//      (learner via profiles.learner_id, or team member via the staff bridge).
//   3. Resolve photo through the fallback chain (learner photo → staff picture
//      → profile avatar → locally-drawn initials) and generate the QR payload.
//   4. Composite a 1014x638 PNG (CR80 landscape @ 300dpi) with next/og
//      ImageResponse — bundled with Next, default font, no network fonts.
//   5. Respond:
//        default        → { data: { png_base64, template_id, profile_id } }
//        ?format=png    → raw PNG bytes (what the Windows print bridge downloads)
//
// Data reads mirror the jobs route: session-bound client on the user path,
// service-role client on the agent path (the agent has no Supabase session).

import { NextRequest, connection } from 'next/server';
import { ImageResponse } from 'next/og';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireUserOrAgent, isAuthFailure } from '@/lib/id-cards/auth';
import { TEMPLATE_RENDER_ROLES } from '@/lib/id-cards/types';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  assembleCardData,
  isAssembleFailure,
  parseFieldMappings,
  parseValidityPolicy,
  resolveValidUntilLabel,
  resolvePhotoDataUrl,
  resolveBackgroundDataUrl,
  makeQrDataUrl
} from '@/lib/id-cards/render-data';
import {
  buildCardElement,
  buildBackElement,
  parseFrontLayout,
  parseBackLayout,
  CARD_WIDTH,
  CARD_HEIGHT
} from '@/lib/id-cards/render-card';
import { makeCode39SvgDataUrl } from '@/lib/id-cards/barcode';
import type { ReactElement } from 'react';

const paramsSchema = z.string().uuid();
const querySchema = z.object({
  profile_id: z.string().uuid(),
  format: z.enum(['json', 'png']).optional().default('json'),
  side: z.enum(['front', 'back']).optional().default('front')
});

type TemplateRow = {
  id: string;
  name: string | null;
  institution_id: string | null;
  front_layout_json: unknown;
  back_layout_json: unknown;
  field_mappings: unknown;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = await requireUserOrAgent(request, TEMPLATE_RENDER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsedId = paramsSchema.safeParse(id);
    if (!parsedId.success) {
      return jsonError('Template id must be a valid uuid', 'bad_request', 400);
    }

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      profile_id: url.searchParams.get('profile_id'),
      format: url.searchParams.get('format') ?? undefined,
      side: url.searchParams.get('side') ?? undefined
    });
    if (!parsedQuery.success) {
      return jsonError(
        `Invalid query: ${parsedQuery.error.issues.map((i) => i.message).join('; ')}`,
        'bad_request',
        400
      );
    }
    const { profile_id: profileId, format, side } = parsedQuery.data;

    // Agent path has no Supabase session — use service-role for reads.
    // User path uses the session-bound client opened in requireUser (RLS applies).
    const supabase = auth.kind === 'user' ? auth.supabase : createServiceRoleClient();

    // 1. Template (layout + field mappings).
    const { data: template, error: templateError } = await supabase
      .from('id_card_templates')
      .select('id, name, institution_id, front_layout_json, back_layout_json, field_mappings')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (templateError) {
      console.error('[id-cards/templates/render] template read error:', templateError);
      return jsonError(
        `Failed to read template: ${templateError.message}`,
        'query_failed',
        500
      );
    }
    if (!template) {
      return jsonError('No template exists for the given id', 'template_not_found', 404);
    }
    const templateRow = template as TemplateRow;

    // DARK gate: side=back requires the template to have opted in by setting
    // back_layout_json non-null ({} = enabled with the default back design).
    // Every prod template is NULL today, so this 404s everywhere until a
    // template is explicitly configured — front behavior is untouched.
    if (
      side === 'back' &&
      (templateRow.back_layout_json === null || templateRow.back_layout_json === undefined)
    ) {
      return jsonError(
        'The back side is not configured for this template',
        'back_not_configured',
        404
      );
    }

    // 2. Person data (learner or team member) + institution display name.
    const assembled = await assembleCardData(
      supabase,
      profileId,
      templateRow.institution_id
    );
    if (isAssembleFailure(assembled)) {
      return jsonError(assembled.message, assembled.code, assembled.status);
    }
    const person = assembled.data;

    // 2b. Card validity policy (id_card.validity.* in platform_policies).
    // Read ONCE, and compute the label ONCE — above the front/back branch, so
    // a card can never print one date on the front and another on the back.
    // Fail-soft like every other read here: an error, or a database that
    // predates the validity keys, falls back to the built-in defaults, which
    // are the Director's rules (learner = whole course, team member = yearly).
    const { data: policyJson, error: policyError } = await supabase.rpc(
      'fn_get_id_card_policy',
      { p_institution_id: templateRow.institution_id }
    );
    if (policyError) {
      console.warn(
        '[id-cards/templates/render] policy read failed, using built-in validity rules:',
        policyError.message
      );
    }
    const validUntilLabel = resolveValidUntilLabel({
      kind: person.kind,
      courseEndDate: person.courseEndDate,
      policy: parseValidityPolicy(policyError ? null : policyJson)
    });

    let element: ReactElement;
    if (side === 'back') {
      // 3b. Back composite (DARK): Code 39 barcode of the learner's roll
      // number / team member's staff id (pure, no I/O) + optional back
      // artwork through the SAME id-card-assets allowlist as the front.
      const backLayout = parseBackLayout(templateRow.back_layout_json) ?? {};
      const barcodeDataUrl =
        (backLayout.show_barcode ?? true) && person.idCode
          ? makeCode39SvgDataUrl(person.idCode, { height: 110, scale: 3, showText: false })
          : null;
      const backBackgroundDataUrl = await resolveBackgroundDataUrl(
        backLayout.background_image
      );
      element = buildBackElement({
        person,
        backgroundDataUrl: backBackgroundDataUrl,
        barcodeDataUrl,
        layout: backLayout,
        mappings: parseFieldMappings(templateRow.field_mappings),
        validUntilLabel
      });
    } else {
      // 3. Photo fallback chain + QR + card artwork — all fail-soft (never 500
      // the render). The background fetch is allowlisted to the id-card-assets
      // bucket inside resolveBackgroundDataUrl.
      const layout = parseFrontLayout(templateRow.front_layout_json);
      const [photoDataUrl, qrDataUrl, backgroundDataUrl] = await Promise.all([
        resolvePhotoDataUrl(person.photoCandidates),
        makeQrDataUrl(person.qrValue),
        resolveBackgroundDataUrl(layout?.background_image)
      ]);

      // 4. Composite. Empty front_layout_json (prod today) → default design.
      element = buildCardElement({
        person,
        photoDataUrl,
        qrDataUrl,
        backgroundDataUrl,
        layout,
        mappings: parseFieldMappings(templateRow.field_mappings),
        validUntilLabel
      });
    }

    const image = new ImageResponse(element, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT
    });
    const pngBuffer = await image.arrayBuffer();

    // 5a. Raw PNG for the Windows print bridge.
    if (format === 'png') {
      return new Response(pngBuffer, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'no-store',
          'content-disposition': `inline; filename="id-card-${profileId}${side === 'back' ? '-back' : ''}.png"`
        }
      });
    }

    // 5b. Default JSON envelope (unchanged contract, stub flag dropped).
    return jsonOk({
      png_base64: Buffer.from(pngBuffer).toString('base64'),
      template_id: parsedId.data,
      profile_id: profileId
    });
  } catch (err) {
    console.error('[id-cards/templates/render] unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
