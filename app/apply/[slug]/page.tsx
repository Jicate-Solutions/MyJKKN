// app/apply/[slug]/page.tsx
// Server component — fetches form schema and renders public form client
// Added: 2026-04-08

import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import PublicFormClient from './_components/public-form-client';



interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicFormPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const getStr = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: form } = await supabase
    .from('admission_forms')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('is_active', true)
    .single();

  if (!form) notFound();

  const now = new Date();
  if (form.starts_at && new Date(form.starts_at) > now) notFound();
  if (form.expires_at && new Date(form.expires_at) < now) notFound();

  if (form.max_submissions) {
    const { count } = await supabase
      .from('admission_form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', form.id);
    if ((count ?? 0) >= form.max_submissions) notFound();
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

  // Note: programs table uses 'program_name', we project to 'name' for the client
  const { data: programsRaw } = await supabase
    .from('programs')
    .select('id, program_name, display_name, institution_id, is_active')
    .in('institution_id', institutionIds)
    .eq('is_active', true)
    .order('program_name');

  // Dedupe by (institution_id, program_name) — the table has duplicate rows
  // for the same program across academic years
  const seen = new Set<string>();
  const programs = (programsRaw ?? [])
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

  const { data: institutions } = await supabase
    .from('institutions')
    .select('id, name, logo_url')
    .in('id', institutionIds);

  const sectionsWithFields = (sections ?? []).map((s: any) => ({
    ...s,
    fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
  }));

  const filteredPrograms =
    form.program_ids?.length > 0
      ? (programs ?? []).filter((p: any) => form.program_ids.includes(p.id))
      : programs ?? [];

  return (
    <PublicFormClient
      form={{ ...form, sections: sectionsWithFields }}
      institutions={institutions ?? []}
      programs={filteredPrograms}
      utmSource={getStr(query.utm_source)}
      utmMedium={getStr(query.utm_medium)}
      utmCampaign={getStr(query.utm_campaign)}
    />
  );
}
