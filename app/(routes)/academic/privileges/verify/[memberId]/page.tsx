/**
 * Public Privilege Card verification landing.
 * URL: /academic/privileges/verify/[memberId]
 *
 * Scanned from the QR code on the printed card. Session NOT required —
 * anyone with the URL can verify. Exposes only non-sensitive fields
 * (no phone numbers, no DOB, no address).
 *
 * Shows: learner name, institution, active privileges, "Valid as of <now>" stamp.
 *
 * Created: 2026-04-21
 */

import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface VerifyPageProps {
  params: Promise<{ memberId: string }>;
}

interface VerifyData {
  learner_name: string;
  institution_name: string | null;
  program_name: string | null;
  roll_number: string | null;
  active_privileges: Array<{
    group_name: string;
    reference_code: string;
    renewal_status: string;
    privilege_types: string[];
  }>;
  anyPending: boolean;
}

async function fetchVerifyData(memberId: string): Promise<VerifyData | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
    return null;
  }

  // Service-role is used here because this route intentionally bypasses RLS —
  // verification must work for anyone who scans the QR. Only non-sensitive
  // fields are exposed.
  const supabase = createServiceRoleClient() as any;

  const { data: member } = await supabase
    .from('privilege_members')
    .select('learner_id, status')
    .eq('id', memberId)
    .maybeSingle();

  if (!member || member.status !== 'active') return null;

  const learnerId = member.learner_id;

  const { data: learner } = await supabase
    .from('learners_profiles')
    .select('first_name, last_name, roll_number, institution_id, program_id')
    .eq('id', learnerId)
    .maybeSingle();

  if (!learner) return null;

  const [instRes, progRes, memberships] = await Promise.all([
    learner.institution_id
      ? supabase.from('institutions').select('name').eq('id', learner.institution_id).maybeSingle()
      : Promise.resolve({ data: null }),
    learner.program_id
      ? supabase.from('programs').select('program_name').eq('id', learner.program_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('privilege_members')
      .select(
        `id, status, renewal_status,
         group:privilege_groups!privilege_members_group_id_fkey(
           id, name, reference_code, status,
           privilege_group_types(privilege_type:privilege_types(name))
         )`,
      )
      .eq('learner_id', learnerId)
      .eq('status', 'active')
      .in('renewal_status', ['active', 'pending_report', 'pending_review', 'paused']),
  ]);

  const rows = Array.isArray(memberships.data) ? memberships.data : [];
  const active_privileges = rows
    .filter((r: any) => r.group?.status === 'active')
    .map((r: any) => ({
      group_name: r.group.name,
      reference_code: r.group.reference_code,
      renewal_status: r.renewal_status ?? 'active',
      privilege_types: (r.group.privilege_group_types ?? [])
        .map((gt: any) => gt.privilege_type?.name)
        .filter(Boolean),
    }));

  return {
    learner_name: [learner.first_name, learner.last_name].filter(Boolean).join(' ') || 'Learner',
    institution_name: (instRes.data as any)?.name ?? null,
    program_name: (progRes.data as any)?.program_name ?? null,
    roll_number: learner.roll_number ?? null,
    active_privileges,
    anyPending: active_privileges.some(
      (p) => p.renewal_status === 'pending_report' || p.renewal_status === 'pending_review',
    ),
  };
}

export default async function VerifyPrivilegePage({ params }: VerifyPageProps) {
  const { memberId } = await params;
  const data = await fetchVerifyData(memberId);
  if (!data) notFound();

  const validAsOf = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isValid = data.active_privileges.length > 0;

  return (
    <main className="min-h-screen bg-[#fbfbee] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Header band */}
        <div className="rounded-t-xl bg-[#0b6d41] px-6 py-5 text-white">
          <h1 className="text-xl font-bold tracking-wide">JKKN Institutions</h1>
          <p className="text-sm text-white/80">Privilege Card Verification</p>
        </div>
        <div className="h-1 w-full bg-[#ffde59]" />

        {/* Body */}
        <div className="rounded-b-xl border border-[#0b6d41]/20 bg-white px-6 py-8 shadow-sm">
          {/* Status banner */}
          <div
            className={
              isValid
                ? 'flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3'
                : 'flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3'
            }
          >
            {isValid ? (
              <ShieldCheck className="h-6 w-6 text-green-700" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-red-700" />
            )}
            <div>
              <p className={isValid ? 'font-semibold text-green-900' : 'font-semibold text-red-900'}>
                {isValid ? 'Valid Privilege Card' : 'No Active Privileges'}
              </p>
              <p className={isValid ? 'text-xs text-green-700' : 'text-xs text-red-700'}>
                Checked {validAsOf}
              </p>
            </div>
          </div>

          {/* Learner block */}
          <div className="mt-6 space-y-1">
            <h2 className="text-2xl font-bold text-gray-900">{data.learner_name}</h2>
            {data.roll_number && (
              <p className="text-sm text-gray-600">Roll No: {data.roll_number}</p>
            )}
            {data.program_name && <p className="text-sm text-gray-600">{data.program_name}</p>}
            {data.institution_name && (
              <p className="text-sm font-medium text-[#0b6d41]">{data.institution_name}</p>
            )}
          </div>

          {/* Privileges */}
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#0b6d41]">
              Active Privileges ({data.active_privileges.length})
            </h3>
            {data.active_privileges.length === 0 ? (
              <p className="text-sm text-gray-500">No active privileges on record.</p>
            ) : (
              <ul className="space-y-3">
                {data.active_privileges.map((p, idx) => (
                  <li
                    key={`${p.reference_code}-${idx}`}
                    className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{p.group_name}</p>
                        {p.privilege_types.length > 0 && (
                          <p className="mt-1 text-xs text-gray-600">
                            {p.privilege_types.join(' · ')}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">Ref: {p.reference_code}</p>
                      </div>
                      <StatusPill status={p.renewal_status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.anyPending && (
            <div className="mt-6 flex items-start gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Some of this learner's privileges are under review. They remain active while the
                committee evaluates the current monthly report.
              </span>
            </div>
          )}

          <p className="mt-8 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
            This verification reflects live data at the time of scan.
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-green-100 text-green-800' },
    pending_report: { label: 'Renewal Due', cls: 'bg-amber-100 text-amber-800' },
    pending_review: { label: 'Under Review', cls: 'bg-blue-100 text-blue-800' },
    paused: { label: 'Paused', cls: 'bg-gray-200 text-gray-700' },
  };
  const meta = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
