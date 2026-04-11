export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/register
// Public endpoint — creates a new registration for the marathon.
// No auth required. Generates BIB number automatically.
//
// External users  → identified by phone; upserted into event_external_participants.
//                   Returning participants get auto-filled profile data.
// Internal users  → require profile_id or learner_id.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { publicRegistrationSchema } from '@/lib/validations/events';
import { ExternalParticipantService } from '@/lib/services/events/core/external-participant-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createServiceRoleClient();

    // Parse and validate body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Normalize field aliases from external apps:
    //   phone → participant_phone, age → participant_age, gender → participant_gender
    //   tshirt_size / date_of_birth → merged into custom_data
    if (body.phone && !body.participant_phone) body.participant_phone = body.phone;
    if (body.age && !body.participant_age) body.participant_age = body.age;
    if (body.gender && !body.participant_gender) body.participant_gender = body.gender;
    if (body.tshirt_size || body.date_of_birth) {
      const existing = (body.custom_data ?? {}) as Record<string, unknown>;
      if (body.tshirt_size) existing.tshirt_size = body.tshirt_size;
      if (body.date_of_birth) existing.date_of_birth = body.date_of_birth;
      body.custom_data = existing;
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

    // Internal users must supply at least one identity anchor
    if (data.participant_type === 'internal' && !data.profile_id && !data.learner_id) {
      return NextResponse.json(
        { error: 'Internal registrations require profile_id or learner_id' },
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

    // =========================================================================
    // External participant: upsert profile and resolve ID
    // =========================================================================
    let external_participant_id: string | null = null;

    if (data.participant_type === 'external') {
      try {
        const extParticipant = await ExternalParticipantService.createOrUpdate({
          full_name: data.participant_name,
          phone: data.participant_phone,
          email: data.participant_email,
          age: data.participant_age,
          gender: data.participant_gender,
          organization: data.organization ?? data.institution_name,
          city: data.city,
        });
        external_participant_id = extParticipant.id;
      } catch {
        // Non-fatal — we still create the registration without linking
        console.warn(
          '[marathon-api/register] External participant upsert failed; continuing without link'
        );
      }
    }

    // =========================================================================
    // Generate BIB number: T(10K), F(5K paid), K(5K free)
    // =========================================================================
    const catCode = (category.code ?? category.name.substring(0, 3)).toUpperCase();
    const feeAmount = category.fee_amount ?? 0;
    const paymentStatus = feeAmount > 0 ? 'paid' : 'not_required';
    const bibPrefix = catCode === '10K' ? 'T'
      : (catCode === '5K' && paymentStatus === 'not_required') ? 'K' : 'F';

    const { count: seqCount } = await supabase
      .from('events_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .like('bib_number', `${bibPrefix}%`);

    const seq = (seqCount ?? 0) + 1;
    const eventYear = event.year ?? new Date().getFullYear();
    const bib_number = catCode === '10K'
      ? `T${String(seq).padStart(3, '0')}`
      : paymentStatus === 'not_required'
        ? `K${String(seq + 2000).padStart(4, '0')}`
        : `F${String(seq + 500).padStart(4, '0')}`;

    // =========================================================================
    // Insert registration
    // =========================================================================
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
        // Internal user anchors
        profile_id: data.participant_type === 'internal' ? (data.profile_id ?? null) : null,
        learner_id: data.participant_type === 'internal' ? (data.learner_id ?? null) : null,
        institution_id: data.participant_type === 'internal' ? (data.institution_id ?? null) : null,
        // External participant link
        external_participant_id,
        status: 'registered',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[marathon-api/register] Insert error:', insertError.message, insertError.details, insertError.hint);
      return NextResponse.json(
        { error: 'Failed to create registration', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: registration }, { status: 201 });
  } catch (error) {
    console.error('[marathon-api/register] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
