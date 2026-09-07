'use client';

/**
 * TDS Bands — the monthly-gross ranges that decide who pays tax and how much.
 *
 * SUPER ADMIN AND HR HEAD ONLY, on the same keys as Employee Salaries
 * (hr.payroll.salary.view / .manage). No new permission key: setting the rate
 * and seeing what people earn are the same decision by the same person, and a
 * key declared but never granted renders an empty page.
 *
 * THE COVERAGE PANEL IS THE POINT OF THIS SCREEN, not the table. A band table
 * that looks complete can still leave the highest earner untaxed, and no error
 * anywhere would say so — the register would simply deduct nothing from them.
 * The panel counts real salaries against the configured bands and names anyone
 * who falls outside all of them.
 *
 * ONE RULE IS ENFORCED IN POSTGRES: bands may not overlap (an EXCLUDE
 * constraint on the [min, max) range). Everything else about the set is a
 * judgement call and is left to whoever configures it.
 *
 * IT USED TO BE THREE. A deferred trigger also demanded exactly one open-ended
 * band and no gaps between bands. Both were dropped on 2026-09-02: they are
 * properties of a COMPLETE set, so no single row could satisfy them, and adding
 * one range on its own -- the ordinary thing to do -- was impossible. They also
 * contradicted the specified behaviour, which is that a salary matching no band
 * attracts no TDS, above the highest band exactly as below the lowest.
 *
 * WHICH MAKES THE COVERAGE PANEL THE ONLY GUARD LEFT, and the reason it names
 * people rather than counting them.
 */

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useStaffSalaryDirectory } from '@/hooks/hr/use-staff-salaries';
import {
  useCreateTdsSlab,
  useDeleteTdsSlab,
  useTdsSlabs,
  useUpdateTdsSlab,
} from '@/hooks/hr/use-tds-slabs';
import { describeSlab, resolveTds } from '@/lib/hr/payroll/tds-slabs';
import type { HrTdsSlab } from '@/lib/services/hr/payroll/tds-slab-service';

/**
 * The route manifest title-cases the folder name, which turns "tds-slabs" into
 * "Tds Slabs" — the string global search would show. This overrides it to match
 * the label the sidebar and the nav chip use, so the page has one name
 * everywhere rather than three.
 */
export const navMeta = { label: 'TDS Bands', icon: 'Percent' };

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** One salaried person as they land against a band. */
interface BandMember {
  id: string;
  name: string;
  code: string | null;
  worksAt: string;
  gross: number;
  /** rate% of gross. The allowance is never part of this. */
  tds: number;
}

interface DraftBand {
  id: string | null;
  min: string;
  max: string;
  rate: string;
  label: string;
}

const EMPTY_DRAFT: DraftBand = { id: null, min: '', max: '', rate: '', label: '' };

function parseAmount(raw: string): number {
  return Number(raw.replace(/[,\s₹]/g, ''));
}

function BandDialog({
  draft,
  bands,
  onClose,
}: {
  draft: DraftBand | null;
  /** Needed to tell whether this band would leave the top of the range capped. */
  bands: HrTdsSlab[];
  onClose: () => void;
}) {
  const create = useCreateTdsSlab();
  const update = useUpdateTdsSlab();
  const busy = create.isPending || update.isPending;

  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [rate, setRate] = useState('');
  const [label, setLabel] = useState('');

  // Re-seed during render when a different band is opened — the same pattern
  // the salary dialog uses, and for the same reason: an effect paints the
  // previous band's numbers first and corrects them afterwards.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const draftKey = draft ? (draft.id ?? '__new__') : null;
  if (!draft && seededFor !== null) {
    setSeededFor(null);
  } else if (draft && seededFor !== draftKey) {
    setSeededFor(draftKey);
    setMin(draft.min);
    setMax(draft.max);
    setRate(draft.rate);
    setLabel(draft.label);
  }

  const minVal = parseAmount(min);
  const maxVal = max.trim() === '' ? null : parseAmount(max);
  const rateVal = Number(rate);

  /**
   * WOULD THIS LEAVE SALARIES ABOVE THE BAND UNTAXED? Advisory only.
   *
   * A capped highest band is allowed: "outside every band = no TDS" is the
   * specified behaviour, and it applies above the highest band exactly as it
   * does below the lowest. This used to be refused by a database trigger, which
   * made it impossible to add a single range at all — the set-level rule could
   * not be satisfied by any one row.
   *
   * So the consequence is stated, not prevented. The coverage panel on the page
   * behind this dialog names the actual staff affected.
   */
  const hasOpenBand = bands.some(
    (b) => b.max_monthly_gross === null && b.id !== draft?.id
  );
  const capsTheTop =
    !hasOpenBand &&
    maxVal !== null &&
    !bands.some((b) => b.id !== draft?.id && Number(b.min_monthly_gross) >= maxVal);

  const errors: string[] = [];
  if (min.trim() !== '' && (!Number.isFinite(minVal) || minVal < 0)) {
    errors.push('The lower limit must be a number of rupees, zero or more.');
  }
  if (maxVal !== null && (!Number.isFinite(maxVal) || maxVal <= minVal)) {
    errors.push('The upper limit must be greater than the lower limit.');
  }
  if (rate.trim() !== '' && (!Number.isFinite(rateVal) || rateVal < 0 || rateVal > 100)) {
    errors.push('The rate must be between 0 and 100 percent.');
  }
  const filled = min.trim() !== '' && rate.trim() !== '';
  const canSave = filled && errors.length === 0 && !busy;

  const handleSave = async () => {
    if (!draft || !canSave) return;
    const input = {
      minMonthlyGross: minVal,
      maxMonthlyGross: maxVal,
      ratePct: rateVal,
      label: label.trim() || null,
    };
    try {
      if (draft.id) {
        await update.mutateAsync({ id: draft.id, input });
        toast.success('Band updated.');
      } else {
        await create.mutateAsync(input);
        toast.success('Band added.');
      }
      onClose();
    } catch (err) {
      // Carries the trigger's own wording for the set-level rules — "the highest
      // band must be open-ended", "bands must not leave a gap" — which say more
      // than a generic failure ever could.
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{draft?.id ? 'Edit band' : 'Add band'}</DialogTitle>
          <DialogDescription>
            A salary inside this band is taxed at this rate on its whole monthly gross.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='band-min'>From (monthly gross)</Label>
              <Input
                id='band-min'
                inputMode='decimal'
                placeholder='106250'
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>Included in the band.</p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='band-max'>To</Label>
              <Input
                id='band-max'
                inputMode='decimal'
                placeholder='Leave blank for no limit'
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
              {/* The half-open convention, said plainly. It is the difference
                  between ₹2,00,000 being taxed at this rate or the next one. */}
              <p className='text-xs text-muted-foreground'>
                Excluded — the next band starts here. Blank makes this the top band.
              </p>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='band-rate'>Rate (%)</Label>
              <Input
                id='band-rate'
                inputMode='decimal'
                placeholder='5'
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='band-label'>Label (optional)</Label>
              <Input
                id='band-label'
                placeholder='First slab'
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          {/* Consequence, not obstacle — this band saves either way. */}
          {capsTheTop && (
            <p className='rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground'>
              Nothing is taxed above {maxVal === null ? '' : INR.format(maxVal)}. Leave the
              upper limit blank instead, or add another band above this one, if that is not
              what you want.
            </p>
          )}

          {errors.length > 0 && (
            <Alert variant='destructive'>
              <AlertDescription>
                {errors.map((e) => <div key={e}>{e}</div>)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {busy && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {draft?.id ? 'Save band' : 'Add band'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One band, and exactly who it applies to.
 *
 * The members come from the page's own coverage pass rather than a fresh query:
 * the count in the table row and this list are then the same array read twice,
 * so a row can never advertise a number the dialog cannot produce.
 *
 * TDS SHOWN PER PERSON IS ON THE MONTHLY GROSS ALONE. Allowances are outside the
 * tax base, so they are deliberately not in this table -- showing a "total pay"
 * column next to a tax figure derived from a different number invites exactly
 * the misreading the whole feature is built to avoid.
 */
function BandDetailsDialog({
  band,
  members,
  loading,
  onClose,
}: {
  band: HrTdsSlab | null;
  members: BandMember[];
  loading: boolean;
  onClose: () => void;
}) {
  const monthlyTotal = members.reduce((sum, m) => sum + m.tds, 0);

  return (
    <Dialog open={Boolean(band)} onOpenChange={(o) => !o && onClose()}>
      {/* Flex shell with an explicit max height: DialogContent ships with no
          max-height and no overflow of its own, so a band with 300 staff in it
          would push the footer off-screen with no way to scroll back. */}
      <DialogContent className='flex max-h-[85vh] max-w-3xl flex-col'>
        <DialogHeader>
          <DialogTitle>
            {band ? describeSlab(band, (n) => INR.format(n)) : ''}
          </DialogTitle>
          <DialogDescription>
            {band?.rate_pct}% of the monthly gross
            {band?.label ? ` · ${band.label}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
          <Card>
            <CardContent className='p-3'>
              <p className='text-xs text-muted-foreground'>Staff in this band</p>
              <p className='text-lg font-semibold tabular-nums'>{members.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-3'>
              <p className='text-xs text-muted-foreground'>TDS a month</p>
              <p className='text-lg font-semibold tabular-nums'>{INR.format(monthlyTotal)}</p>
            </CardContent>
          </Card>
          <Card className='col-span-2 sm:col-span-1'>
            <CardContent className='p-3'>
              <p className='text-xs text-muted-foreground'>TDS a year</p>
              <p className='text-lg font-semibold tabular-nums'>
                {INR.format(monthlyTotal * 12)}
              </p>
              <p className='mt-0.5 text-[11px] text-muted-foreground'>
                At today&apos;s salaries
              </p>
            </CardContent>
          </Card>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto rounded-md border'>
          <table className='w-full text-sm'>
            <thead className='sticky top-0 border-b bg-muted/95 backdrop-blur'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-semibold text-muted-foreground'>
                  Employee
                </th>
                <th className='px-3 py-2 text-left text-xs font-semibold text-muted-foreground'>
                  Works at
                </th>
                <th className='px-3 py-2 text-right text-xs font-semibold text-muted-foreground'>
                  Monthly gross
                </th>
                <th className='px-3 py-2 text-right text-xs font-semibold text-muted-foreground'>
                  TDS
                </th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {members.map((m) => (
                <tr key={m.id} className='hover:bg-muted/30'>
                  <td className='px-3 py-2'>
                    <span className='block'>{m.name}</span>
                    <span className='block font-mono text-xs text-muted-foreground'>
                      {m.code ?? '—'}
                    </span>
                  </td>
                  <td className='px-3 py-2 text-muted-foreground'>{m.worksAt}</td>
                  <td className='px-3 py-2 text-right tabular-nums'>{INR.format(m.gross)}</td>
                  <td className='px-3 py-2 text-right font-medium tabular-nums'>
                    {INR.format(m.tds)}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className='px-3 py-8 text-center text-sm text-muted-foreground'>
                    {loading
                      ? 'Loading staff…'
                      : 'Nobody currently earns a salary in this range.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TdsSlabsPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.salary', 'view');
  const canManage = canAccess('hr.payroll.salary', 'manage');

  const { data: slabs, isLoading, error, refetch: refetchSlabs } = useTdsSlabs();
  /**
   * The roster, read to work out who each band actually hits.
   *
   * refetchOnMount: 'always' — this page DERIVES from salaries but does not own
   * them. A salary is edited on the Employee Salaries screen, and although that
   * mutation invalidates this same cache entry, two gaps remained: the shared
   * 60-second staleTime meant arriving here soon after a change could still show
   * the old figures, and refetchOnWindowFocus is off app-wide, so this page left
   * open in a second tab never updated at all. Both showed up as "I changed a
   * salary and the band details did not follow".
   */
  const {
    data: staff,
    isLoading: staffLoading,
    isFetching: staffFetching,
    refetch: refetchStaff,
  } = useStaffSalaryDirectory({ refetchOnMount: 'always' });
  const remove = useDeleteTdsSlab();

  const [draft, setDraft] = useState<DraftBand | null>(null);
  const bands = useMemo(() => slabs ?? [], [slabs]);

  /**
   * The band being examined, held as an ID rather than the row itself.
   *
   * A captured object is a snapshot: refresh the page's data while the dialog is
   * open and its header would keep quoting the rate the band had when it was
   * clicked. Resolving from `bands` on every render means the dialog cannot
   * disagree with the table behind it.
   */
  const [detailsForId, setDetailsForId] = useState<string | null>(null);
  const detailsFor = useMemo(
    () => bands.find((b) => b.id === detailsForId) ?? null,
    [bands, detailsForId]
  );

  /**
   * What the bands actually do to the people on the payroll.
   *
   * Counted from salaries in force, not from the band definitions — the whole
   * risk this panel exists for is a band set that reads sensibly and still
   * leaves somebody out.
   */
  const coverage = useMemo(() => {
    const salaried = (staff ?? []).filter(
      (s) => s.salary_id !== null && (s.monthly_gross ?? 0) > 0
    );
    // Keeps the PEOPLE, not a tally: the count in the table and the list in the
    // details dialog are then the same array read two ways, so a band can never
    // advertise a number its own dialog cannot show.
    const perBand = new Map<string, BandMember[]>();
    const uncovered: BandMember[] = [];

    for (const s of salaried) {
      const gross = s.monthly_gross ?? 0;
      const hit = resolveTds(gross, bands);
      const member: BandMember = {
        id: s.staff_uuid,
        name: s.person_name,
        code: s.staff_code,
        worksAt: s.works_at_name,
        gross,
        tds: hit.amount,
      };
      if (hit.slab) {
        const list = perBand.get(hit.slab.id);
        if (list) list.push(member);
        else perBand.set(hit.slab.id, [member]);
      } else {
        uncovered.push(member);
      }
    }

    // Highest paid first — the person most likely to matter, and the one a
    // capped top band silently exempts.
    for (const list of perBand.values()) list.sort((a, b) => b.gross - a.gross);
    uncovered.sort((a, b) => b.gross - a.gross);
    return { salaried: salaried.length, perBand, uncovered };
  }, [bands, staff]);

  /**
   * Someone earning MORE than a taxed colleague while paying nothing.
   *
   * Below the lowest band that is the intended design and is not flagged. Above
   * it, it is almost always an unfinished band set -- and since the database no
   * longer refuses that shape, this list is the only thing standing between a
   * capped top band and the highest earner quietly paying zero.
   */
  const untaxedAboveTaxed = useMemo(() => {
    if (bands.length === 0) return [];
    const lowestFloor = Math.min(...bands.map((b) => Number(b.min_monthly_gross)));
    return coverage.uncovered.filter((u) => u.gross > lowestFloor);
  }, [bands, coverage.uncovered]);

  const handleDelete = async (band: HrTdsSlab) => {
    try {
      await remove.mutateAsync(band.id);
      toast.success('Band removed.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (permsLoading) {
    return (
      <ContentLayout title='TDS Bands'>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />
          Checking access…
        </div>
      </ContentLayout>
    );
  }

  // Decides what to SAY to someone who reaches the URL. It is not what stops
  // them reading the data — hr_tds_slabs' RLS is.
  if (!canView) {
    return (
      <ContentLayout title='TDS Bands'>
        <Alert variant='destructive'>
          <ShieldAlert className='h-4 w-4' />
          <AlertDescription>
            TDS bands are restricted to the HR Head and super administrators.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='TDS Bands'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href='/hr'>HR</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/hr/payroll/salaries'>Payroll</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>TDS Bands</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-4 space-y-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <p className='max-w-2xl text-sm text-muted-foreground'>
            A salary inside a band has TDS deducted at that band&apos;s rate, applied to its
            whole monthly gross. A salary outside every band has no TDS deducted. Allowances
            are never counted — only the monthly gross decides the band.
          </p>
          <div className='flex gap-2'>
            {/* Both queries, because the page is only correct when the bands and
                the salaries they are resolved against are both current. */}
            <Button
              variant='outline'
              onClick={() => {
                refetchSlabs();
                refetchStaff();
              }}
              disabled={staffFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${staffFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canManage && (
              <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                <Plus className='mr-2 h-4 w-4' />
                Add band
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        )}

        {untaxedAboveTaxed.length > 0 && (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              <span className='font-medium'>
                {untaxedAboveTaxed.length} staff member
                {untaxedAboveTaxed.length === 1 ? '' : 's'} earn more than the lowest taxed
                salary but fall in no band, so no TDS will be deducted from them:
              </span>
              <ul className='mt-1 list-inside list-disc'>
                {untaxedAboveTaxed.slice(0, 10).map((u) => (
                  <li key={`${u.name}-${u.gross}`} className='tabular-nums'>
                    {u.name} — {INR.format(u.gross)} a month
                  </li>
                ))}
              </ul>
              {untaxedAboveTaxed.length > 10 && (
                <p className='mt-1'>…and {untaxedAboveTaxed.length - 10} more.</p>
              )}
              <p className='mt-2'>
                If that is intended, nothing needs doing. Otherwise extend the highest
                band by clearing its upper limit, or add a band to cover them.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading bands…
          </div>
        ) : bands.length === 0 ? (
          <Card>
            <CardContent className='py-10 text-center'>
              <p className='text-sm font-medium'>No TDS bands are configured.</p>
              <p className='mx-auto mt-1 max-w-md text-sm text-muted-foreground'>
                No tax is being deducted from anyone. Add a band to start — and remember the
                highest one must be left open-ended, or the highest earners pay nothing.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className='overflow-x-auto rounded-md border'>
            <table className='w-full min-w-[720px] text-sm'>
              <thead className='border-b bg-muted/50'>
                <tr>
                  <th className='px-3 py-2 text-left text-xs font-semibold text-muted-foreground'>
                    Monthly gross
                  </th>
                  <th className='px-3 py-2 text-right text-xs font-semibold text-muted-foreground'>
                    Rate
                  </th>
                  <th className='px-3 py-2 text-left text-xs font-semibold text-muted-foreground'>
                    Label
                  </th>
                  <th className='px-3 py-2 text-right text-xs font-semibold text-muted-foreground'>
                    Staff in band
                  </th>
                  <th className='px-3 py-2' />
                </tr>
              </thead>
              <tbody className='divide-y'>
                {bands.map((b) => (
                  <tr key={b.id} className='hover:bg-muted/30'>
                    <td className='whitespace-nowrap px-3 py-2 tabular-nums'>
                      {b.max_monthly_gross === null ? (
                        <>
                          {INR.format(b.min_monthly_gross)}{' '}
                          <span className='text-muted-foreground'>and above</span>
                          <Badge variant='secondary' className='ml-2 font-normal'>
                            Top band
                          </Badge>
                        </>
                      ) : (
                        <>
                          {INR.format(b.min_monthly_gross)} –{' '}
                          {INR.format(b.max_monthly_gross)}
                        </>
                      )}
                    </td>
                    <td className='px-3 py-2 text-right font-medium tabular-nums'>
                      {b.rate_pct}%
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>{b.label ?? '—'}</td>
                    <td className='px-3 py-2 text-right tabular-nums'>
                      {/* The count IS the affordance for "who?" — clicking a
                          number to see the people behind it needs no label. */}
                      <button
                        type='button'
                        onClick={() => setDetailsForId(b.id)}
                        className='underline-offset-2 hover:underline'
                      >
                        {staffLoading ? '…' : (coverage.perBand.get(b.id)?.length ?? 0)}
                      </button>
                    </td>
                    <td className='px-3 py-2 text-right'>
                      <div className='flex justify-end gap-1'>
                        {/* Viewing is a view-level action, so it is NOT behind
                            canManage — an HR Head reviewing the configuration
                            should not need edit rights to see who it hits. */}
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8'
                          aria-label={`View staff in the ${b.rate_pct}% band`}
                          onClick={() => setDetailsForId(b.id)}
                        >
                          <Eye className='h-4 w-4' />
                        </Button>
                        {canManage && (
                          <>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8'
                            aria-label='Edit band'
                            onClick={() =>
                              setDraft({
                                id: b.id,
                                min: String(b.min_monthly_gross),
                                max:
                                  b.max_monthly_gross === null
                                    ? ''
                                    : String(b.max_monthly_gross),
                                rate: String(b.rate_pct),
                                label: b.label ?? '',
                              })
                            }
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8'
                            aria-label='Remove band'
                            disabled={remove.isPending}
                            onClick={() => handleDelete(b)}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {bands.length > 0 && (
          <p className='text-xs text-muted-foreground'>
            {coverage.salaried - coverage.uncovered.length} of {coverage.salaried} salaried
            staff fall in a band. The rest earn below the lowest band and have no TDS deducted.
          </p>
        )}
      </div>

      <BandDialog draft={draft} bands={bands} onClose={() => setDraft(null)} />

      <BandDetailsDialog
        band={detailsFor}
        members={detailsFor ? (coverage.perBand.get(detailsFor.id) ?? []) : []}
        loading={staffLoading}
        onClose={() => setDetailsForId(null)}
      />
    </ContentLayout>
  );
}
