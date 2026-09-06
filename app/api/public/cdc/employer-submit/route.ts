// app/api/public/cdc/employer-submit/route.ts
// PUBLIC (no auth) — a company self-submits a job vacancy + skills requirement.
// Writes via the service-role client so the cdc_employer_requirements tables need
// NO anon grants. Every public submission lands as status='pending_review' and is
// invisible to students until a CDC coordinator approves it (moderation gate).
//
// Anti-abuse: a hidden honeypot field (company_fax) silently drops bots, and a
// short-window duplicate guard blocks accidental / scripted double-submits.
// Full IP rate-limiting would need edge middleware — noted as a follow-up.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { PublicEmployerSubmitInput, CreateRoleInput } from '@/types/cdc/employer-requirements';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ROLES = 10;
const MAX_SKILLS = 30;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function sanitizeSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== 'string') continue;
    const t = s.trim().slice(0, 60);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

const ALLOWED_EXP = new Set(['fresher', 'experienced', 'any']);
const ALLOWED_MODE = new Set(['in_person', 'remote', 'hybrid']);

export async function POST(request: NextRequest) {
  try {
    let body: PublicEmployerSubmitInput;
    try {
      body = (await request.json()) as PublicEmployerSubmitInput;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Honeypot — real users never see/fill company_fax; bots do. Silently accept
    // (return a plausible success) but do not persist, so bots don't learn.
    if (typeof body.company_fax === 'string' && body.company_fax.trim() !== '') {
      return NextResponse.json({ success: true, reference: 'RECEIVED', roleCount: 0 });
    }

    const companyName = clip(body.company_name, 200);
    if (!companyName || companyName.length < 2) {
      return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });
    }

    if (!Array.isArray(body.roles) || body.roles.length === 0) {
      return NextResponse.json({ error: 'Add at least one role.' }, { status: 400 });
    }
    if (body.roles.length > MAX_ROLES) {
      return NextResponse.json({ error: `A single submission can hold at most ${MAX_ROLES} roles.` }, { status: 400 });
    }

    // Normalise roles; every role needs a title.
    const roles = body.roles.map((r: CreateRoleInput, i: number) => {
      const title = clip(r.role_title, 150);
      const exp = typeof r.experience_level === 'string' && ALLOWED_EXP.has(r.experience_level) ? r.experience_level : 'any';
      const mode = typeof r.work_mode === 'string' && ALLOWED_MODE.has(r.work_mode) ? r.work_mode : null;
      const years = typeof r.experience_min_years === 'number' && r.experience_min_years >= 0 && r.experience_min_years <= 60
        ? Math.floor(r.experience_min_years) : null;
      const openings = typeof r.openings_count === 'number' && r.openings_count > 0 && r.openings_count <= 9999
        ? Math.floor(r.openings_count) : 1;
      const pkg = typeof r.package_lpa === 'number' && r.package_lpa >= 0 && r.package_lpa <= 100000 ? r.package_lpa : null;
      return {
        title,
        description: clip(r.description, 5000),
        skills: sanitizeSkills(r.skills),
        experience_level: exp,
        experience_min_years: years,
        education_text: clip(r.education_text, 500),
        package_lpa: pkg,
        benefits: clip(r.benefits, 2000),
        work_mode: mode,
        location: clip(r.location, 200),
        openings_count: openings,
        display_order: i,
      };
    });
    if (roles.some((r) => !r.title)) {
      return NextResponse.json({ error: 'Every role needs a title.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('[public/cdc/employer-submit] missing Supabase service env');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const svc = createClient(url, key);

    const contactEmail = clip(body.primary_contact_email, 200);

    // Duplicate guard: same company (+ same contact email if given) submitted in
    // the last 10 minutes → treat as an accidental / scripted double-submit.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let dupQuery = svc
      .from('cdc_employer_requirements')
      .select('id', { count: 'exact', head: true })
      .ilike('company_name', companyName)
      .gte('created_at', tenMinAgo);
    if (contactEmail) dupQuery = dupQuery.ilike('primary_contact_email', contactEmail);
    const { count: dupCount } = await dupQuery;
    if ((dupCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'It looks like you just submitted this — we have it. Please wait before submitting again.' },
        { status: 429 }
      );
    }

    // Insert the header (pending_review — invisible to students until approved).
    const { data: req, error: reqErr } = await svc
      .from('cdc_employer_requirements')
      .insert({
        company_name: companyName,
        company_website: clip(body.company_website, 300),
        hq_city: clip(body.hq_city, 120),
        hq_state: clip(body.hq_state, 120),
        primary_contact_name: clip(body.primary_contact_name, 150),
        primary_contact_email: contactEmail,
        primary_contact_phone: clip(body.primary_contact_phone, 40),
        secondary_contact_name: clip(body.secondary_contact_name, 150),
        secondary_contact_phone: clip(body.secondary_contact_phone, 40),
        source: 'public_portal',
        status: 'pending_review',
      })
      .select('id')
      .single();

    if (reqErr || !req) {
      console.error('[public/cdc/employer-submit] header insert failed:', reqErr?.message);
      return NextResponse.json({ error: 'Could not save your submission. Please try again.' }, { status: 500 });
    }

    const { error: rolesErr } = await svc.from('cdc_employer_requirement_roles').insert(
      roles.map((r) => ({
        requirement_id: req.id,
        role_title: r.title,
        description: r.description,
        skills: r.skills,
        experience_level: r.experience_level,
        experience_min_years: r.experience_min_years,
        education_text: r.education_text,
        package_lpa: r.package_lpa,
        benefits: r.benefits,
        work_mode: r.work_mode,
        location: r.location,
        openings_count: r.openings_count,
        display_order: r.display_order,
      }))
    );

    if (rolesErr) {
      // Roll back the orphan header so a failed roles insert doesn't leave a
      // header with no roles in the moderation queue.
      await svc.from('cdc_employer_requirements').delete().eq('id', req.id);
      console.error('[public/cdc/employer-submit] roles insert failed:', rolesErr.message);
      return NextResponse.json({ error: 'Could not save your roles. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, reference: req.id, roleCount: roles.length });
  } catch (e) {
    console.error('[public/cdc/employer-submit] unexpected error:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
