// app/api/public/courses/[slug]/route.ts
//
// GET — the PUBLIC view of one course: details, package tiers with their
// instalment schedules, and the forms currently accepting applications.
//
// Deliberately thin. The projection — which is the real security boundary on
// this surface, since anon is revoked on every course table and RLS therefore
// gates nothing here — lives in lib/services/courses/public-course-loader.ts,
// shared with the public pages so the two cannot drift apart.
//
// A draft course 404s: publishing is what makes a course readable by URL.

import { NextRequest, NextResponse } from 'next/server';
import { loadPublicCourse } from '@/lib/services/courses/public-course-loader';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const course = await loadPublicCourse(slug);
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(course);
  } catch (e) {
    console.error('[api/public/courses] unexpected:', e);
    return NextResponse.json({ error: 'Could not load the course' }, { status: 500 });
  }
}
