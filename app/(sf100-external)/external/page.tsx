import { redirect } from 'next/navigation';
import { Target, Users, TrendingUp, Briefcase } from 'lucide-react';
import {
  getExternalSession,
  resolveAssignedEnrollmentIds,
} from '@/lib/utils/external-access';
import { getTeamsSummary } from '@/lib/services/startup-studio/sf100-mentor-assign-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ExternalLogoutButton } from './_components/external-logout-button';
import { ExternalInvestorNotes } from './_components/external-investor-notes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ExternalDashboardPage() {
  const session = await getExternalSession();
  // Belt-and-suspenders: the proxy already gates /external/*, but never render
  // team data without a verified session.
  if (!session) redirect('/external/login');

  const db = createServiceRoleClient();
  const { data: me } = await db
    .from('ss_mentors')
    .select('name, mentor_type, organization')
    .eq('id', session.mentorId)
    .maybeSingle();

  const enrollmentIds = await resolveAssignedEnrollmentIds(session.mentorId);
  const teams = await getTeamsSummary(enrollmentIds);
  const isInvestor = me?.mentor_type === 'investor';

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jkkn.png" alt="JKKN" className="h-8 w-auto object-contain" />
            <span className="hidden text-sm font-semibold text-slate-700 sm:inline">
              Solve for 100
            </span>
          </div>
          <ExternalLogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              Welcome{me?.name ? `, ${me.name}` : ''}
            </h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isInvestor
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              <Briefcase className="h-3 w-3" />
              {isInvestor ? 'Investor' : 'Mentor'}
            </span>
          </div>
          {me?.organization && (
            <p className="mt-0.5 text-sm text-slate-500">{me.organization}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {teams.length === 0
              ? 'You have not been assigned to a team yet. Your coordinator will assign you shortly.'
              : `You are supporting ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}.`}
          </p>
        </div>

        <div className="space-y-3">
          {teams.map((t) => {
            const pct = Math.min(
              100,
              Math.round((t.paidUsers / Math.max(1, t.paidUserTarget)) * 100)
            );
            return (
              <div
                key={t.enrollmentId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {t.teamName}
                    </h2>
                    {t.programName && (
                      <p className="mt-0.5 text-xs text-slate-400">{t.programName}</p>
                    )}
                  </div>
                  {t.currentPhase && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                      {t.currentPhase.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>

                {t.problem && (
                  <p className="mt-3 line-clamp-3 text-sm text-slate-600">{t.problem}</p>
                )}

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Paid users
                    </span>
                    <span className="font-semibold text-slate-700">
                      {t.paidUsers} / {t.paidUserTarget}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {pct}% to goal
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    SF100 team
                  </span>
                </div>

                {isInvestor && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ExternalInvestorNotes enrollmentId={t.enrollmentId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
