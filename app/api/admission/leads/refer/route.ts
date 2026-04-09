// POST /api/admission/leads/refer — Public agent referral submission (no auth)
// Rate limited: accepts referrals without login for agents/consultants

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { IntegrationService } from '@/lib/services/admission/integration-service';
import { logger } from '@/lib/utils/enhanced-logger';

// Simple in-memory rate limiter (per IP, 10 submissions per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600000 }); // 1 hour
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate required fields
    const errors: { field: string; message: string }[] = [];
    if (!body.student_name?.trim()) errors.push({ field: 'student_name', message: 'Student name is required' });
    if (!body.student_phone?.trim()) errors.push({ field: 'student_phone', message: 'Student phone is required' });
    if (!body.agent_name?.trim()) errors.push({ field: 'agent_name', message: 'Your name is required' });
    if (!body.agent_phone?.trim()) errors.push({ field: 'agent_phone', message: 'Your phone is required' });

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors[0].message, errors }, { status: 400 });
    }

    // Validate phone format
    const phoneRegex = /^[6-9]\d{9}$/;
    const cleanStudentPhone = body.student_phone.trim().replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
    if (!phoneRegex.test(cleanStudentPhone)) {
      return NextResponse.json(
        { success: false, error: 'Invalid student phone number. Enter a 10-digit mobile number.' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Default institution — JKKN (look up from institutions table or use config)
    // For multi-tenant: pass institution via query param ?institution=JKKN
    const institutionSlug = request.nextUrl.searchParams.get('institution') || 'JKKN';
    const { data: institution } = await supabase
      .from('institutions')
      .select('id')
      .ilike('name', `%${institutionSlug}%`)
      .limit(1)
      .maybeSingle();

    // Fallback: use the first active institution
    let institutionId = institution?.id;
    if (!institutionId) {
      const { data: fallback } = await supabase
        .from('institutions')
        .select('id')
        .limit(1)
        .single();
      institutionId = fallback?.id;
    }

    if (!institutionId) {
      return NextResponse.json(
        { success: false, error: 'Institution not found' },
        { status: 400 }
      );
    }

    // Process the lead
    const result = await IntegrationService.processInboundLead(
      {
        name: body.student_name.trim(),
        phone: cleanStudentPhone,
        email: body.student_email?.trim() || undefined,
        interested_program: body.interested_program?.trim() || undefined,
        source: 'agent',
        referred_by_name: body.agent_name.trim(),
        referred_by_phone: body.agent_phone.trim(),
        notes: body.notes?.trim() || undefined,
      },
      institutionId,
      null, // No specific integration — this is the generic agent form
      supabase
    );

    logger.info('admission/integrations', 'Agent referral submitted', {
      agent: body.agent_name,
      student_phone: cleanStudentPhone.substring(0, 4) + '******',
      result: result.success ? (result.is_duplicate ? 'duplicate' : 'created') : 'error',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      reference: result.reference,
      is_duplicate: result.is_duplicate,
    });
  } catch (error: any) {
    logger.error('admission/integrations', 'Agent referral failed', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
