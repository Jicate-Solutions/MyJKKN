// app/api/admission/expos/bulk-capture/route.ts
// Server-side bulk capture endpoint for expo leads.
// Uses service role client to bypass RLS and avoid the 8-second PostgREST timeout.
// Processes inserts in small batches (100 rows) for reliability.
// Checks team membership before allowing capture.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import { ExpoWhatsAppService } from '@/lib/services/admission/expo-whatsapp-service';

export const maxDuration = 60;

const BATCH_SIZE = 100;

/** Clean a phone string down to digits, stripping +91 / 0 prefix */
function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '').replace(/^(\+91|0)/, '');
}

/** Validate Indian mobile number: 10 digits starting with 6-9 */
function isValidIndianPhone(phone: string): boolean {
  const clean = phone.replace(/[\s\-()]/g, '');
  return /^(\+91|0)?[6-9]\d{9}$/.test(clean);
}

export async function POST(request: NextRequest) {
  await connection();

  // Verify auth
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { leads, eventId, institutionId, capturedBy } = body as {
      leads: Array<Record<string, string>>;
      eventId: string;
      institutionId: string;
      capturedBy: string;
    };

    if (!eventId || !institutionId || !capturedBy || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, institutionId, capturedBy, leads' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // ── Verify team membership ──────────────────────────────────────────
    // Use the get_my_expo_event_ids RPC to check if capturedBy user is on the team.
    // Since we're using service role, we do a direct check on the expo_team_members table.
    const { data: teamCheck, error: teamError } = await (supabase as any)
      .from('expo_team_members')
      .select('id')
      .eq('expo_event_id', eventId)
      .or(`staff_id.eq.${capturedBy},student_id.eq.${capturedBy},learner_id.eq.${capturedBy}`)
      .limit(1);

    if (teamError) {
      console.error('[admission/expos] Team membership check failed:', teamError);
      return NextResponse.json(
        { error: 'Failed to verify team membership' },
        { status: 500 }
      );
    }

    if (!teamCheck || teamCheck.length === 0) {
      // Also allow institution admins — check if user has admin/super_admin role
      const { data: profileCheck } = await (supabase as any)
        .from('profiles')
        .select('system_role')
        .eq('id', capturedBy)
        .single();

      const isAdmin = profileCheck?.system_role === 'admin' || profileCheck?.system_role === 'super_admin';

      if (!isAdmin) {
        return NextResponse.json(
          { error: 'You are not a team member for this expo event' },
          { status: 403 }
        );
      }
    }

    // ── Fetch existing phones for duplicate detection ───────────────────
    // Pull all phones for this institution to detect duplicates efficiently
    const { data: existingLeads, error: existingError } = await (supabase as any)
      .from('admission_leads')
      .select('phone')
      .eq('institution_id', institutionId);

    if (existingError) {
      console.error('[admission/expos] Failed to fetch existing leads for dedup:', existingError);
    }

    const existingPhones = new Set<string>(
      (existingLeads || []).map((l: { phone: string }) => cleanPhone(l.phone))
    );

    // ── Validate and prepare rows ───────────────────────────────────────
    let inserted = 0;
    let duplicates = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const validRows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const rowNum = i + 2; // +2 for 1-indexed + header row

      const name = (lead.name || '').trim();
      const phone = (lead.phone || '').trim();
      const parentName = (lead.parent_name || '').trim();
      const parentPhone = (lead.parent_phone || '').trim();

      // Required field validation
      if (!name) {
        errors.push({ row: rowNum, message: 'Name is required' });
        continue;
      }
      if (!phone) {
        errors.push({ row: rowNum, message: 'Phone is required' });
        continue;
      }
      if (!isValidIndianPhone(phone)) {
        errors.push({ row: rowNum, message: `Invalid phone number: ${phone}` });
        continue;
      }
      if (!parentName) {
        errors.push({ row: rowNum, message: 'Parent name is required' });
        continue;
      }
      if (!parentPhone) {
        errors.push({ row: rowNum, message: 'Parent phone is required' });
        continue;
      }
      if (!isValidIndianPhone(parentPhone)) {
        errors.push({ row: rowNum, message: `Invalid parent phone: ${parentPhone}` });
        continue;
      }

      // Duplicate check
      const cleanedPhone = cleanPhone(phone);
      if (existingPhones.has(cleanedPhone)) {
        duplicates++;
        continue;
      }

      // Mark as seen for intra-batch dedup
      existingPhones.add(cleanedPhone);

      // Split name into first/last
      const nameParts = name.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      // Parse wa_opt_in from uploaded data (default true if not specified)
      const waRaw = (lead.wa_opt_in ?? '').toString().toLowerCase().trim();
      const waOptIn = waRaw === '' || ['yes', 'true', '1', 'y'].includes(waRaw);

      validRows.push({
        institution_id: institutionId,
        first_name: firstName,
        last_name: lastName,
        phone: cleanedPhone,
        parent_name: parentName.trim(),
        parent_phone: cleanPhone(parentPhone),
        email: (lead.email || '').trim() || null,
        district: (lead.district || '').trim() || null,
        notes: (lead.notes || '').trim() || null,
        source: 'education_fair',
        expo_event_id: eventId,
        captured_by: capturedBy,
        referral_type: 'learner_ambassador',
        referred_by_id: capturedBy,
        funnel_stage: 'new',
        wa_opt_in: waOptIn,
        ...(waOptIn && {
          wa_opt_in_at: new Date().toISOString(),
          wa_opt_in_source: 'expo_bulk_upload',
        }),
        lead_number: `LEAD-${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      });
    }

    // ── Insert in batches ───────────────────────────────────────────────
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      // Generate unique lead numbers per row in batch
      const batchWithNumbers = batch.map((row) => ({
        ...row,
        lead_number: `LEAD-${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      }));

      const { error: insertError } = await (supabase as any)
        .from('admission_leads')
        .insert(batchWithNumbers);

      if (insertError) {
        console.error(
          `[admission/expos] Bulk capture batch error (rows ${i + 1}-${i + batch.length}):`,
          insertError
        );
        for (let j = 0; j < batch.length; j++) {
          errors.push({
            row: i + j + 2,
            message: insertError.message || 'Database insert failed',
          });
        }
      } else {
        inserted += batch.length;
      }
    }

    // ── Queue WhatsApp welcome messages for opted-in leads (best-effort) ──
    if (inserted > 0) {
      try {
        // Fetch event name for template params
        const { data: expoEvent } = await (supabase as any)
          .from('expo_events')
          .select('event_name')
          .eq('id', eventId)
          .single();

        // Fetch recently inserted leads with WA consent
        const { data: waLeads } = await (supabase as any)
          .from('admission_leads')
          .select('id, first_name, last_name, phone, parent_phone, parent_name')
          .eq('expo_event_id', eventId)
          .eq('wa_opt_in', true)
          .eq('captured_by', capturedBy)
          .order('created_at', { ascending: false })
          .limit(inserted);

        if (waLeads && waLeads.length > 0) {
          // Fire WA welcomes concurrently (non-blocking, capped at 10 parallel)
          const batchSize = 10;
          for (let i = 0; i < waLeads.length; i += batchSize) {
            const waBatch = waLeads.slice(i, i + batchSize);
            await Promise.allSettled(
              waBatch.map((lead: any) =>
                ExpoWhatsAppService.sendExpoWelcome({
                  leadId: lead.id,
                  leadPhone: lead.phone,
                  leadName: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
                  parentPhone: lead.parent_phone,
                  parentName: lead.parent_name,
                  eventName: expoEvent?.event_name || 'Exhibition',
                  institutionId: institutionId,
                  expoEventId: eventId,
                })
              )
            );
          }
        }
      } catch (waErr) {
        console.warn('[admission/expos] Bulk WA welcome failed (non-blocking):', waErr);
      }
    }

    return NextResponse.json({
      success: true,
      total: leads.length,
      inserted,
      duplicates,
      errors: errors.slice(0, 50),
      errorCount: errors.length,
    });
  } catch (err) {
    console.error('[admission/expos] Bulk capture route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
