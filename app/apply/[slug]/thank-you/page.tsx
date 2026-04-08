// app/apply/[slug]/thank-you/page.tsx
// Branded confirmation page shown after form submission
// Added: 2026-04-08

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ThankYouPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: form } = await supabase
    .from('admission_forms')
    .select('name, slug, logo_url, primary_color, thank_you_title, thank_you_message')
    .eq('slug', slug)
    .single();

  if (!form) notFound();

  const primary = form.primary_color || '#1a73e8';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {form.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.logo_url} alt="Logo" className="h-16 mx-auto" />
        )}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: `${primary}20` }}
        >
          <CheckCircle2 className="w-10 h-10" style={{ color: primary }} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {form.thank_you_title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-line">
          {form.thank_you_message}
        </p>
        <p className="text-sm text-gray-500">
          Our admission team will contact you shortly via WhatsApp or phone call.
        </p>
      </div>
    </div>
  );
}
