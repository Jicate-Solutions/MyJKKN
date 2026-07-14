'use client';

/**
 * "Our training needs" — team-facing panel. A team records what help it needs
 * (pitching / tech / finance / legal / marketing / other + a note), which feeds
 * the coordinator's "assign a fitting mentor" step (spec §3, D4).
 *
 * All calls go to /api/startup-studio/sf100/training-needs, which runs on the
 * authenticated RLS client — only ACCEPTED members of THIS team (or an admin)
 * can read/write, enforced by the sf100_training_needs policies. `canEdit`
 * hides the write controls on read-only surfaces (e.g. public transparency).
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, Check, Archive, HeartHandshake } from 'lucide-react';

const CATEGORIES = ['pitching', 'tech', 'finance', 'legal', 'marketing', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

interface Need {
  id: string;
  category: Category;
  detail: string | null;
  status: 'open' | 'addressed' | 'archived';
  created_at: string;
}

const API = '/api/startup-studio/sf100/training-needs';

const CATEGORY_LABEL: Record<Category, string> = {
  pitching: 'Pitching',
  tech: 'Tech',
  finance: 'Finance',
  legal: 'Legal',
  marketing: 'Marketing',
  other: 'Other',
};

export function Sf100TrainingNeedsPanel({
  enrollmentId,
  canEdit = true,
}: {
  enrollmentId: string;
  canEdit?: boolean;
}) {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<Category>('pitching');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}?enrollmentId=${encodeURIComponent(enrollmentId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load');
      setNeeds(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, category, detail: detail.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to add');
      setDetail('');
      setAdding(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: Need['status']) => {
    const res = await fetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) void load();
  };

  const openNeeds = needs.filter((n) => n.status === 'open');
  const doneNeeds = needs.filter((n) => n.status !== 'open');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-slate-900">Our training needs</h3>
        </div>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      <p className="mb-3 text-sm text-slate-500">
        Tell your coordinator what help your team needs — they’ll match you with a
        fitting mentor or investor.
      </p>

      {canEdit && adding && (
        <div className="mb-4 space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  category === c
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Describe what you need (optional)…"
            rows={2}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setDetail('');
              }}
              className="h-9 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : needs.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No training needs recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {openNeeds.map((n) => (
            <NeedRow key={n.id} need={n} canEdit={canEdit} onStatus={setStatus} />
          ))}
          {doneNeeds.length > 0 && (
            <div className="pt-2">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                Addressed / archived
              </p>
              {doneNeeds.map((n) => (
                <NeedRow key={n.id} need={n} canEdit={canEdit} onStatus={setStatus} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NeedRow({
  need,
  canEdit,
  onStatus,
}: {
  need: Need;
  canEdit: boolean;
  onStatus: (id: string, s: Need['status']) => void;
}) {
  const dim = need.status !== 'open';
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-2.5 ${
        dim ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0">
        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
          {CATEGORY_LABEL[need.category]}
        </span>
        {need.detail && <p className="mt-1 text-sm text-slate-600">{need.detail}</p>}
        {need.status !== 'open' && (
          <span className="mt-0.5 inline-block text-xs capitalize text-slate-400">
            {need.status}
          </span>
        )}
      </div>
      {canEdit && need.status === 'open' && (
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onStatus(need.id, 'addressed')}
            title="Mark addressed"
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => onStatus(need.id, 'archived')}
            title="Archive"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
