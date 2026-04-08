// app/api/public/forms/[slug]/route.ts
// GET — returns published form schema for public rendering (no auth required)
// Added: 2026-04-08

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: form, error: formError } = await supabase
      .from('admission_forms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const now = new Date();
    if (form.starts_at && new Date(form.starts_at) > now) {
      return NextResponse.json({ error: 'Form is not yet active' }, { status: 404 });
    }
    if (form.expires_at && new Date(form.expires_at) < now) {
      return NextResponse.json({ error: 'Form has expired' }, { status: 410 });
    }

    if (form.max_submissions) {
      const { count } = await supabase
        .from('admission_form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', form.id);
      if ((count ?? 0) >= form.max_submissions) {
        return NextResponse.json(
          { error: 'Form is no longer accepting submissions' },
          { status: 410 }
        );
      }
    }

    const { data: sections } = await supabase
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const { data: fields } = await supabase
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const institutionIds =
      form.institution_ids?.length > 0 ? form.institution_ids : [form.institution_id];

    const { data: programData } = await supabase
      .from('programs')
      .select('id, program_name, display_name, institution_id, is_active')
      .in('institution_id', institutionIds)
      .eq('is_active', true)
      .order('program_name');

    // Dedupe + project program_name -> name (programs table has duplicate rows
    // across academic years, and the client expects a 'name' field)
    const seen = new Set<string>();
    const normalized = (programData ?? [])
      .filter((p: any) => {
        const key = `${p.institution_id}::${p.program_name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((p: any) => ({
        id: p.id,
        name: p.display_name || p.program_name,
        institution_id: p.institution_id,
      }));

    const programs =
      form.program_ids?.length > 0
        ? normalized.filter((p: any) => form.program_ids.includes(p.id))
        : normalized;

    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name, logo_url')
      .in('id', institutionIds);

    const sectionsWithFields = (sections ?? []).map((s: any) => ({
      ...s,
      fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
    }));

    return NextResponse.json({
      id: form.id,
      name: form.name,
      slug: form.slug,
      description: form.description,
      logo_url: form.logo_url,
      banner_url: form.banner_url,
      primary_color: form.primary_color,
      thank_you_title: form.thank_you_title,
      thank_you_message: form.thank_you_message,
      sections: sectionsWithFields,
      institutions: institutions ?? [],
      programs,
    });
  } catch (error: any) {
    console.error('[public/forms] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
