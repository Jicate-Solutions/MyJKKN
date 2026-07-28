'use client';

// ============================================================================
// CLUSTER PICKER — member selector for the Cluster lens (C4)
// ============================================================================
// Phase 1 is a manual multi-institution picker: there is no cluster→college
// mapping table in the schema, so the SELECTION is the cluster, persisted in
// the URL (?view=cluster&inst=a,b,c) so a CAC can bookmark its own view.
// Presets come from accreditation_committees committee_type='cluster' rows
// once C1 lands that type value; zero rows today renders no preset strip at
// all — graceful degradation, by design.
//
// The applied selection arrives as a SERVER prop (the page parses the URL),
// and changes are pushed back via router.replace — no useSearchParams here,
// which also sidesteps the bare-useSearchParams Suspense deploy-blocker
// entirely. The only client state is the draft checkbox set.
// ============================================================================

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ClusterInstitutionOption, ClusterPreset } from './types';

export function ClusterPicker({
  institutions,
  presets,
  appliedIds,
}: {
  institutions: ClusterInstitutionOption[];
  presets: ClusterPreset[];
  /** The selection currently applied in the URL (already validated server-side). */
  appliedIds: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Set<string>>(() => new Set(appliedIds));

  // Canonical ordering (the institutions list is name-sorted server-side) so
  // the same member set always produces the same URL — stable bookmarks.
  const canon = (ids: Set<string>) =>
    institutions.filter((i) => ids.has(i.id)).map((i) => i.id);

  const apply = (ids: string[]) => {
    const href =
      ids.length > 0
        ? `/admin/loops?view=cluster&inst=${ids.join(',')}`
        : '/admin/loops?view=cluster';
    startTransition(() => router.replace(href, { scroll: false }));
  };

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Set-equality, not order-sensitive — appliedIds keeps URL order.
  const dirty =
    draft.size !== appliedIds.length || appliedIds.some((id) => !draft.has(id));

  if (institutions.length === 0) {
    // Explicit hollow state (thesis rule) — an unreachable institutions read
    // must never render as a silently empty-but-healthy picker.
    return (
      <div className="rounded-xl border border-dashed border-amber-500/50 bg-amber-50/40 p-4 text-[13px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
        institutions unreachable — the cluster picker cannot render (hollow, not
        healthy). Reload, or check the institutions table.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${isPending ? 'opacity-60' : ''}`}>
      <p className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Cluster members — pick the institutions this CAC covers
      </p>

      {presets.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            committee presets:
          </span>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={isPending}
              onClick={() => {
                const ids = new Set(p.institutionIds);
                setDraft(ids);
                apply(canon(ids));
              }}
              className="rounded-full border border-emerald-500/50 bg-emerald-50/60 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {institutions.map((i) => (
          <label
            key={i.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors ${
              draft.has(i.id)
                ? 'border-emerald-500/60 bg-emerald-50/60 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                : 'border-border text-foreground hover:bg-muted/40'
            }`}
          >
            <input
              type="checkbox"
              checked={draft.has(i.id)}
              onChange={() => toggle(i.id)}
              disabled={isPending}
              className="h-3.5 w-3.5 flex-none accent-emerald-600"
            />
            <span className="truncate" title={i.name}>
              {i.display_name || i.name}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => apply(canon(draft))}
          disabled={isPending || !dirty}
          className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Updating…' : 'View this cluster'}
        </button>
        {appliedIds.length > 0 && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setDraft(new Set());
              apply([]);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        )}
        <span className="text-[11px] text-muted-foreground">
          the selection lives in the URL — bookmark it as this CAC&apos;s view
        </span>
      </div>
    </div>
  );
}
