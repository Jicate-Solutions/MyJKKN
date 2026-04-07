export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/register
// Public endpoint — creates a new registration for the marathon.
// No auth required. Generates BIB number automatically.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { publicRegistrationSchema } from '@/lib/validations/events';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createServiceRoleClient();

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = publicRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Ensure event_id matches route param
    if (data.event_id !== eventId) {
      return NextResponse.json(
        { error: 'event_id in body does not match URL' },
        { status: 400 }
      );
    }

    // Fetch event to validate it's a public marathon
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, event_type, is_public, allow_external_registration, status, year')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!event.is_public) {
      return NextResponse.json({ error: 'Registrations are not open' }, { status: 403 });
    }

    if (data.participant_type === 'external' && !event.allow_external_registration) {
      return NextResponse.json(
        { error: 'External registrations are not allowed for this event' },
        { status: 403 }
      );
    }

    // Fetch category to get its code
    const { data: category, error: catError } = await supabase
      .from('event_categories')
      .select('id, name, code, max_participants')
      .eq('id', data.category_id)
      .eq('event_id', eventId)
      .single();

    if (catError || !category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Check category capacity
    if (category.max_participants) {
      const { count } = await supabase
        .from('events_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('category_id', data.category_id);

      if ((count ?? 0) >= category.max_participants) {
        return NextResponse.json({ error: 'Category is full' }, { status: 409 });
      }
    }

    // Check for duplicate phone in same event
    const { data: existing } = await supabase
      .from('events_registrations')
      .select('id, bib_number')
      .eq('event_id', eventId)
      .eq('participant_phone', data.participant_phone)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A registration with this phone number already exists', data: existing },
        { status: 409 }
      );
    }

    // Generate BIB number: {EVENT_CODE}-{YEAR}-{CAT_CODE}-{SEQ}
    const { count: seqCount } = await supabase
      .from('events_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('category_id', data.category_id);

    const seq = ((seqCount ?? 0) + 1).toString().padStart(4, '0');
    const eventYear = event.year ?? new Date().getFullYear();
    const catCode = (category.code ?? category.name.substring(0, 3)).toUpperCase();
    // Use a short event code derived from event id (first 3 chars uppercased) or institution
    const eventCode = 'KBM'; // Standard prefix — can be made configurable via event.config
    const bib_number = `${eventCode}-${eventYear}-${catCode}-${seq}`;

    // Insert registration
    const { data: registration, error: insertError } = await supabase
      .from('events_registrations')
      .insert({
        event_id: eventId,
        category_id: data.category_id,
        bib_number,
        participant_name: data.participant_name,
        participant_phone: data.participant_phone,
        participant_email: data.participant_email ?? null,
        participant_age: data.participant_age ?? null,
        participant_gender: data.participant_gender ?? null,
        participant_type: data.participant_type,
        institution_name: data.institution_name ?? null,
        department: data.department ?? null,
        custom_data: data.custom_data ?? null,
        discount_code: data.discount_code ?? null,
        source: data.source ?? 'external_app',
        referral_source: data.referral_source ?? null,
        profile_id: data.profile_id ?? null,
        learner_id: data.learner_id ?? null,
        institution_id: data.institution_id ?? null,
        organization: data.organization ?? null,
        city: data.city ?? null,
        status: 'registered',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[marathon-api/register] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create registration' }, { status: 500 });
    }

    // If external participant, upsert into event_external_participants by phone
    if (data.participant_type === 'external') {
      const { error: extError } = await supabase
        .from('event_external_participants')
        .upsert(
          {
            phone: data.participant_phone,
            name: data.participant_name,
            email: data.participant_email ?? null,
            organization: data.organization ?? data.institution_name ?? null,
            city: data.city ?? null,
            last_event_id: eventId,
          },
          { onConflict: 'phone', ignoreDuplicates: false }
        );

      if (extError) {
        // Non-fatal — registration already created
        console.warn('[marathon-api/register] External participant upsert failed:', extError);
      }
    }

    return NextResponse.json({ data: registration }, { status: 201 });
  } catch (error) {
    console.error('[marathon-api/register] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
