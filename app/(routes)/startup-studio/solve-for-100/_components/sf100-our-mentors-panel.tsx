'use client';

/**
 * "Our mentors & investors" — team-facing, READ-ONLY panel. Shows the team the
 * mentors and investors the coordinator has assigned to them (name, role, org).
 *
 * Deliberately shows NO notes: investor notes (sf100_investor_notes) are
 * service-role-only and NEVER visible to teams. This panel calls
 * /api/startup-studio/sf100/team-mentors, which runs authenticated + membership-
 * gated (sf100_can_write_enrollment) — only members of THIS team (or an admin)
 * can see who their mentors are.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Users, Briefcase, GraduationCap } from 'lucide-react';

interface TeamMentor {
  mentorId: string;
  name: string;
  mentorType: string;
  organization: string | null;
  isInvestor: boolean;
}

const API = '/api/startup-studio/sf100/team-mentors';

export function Sf100OurMentorsPanel({ enrollmentId }: { enrollmentId: string }) {
  const [mentors, setMentors] = useState<TeamMentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}?enrollmentId=${encodeURIComponent(enrollmentId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load');
      setMentors(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-emerald-600" />
        <h3 className="text-base font-semibold text-slate-900">Our mentors &amp; investors</h3>
      </div>

      <p className="mb-3 text-sm text-slate-500">
        These are the mentors and investors your coordinator has matched with your team.
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : mentors.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No mentors assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {mentors.map((m) => (
            <div
              key={m.mentorId}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{m.name}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.isInvestor
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {m.isInvestor ? (
                      <Briefcase className="h-3 w-3" />
                    ) : (
                      <GraduationCap className="h-3 w-3" />
                    )}
                    {m.isInvestor ? 'Investor' : 'Mentor'}
                  </span>
                </div>
                {m.organization && (
                  <p className="mt-0.5 text-xs text-slate-500">{m.organization}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
