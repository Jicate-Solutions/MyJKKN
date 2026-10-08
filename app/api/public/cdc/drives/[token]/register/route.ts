// app/api/public/cdc/drives/[token]/register/route.ts
//
// PUBLIC, no-login registration for a CDC campus drive (/dr/<token>).
// The unguessable public_token is the only key. Before writing, this handler
// checks that the link is switched on AND the drive is still accepting
// registrations, validates every field, enforces the drive's gender
// restriction and one registration per email / mobile per drive.
//
// Pattern: app/api/public/health-surveys/[token]/submit/route.ts (public,
// per-IP rate limit, service-role, token-only auth).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_TOKEN_RE,
  isPublicRegistrationOpen,
  loadDriveByPublicToken,
  matchRegistrantToLearner,
} from '@/lib/services/cdc/drive-public-registration';
import { driveTargetGender } from '@/lib/services/cdc/drive-targeting';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENDERS = ['Male', 'Female', 'Other'];

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await params;
  if (!PUBLIC_TOKEN_RE.test(token)) return bad('Drive not found', 404);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) return bad('Too many attempts. Please wait a minute and try again.', 429);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid request');
  }

  const full_name = str(body.full_name, 150);
  const email = str(body.email, 320).toLowerCase();
  const mobile = str(body.mobile, 20).replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
  const gender = str(body.gender, 10);
  const register_number = str(body.register_number, 40) || null;
  const institution_id = str(body.institution_id, 40);
  const institution_other = str(body.institution_name, 200);
  const program_name = str(body.program_name, 200);
  const semester = str(body.semester, 30) || null;

  if (full_name.length < 2) return bad('Please enter your full name');
  if (!EMAIL_RE.test(email)) return bad('Please enter a valid email address');
  if (!/^[6-9]\d{9}$/.test(mobile)) return bad('Please enter a valid 10-digit mobile number');
  if (!GENDERS.includes(gender)) return bad('Please select your gender');
  if (program_name.length < 2) return bad('Please enter your program / branch');

  let cgpa: number | null = null;
  if (body.cgpa !== undefined && body.cgpa !== null && body.cgpa !== '') {
    cgpa = Number(body.cgpa);
    if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) return bad('CGPA must be between 0 and 10');
    cgpa = Math.round(cgpa * 100) / 100;
  }
  let arrears: number | null = null;
  if (body.arrears !== undefined && body.arrears !== null && body.arrears !== '') {
    arrears = Number(body.arrears);
    if (!Number.isInteger(arrears) || arrears < 0 || arrears > 99) return bad('Arrears must be a whole number');
  }

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const drive = await loadDriveByPublicToken(service, token);
  if (!drive) return bad('Drive not found', 404);
  if (!isPublicRegistrationOpen(drive)) return bad('Registration for this drive is closed.', 409);

  const driveGender = driveTargetGender(drive);
  if (driveGender !== 'all' && gender.toLowerCase() !== driveGender) {
    return bad(`This drive is open only to ${driveGender} candidates.`, 409);
  }

  // Institution: one of the drive's own, or a typed name ("Other").
  let institutionId: string | null = null;
  let institutionName = institution_other;
  if (institution_id && institution_id !== 'other') {
    if (!UUID_RE.test(institution_id) || !drive.institutions.includes(institution_id)) {
      return bad('Please select your institution');
    }
    const { data: inst } = await service.from('institutions').select('name').eq('id', institution_id).maybeSingle();
    if (!inst) return bad('Please select your institution');
    institutionId = institution_id;
    institutionName = inst.name as string;
  }
  if (institutionName.length < 2) return bad('Please enter your institution');

  const match = await matchRegistrantToLearner(service, drive, register_number);

  const { error } = await service.from('cdc_drive_public_registrations').insert({
    drive_id: drive.id,
    full_name,
    email,
    mobile,
    gender,
    register_number,
    institution_id: institutionId,
    institution_name: institutionName,
    program_name,
    semester,
    cgpa,
    arrears,
    learner_id: match.learner_id,
    in_audience: match.in_audience,
  });

  if (error) {
    if (error.code === '23505') {
      return bad('You have already registered for this drive with this email or mobile number.', 409);
    }
    console.error('[public cdc drive register]', error);
    return bad('Could not submit your registration. Please try again.', 500);
  }

  return NextResponse.json({ success: true });
}
