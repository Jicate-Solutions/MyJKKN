'use client';

// ============================================================================
// OWNERS & VERDICTS — the loop registry's delegation surface
// ============================================================================
// Director decision 2026-08-12: verdict-owner delegation was decided but the
// registry had no write UI — this panel is that surface, and the first real
// owner assignment happening THROUGH it is its acceptance test.
//
// One row per loop_registry row (inactive included — an owner can be assigned
// before a loop is switched on). verdict_owner + owner_email are the ONLY two
// editable fields; everything else is read-only context. Saves go through the
// fn_loop_set_owner RPC (SECURITY DEFINER, re-checks is_super_admin() on the
// server), so the page gate is UI-only and the database is the enforcement.
// Super-admin-only rendering is inherited from ../page.tsx, which
// short-circuits for non-super-admins before any data is read.
//
// A refused save surfaces an explicit error toast (never a silent redirect),
// per the platform's permission-UX rule. On success the RPC has definitively
// applied the update (it returns FOUND), so the row's baseline is updated from
// the saved values — no client-side table read, which would depend on
// loop_registry RLS this panel doesn't need.
//
// Per-college owners (2026-09-06, Director decision): a loop can ALSO be
// owned per institution — loop_owner_scopes rows, one per (loop, institution).
// The registry owner_email stays the estate-level fallback / escalation owner
// for every institution without a scope row. Under a loop that has scopes the
// panel lists them with the institution's name, lets the SAME super-admin
// replace an owner or add one for another institution, through the sibling
// RPC fn_loop_set_scoped_owner (same is_super_admin() enforcement, same
// NULLIF(btrim) normalization — a blank email REMOVES the scope so that
// institution falls back to the registry owner). No new permission keys.
// ============================================================================

import { Fragment, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface OwnerPanelRow {
  loop_key: string;
  name: string;
  domain: string | null;
  verdict_owner: string | null;
  owner_email: string | null;
  is_active: boolean;
  /** Charter legs (outcome_metric, counter_metric, intervention,
   *  baseline_window, remeasure_window) still NULL on this row — empty array
   *  means all five are present ("chartered"). Computed server-side in
   *  ../page.tsx from the same select. */
  missing_legs: string[];
}

/** One loop_owner_scopes row, with the institution's name resolved server-side. */
export interface ScopedOwnerRow {
  loop_key: string;
  institution_id: string;
  institution_name: string;
  owner_email: string;
}

/** An institution the "add" control can scope a loop to. */
export interface InstitutionOption {
  id: string;
  name: string;
}

/** The two editable fields, as the inputs hold them (always strings). */
type Draft = { verdict_owner: string; owner_email: string };

/** Unsaved "add a college" row under one loop. */
type AddDraft = { institution_id: string; owner_email: string };

const scopeKey = (loopKey: string, institutionId: string) =>
  `${loopKey}:${institutionId}`;

/** Mirror of the RPC's NULLIF(btrim(...)) normalization, so the dirty check
 *  and the post-save baseline agree exactly with what the database stored. */
function normalize(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

export function OwnersPanel({
  rows: initialRows,
  scopes: initialScopes = [],
  institutions = [],
}: {
  rows: OwnerPanelRow[];
  /** loop_owner_scopes rows (all loops). Empty before the migration applies. */
  scopes?: ScopedOwnerRow[];
  /** Active institutions the add control may scope a loop to. */
  institutions?: InstitutionOption[];
}) {
  // loop_registry / fn_loop_set_owner aren't in the generated Database types
  // yet — use the codebase's untyped-client cast (same pattern as
  // pillars/_components/pillars-editor.tsx). Authorization is enforced inside
  // the RPC regardless.
  const supabase = useMemo(
    () => createClientSupabaseClient() as unknown as SupabaseClient,
    []
  );
  const [rows, setRows] = useState<OwnerPanelRow[]>(initialRows);
  // Unsaved edits keyed by loop_key; absent key = inputs show the saved row.
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const draftFor = (row: OwnerPanelRow): Draft =>
    edits[row.loop_key] ?? {
      verdict_owner: row.verdict_owner ?? '',
      owner_email: row.owner_email ?? '',
    };

  const isDirty = (row: OwnerPanelRow): boolean => {
    const d = draftFor(row);
    return (
      normalize(d.verdict_owner) !== (row.verdict_owner ?? null) ||
      normalize(d.owner_email) !== (row.owner_email ?? null)
    );
  };

  const patch = (key: string, row: OwnerPanelRow, p: Partial<Draft>) =>
    setEdits((e) => ({ ...e, [key]: { ...draftFor(row), ...p } }));

  async function save(row: OwnerPanelRow) {
    const d = draftFor(row);
    setBusyKey(row.loop_key);
    try {
      const { data, error } = await supabase.rpc('fn_loop_set_owner', {
        p_loop_key: row.loop_key,
        p_verdict_owner: d.verdict_owner,
        p_owner_email: d.owner_email,
      });
      if (error) {
        // Explicit refusal, never silent — the RPC raises 'not authorized'
        // when the session isn't a super admin.
        toast.error(
          /not authorized/i.test(error.message)
            ? 'Not authorized — only super administrators can assign loop owners.'
            : `Save failed for ${row.loop_key}: ${error.message}`
        );
        return;
      }
      if (data !== true) {
        toast.error(
          `No registry row matched “${row.loop_key}” — nothing was saved. Reload the page.`
        );
        return;
      }
      // The RPC applied NULLIF(btrim(...)) server-side — mirror it locally so
      // the baseline matches the database exactly.
      const saved = {
        verdict_owner: normalize(d.verdict_owner),
        owner_email: normalize(d.owner_email),
      };
      setRows((rs) =>
        rs.map((r) => (r.loop_key === row.loop_key ? { ...r, ...saved } : r))
      );
      setEdits((e) => {
        const { [row.loop_key]: _drop, ...rest } = e;
        return rest;
      });
      toast.success(
        `Saved owners for “${row.name}” — verdict: ${saved.verdict_owner ?? '(none)'}, email: ${saved.owner_email ?? '(none)'}.`
      );
    } finally {
      setBusyKey(null);
    }
  }

  // ── Per-college owners ────────────────────────────────────────────────────
  const [scopes, setScopes] = useState<ScopedOwnerRow[]>(initialScopes);
  // Unsaved email edits keyed by scopeKey(loop, institution).
  const [scopeEdits, setScopeEdits] = useState<Record<string, string>>({});
  // Unsaved "add a college" row keyed by loop_key.
  const [addDrafts, setAddDrafts] = useState<Record<string, AddDraft>>({});
  const [busyScopeKey, setBusyScopeKey] = useState<string | null>(null);

  const scopesFor = (loopKey: string) =>
    scopes
      .filter((s) => s.loop_key === loopKey)
      .sort((a, b) => a.institution_name.localeCompare(b.institution_name));

  const scopeDraft = (s: ScopedOwnerRow) =>
    scopeEdits[scopeKey(s.loop_key, s.institution_id)] ?? s.owner_email;

  const scopeDirty = (s: ScopedOwnerRow) =>
    normalize(scopeDraft(s)) !== s.owner_email;

  const addDraftFor = (loopKey: string): AddDraft =>
    addDrafts[loopKey] ?? { institution_id: '', owner_email: '' };

  /**
   * One RPC for replace, add and clear: fn_loop_set_scoped_owner upserts when
   * the email is non-blank and DELETES the scope when it is blank (that
   * institution then falls back to the registry owner). Returns true when the
   * database confirmed the write, false after an explicit error toast.
   */
  async function saveScope(
    row: OwnerPanelRow,
    institution: InstitutionOption,
    email: string
  ): Promise<boolean> {
    const key = scopeKey(row.loop_key, institution.id);
    setBusyScopeKey(key);
    try {
      const { data, error } = await supabase.rpc('fn_loop_set_scoped_owner', {
        p_loop_key: row.loop_key,
        p_institution_id: institution.id,
        p_owner_email: email,
      });
      if (error) {
        toast.error(
          /not authorized/i.test(error.message)
            ? 'Not authorized — only super administrators can assign loop owners.'
            : `Save failed for ${row.loop_key} / ${institution.name}: ${error.message}`
        );
        return false;
      }
      if (data !== true) {
        toast.error(
          `No registry row matched “${row.loop_key}” — nothing was saved. Reload the page.`
        );
        return false;
      }
      const saved = normalize(email);
      setScopes((ss) => {
        const rest = ss.filter(
          (s) => !(s.loop_key === row.loop_key && s.institution_id === institution.id)
        );
        return saved === null
          ? rest
          : [
              ...rest,
              {
                loop_key: row.loop_key,
                institution_id: institution.id,
                institution_name: institution.name,
                owner_email: saved,
              },
            ];
      });
      setScopeEdits((e) => {
        const { [key]: _drop, ...rest } = e;
        return rest;
      });
      toast.success(
        saved === null
          ? `Removed the ${institution.name} owner for “${row.name}” — it falls back to ${row.owner_email ?? 'the registry owner'}.`
          : `Saved ${institution.name} owner for “${row.name}”: ${saved}.`
      );
      return true;
    } finally {
      setBusyScopeKey(null);
    }
  }

  async function addScope(row: OwnerPanelRow) {
    const d = addDraftFor(row.loop_key);
    const institution = institutions.find((i) => i.id === d.institution_id);
    if (!institution) return;
    const ok = await saveScope(row, institution, d.owner_email);
    if (ok) {
      setAddDrafts((a) => {
        const { [row.loop_key]: _drop, ...rest } = a;
        return rest;
      });
    }
  }

  const chartered = rows.filter((r) => r.missing_legs.length === 0).length;
  const owned = rows.filter((r) => r.verdict_owner !== null).length;
  const splitLoops = new Set(scopes.map((s) => s.loop_key)).size;

  return (
    <section className="rounded-xl border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">
            Owners &amp; verdicts
          </h2>
          <p className="text-xs text-muted-foreground">
            Who owns each loop&rsquo;s verdict, and where its outcome mail goes.
            Edits save immediately through a super-admin-only database function.
            A loop split by college lists its per-college owners underneath; the
            owner email above stays the estate-level fallback for every college
            without one.
          </p>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {owned}/{rows.length} verdict-owned · {chartered}/{rows.length}{' '}
          chartered
          {splitLoops > 0 && ` · ${splitLoops} split by college`}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          The loop registry is empty or unreachable — nothing to assign.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Loop</th>
                <th className="px-2 py-2 font-medium">Domain</th>
                <th className="px-2 py-2 font-medium">Charter</th>
                <th className="px-2 py-2 font-medium">Verdict owner</th>
                <th className="px-2 py-2 font-medium">Owner email</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const d = draftFor(row);
                const busy = busyKey === row.loop_key;
                const isChartered = row.missing_legs.length === 0;
                const rowScopes = scopesFor(row.loop_key);
                const scopedIds = new Set(rowScopes.map((s) => s.institution_id));
                const addable = institutions.filter((i) => !scopedIds.has(i.id));
                const add = addDraftFor(row.loop_key);
                const addBusy =
                  busyScopeKey === scopeKey(row.loop_key, add.institution_id);
                return (
                  <Fragment key={row.loop_key}>
                  <tr
                    className={`border-b border-border/60 ${rowScopes.length === 0 ? 'last:border-0' : 'border-b-0'} ${row.is_active ? '' : 'opacity-60'}`}
                  >
                    <td className="px-4 py-2 align-top">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {row.loop_key}
                          {!row.is_active && ' · inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top text-xs text-muted-foreground">
                      {row.domain ?? '—'}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span
                        title={
                          isChartered
                            ? 'All five charter legs are filled: outcome metric, counter metric, intervention, baseline window, remeasure window.'
                            : `Missing charter legs: ${row.missing_legs.join(', ')}`
                        }
                        className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                          isChartered
                            ? 'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-amber-400/60 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300'
                        }`}
                      >
                        {isChartered ? 'chartered' : 'uncharted'}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <Input
                        aria-label={`Verdict owner for ${row.name}`}
                        value={d.verdict_owner}
                        onChange={(e) =>
                          patch(row.loop_key, row, {
                            verdict_owner: e.target.value,
                          })
                        }
                        placeholder="unassigned"
                        className="h-8 w-44 text-xs"
                        disabled={busy}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <Input
                        aria-label={`Owner email for ${row.name}`}
                        type="email"
                        value={d.owner_email}
                        onChange={(e) =>
                          patch(row.loop_key, row, {
                            owner_email: e.target.value,
                          })
                        }
                        placeholder="owner@jkkn.ac.in"
                        className="h-8 w-52 font-mono text-xs"
                        disabled={busy}
                      />
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !isDirty(row)}
                        onClick={() => save(row)}
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </Button>
                    </td>
                  </tr>
                  {rowScopes.length > 0 && (
                    <tr
                      className={`border-b border-border/60 last:border-0 ${row.is_active ? '' : 'opacity-60'}`}
                      data-testid={`scoped-owners-${row.loop_key}`}
                    >
                      <td colSpan={6} className="px-4 pb-3 pt-0">
                        <div className="ml-4 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            Per-college owners · {rowScopes.length}
                          </p>
                          <ul className="flex flex-col gap-1.5">
                            {rowScopes.map((s) => {
                              const key = scopeKey(s.loop_key, s.institution_id);
                              const sBusy = busyScopeKey === key;
                              const institution = {
                                id: s.institution_id,
                                name: s.institution_name,
                              };
                              return (
                                <li
                                  key={key}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span className="min-w-[260px] text-xs">
                                    {s.institution_name}
                                  </span>
                                  <Input
                                    aria-label={`${s.institution_name} owner for ${row.name}`}
                                    type="email"
                                    value={scopeDraft(s)}
                                    onChange={(e) =>
                                      setScopeEdits((ed) => ({
                                        ...ed,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    placeholder="blank = fall back to the owner above"
                                    className="h-7 w-64 font-mono text-xs"
                                    disabled={sBusy}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7"
                                    disabled={sBusy || !scopeDirty(s)}
                                    onClick={() =>
                                      saveScope(row, institution, scopeDraft(s))
                                    }
                                  >
                                    {sBusy
                                      ? 'Saving…'
                                      : normalize(scopeDraft(s)) === null
                                        ? 'Remove'
                                        : 'Save'}
                                  </Button>
                                </li>
                              );
                            })}
                            {addable.length > 0 && (
                              <li className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-1.5">
                                <select
                                  aria-label={`Add a college owner for ${row.name}`}
                                  value={add.institution_id}
                                  onChange={(e) =>
                                    setAddDrafts((a) => ({
                                      ...a,
                                      [row.loop_key]: {
                                        ...add,
                                        institution_id: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-7 min-w-[260px] rounded-md border border-input bg-background px-2 text-xs"
                                  disabled={addBusy}
                                >
                                  <option value="">Add a college…</option>
                                  {addable.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.name}
                                    </option>
                                  ))}
                                </select>
                                <Input
                                  aria-label={`New college owner email for ${row.name}`}
                                  type="email"
                                  value={add.owner_email}
                                  onChange={(e) =>
                                    setAddDrafts((a) => ({
                                      ...a,
                                      [row.loop_key]: {
                                        ...add,
                                        owner_email: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="principal@jkkn.ac.in"
                                  className="h-7 w-64 font-mono text-xs"
                                  disabled={addBusy}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  disabled={
                                    addBusy ||
                                    add.institution_id === '' ||
                                    normalize(add.owner_email) === null
                                  }
                                  onClick={() => addScope(row)}
                                >
                                  {addBusy ? 'Saving…' : 'Add'}
                                </Button>
                              </li>
                            )}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
