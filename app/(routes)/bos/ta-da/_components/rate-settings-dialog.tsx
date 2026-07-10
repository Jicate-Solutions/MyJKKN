'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { IndianRupee, Plus, Settings2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { BosTaDaRate } from '@/types/bos';
import { TA_DA_RATES } from '@/lib/utils/bos/ta-da-rates';
import { useBosCommittees } from '@/hooks/bos/use-bos-committees';
import { useBosMemberTypes } from '@/hooks/bos/use-bos-member-types';
import { logger } from '@/lib/utils/enhanced-logger';

// base_type values whose SOP default is the "external" shape (honorarium
// ₹1,500 + per-km TA). The rest default to the internal shape (₹1,000, no
// TA). Used only to prefill a freshly added row — saved values always win.
const EXTERNAL_BASE_TYPES: ReadonlySet<string> = new Set([
  'university_nominee',
  'subject_expert',
  'industry_expert',
  'alumni',
  'startup',
]);

interface CatalogType {
  name: string;
  base_type: string | null;
}

interface RateRowState {
  /** Local list key — NOT the DB id (rows are synced wholesale on save). */
  key: string;
  memberType: string;
  honorarium: string;
  taPerKm: string;
}

let rowSeq = 0;
const nextKey = () => `row-${++rowSeq}`;

function sopDefaults(baseType: string | null | undefined): { honorarium: string; taPerKm: string } {
  const external = !!baseType && EXTERNAL_BASE_TYPES.has(baseType);
  return {
    honorarium: String(
      external ? TA_DA_RATES.honorariumExternal : TA_DA_RATES.honorariumInternal
    ),
    taPerKm: String(external ? TA_DA_RATES.travelPerKm : 0),
  };
}

/** Numeric input with a ₹ prefix (and optional unit suffix). */
function AmountInput({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className='relative'>
      <IndianRupee className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
      <Input
        type='number'
        min={0}
        step='0.01'
        inputMode='decimal'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 pl-8 ${suffix ? 'pr-12' : ''}`}
      />
      {suffix && (
        <span className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground'>
          {suffix}
        </span>
      )}
    </div>
  );
}

interface RateSettingsDialogProps {
  /** CAS-expanded institution UUID csv — read scope for committees + rates. */
  institutionsIdsCsv: string | null;
  /** Primary institution UUID the saved rows are written under. */
  institutionId: string | undefined;
}

/**
 * Super-admin dialog for per-council / per-member-type TA & honorarium rates
 * (bos_ta_da_rates). Child-table UX: only member types explicitly added here
 * get a configured rate — every other type keeps the institution-wide SOP
 * fallback. Member types come from the institution's bos_member_types catalog
 * (the same list /bos/member-types manages); removing a row deactivates its
 * rate on save.
 */
export function RateSettingsDialog({ institutionsIdsCsv, institutionId }: RateSettingsDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [committeeName, setCommitteeName] = useState('');
  const [rows, setRows] = useState<RateRowState[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Councils = distinct committee names across the institution (every
  // composition's 'Curriculum Development Cell' collapses to one entry;
  // AC bodies contribute 'Academic Council').
  const { data: committees = [], isLoading: loadingCommittees } = useBosCommittees(
    institutionsIdsCsv,
    { isActive: true, enabled: open && !!institutionsIdsCsv }
  );
  const councilNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of committees) {
      const key = c.name.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, c.name.trim());
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [committees]);

  // Member types from the institution's catalog (bos_member_types.name).
  // CAS siblings each carry a seeded set, so collapse by lower(name) — same
  // dedupe the composition detail page applies.
  const { data: memberTypeRows = [], isLoading: loadingTypes } = useBosMemberTypes(
    institutionsIdsCsv,
    { isActive: true, enabled: open && !!institutionsIdsCsv }
  );
  const catalog = useMemo<CatalogType[]>(() => {
    const seen = new Map<string, CatalogType>();
    for (const t of memberTypeRows as Array<{ name: string; base_type?: string | null }>) {
      const name = (t.name ?? '').trim();
      const key = name.toLowerCase();
      if (name && !seen.has(key)) seen.set(key, { name, base_type: t.base_type ?? null });
    }
    return [...seen.values()];
  }, [memberTypeRows]);

  const ratesKey = ['bos-ta-da-rates', institutionsIdsCsv ?? '', committeeName] as const;
  const { data: savedRates, isLoading: loadingRates } = useQuery({
    queryKey: ratesKey,
    queryFn: async (): Promise<BosTaDaRate[]> => {
      const params = new URLSearchParams();
      params.set('institutionsIds', institutionsIdsCsv!);
      params.set('committeeName', committeeName);
      const res = await fetch(`/api/bos/ta-da/rates?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'Failed to fetch rate settings');
      }
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: open && !!institutionsIdsCsv && !!committeeName,
  });

  // Selected council's saved rows → child-table state. Only saved rows appear;
  // an empty table means the whole council rides on the SOP defaults.
  useEffect(() => {
    if (!committeeName) {
      setRows([]);
      return;
    }
    setRows(
      (savedRates ?? []).map((r) => ({
        key: nextKey(),
        memberType: r.member_type,
        honorarium: String(r.honorarium_amount),
        taPerKm: String(r.ta_per_km),
      }))
    );
  }, [savedRates, committeeName]);

  const usedTypes = useMemo(
    () => new Set(rows.map((r) => r.memberType.toLowerCase()).filter(Boolean)),
    [rows]
  );
  const allTypesUsed = catalog.length > 0 && usedTypes.size >= catalog.length;

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey(), memberType: '', honorarium: '', taPerKm: '' }]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const setRowType = (key: string, name: string) => {
    const entry = catalog.find((c) => c.name === name);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        // Prefill SOP defaults (by the type's base_type) when the row has no
        // amounts yet; a repick keeps whatever the user already typed.
        const blank = r.honorarium === '' && r.taPerKm === '';
        return blank
          ? { ...r, memberType: name, ...sopDefaults(entry?.base_type) }
          : { ...r, memberType: name };
      })
    );
  };

  const setRowValue = (key: string, field: 'honorarium' | 'taPerKm', value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    if (!institutionId || !committeeName) return;

    for (const r of rows) {
      if (!r.memberType) {
        toast.error('Every row needs a member type — remove empty rows or pick a type.');
        return;
      }
      if (Number(r.honorarium) < 0 || Number(r.taPerKm) < 0 || r.honorarium === '') {
        toast.error(`Enter valid amounts for ${r.memberType}.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/bos/ta-da/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutions_id: institutionId,
          committee_name: committeeName,
          rates: rows.map((r) => ({
            member_type: r.memberType,
            honorarium_amount: Number(r.honorarium) || 0,
            ta_per_km: Number(r.taPerKm) || 0,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Failed to save rate settings');
      toast.success(
        rows.length > 0
          ? `Rates saved for ${committeeName}`
          : `All custom rates cleared for ${committeeName} — SOP defaults apply`
      );
      queryClient.invalidateQueries({ queryKey: ['bos-ta-da-rates'] });
    } catch (err) {
      logger.error('academic/bos', 'Failed to save TA/DA rates', err);
      toast.error((err as Error).message || 'Failed to save rate settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' disabled={!institutionId}>
          <Settings2 className='mr-2 h-4 w-4' />
          Rate Settings
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>TA / Honorarium Rate Settings</DialogTitle>
          <DialogDescription>
            Add a row per member type that needs a custom rate for the selected council.
            Member types without a row use the institution-wide SOP (₹
            {TA_DA_RATES.honorariumExternal} external / ₹{TA_DA_RATES.honorariumInternal} internal,
            ₹{TA_DA_RATES.travelPerKm}/km TA for external experts).
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>Council / Committee</Label>
            <Select value={committeeName} onValueChange={setCommitteeName}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingCommittees
                      ? 'Loading councils…'
                      : councilNames.length === 0
                        ? 'No councils found'
                        : 'Select council / committee'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {councilNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {committeeName && (loadingRates || loadingTypes) && (
            <div className='space-y-2'>
              {[1, 2, 3].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
            </div>
          )}

          {committeeName && !loadingRates && !loadingTypes && (
            <>
              {rows.length === 0 ? (
                <div className='rounded-lg border border-dashed p-6 text-center'>
                  <p className='text-sm font-medium'>No custom rates for this council</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    All member types currently use the institution-wide SOP defaults.
                  </p>
                </div>
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member Type</TableHead>
                        <TableHead className='w-36'>Honorarium</TableHead>
                        <TableHead className='w-36'>TA per km</TableHead>
                        <TableHead className='w-12' />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell>
                            <Select
                              value={row.memberType}
                              onValueChange={(v) => setRowType(row.key, v)}
                            >
                              <SelectTrigger className='h-9'>
                                <SelectValue placeholder='Select member type' />
                              </SelectTrigger>
                              <SelectContent>
                                {catalog.map((t) => (
                                  <SelectItem
                                    key={t.name}
                                    value={t.name}
                                    // A type may appear in one row only; its own
                                    // current value stays selectable.
                                    disabled={
                                      usedTypes.has(t.name.toLowerCase()) &&
                                      row.memberType.toLowerCase() !== t.name.toLowerCase()
                                    }
                                  >
                                    {t.name}
                                  </SelectItem>
                                ))}
                                {/* A saved rate whose type was later removed from
                                    the catalog must stay visible + selectable. */}
                                {row.memberType &&
                                  !catalog.some(
                                    (t) => t.name.toLowerCase() === row.memberType.toLowerCase()
                                  ) && (
                                    <SelectItem value={row.memberType}>
                                      {row.memberType}
                                    </SelectItem>
                                  )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <AmountInput
                              value={row.honorarium}
                              onChange={(v) => setRowValue(row.key, 'honorarium', v)}
                            />
                          </TableCell>
                          <TableCell>
                            <AmountInput
                              value={row.taPerKm}
                              onChange={(v) => setRowValue(row.key, 'taPerKm', v)}
                              suffix='/km'
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8 text-muted-foreground hover:text-destructive'
                              onClick={() => removeRow(row.key)}
                              aria-label='Remove rate row'
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={addRow}
                disabled={allTypesUsed || catalog.length === 0}
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Member Type
              </Button>
              {catalog.length === 0 && (
                <p className='text-xs text-amber-700 dark:text-amber-400'>
                  No member types found — manage the catalog at /bos/member-types first.
                </p>
              )}

              <p className='text-xs text-muted-foreground'>
                TA = round-trip distance (one-way km × 2) × rate; distance comes from the
                external expert&apos;s profile, so member types without a distance receive
                honorarium only. Removing a row restores the SOP default for that type.
                Changes apply to claims generated after saving.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)} disabled={isSaving}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !committeeName || !institutionId}>
            {isSaving ? 'Saving…' : 'Save Rates'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
