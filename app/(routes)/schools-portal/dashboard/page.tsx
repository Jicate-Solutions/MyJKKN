'use client';

/**
 * /schools-portal/dashboard
 *
 * HM-facing summary view of their school:
 *   - School snapshot (name, district, status, intake year)
 *   - JKKN in-charge contacts (school_jkkn_owners with role + program partner)
 *   - Contributions JKKN/partners delivered to the school
 *   - Sessions JKKN conducted at the school
 *
 * All data comes from GET /api/schools-portal/me, which is scoped to the
 * HM's school_id via the school_portal_session cookie.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  Gift,
  IndianRupee,
  LogOut,
  Pencil,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ApiPayload {
  ok: boolean;
  error?: string;
  school: SchoolSummary | null;
  selfContact: SelfContact | null;
  recentSessions: SessionRow[];
  contributions: ContributionRow[];
  jkknOwners: OwnerRow[];
}

interface SchoolSummary {
  id: string;
  name: string;
  district: string | null;
  state: string | null;
  status: string;
  intake_year: number | null;
  address: string | null;
  ownership: string;
}

interface SelfContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  role?: { code: string; label: string } | { code: string; label: string }[];
}

interface SessionRow {
  id: string;
  conducted_at: string;
  attendee_count: number;
  topic: string | null;
  notes: string | null;
  session_type:
    | { code: string; label: string }
    | { code: string; label: string }[];
  program_partner: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface ContributionRow {
  id: string;
  kind: string;
  description: string;
  value_inr: number | null;
  delivered_at: string | null;
  evidence_url: string | null;
  program_partner: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface OwnerRow {
  id: string;
  role: string;
  assigned_at: string;
  program_partner: { id: string; name: string } | { id: string; name: string }[] | null;
  jkkn_user:
    | { id: string; full_name: string | null; email: string | null; phone: string | null }
    | { id: string; full_name: string | null; email: string | null; phone: string | null }[]
    | null;
}

function pickOne<T>(joined: T | T[] | null | undefined): T | null {
  if (!joined) return null;
  if (Array.isArray(joined)) return joined[0] ?? null;
  return joined;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatInr(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function SchoolsPortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/schools-portal/me', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/schools-portal/login');
        return;
      }
      const json = (await res.json().catch(() => ({}))) as ApiPayload;
      if (!res.ok || !json.ok) {
        setError(json.error || 'Failed to load your school');
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/schools-portal/auth/logout', { method: 'POST' });
    } catch {
      // Even on failure we still bounce to login — cookie may already be gone.
    }
    router.replace('/schools-portal/login');
  }, [router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data?.school) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="mx-auto mb-3 w-fit rounded-full bg-rose-100 p-2 text-rose-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-[#11243a]">
            We couldn't load your school
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ??
              'Your portal access may have been revoked. Contact the JKKN team if this looks wrong.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
            <Button onClick={() => void logout()} className="bg-[#0b6d41] hover:bg-[#0e7a49]">
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const school = data.school;
  const selfContact = data.selfContact;
  const ownersList: OwnerRow[] = data.jkknOwners ?? [];
  const sessionsList: SessionRow[] = data.recentSessions ?? [];
  const contributionsList: ContributionRow[] = data.contributions ?? [];

  const totalContributedInr = contributionsList.reduce(
    (sum, c) => sum + (c.value_inr ?? 0),
    0,
  );
  const totalAttendees = sessionsList.reduce(
    (sum, s) => sum + (s.attendee_count ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#0b6d41]" />
              <h1 className="text-xl font-semibold text-[#11243a]">
                {school.name}
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[school.district, school.state].filter(Boolean).join(', ') ||
                'Location not on file'}
              {school.intake_year ? ` · Network since ${school.intake_year}` : null}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#0b6d41]/10 px-2 py-0.5 text-xs font-medium text-[#0b6d41] capitalize">
              {school.status}
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/schools-portal/update-contact">
                <Pencil className="mr-2 h-4 w-4" /> Update contact
              </Link>
            </Button>
            <Button onClick={() => void logout()} variant="ghost">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>

        {selfContact && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Signed in as
            </p>
            <p className="mt-0.5 font-medium">
              {selfContact.name}
              {(() => {
                const role = pickOne(selfContact.role);
                return role?.label ? (
                  <span className="ml-2 text-xs text-slate-500">
                    {role.label}
                  </span>
                ) : null;
              })()}
            </p>
            <p className="text-xs text-slate-500">{selfContact.email}</p>
          </div>
        )}
      </section>

      {/* Stat strip */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Sessions conducted"
          value={sessionsList.length.toString()}
          hint={`${totalAttendees} attendees`}
          icon={<CalendarDays className="h-4 w-4 text-[#0b6d41]" />}
        />
        <StatCard
          label="Contributions delivered"
          value={contributionsList.length.toString()}
          hint={formatInr(totalContributedInr)}
          icon={<Gift className="h-4 w-4 text-[#0b6d41]" />}
        />
        <StatCard
          label="JKKN in-charge contacts"
          value={ownersList.length.toString()}
          hint="Click below for details"
          icon={<UserRound className="h-4 w-4 text-[#0b6d41]" />}
        />
      </section>

      {/* JKKN owners */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your JKKN in-charge contacts
        </h2>
        {ownersList.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No JKKN contact has been assigned yet. If you need help, reply to
            the email that brought you here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {ownersList.map((owner) => {
              const user = pickOne(owner.jkkn_user);
              const partner = pickOne(owner.program_partner);
              return (
                <li
                  key={owner.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-[#11243a]">
                      {user?.full_name || 'JKKN staff'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {titleCase(owner.role)}
                      {partner ? ` · ${partner.name}` : null}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    {user?.email ? (
                      <a
                        href={`mailto:${user.email}`}
                        className="block text-[#0b6d41] hover:underline"
                      >
                        {user.email}
                      </a>
                    ) : null}
                    {user?.phone ? (
                      <a
                        href={`tel:${user.phone}`}
                        className="block text-muted-foreground"
                      >
                        {user.phone}
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Contributions */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contributions delivered
        </h2>
        {contributionsList.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No contributions on file yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {contributionsList.map((c) => {
              const partner = pickOne(c.program_partner);
              return (
                <li key={c.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[#11243a]">
                        {c.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {titleCase(c.kind)} · Delivered {formatDate(c.delivered_at)}
                        {partner ? ` · via ${partner.name}` : null}
                      </p>
                    </div>
                    <p className="inline-flex items-center text-sm font-semibold text-[#0b6d41]">
                      <IndianRupee className="h-4 w-4" />
                      {c.value_inr !== null
                        ? new Intl.NumberFormat('en-IN', {
                            maximumFractionDigits: 0,
                          }).format(c.value_inr)
                        : '—'}
                    </p>
                  </div>
                  {c.evidence_url && (
                    <a
                      href={c.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-[#0b6d41] hover:underline"
                    >
                      View evidence ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Sessions */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sessions JKKN conducted at your school
        </h2>
        {sessionsList.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No sessions logged yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sessionsList.map((s) => {
              const type = pickOne(s.session_type);
              const partner = pickOne(s.program_partner);
              return (
                <li key={s.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[#11243a]">
                        {type?.label || 'Session'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.conducted_at)} · {s.attendee_count}{' '}
                        attendees
                        {partner ? ` · via ${partner.name}` : null}
                      </p>
                    </div>
                  </div>
                  {s.topic && (
                    <p className="mt-2 text-sm text-slate-700">{s.topic}</p>
                  )}
                  {s.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
        {icon} {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-[#11243a]">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
