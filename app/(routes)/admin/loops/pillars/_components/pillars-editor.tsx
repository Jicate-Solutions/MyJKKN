'use client';

// Client editor for the mission_pillars config table. One card per pillar; each
// field is editable and saved on demand via the browser (session-scoped) Supabase
// client, so the mission_pillars RLS write policy (is_super_admin/is_admin) re-checks
// every write. "Remove" is a soft-delete (is_active=false) — nothing is hard-deleted,
// so a pillar can always be restored. After every mutation the list is re-fetched
// so the screen never shows an optimistic value the database rejected.

import { useCallback, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CoverageStatus = 'covered' | 'partial' | 'gap' | 'excluded';

export type PillarRow = {
  id: string;
  pillar_key: string;
  name: string;
  anchor_quote: string | null;
  source_url: string | null;
  covering_loops: string[];
  coverage_status: CoverageStatus;
  display_order: number;
  is_active: boolean;
  notes: string | null;
};

type LoopOption = { loop_key: string; name: string };

const STATUS_OPTIONS: { value: CoverageStatus; label: string }[] = [
  { value: 'covered', label: 'Covered' },
  { value: 'partial', label: 'Partial' },
  { value: 'gap', label: 'Gap' },
  { value: 'excluded', label: 'Excluded (not counted)' },
];

// Coverage weight — mirrors the /admin/loops strip cell exactly so the editor and
// the tower can never disagree: covered = 1, partial = 0.5, everything else = 0.
function statusWeight(s: CoverageStatus): number {
  return s === 'covered' ? 1 : s === 'partial' ? 0.5 : 0;
}

const STATUS_TONE: Record<CoverageStatus, string> = {
  covered: 'border-emerald-400/50 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20',
  partial: 'border-amber-400/50 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20',
  gap: 'border-red-300/60 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/15',
  excluded: 'border-border bg-muted/20',
};

function freshPillar(order: number): PillarRow {
  return {
    id: '',
    pillar_key: '',
    name: '',
    anchor_quote: '',
    source_url: '',
    covering_loops: [],
    coverage_status: 'gap',
    display_order: order,
    is_active: true,
    notes: '',
  };
}

export function PillarsEditor({
  initialPillars,
  loopOptions,
  tableMissing = false,
}: {
  initialPillars: PillarRow[];
  loopOptions: LoopOption[];
  tableMissing?: boolean;
}) {
  // `mission_pillars` is not in the generated Database types yet, so use the
  // codebase's untyped-client cast (same pattern as cdc/mentors/new) for reads
  // and writes. RLS still enforces the write policy server-side.
  const supabase = useMemo(
    () => createClientSupabaseClient() as unknown as SupabaseClient,
    []
  );
  const [pillars, setPillars] = useState<PillarRow[]>(initialPillars);
  const [drafts, setDrafts] = useState<PillarRow[]>([]); // unsaved new rows
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('mission_pillars')
      .select(
        'id, pillar_key, name, anchor_quote, source_url, covering_loops, coverage_status, display_order, is_active, notes'
      )
      .order('display_order', { ascending: true });
    if (error) {
      setBanner({ tone: 'err', text: `Could not reload pillars: ${error.message}` });
      return;
    }
    setPillars((data ?? []) as PillarRow[]);
  }, [supabase]);

  // Live coverage — active pillars only, same formula as the tower strip.
  const coverage = useMemo(() => {
    const active = pillars.filter((p) => p.is_active);
    const total = active.length;
    const score = active.reduce((sum, p) => sum + statusWeight(p.coverage_status), 0);
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    return { total, score, pct };
  }, [pillars]);

  async function saveExisting(row: PillarRow) {
    setBusyId(row.id);
    setBanner(null);
    const { error } = await supabase
      .from('mission_pillars')
      .update({
        name: row.name.trim(),
        anchor_quote: emptyToNull(row.anchor_quote),
        source_url: emptyToNull(row.source_url),
        covering_loops: row.covering_loops,
        coverage_status: row.coverage_status,
        display_order: row.display_order,
        is_active: row.is_active,
        notes: emptyToNull(row.notes),
      })
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      setBanner({ tone: 'err', text: `Save failed for ${row.pillar_key}: ${error.message}` });
      return;
    }
    setBanner({ tone: 'ok', text: `Saved “${row.name.trim() || row.pillar_key}”.` });
    await refetch();
  }

  async function insertDraft(draft: PillarRow, draftIndex: number) {
    const key = draft.pillar_key.trim();
    const name = draft.name.trim();
    if (!key || !name) {
      setBanner({ tone: 'err', text: 'A new pillar needs both a key and a name.' });
      return;
    }
    setBusyId(`draft-${draftIndex}`);
    setBanner(null);
    const { error } = await supabase.from('mission_pillars').insert({
      pillar_key: key,
      name,
      anchor_quote: emptyToNull(draft.anchor_quote),
      source_url: emptyToNull(draft.source_url),
      covering_loops: draft.covering_loops,
      coverage_status: draft.coverage_status,
      display_order: draft.display_order,
      is_active: draft.is_active,
      notes: emptyToNull(draft.notes),
    });
    setBusyId(null);
    if (error) {
      const dup = /duplicate key|unique/i.test(error.message);
      setBanner({
        tone: 'err',
        text: dup
          ? `A pillar with key “${key}” already exists.`
          : `Add failed: ${error.message}`,
      });
      return;
    }
    setDrafts((d) => d.filter((_, i) => i !== draftIndex));
    setBanner({ tone: 'ok', text: `Added “${name}”.` });
    await refetch();
  }

  async function setActive(row: PillarRow, active: boolean) {
    setBusyId(row.id);
    setBanner(null);
    const { error } = await supabase
      .from('mission_pillars')
      .update({ is_active: active })
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      setBanner({ tone: 'err', text: `Could not ${active ? 'restore' : 'remove'} ${row.pillar_key}: ${error.message}` });
      return;
    }
    setBanner({
      tone: 'ok',
      text: active ? `Restored “${row.name}”.` : `Removed “${row.name}” (soft-delete — can be restored).`,
    });
    await refetch();
  }

  const patchPillar = (id: string, patch: Partial<PillarRow>) =>
    setPillars((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const patchDraft = (i: number, patch: Partial<PillarRow>) =>
    setDrafts((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const nextOrder =
    (pillars.reduce((m, p) => Math.max(m, p.display_order), 0) || 0) + 10;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Mission Pillars</h1>
        <p className="text-sm text-muted-foreground">
          The JKKN mission-pillar map, editable without a deploy. The Loop Control
          Tower reports coverage against these rows. Changes save immediately.
        </p>
      </header>

      {/* Coverage summary — the exact number the tower strip shows. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Coverage · active pillars
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {coverage.total > 0
              ? `${trimNum(coverage.score)} of ${coverage.total} pillars · ${coverage.pct}%`
              : 'no active pillars'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          covered = 1 · partial = 0.5 · gap/excluded = 0
        </span>
      </div>

      {tableMissing && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50/60 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
          The <code>mission_pillars</code> table is not on the database yet — the
          migration is validated but pending apply. The editor works, but there is
          nothing to show until the table lands.
        </div>
      )}

      {banner && (
        <div
          role="status"
          className={`rounded-md border p-3 text-sm ${
            banner.tone === 'ok'
              ? 'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-red-400/70 bg-red-50/70 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setDrafts((d) => [...d, freshPillar(nextOrder)])}
        >
          + Add pillar
        </Button>
      </div>

      {drafts.map((draft, i) => (
        <PillarCard
          key={`draft-${i}`}
          row={draft}
          loopOptions={loopOptions}
          isNew
          busy={busyId === `draft-${i}`}
          onPatch={(patch) => patchDraft(i, patch)}
          onSave={() => insertDraft(draft, i)}
          onCancel={() => setDrafts((d) => d.filter((_, idx) => idx !== i))}
        />
      ))}

      {pillars.map((row) => (
        <PillarCard
          key={row.id}
          row={row}
          loopOptions={loopOptions}
          busy={busyId === row.id}
          onPatch={(patch) => patchPillar(row.id, patch)}
          onSave={() => saveExisting(row)}
          onToggleActive={(active) => setActive(row, active)}
        />
      ))}

      {pillars.length === 0 && drafts.length === 0 && !tableMissing && (
        <div className="rounded-md border border-dashed border-muted-foreground/40 p-6 text-center text-sm text-muted-foreground">
          No pillars configured. Use “Add pillar” to create the first one.
        </div>
      )}
    </div>
  );
}

function PillarCard({
  row,
  loopOptions,
  isNew = false,
  busy = false,
  onPatch,
  onSave,
  onCancel,
  onToggleActive,
}: {
  row: PillarRow;
  loopOptions: LoopOption[];
  isNew?: boolean;
  busy?: boolean;
  onPatch: (patch: Partial<PillarRow>) => void;
  onSave: () => void;
  onCancel?: () => void;
  onToggleActive?: (active: boolean) => void;
}) {
  const toneCls = row.is_active ? STATUS_TONE[row.coverage_status] : 'border-border bg-muted/10 opacity-70';

  function toggleLoop(key: string, on: boolean) {
    const set = new Set(row.covering_loops);
    if (on) set.add(key);
    else set.delete(key);
    onPatch({ covering_loops: Array.from(set) });
  }

  return (
    <section className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${toneCls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isNew ? (
            <Input
              aria-label="Pillar key"
              placeholder="pillar_key (e.g. p10-new)"
              value={row.pillar_key}
              onChange={(e) => onPatch({ pillar_key: e.target.value })}
              className="h-8 w-48 font-mono text-xs"
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">{row.pillar_key}</span>
          )}
          {!row.is_active && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              removed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && onToggleActive && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onToggleActive(!row.is_active)}
            >
              {row.is_active ? 'Remove' : 'Restore'}
            </Button>
          )}
          {isNew && onCancel && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={onSave}>
            {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={row.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="Pillar name"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Coverage status</Label>
          <Select
            value={row.coverage_status}
            onValueChange={(v) => onPatch({ coverage_status: v as CoverageStatus })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Display order</Label>
          <Input
            type="number"
            value={row.display_order}
            onChange={(e) => onPatch({ display_order: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Source URL</Label>
          <Input
            value={row.source_url ?? ''}
            onChange={(e) => onPatch({ source_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Anchor quote</Label>
        <Textarea
          value={row.anchor_quote ?? ''}
          onChange={(e) => onPatch({ anchor_quote: e.target.value })}
          placeholder="Verbatim published clause this pillar is anchored to"
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          Covering loops{' '}
          <span className="font-normal text-muted-foreground">
            ({row.covering_loops.length} selected — from the loop registry)
          </span>
        </Label>
        <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-border bg-background/50 p-2.5 sm:grid-cols-2">
          {loopOptions.length === 0 && (
            <span className="text-xs italic text-muted-foreground">
              No loops in the registry to choose from.
            </span>
          )}
          {loopOptions.map((lo) => {
            const checked = row.covering_loops.includes(lo.loop_key);
            return (
              <label
                key={lo.loop_key}
                className="flex items-center gap-2 text-sm"
                title={lo.name}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => toggleLoop(lo.loop_key, c === true)}
                />
                <span className="font-mono text-xs">{lo.loop_key}</span>
                <span className="truncate text-xs text-muted-foreground">{lo.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={row.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value })}
          placeholder="Caveats, gaps, or review notes"
          rows={2}
        />
      </div>

      {!isNew && (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.is_active}
            onCheckedChange={(c) => onPatch({ is_active: c })}
            id={`active-${row.id}`}
          />
          <Label htmlFor={`active-${row.id}`} className="text-xs text-muted-foreground">
            Active (counts toward coverage). Toggle here then Save, or use Remove
            for an immediate soft-delete.
          </Label>
        </div>
      )}
    </section>
  );
}

function emptyToNull(v: string | null): string | null {
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

// "3.5" not "3.50", "3" not "3.0".
function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
