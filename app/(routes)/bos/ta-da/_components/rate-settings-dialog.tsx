'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { IndianRupee, Info, Plus, Settings2, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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

import {
  BosTaDaRate,
  BosTaDaTravelBasis,
  BOS_TA_DA_TRAVEL_BASIS_LABELS,
} from '@/types/bos';
import {
  TA_DA_RATES,
  INSTITUTION_WIDE_COMMITTEE,
  INSTITUTION_WIDE_LABEL,
  isInstitutionWideCommittee,
} from '@/lib/utils/bos/ta-da-rates';
import { useBosCommittees } from '@/hooks/bos/use-bos-committees';
import { useBosMemberTypes } from '@/hooks/bos/use-bos-member-types';
import { logger } from '@/lib/utils/enhanced-logger';

// base_type values whose SOP default is the "external" shape (honorarium
// ₹1,500 + per-km TA). The rest default to the internal shape (₹1,000, no
// TA). Used only to prefill a freshly added row — saved values always win.
const EXTERNAL_BASE_TYPES: ReadonlySet<string> = new Set([
  'university_nominee',
  'subject_expert',
  'academic_expert',
  'industry_expert',
  'alumni',
  'startup',
  'student',
]);

const TRAVEL_BASES: BosTaDaTravelBasis[] = ['distance', 'flat', 'none'];

interface CatalogType {
  name: string;
  base_type: string | null;
}

interface RateRowState {
  /** Local list key — NOT the DB id (rows are synced wholesale on save). */
  key: string;
  memberType: string;
  /** Sitting charge for in-person attendance. */
  honorarium: string;
  /** Sitting charge for online attendance (usually the same figure). */
  honorariumOnline: string;
  travelBasis: BosTaDaTravelBasis;
  /** Used under the 'distance' basis. */
  taPerKm: string;
  /** Used under the 'flat' basis. */
  travelFlat: string;
}

let rowSeq = 0;
const nextKey = () => `row-${++rowSeq}`;

function sopDefaults(
  baseType: string | null | undefined,
): Omit<RateRowState, 'key' | 'memberType'> {
  const external = !!baseType && EXTERNAL_BASE_TYPES.has(baseType);
  const sitting = String(
    external ? TA_DA_RATES.honorariumExternal : TA_DA_RATES.honorariumInternal
  );
  return {
    honorarium: sitting,
    // The SOP quotes the same sitting charge offline and online; an admin who
    // needs them to differ edits the online cell.
    honorariumOnline: sitting,
    // Internal members receive no travel under the SOP — 'none' says that
    // outright rather than leaning on a ₹0 per-km rate.
    travelBasis: external ? 'distance' : 'none',
    taPerKm: String(external ? TA_DA_RATES.travelPerKm : 0),
    travelFlat: '0',
  };
}

/** Numeric input with a ₹ prefix (and optional unit suffix). */
function AmountInput({
  value,
  onChange,
  suffix,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  disabled?: boolean;
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
        disabled={disabled}
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
 * Super-admin dialog for TA & honorarium rates (bos_ta_da_rates), in two tiers
 * selected by the "Rate scope" dropdown:
 *
 *   • Institution-wide — stored under the INSTITUTION_WIDE_COMMITTEE sentinel;
 *     applies to every council the institution has now or gains later. This is
 *     where an institution's own SOP belongs.
 *   • A single council — overrides the institution-wide row, per member type.
 *     A council may override one type and inherit the rest; the types it
 *     inherits are named under the grid so a missing row is never ambiguous.
 *
 * Child-table UX within a scope: only member types explicitly added here get a
 * configured rate, and removing a row drops that type to the next tier down.
 * Member types come from the institution's bos_member_types catalog (the same
 * list /bos/member-types manages).
 *
 * Each row carries the SOP's four money facts (20260805120000): the offline
 * and online sitting charges, and how travel is computed — per-km on the
 * recorded distance, a flat amount, or nothing at all. Online attendance never
 * pays travel, so there is no online travel column to configure.
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

  const isInstitutionWide = isInstitutionWideCommittee(committeeName);
  /** What the selected scope is called in prose. */
  const scopeLabel = isInstitutionWide ? INSTITUTION_WIDE_LABEL : committeeName;

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
        // NULL in the column means "same as offline" (rows written before the
        // online split, or by a client that omitted it) — show the offline
        // figure so the cell is never a confusing blank.
        honorariumOnline:
          r.honorarium_amount_online === null || r.honorarium_amount_online === undefined
            ? String(r.honorarium_amount)
            : String(r.honorarium_amount_online),
        travelBasis: r.travel_basis ?? 'distance',
        taPerKm: String(r.ta_per_km),
        travelFlat: String(r.travel_flat_amount ?? 0),
      }))
    );
  }, [savedRates, committeeName]);

  // Institution-wide tier, loaded while a *council* is selected so the grid can
  // say which member types this council inherits rather than overrides. Without
  // it an empty council grid reads as "SOP defaults" when an institution-wide
  // rate may in fact be paying these members.
  const { data: institutionWideRates = [] } = useQuery({
    queryKey: ['bos-ta-da-rates', institutionsIdsCsv ?? '', INSTITUTION_WIDE_COMMITTEE],
    queryFn: async (): Promise<BosTaDaRate[]> => {
      const params = new URLSearchParams();
      params.set('institutionsIds', institutionsIdsCsv!);
      params.set('committeeName', INSTITUTION_WIDE_COMMITTEE);
      const res = await fetch(`/api/bos/ta-da/rates?${params.toString()}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: open && !!institutionsIdsCsv && !!committeeName && !isInstitutionWide,
  });

  const usedTypes = useMemo(
    () => new Set(rows.map((r) => r.memberType.toLowerCase()).filter(Boolean)),
    [rows]
  );

  /** Institution-wide types this council does NOT override. */
  const inheritedTypes = useMemo(() => {
    if (isInstitutionWide) return [];
    return institutionWideRates
      .filter((r) => !usedTypes.has(r.member_type.trim().toLowerCase()))
      .map((r) => r.member_type);
  }, [institutionWideRates, usedTypes, isInstitutionWide]);
  const allTypesUsed = catalog.length > 0 && usedTypes.size >= catalog.length;

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        memberType: '',
        honorarium: '',
        honorariumOnline: '',
        travelBasis: 'distance',
        taPerKm: '',
        travelFlat: '',
      },
    ]);
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
        const blank = r.honorarium === '' && r.taPerKm === '' && r.honorariumOnline === '';
        return blank
          ? { ...r, memberType: name, ...sopDefaults(entry?.base_type) }
          : { ...r, memberType: name };
      })
    );
  };

  const setRowValue = (
    key: string,
    field: 'honorarium' | 'honorariumOnline' | 'taPerKm' | 'travelFlat',
    value: string
  ) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const setRowBasis = (key: string, basis: BosTaDaTravelBasis) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        // Seed the newly-relevant amount so switching basis doesn't leave the
        // input blank (which would fail validation on save).
        if (basis === 'distance' && !r.taPerKm) {
          return { ...r, travelBasis: basis, taPerKm: String(TA_DA_RATES.travelPerKm) };
        }
        if (basis === 'flat' && !r.travelFlat) {
          return { ...r, travelBasis: basis, travelFlat: '0' };
        }
        return { ...r, travelBasis: basis };
      })
    );
  };

  const handleSave = async () => {
    if (!institutionId || !committeeName) return;

    for (const r of rows) {
      if (!r.memberType) {
        toast.error('Every row needs a member type — remove empty rows or pick a type.');
        return;
      }
      const sittingInvalid =
        r.honorarium === '' ||
        Number(r.honorarium) < 0 ||
        r.honorariumOnline === '' ||
        Number(r.honorariumOnline) < 0;
      // Only the amount the chosen basis actually uses has to be valid — an
      // untouched per-km box on a flat-travel row is not an error.
      const travelInvalid =
        (r.travelBasis === 'distance' && (r.taPerKm === '' || Number(r.taPerKm) < 0)) ||
        (r.travelBasis === 'flat' && (r.travelFlat === '' || Number(r.travelFlat) < 0));
      if (sittingInvalid || travelInvalid) {
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
            honorarium_amount_online: Number(r.honorariumOnline) || 0,
            travel_basis: r.travelBasis,
            ta_per_km: Number(r.taPerKm) || 0,
            travel_flat_amount: Number(r.travelFlat) || 0,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Failed to save rate settings');
      toast.success(
        rows.length > 0
          ? `Rates saved — ${scopeLabel}`
          : isInstitutionWide
            ? 'Institution rates cleared — SOP defaults apply'
            : `Overrides cleared for ${committeeName} — institution-wide rates apply`
      );
      // Invalidates the institution-wide query too, so the "Inherited from…"
      // line on every council reflects a just-saved institution grid.
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
      <DialogContent className='max-w-5xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Settings2 className='h-5 w-5 text-primary' />
            TA / Honorarium Rate Settings
          </DialogTitle>
          <DialogDescription>
            Set rates per member type for the whole institution, or override
            them for a single council. Anything left unset follows the SOP
            defaults below.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* SOP defaults reference — the fallback every un-configured member
              type rides on. Read-only; edits happen via the rows below. */}
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            <div className='rounded-lg border bg-muted/40 px-3 py-2'>
              <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
                SOP · External honorarium
              </p>
              <p className='mt-0.5 text-base font-semibold tabular-nums'>
                ₹{TA_DA_RATES.honorariumExternal.toLocaleString('en-IN')}
              </p>
            </div>
            <div className='rounded-lg border bg-muted/40 px-3 py-2'>
              <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
                SOP · Internal honorarium
              </p>
              <p className='mt-0.5 text-base font-semibold tabular-nums'>
                ₹{TA_DA_RATES.honorariumInternal.toLocaleString('en-IN')}
              </p>
            </div>
            <div className='rounded-lg border bg-muted/40 px-3 py-2'>
              <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
                SOP · TA (external)
              </p>
              <p className='mt-0.5 text-base font-semibold tabular-nums'>
                ₹{TA_DA_RATES.travelPerKm.toLocaleString('en-IN')}
                <span className='ml-1 text-xs font-normal text-muted-foreground'>
                  /km, round trip
                </span>
              </p>
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>Rate scope</Label>
            <Select value={committeeName} onValueChange={setCommitteeName}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingCommittees
                      ? 'Loading councils…'
                      : 'Select institution-wide or a council'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {/* Institution-wide first: it is the tier most settings belong
                    in, and a council row is the exception, not the norm. */}
                <SelectItem value={INSTITUTION_WIDE_COMMITTEE}>
                  {INSTITUTION_WIDE_LABEL}
                </SelectItem>
                {councilNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-xs text-muted-foreground'>
              {isInstitutionWide
                ? 'Applies to every council in this institution, including councils created later.'
                : committeeName
                  ? `Applies to ${committeeName} only, overriding the institution-wide rate for the member types listed below.`
                  : 'Set rates once for the whole institution, or override them for a single council.'}
            </p>
          </div>

          {!committeeName && (
            <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
              Choose <strong>{INSTITUTION_WIDE_LABEL}</strong> to set the
              institution&apos;s rates, or pick a council to override them.
            </div>
          )}

          {committeeName && (loadingRates || loadingTypes) && (
            <div className='space-y-2'>
              {[1, 2, 3].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
            </div>
          )}

          {committeeName && !loadingRates && !loadingTypes && (
            <>
              {/* Section header: what's configured for this council + Add. */}
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                  <h4 className='text-sm font-semibold'>
                    {isInstitutionWide ? 'Institution rates' : `Overrides — ${committeeName}`}
                  </h4>
                  {rows.length > 0 && (
                    <Badge variant='secondary' className='h-5 px-1.5 text-xs'>
                      {rows.length} {rows.length === 1 ? 'type' : 'types'}
                    </Badge>
                  )}
                </div>
                {rows.length > 0 && (
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
                )}
              </div>

              {rows.length === 0 ? (
                <div className='rounded-lg border border-dashed p-8 text-center'>
                  <IndianRupee className='mx-auto h-8 w-8 text-muted-foreground/40' />
                  <p className='mt-2 text-sm font-medium'>
                    {isInstitutionWide
                      ? 'No institution rates configured'
                      : 'No overrides for this council'}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {isInstitutionWide
                      ? 'Every council falls back to the SOP defaults shown above. Add a member type to set this institution’s own rates.'
                      : inheritedTypes.length > 0
                        ? `This council uses the institution-wide rates for ${inheritedTypes.join(', ')}. Add a member type only where it should differ.`
                        : 'This council uses the institution-wide rates, falling back to the SOP defaults shown above.'}
                  </p>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='mt-4'
                    onClick={addRow}
                    disabled={catalog.length === 0}
                  >
                    <Plus className='mr-2 h-4 w-4' />
                    Add Member Type
                  </Button>
                </div>
              ) : (
                <div className='overflow-x-auto rounded-lg border'>
                  <Table>
                    <TableHeader className='bg-muted/50'>
                      {/* Two header rows mirror the printed SOP table: the
                          sitting charge is quoted per attendance mode, travel
                          is a single offline figure (online pays none). */}
                      <TableRow className='hover:bg-muted/50'>
                        <TableHead rowSpan={2} className='align-bottom text-xs'>
                          Member Type
                        </TableHead>
                        <TableHead colSpan={2} className='border-l text-center text-xs'>
                          Sitting Charges
                        </TableHead>
                        <TableHead colSpan={2} className='border-l text-center text-xs'>
                          Travel Allowance
                        </TableHead>
                        <TableHead rowSpan={2} className='w-12' />
                      </TableRow>
                      <TableRow className='hover:bg-muted/50'>
                        <TableHead className='w-32 border-l text-xs font-normal'>
                          Offline
                        </TableHead>
                        <TableHead className='w-32 text-xs font-normal'>Online</TableHead>
                        <TableHead className='w-40 border-l text-xs font-normal'>
                          Basis
                        </TableHead>
                        <TableHead className='w-36 text-xs font-normal'>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.key} className='hover:bg-muted/30'>
                          <TableCell>
                            <Select
                              value={row.memberType}
                              onValueChange={(v) => setRowType(row.key, v)}
                            >
                              <SelectTrigger className='h-9 min-w-[11rem]'>
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
                          <TableCell className='border-l'>
                            <AmountInput
                              value={row.honorarium}
                              onChange={(v) => setRowValue(row.key, 'honorarium', v)}
                            />
                          </TableCell>
                          <TableCell>
                            <AmountInput
                              value={row.honorariumOnline}
                              onChange={(v) => setRowValue(row.key, 'honorariumOnline', v)}
                            />
                          </TableCell>
                          <TableCell className='border-l'>
                            <Select
                              value={row.travelBasis}
                              onValueChange={(v) =>
                                setRowBasis(row.key, v as BosTaDaTravelBasis)
                              }
                            >
                              <SelectTrigger className='h-9'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TRAVEL_BASES.map((b) => (
                                  <SelectItem key={b} value={b}>
                                    {BOS_TA_DA_TRAVEL_BASIS_LABELS[b]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {row.travelBasis === 'none' ? (
                              <span className='text-sm text-muted-foreground'>—</span>
                            ) : row.travelBasis === 'flat' ? (
                              <AmountInput
                                value={row.travelFlat}
                                onChange={(v) => setRowValue(row.key, 'travelFlat', v)}
                              />
                            ) : (
                              <AmountInput
                                value={row.taPerKm}
                                onChange={(v) => setRowValue(row.key, 'taPerKm', v)}
                                suffix='/km'
                              />
                            )}
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

              {catalog.length === 0 && (
                <p className='text-xs text-amber-700 dark:text-amber-400'>
                  No member types found — manage the catalog at /bos/member-types first.
                </p>
              )}

              {/* Only meaningful on a council: names the types this council
                  leaves to the institution-wide tier, so an absent row never
                  reads as "unconfigured". */}
              {!isInstitutionWide && rows.length > 0 && inheritedTypes.length > 0 && (
                <p className='text-xs text-muted-foreground'>
                  Inherited from {INSTITUTION_WIDE_LABEL.toLowerCase()}:{' '}
                  <span className='font-medium text-foreground'>
                    {inheritedTypes.join(', ')}
                  </span>
                </p>
              )}

              <div className='flex gap-2 rounded-lg border bg-muted/40 px-3 py-2.5'>
                <Info className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
                <p className='text-xs leading-relaxed text-muted-foreground'>
                  Rates resolve per member type, most specific first:{' '}
                  <strong>council override → institution-wide → SOP default</strong>.
                  The sitting charge is chosen by each attendee&apos;s
                  Offline/Online marking on the meeting&apos;s Attendance tab.{' '}
                  <strong>Online attendance never pays travel</strong>, so the
                  travel column applies to in-person attendance only. Under{' '}
                  <em>As per distance</em>, travel = round-trip distance
                  (one-way km × 2) × rate, and distance comes from the external
                  expert&apos;s profile — so member types without a distance
                  receive the sitting charge only. Removing a row drops that
                  type to the next tier down. Changes apply to claims generated
                  after saving.
                </p>
              </div>
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
