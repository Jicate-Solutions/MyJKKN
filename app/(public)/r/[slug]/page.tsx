// app/(public)/r/[slug]/page.tsx
//
// PUBLIC Routing Form page — Universal Booking M1 (Calendly "Routing Forms").
//
// A visitor (no login) fills the form; their answers route them to a
// destination (a scheduling link, an external URL, or a rich message). The
// server component loads only the PUBLIC subset of the form via the anon RPC
// fn_get_active_routing_form (institution ids / host internals never reach the
// client). Rule evaluation + the response write happen in the submit API route.
//
// Explicit "not found / inactive" state when the slug is unknown — never a
// silent redirect (rule #27).
//
// Pattern: app/(public)/book/[slug]/page.tsx (public, no sidebar, no auth).

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { RoutingFormWidget, type PublicRoutingField } from './_components/routing-form-widget';

export const dynamic = 'force-dynamic';

interface RoutingPageProps {
  params: Promise<{ slug: string }>;
}

interface PublicForm {
  id: string;
  slug: string;
  title: string;
  headline: string | null;
  description: string | null;
  fields: PublicRoutingField[];
}

async function loadForm(slug: string): Promise<PublicForm | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await supabase.rpc('fn_get_active_routing_form', {
    p_slug: slug,
  });
  if (error) {
    console.error('[r/[slug]] load failed:', error.message);
    return null;
  }
  if (!data) return null;

  const doc = data as Record<string, unknown>;
  const fields = Array.isArray(doc.fields)
    ? (doc.fields as PublicRoutingField[]).filter(
        (f) =>
          f &&
          typeof f.key === 'string' &&
          typeof f.label === 'string' &&
          (f.type === 'text' || f.type === 'select' || f.type === 'multiselect'),
      )
    : [];

  return {
    id: String(doc.id),
    slug: String(doc.slug),
    title: String(doc.title ?? 'Routing form'),
    headline: (doc.headline as string | null) ?? null,
    description: (doc.description as string | null) ?? null,
    fields,
  };
}

export async function generateMetadata({ params }: RoutingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const form = await loadForm(slug);
  return {
    title: form ? `${form.title} · JKKN` : 'Form not found · JKKN',
    robots: { index: false },
  };
}

export default async function PublicRoutingFormPage({ params }: RoutingPageProps) {
  const { slug } = await params;
  const form = await loadForm(slug);

  if (!form) {
    // Explicit not-found state — never a silent redirect (rule #27).
    return (
      <div className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]">
        <div className="h-2 w-full bg-[#0E4D34]" />
        <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] w-full max-w-md flex-col items-center justify-center px-5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
            JKKN Institutions
          </p>
          <h1
            className="mt-3 text-2xl text-[#0E4D34]"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
          >
            Form not available
          </h1>
          <p className="mt-2 max-w-xs text-sm text-[#1C2B24]/65">
            This form does not exist or has been turned off. Please check the link
            or contact the office you were trying to reach.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RoutingFormWidget
      slug={form.slug}
      title={form.title}
      headline={form.headline}
      description={form.description}
      fields={form.fields}
    />
  );
}
