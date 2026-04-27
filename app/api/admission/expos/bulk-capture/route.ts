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
      // Mirror the 3-step semantics of user_has_permission() in
      // supabase/setup/02_functions.sql so this check accepts EVERY user the
      // database itself would let through:
      //   1. is_super_admin / admin / administrator (full bypass)
      //   2. any user_roles row whose custom_roles JSONB has the perm = true
      //   3. legacy: profiles.role joined to a custom_role whose JSONB has it
      // Step 3 is what was missing — admission/admission_staff users seeded
      // before the multi-role migration carry their role in profiles.role
      // only and have no user_roles row, so they were 403'd here despite
      // user_has_permission('admission.leads.create') returning true for
      // them at the SQL layer. Confirmed via DB query 2026-04-27 — 2 such
      // users (1 admission + 1 admission_staff) would fail right now.
      const { data: profileCheck } = await (supabase as any)
        .from('profiles')
        .select('role, is_super_admin')
        .eq('id', capturedBy)
        .single();

      const { data: userRoles } = await (supabase as any)
        .from('user_roles')
        .select('role_id, custom_roles!inner(role_key, permissions)')
        .eq('user_id', capturedBy);

      const isAdmin =
        profileCheck?.is_super_admin === true ||
        profileCheck?.role === 'super_admin' ||
        profileCheck?.role === 'admin' ||
        profileCheck?.role === 'administrator';

      // Step 2: user_roles → custom_roles permissions JSONB
      const hasUserRolesGrant = (userRoles || []).some(
        (ur: any) =>
          ur.custom_roles?.permissions?.['admission.leads.create'] === true,
      );

      // Step 3: legacy fallback — profiles.role → custom_roles permissions
      let hasLegacyRoleGrant = false;
      if (!isAdmin && !hasUserRolesGrant && profileCheck?.role) {
        const { data: legacyRole } = await (supabase as any)
          .from('custom_roles')
          .select('permissions')
          .eq('role_key', profileCheck.role)
          .maybeSingle();
        hasLegacyRoleGrant =
          legacyRole?.permissions?.['admission.leads.create'] === true;
      }

      if (!isAdmin && !hasUserRolesGrant && !hasLegacyRoleGrant) {
        return NextResponse.json(
          {
            error:
              'Insufficient permission. You must be on this expo event team or have admission.leads.create permission.',
          },
          { status: 403 },
        );
      }
    }

    // ── Pre-fetch lookup tables for name resolution ─────────────────────
    // Note: existingLeads phone lookup intentionally removed (2026-04-25)
    // to support "upload everything" mode — duplicates are allowed.
    const [
      { data: allInstitutions },
      { data: allPrograms },
    ] = await Promise.all([
      (supabase as any).from('institutions').select('id, name').eq('is_active', true),
      (supabase as any).from('programs').select('id, program_name, display_name, institution_id').eq('is_active', true),
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

    // ── Prepare rows (validation removed 2026-04-25) ────────────────────
    // The data-owner explicitly opted out of all app-level validation:
    // missing name / blank or non-Indian phone / duplicate phone are now
    // accepted. The DB still enforces NOT NULL on phone & institution_id
    // and the visit_type enum — those failures (if any) come back from
    // the batch insert and are reported per-row.
    let inserted = 0;
    const duplicates = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const validRows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      const name = (lead.name || '').trim();
      const phone = (lead.phone || '').trim();
      const parentName = (lead.parent_name || '').trim();
      const parentPhone = (lead.parent_phone || '').trim();

      const cleanedPhone = phone ? cleanPhone(phone) : '';

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
