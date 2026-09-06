'use client';

/**
 * External-portal investor notes — renders inside an investor's team card on the
 * /external dashboard. An external contact with mentor_type='investor' can record
 * private diligence notes (with an interest level) on a team they are assigned to,
 * and see their own past notes. Mentors (canWrite=false) see nothing.
 *
 * Self-contained: talks only to /api/startup-studio/external/notes (external
 * JWT-cookie session, no Supabase session). The server verifies the caller is
 * assigned to `enrollmentId` and is an investor before returning/writing — this
 * component never sees another team's notes. Notes are private to the investor:
 * teams and mentors cannot read them. Lightweight local state (no radix).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, NotebookPen, Plus, Check } from 'lucide-react';

const INTEREST_LEVELS = ['high', 'medium', 'low', 'passed'] as const;
type InterestLevel = (typeof INTEREST_LEVELS)[number];

interface Note {
  id: string;
  enrollmentId: string;
  mentorId: string;
  mentorName: string | null;
  note: string;
  interestLevel: InterestLevel;
  createdAt: string;
}

const API = '/api/startup-studio/external/notes';

const INTEREST_LABEL: Record<InterestLevel, string> = {
  high: 'High interest',
  medium: 'Medium',
  low: 'Low',
  passed: 'Passed',
};

const INTEREST_BADGE: Record<InterestLevel, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-600',
  passed: 'bg-rose-100 text-rose-700',
};

const INTEREST_PILL_ACTIVE: Record<InterestLevel, string> = {
  high: 'bg-emerald-600 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-slate-600 text-white',
  passed: 'bg-rose-600 text-white',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ExternalInvestorNotes({ enrollmentId }: { enrollmentId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [interestLevel, setInterestLevel] = useState<InterestLevel>('high');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}?enrollmentId=${encodeURIComponent(enrollmentId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load notes');
      setNotes(Array.isArray(json.data?.notes) ? json.data.notes : []);
      setCanWrite(Boolean(json.data?.canWrite));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!note.trim()) {
      setError('Write a note before saving.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, note: note.trim(), interestLevel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to save note');
      setNote('');
      setInterestLevel('high');
      setAdding(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  // While loading we don't yet know if the viewer is an investor. Keep it quiet:
  // a subtle inline spinner rather than a big block inside the team card.
  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading notes…
      </div>
    );
  }

  // Mentors (not investors) and any non-writer with nothing to show: render nothing.
  if (!canWrite && notes.length === 0) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <NotebookPen className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-800">My investor notes</h3>
          <span className="text-[11px] text-slate-400">(private)</span>
        </div>
        {canWrite && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add note
          </button>
        )}
      </div>

      {canWrite && adding && (
        <div className="mb-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {INTEREST_LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setInterestLevel(lvl)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  interestLevel === lvl
                    ? INTEREST_PILL_ACTIVE[lvl]
                    : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {INTEREST_LABEL[lvl]}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Your private note on this team…"
            rows={3}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save note
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNote('');
                setError(null);
              }}
              className="h-9 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {notes.length === 0 ? (
        <p className="py-2 text-xs text-slate-400">
          No notes yet. Add your first note on this team above.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-slate-100 p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    INTEREST_BADGE[n.interestLevel] ?? INTEREST_BADGE.low
                  }`}
                >
                  {INTEREST_LABEL[n.interestLevel] ?? n.interestLevel}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatDate(n.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{n.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
