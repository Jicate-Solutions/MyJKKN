'use client';

import { useEffect, useMemo, useState } from 'react';

interface Section {
  id: string;
  section_name: string | null;
  // "Programme · Semester · Section" — disambiguates the many identically-named
  // sections (e.g. "G" exists in 4 Year and in CRRI). Supplied by the API.
  label: string | null;
  // false = archived section that still has enrolled learners. Shown with an
  // "(archived)" tag and sorted last (the API orders active first) so a Senior Learner
  // can still deliberately assign to it. Absent/true = active.
  is_active?: boolean;
}
interface Assignment {
  section_id: string;
  due_at: string | null;
}

const BRAND_GREEN = '#0b6d41';

export function CaseAssignForm({ caseId }: { caseId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<'open' | 'class_only'>('open');
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueAt, setDueAt] = useState<string>('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/pde/cases/${caseId}/assign`, { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Load failed (${res.status})`);
        const data = (await res.json()) as {
          visibility_mode: 'open' | 'class_only';
          assignments: Assignment[];
          sections: Section[];
        };
        if (!alive) return;
        setVisibility(data.visibility_mode ?? 'open');
        setSections(data.sections ?? []);
        setSelected(new Set((data.assignments ?? []).map((a) => a.section_id)));
        const firstDue = (data.assignments ?? []).find((a) => a.due_at)?.due_at ?? null;
        setDueAt(firstDue ? firstDue.slice(0, 10) : '');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [caseId]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return sections;
    return sections.filter((s) =>
      (s.label ?? s.section_name ?? '').toLowerCase().includes(f),
    );
  }, [sections, filter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/pde/cases/${caseId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility_mode: visibility,
          section_ids: visibility === 'class_only' ? [...selected] : [...selected],
          // A date-only pick ("2026-07-22") means "due by the END of that day,
          // India time" — not UTC midnight, which would lock the case at ~5:30 AM
          // IST that morning and cost learners the whole due day. JKKN is
          // India-only, so a fixed IST offset (+05:30, no DST) is correct here.
          due_at: dueAt ? new Date(`${dueAt}T23:59:59.999+05:30`).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      const notified = typeof data.notified === 'number' ? data.notified : 0;
      setOk(
        visibility === 'class_only'
          ? `Saved. ${data.assigned_sections ?? 0} section(s) assigned, ${notified} learner(s) notified.`
          : `Saved. This case is open to everyone; ${data.assigned_sections ?? 0} section(s) highlighted, ${notified} learner(s) notified.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mt-6 rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Visibility */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Who can see this case?</h2>
        <div className="mt-3 space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
            <input type="radio" name="vis" checked={visibility === 'open'} onChange={() => setVisibility('open')} className="mt-0.5" />
            <span>
              <span className="font-medium">Open to everyone</span>
              <span className="block text-xs text-muted-foreground">Every enrolled learner can open it. Assigning a section below just sends a nudge.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
            <input type="radio" name="vis" checked={visibility === 'class_only'} onChange={() => setVisibility('class_only')} className="mt-0.5" />
            <span>
              <span className="font-medium">Only the sections I choose</span>
              <span className="block text-xs text-muted-foreground">Hidden from everyone except the sections you pick below (plus anyone who already started it).</span>
            </span>
          </label>
        </div>
      </section>

      {/* Sections + due date */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {visibility === 'class_only' ? 'Which sections?' : 'Nudge which sections? (optional)'}
          </h2>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        </div>

        <label className="mt-3 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Due date (optional)</span>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm sm:w-56"
          />
        </label>

        <input
          type="text"
          placeholder="Search by programme, year, or section…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mt-4 block w-full rounded-md border px-3 py-2 text-sm"
        />

        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No sections found.</p>
          ) : (
            filtered.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="flex flex-wrap items-center gap-2">
                  <span className={s.is_active === false ? 'text-muted-foreground' : undefined}>
                    {s.label || s.section_name || s.id.slice(0, 8)}
                  </span>
                  {s.is_active === false ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                      archived
                    </span>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </div>
        {visibility === 'class_only' && selected.size === 0 ? (
          <p className="mt-2 text-xs text-amber-700">Pick at least one section — otherwise no learner can see this case.</p>
        ) : null}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm" style={{ color: BRAND_GREEN }}>{ok}</p> : null}

      <button
        type="button"
        onClick={save}
        // A locked case with no sections would be hidden from everyone — block the
        // save here too (the API rejects it as well) so it can't happen by accident.
        disabled={saving || (visibility === 'class_only' && selected.size === 0)}
        className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        {saving ? 'Saving…' : 'Save assignment'}
      </button>
    </div>
  );
}
