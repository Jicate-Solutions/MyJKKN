import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceTypeService } from '@/lib/services/service-requests/service-type-service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const updated = await ServiceTypeService.updateServiceType(id, json);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[service-requests/types] PATCH [id] error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Service type not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
