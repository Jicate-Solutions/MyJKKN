export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceTypeService } from '@/lib/services/service-requests/service-type-service';

// PATCH body validator — only guards fields we permit clients to change.
// Everything else flows through as-is so we don't accidentally narrow the DTO.
const patchBodySchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase with hyphens')
      .optional(),
  })
  .passthrough();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceType = await ServiceTypeService.getServiceType(id);
    return NextResponse.json(serviceType);
  } catch (error) {
    console.error('[service-requests/types] GET [id] error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Service type not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validated = patchBodySchema.parse(json);

    // Block slug rename on system-default types — those slugs are load-bearing
    // (transport webhook, external APIs). The UI already keeps the field
    // read-only for these, this is the defense-in-depth layer.
    if (typeof validated.slug === 'string') {
      const existing = await ServiceTypeService.getServiceType(id);
      if (existing?.is_system_default && existing.slug !== validated.slug) {
        return NextResponse.json(
          {
            error:
              'Cannot change the slug of a system-default service type — integrations depend on it.',
          },
          { status: 403 }
        );
      }
    }

    const updated = await ServiceTypeService.updateServiceType(id, validated);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[service-requests/types] PATCH [id] error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('duplicate')) {
        return NextResponse.json(
          { error: 'A service type with this slug already exists' },
          { status: 409 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Service type not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ServiceTypeService.deleteServiceType(id);
    return NextResponse.json({ message: 'Service type deleted successfully' });
  } catch (error) {
    console.error('[service-requests/types] DELETE [id] error:', error);

    if (error instanceof Error) {
      if (error.message.includes('existing requests')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Service type not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
