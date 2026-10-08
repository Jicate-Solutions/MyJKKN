// app/dr/[token]/page.tsx
//
// PUBLIC, no-login registration page for a CDC campus drive. A CDC team member
// switches the link on from the drive page and shares it (or its QR) over
// WhatsApp / email; a visitor opens it, sees the drive and registers once.
//
// Pattern: app/ws/[token]/page.tsx — public, force-dynamic, robots noindex,
// service-role read of a narrow column set, notFound() on miss.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Briefcase, Building2, CalendarDays, IndianRupee, MapPin } from 'lucide-react';

import {
  PUBLIC_TOKEN_RE,
  buildPublicDriveView,
  loadDriveByPublicToken,
} from '@/lib/services/cdc/drive-public-registration';
import { PublicDriveRegistration } from './_components/public-drive-registration';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Campus Drive Registration · JKKN',
    description: 'Register for a JKKN campus drive.',
    robots: { index: false, follow: false },
  };
}

function formatDate(d: string | null): string | null {
  if (!d) return null;
  const date = new Date(`${d}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export default async function PublicDrivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!PUBLIC_TOKEN_RE.test(token)) notFound();

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const drive = await loadDriveByPublicToken(service, token);
  if (!drive) notFound();
  const view = await buildPublicDriveView(service, drive);

  const date = formatDate(view.drive_date);
  const facts: Array<{ icon: typeof Briefcase; label: string; value: string }> = [];
  if (view.job_role_title) facts.push({ icon: Briefcase, label: 'Role', value: view.job_role_title });
  if (view.expected_package_lpa != null) facts.push({ icon: IndianRupee, label: 'Package', value: `${view.expected_package_lpa} LPA` });
  if (date) {
    facts.push({
      icon: CalendarDays,
      label: 'Drive date',
      value: view.drive_start_time ? `${date}, ${view.drive_start_time.slice(0, 5)}` : date,
    });
  }
  if (view.venue_label || view.job_location) {
    facts.push({ icon: MapPin, label: view.venue_label ? 'Venue' : 'Job location', value: (view.venue_label || view.job_location)! });
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbfa] to-[#eef4f3] px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-[760px] space-y-5">
        <header className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">JKKN · Campus Drive</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{view.title}</h1>
          {view.recruiter_name ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <Building2 className="h-4 w-4 shrink-0" /> {view.recruiter_name}
            </p>
          ) : null}
          {view.description ? <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{view.description}</p> : null}
          {facts.length > 0 ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
                  <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div className="min-w-0">
                    <dt className="text-xs text-slate-500">{f.label}</dt>
                    <dd className="text-sm font-medium text-slate-900">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          ) : null}
          {view.gender !== 'all' ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This drive is open to <strong>{view.gender}</strong> candidates only.
            </p>
          ) : null}
        </header>

        {view.open ? (
          <PublicDriveRegistration token={token} institutions={view.institutions} gender={view.gender} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            Registration for this drive is closed. Thank you for your interest.
          </div>
        )}
        <footer className="pb-4 text-center text-xs text-slate-400">JKKN · Career Development Centre</footer>
      </div>
    </main>
  );
}
