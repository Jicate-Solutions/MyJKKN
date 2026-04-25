export const dynamic = 'force-dynamic';

// app/api/admission/expos/bulk-capture/route.ts
// Server-side bulk capture endpoint for expo leads.
// Uses service role client to bypass RLS and avoid the 8-second PostgREST timeout.
// Processes inserts in small batches (100 rows) for reliability.
// Checks team membership before allowing capture.
// Updated: 2026-04-24 — Added institution/program name resolution, twelfth_group, visit_type.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import { ExpoWhatsAppService } from '@/lib/services/admission/expo-whatsapp-service';

export const maxDuration = 60;

const BATCH_SIZE = 100;

function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '').replace(/^(\+91|0)/, '');
}

function isValidIndianPhone(phone: string): boolean {
  const clean = phone.replace(/[\s\-()]/g, '');
  return /^(\+91|0)?[6-9]\d{9}$/.test(clean);
}

/** Strip "Institution — " prefix that the Excel dropdown injects into program names */
function stripInstPrefix(raw: string): string {
  return raw.includes(' — ') ? raw.split(' — ').slice(1).join(' — ').trim() : raw.trim();
}

export async function POST(request: NextRequest) {
  await connection();

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
    const { data: teamCheck, error: teamError } = await (supabase as any)
      .from('expo_event_team_members')
      .select('id')
      .eq('expo_event_id', eventId)
      .or(`staff_id.eq.${capturedBy},student_id.eq.${capturedBy}`)
      .limit(1);

    if (teamError) {
      console.error('[admission/expos] Team membership check failed:', teamError);
      return NextResponse.json(
        { error: 'Failed to verify team membership' },
        { status: 500 }
      );
    }

    if (!teamCheck || teamCheck.length === 0) {
      const { data: profileCheck } = await (supabase as any)
        .from('profiles')
        .select('role, is_super_admin')
        .eq('id', capturedBy)
        .single();

      const { data: userRoles } = await (supabase as any)
        .from('user_roles')
        .select('role_id, custom_roles!inner(role_key, permissions)')
        .eq('user_id', capturedBy);

      // Mirror is_admin() SQL function semantics: super_admin column OR role in (admin/super_admin/administrator).
      // Not using is_admin() RPC directly because this check targets `capturedBy` (may differ from auth.uid()).
      const isAdmin = profileCheck?.is_super_admin === true
        || ['admin', 'super_admin', 'administrator'].includes(profileCheck?.role || '');

      const isAdmissionRole = isAdmin || (userRoles || []).some(
        (ur: any) => ur.custom_roles?.permissions?.['admission.leads.create'] === true
          || ur.custom_roles?.role_key === 'admission'
      );

      if (!isAdmin && !isAdmissionRole) {
        return NextResponse.json(
          { error: 'You are not a team member for this expo event' },
          { status: 403 }
        );
      }
    }

    // ── Pre-fetch lookup tables for name resolution ─────────────────────
    const [
      { data: allInstitutions },
      { data: allPrograms },
      { data: existingLeads },
    ] = await Promise.all([
      (supabase as any).from('institutions').select('id, name').eq('is_active', true),
      (supabase as any).from('programs').select('id, program_name, display_name, institution_id').eq('is_active', true),
      (supabase as any).from('admission_leads').select('phone').eq('institution_id', institutionId),
    ]);

    // Build case-insensitive lookup maps
    const institutionByName = new Map<string, string>(
      (allInstitutions || []).map((i: { id: string; name: string }) => [
        i.name.toLowerCase().trim(),
        i.id,
      ])
    );

    // Programs indexed by name (display_name preferred) — value is { id, institution_id }
    const programByName = new Map<string, { id: string; institution_id: string }>(
      (allPrograms || []).map((p: {
        id: string;
        program_name: string;
        display_name: string | null;
        institution_id: string;
      }) => [
        (p.display_name || p.program_name).toLowerCase().trim(),
        { id: p.id, institution_id: p.institution_id },
      ])
    );
    // Also index by program_name as fallback
    (allPrograms || []).forEach((p: {
      id: string;
      program_name: string;
      display_name: string | null;
      institution_id: string;
    }) => {
      const key = p.program_name.toLowerCase().trim();
      if (!programByName.has(key)) {
        programByName.set(key, { id: p.id, institution_id: p.institution_id });
      }
    });

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
      const rowNum = i + 2;

      const name = (lead.name || '').trim();
      const phone = (lead.phone || '').trim();
      const parentName = (lead.parent_name || '').trim();
      const parentPhone = (lead.parent_phone || '').trim();

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
      if (parentPhone && !isValidIndianPhone(parentPhone)) {
        errors.push({ row: rowNum, message: `Invalid parent phone: ${parentPhone}` });
        continue;
      }

      const cleanedPhone = cleanPhone(phone);
      if (existingPhones.has(cleanedPhone)) {
        duplicates++;
        continue;
      }
      existingPhones.add(cleanedPhone);

      // ── Resolve institution ───────────────────────────────────────────
      let resolvedInstitutionId = institutionId; // fallback: expo's institution
      const institutionNameRaw = (lead.institution_name || '').trim();
      if (institutionNameRaw) {
        const found = institutionByName.get(institutionNameRaw.toLowerCase());
        if (found) resolvedInstitutionId = found;
      }

      // ── Resolve programs ──────────────────────────────────────────────
      const programIds: string[] = [];
      for (const key of ['program_1', 'program_2', 'program_3'] as const) {
        const raw = (lead[key] || '').trim();
        if (!raw) continue;

        // Strip the "Institution — " prefix that the Excel dropdown adds
        const cleanName = stripInstPrefix(raw).toLowerCase();

        let match = programByName.get(cleanName);

        // If no exact match, try substring match within the resolved institution
        if (!match) {
          for (const [name, prog] of programByName.entries()) {
            if (name.includes(cleanName) || cleanName.includes(name)) {
              if (!resolvedInstitutionId || prog.institution_id === resolvedInstitutionId) {
                match = prog;
                break;
              }
            }
          }
        }

        if (match && !programIds.includes(match.id)) {
          programIds.push(match.id);
        }
      }

      // ── Parse visit_type ──────────────────────────────────────────────
      const visitRaw = (lead.visit_type || '').toLowerCase().trim();
      let visitType: string | null = null;
      if (visitRaw === 'expo_visit' || visitRaw === 'expo visit') visitType = 'expo_visit';
      else if (visitRaw === 'stall_visit' || visitRaw === 'stall visit') visitType = 'stall_visit';

      // ── Build insert row ──────────────────────────────────────────────
      const nameParts = name.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      const waRaw = (lead.wa_opt_in ?? '').toString().toLowerCase().trim();
      const waOptIn = waRaw === '' || ['yes', 'true', '1', 'y'].includes(waRaw);

      validRows.push({
        institution_id: resolvedInstitutionId,
        first_name: firstName,
        last_name: lastName,
        full_name: name,
        phone: cleanedPhone,
        parent_name: parentName || null,
        parent_phone: parentPhone ? cleanPhone(parentPhone) : null,
        email: (lead.email || '').trim() || null,
        district: (lead.district || '').trim() || null,
        twelfth_group: (lead.twelfth_group || '').trim() || null,
        interested_programs: programIds.length > 0 ? programIds : null,
        visit_type: visitType,
        notes: (lead.notes || '').trim() || null,
        source: 'education_fair',
        expo_event_id: eventId,
        captured_by: capturedBy,
        referral_type: 'student',
        referred_by_id: capturedBy,
        funnel_stage: 'new',
        wa_opt_in: waOptIn,
        ...(waOptIn && {
          wa_opt_in_at: new Date().toISOString(),
          wa_opt_in_source: 'expo_bulk_upload',
        }),
      });
    }

    // ── Insert in batches ───────────────────────────────────────────────
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      const { error: insertError } = await (supabase as any)
        .from('admission_leads')
        .insert(batch);

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

    // ── Queue WhatsApp welcome messages (best-effort) ───────────────────
    if (inserted > 0) {
      try {
        const { data: expoEvent } = await (supabase as any)
          .from('expo_events')
          .select('event_name')
          .eq('id', eventId)
          .single();

        const { data: waLeads } = await (supabase as any)
          .from('admission_leads')
          .select('id, first_name, last_name, phone, parent_phone, parent_name')
          .eq('expo_event_id', eventId)
          .eq('wa_opt_in', true)
          .eq('captured_by', capturedBy)
          .order('created_at', { ascending: false })
          .limit(inserted);

        if (waLeads && waLeads.length > 0) {
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
