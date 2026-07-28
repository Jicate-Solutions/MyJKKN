'use client';

/**
 * SF100 Investor Notes — coordinator/NIF read-only surface.
 *
 * Investors record private interest notes on the SF100 teams they are assigned
 * to (write happens on the external investor dashboard). Coordinators/NIF staff
 * see those notes here to gauge investor interest per team — READ ONLY.
 *
 * Self-contained: pick a team (from GET /sf100/external-mentors → data.teams),
 * then GET /sf100/investor-notes?enrollmentId=… (gated by
 * startup_studio.sf100.member.create). No radix — plain fetch + local state.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingUp, StickyNote, Building2 } from 'lucide-react';

interface Note {
  id: string;
  enrollmentId: string;
  mentorId: string;
  mentorName: string;
  note: string;
  interestLevel: 'high' | 'medium' | 'low' | 'passed' | string;
  createdAt: string;
}
interface Team {
  enrollmentId: string;
  teamName: string;
}

const API = '/api/startup-studio/sf100';

const INTEREST: Record<string, { label: string; cls: string }> = {
  high: { label: 'High interest', cls: 'bg-emerald-100 text-emerald-800' },
  medium: { label: 'Medium interest', cls: 'bg-amber-100 text-amber-800' },
  low: { label: 'Low interest', cls: 'bg-slate-100 text-slate-600' },
  passed: { label: 'Passed', cls: 'bg-rose-100 text-rose-700' },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Sf100InvestorNotesPanel() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [enrollmentId, setEnrollmentId] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const res = await fetch(`${API}/external-mentors`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load teams');
      setTeams(json.data.teams ?? []);
    } catch (e) {
      setTeamsError(e instanceof Error ? e.message : 'Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const loadNotes = useCallback(async (id: string) => {
    if (!id) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    setNotesError(null);
    try {
      const res = await fetch(`${API}/investor-notes?enrollmentId=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load notes');
      setNotes(json.data ?? []);
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes(enrollmentId);
  }, [enrollmentId, loadNotes]);

  const selectedTeam = teams.find((t) => t.enrollmentId === enrollmentId);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Investor notes</h3>
        <p className="text-sm text-slate-500">
          Private interest notes investors record on the teams they are assigned. Read-only —
          pick a team to see how investors rated them.
        </p>
      </div>

      <div className="max-w-md">
        {teamsLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading teams…
          </div>
        ) : teamsError ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{teamsError}</div>
        ) : (
          <select
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Select a team…</option>
            {teams.map((t) => (
              <option key={t.enrollmentId} value={t.enrollmentId}>
                {t.teamName}
              </option>
            ))}
          </select>
        )}
      </div>

      {!enrollmentId ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          Choose a team above to view investor notes.
        </div>
      ) : notesLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
        </div>
      ) : notesError ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notesError}</div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No investor notes yet for{' '}
          <span className="font-medium text-slate-600">{selectedTeam?.teamName ?? 'this team'}</span>.
        </div>
      ) : (
        <div className="space-y-2.5">
          {notes.map((n) => {
            const interest = INTEREST[n.interestLevel] ?? {
              label: n.interestLevel,
              cls: 'bg-slate-100 text-slate-600',
            };
            return (
              <div
                key={n.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{n.mentorName}</div>
                      <div className="text-xs text-slate-400">{fmtDate(n.createdAt)}</div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${interest.cls}`}
                  >
                    <TrendingUp className="h-3 w-3" />
                    {interest.label}
                  </span>
                </div>
                {n.note && (
                  <div className="mt-2 flex gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p className="whitespace-pre-wrap">{n.note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
