export const dynamic = 'force-dynamic';

// /api/id-cards/template/:id/mappings
// Created: 2026-07-25 — wires the Template page "Field mappings" tab to the
// REAL substrate: the per-template `field_mappings` jsonb column on
// id_card_templates (the same column the render engine reads via
// parseFieldMappings in app/api/id-cards/templates/[id]/render/route.ts).
//
// GET — super_admin / registrar / admission (TEMPLATE_RENDER_ROLES).
//        Returns the template's parsed field mappings.
// PUT — writer roles (JOB_WRITER_ROLES). Body: { mappings: [{ card_field,
//        db_column }] }. Replaces the whole array (it is one jsonb value).
//        Writes go through the session-bound client, so the
//        id_card_templates_edit RLS policy stays in force on top of the
//        route-level role check.
//
// Envelope (lib/id-cards/responses.ts): { data: ... } | { error: { message, code } }.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireUser, isAuthFailure } from '@/lib/id-cards/auth';
import { TEMPLATE_RENDER_ROLES, JOB_WRITER_ROLES } from '@/lib/id-cards/types';
import { CARD_FIELDS, parseFieldMappings } from '@/lib/id-cards/render-data';

const paramsSchema = z.string().uuid();

const putBodySchema = z.object({
  mappings: z
    .array(
      z.object({
        card_field: z.enum(CARD_FIELDS as unknown as [string, ...string[]]),
        db_column: z
          .string()
          .trim()
          .min(3, 'db_column is required')
          .max(120, 'db_column is too long')
          .regex(
            /^[a-z0-9_]+\.[a-z0-9_]+$/,
            'db_column must look like table_name.column_name'
          )
      })
    )
    .max(CARD_FIELDS.length, `mappings capped at ${CARD_FIELDS.length} entries`)
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = await requireUser(TEMPLATE_RENDER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsedId = paramsSchema.safeParse(id);
    if (!parsedId.success) {
      return jsonError('Template id must be a valid uuid', 'bad_request', 400);
    }

    const { data, error } = await auth.supabase
      .from('id_card_templates')
      .select('id, field_mappings')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (error) {
      console.error('[id-cards/template/mappings] GET read error:', error);
      return jsonError(`Failed to read template: ${error.message}`, 'query_failed', 500);
    }
    if (!data) {
      return jsonError('No template exists for the given id', 'template_not_found', 404);
    }

    return jsonOk({
      template_id: parsedId.data,
      mappings: parseFieldMappings((data as { field_mappings: unknown }).field_mappings)
    });
  } catch (err) {
    console.error('[id-cards/template/mappings] GET unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = await requireUser(JOB_WRITER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsedId = paramsSchema.safeParse(id);
    if (!parsedId.success) {
      return jsonError('Template id must be a valid uuid', 'bad_request', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 'bad_request', 400);
    }

    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        'bad_request',
        400
      );
    }

    // One mapping per card field — the renderer only ever reads the first
    // match (resolveMappedValue), so duplicates would silently shadow.
    const seen = new Set<string>();
    for (const mapping of parsed.data.mappings) {
      if (seen.has(mapping.card_field)) {
        return jsonError(
          `Duplicate mapping for card field "${mapping.card_field}" — each card field may be mapped once`,
          'bad_request',
          400
        );
      }
      seen.add(mapping.card_field);
    }

    // Session-bound client: the id_card_templates_edit RLS policy applies on
    // top of the role check above (defense in depth — no service role here).
    const { data, error } = await auth.supabase
      .from('id_card_templates')
      .update({
        field_mappings: parsed.data.mappings,
        updated_at: new Date().toISOString()
      })
      .eq('id', parsedId.data)
      .select('id, field_mappings')
      .maybeSingle();

    if (error) {
      console.error('[id-cards/template/mappings] PUT update error:', error);
      return jsonError(`Failed to save mappings: ${error.message}`, 'query_failed', 500);
    }
    if (!data) {
      // Missing row OR an RLS-blocked write — surface explicitly, never silently.
      return jsonError(
        'Template not found (or you do not have permission to edit it)',
        'template_not_found',
        404
      );
    }

    return jsonOk({
      template_id: parsedId.data,
      mappings: parseFieldMappings((data as { field_mappings: unknown }).field_mappings)
    });
  } catch (err) {
    console.error('[id-cards/template/mappings] PUT unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
