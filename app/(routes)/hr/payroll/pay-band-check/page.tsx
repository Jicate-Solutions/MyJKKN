'use client';

/**
 * Pay Band Check — who is paid outside the band their job title is on.
 *
 * Nothing in MyJKKN asked this before. The band is configured on
 * /hr/admin/policies/pay-scales and the pay is recorded on
 * /hr/payroll/salaries, and until now the two were never compared, so "four
 * people are below band" was a figure somebody worked out by hand.
 *
 * REPORTING ONLY. There is no action on this screen, no button that changes a
 * figure, and no recommendation. Under the Director's ruling of 18 September
 * 2026 the band is reference material and a pay change is a separate decision.
 *
 * GATED ON hr.payroll.salary.view — the same key as Employee Salaries and TDS
 * Bands, and no new key. The page reads two things and they are protected in
 * two different places:
 *   - THE PAY comes from hr_staff_salary_directory(), which RAISES
 *     insufficient_privilege in Postgres without that key.
 *   - THE BANDS come from GET /api/hr/payroll/pay-bands, which checks the key
 *     on the server. Postgres does NOT protect them: platform_policies' SELECT
 *     policy is `auth.uid() IS NOT NULL`, so the route's check is the only gate,
 *     and this page must never query the table from the browser.
 * The canView check below decides what to SAY to someone who reaches the URL,
 * and stops the band request from being made at all. It is not what stops them
 * reading the data.
 *
 * THE SCOPE IS THE WORK COLLEGE, NOT THE PAYER. A band is an institution
 * policy, and the only institution on a salary row is staff.institution_id —
 * where the person works. The payer is an hr_organizations row, which is a
 * different table with its own institution link, and 36 active staff are paid by
 * one college and work at another. So the 10 people paid by Pharmacy who work
 * at Main Office are judged against Main Office's band, which does not exist,
 * and they come back as "cannot tell". Stated in the panel rather than hidden.
 *
 * CANNOT TELL IS SHOWN AS PROMINENTLY AS THE BREACHES. It is the majority
 * answer: 7 of 9 colleges have no band recorded at all. A screen that reported
 * only the two configured colleges would read as "almost everyone is fine".
 *
 * THE COUNTS AND THE TABLE READ THE SAME ARRAY through the same functions, so a
 * card cannot advertise a number the table does not list.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Scale,
  ShieldAlert,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useStaffSalaryDirectory } from '@/hooks/hr/use-staff-salaries';
import { usePayBandPolicies } from '@/hooks/hr/use-pay-band-policies';
import {
  checkPayBand,
  summarisePayBandByCollege,
  type CheckedPerson,
  type PayBandResult,
  type PayBandUnknownReason,
} from '@/lib/hr/pay-band-check';

/**
 * The route manifest title-cases the folder name, which would read "Pay Band
 * Check" correctly but the icon has to be declared somewhere. Same override the
 * TDS Bands page uses so the page has one name in the sidebar, the chip and
 * global search.
 */
export const navMeta = { label: 'Pay Band Check', icon: 'Scale' };

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** One person, checked, with everything the table needs to name them. */
interface CheckedRow extends CheckedPerson {
  staffUuid: string;
  name: string;
  code: string | null;
  designation: string | null;
  monthlyPay: number | null;
}

const UNKNOWN_LABEL: Record<PayBandUnknownReason, string> = {
  no_band_configured: 'College has no pay band',
  no_designation_recorded: 'No job title recorded',
  no_matching_rung: 'Job title not on the band',
  no_pay_recorded: 'No salary recorded',
};

function VerdictBadge({ result }: { result: PayBandResult }) {
  if (result.verdict === 'below_band') {
    return <Badge variant='destructive' className='font-normal'>Below band</Badge>;
  }
  if (result.verdict === 'above_band') {
    return (
      <Badge
        variant='outline'
        className='border-amber-500/50 font-normal text-amber-700 dark:text-amber-400'
      >
        Above band
      </Badge>
    );
  }
  if (result.verdict === 'within_band') {
    return <Badge variant='outline' className='font-normal'>Within band</Badge>;
  }
  return (
    <Badge variant='secondary' className='font-normal'>
      {result.reason ? UNKNOWN_LABEL[result.reason] : 'Cannot tell'}
    </Badge>
  );
}

/** A stat card. Reads the same array the tables read. */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className='flex items-start gap-3 p-4'>
        <Icon className='mt-0.5 h-7 w-7 shrink-0 text-muted-foreground' />
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='text-2xl font-semibold tabular-nums'>{value}</p>
          {sub && <p className='mt-0.5 text-xs text-muted-foreground'>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** The people table. One shape for breaches and for unknowns. */
function PeopleTable({
  rows,
  amountHeader,
  amountOf,
  emptyMessage,
}: {
  rows: CheckedRow[];
  amountHeader: string;
  amountOf: (r: CheckedRow) => string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <p className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto rounded-md border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team member</TableHead>
            <TableHead>Job title</TableHead>
            <TableHead>College</TableHead>
            <TableHead className='text-right'>Paid a month</TableHead>
            <TableHead className='text-right'>Band</TableHead>
            <TableHead className='text-right'>{amountHeader}</TableHead>
            <TableHead>Finding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.staffUuid}>
              <TableCell className='align-top'>
                <span className='font-medium'>{r.name}</span>
                {r.code && (
                  <span className='ml-2 font-mono text-xs text-muted-foreground'>{r.code}</span>
                )}
              </TableCell>
              <TableCell className='align-top text-sm'>{r.designation ?? '—'}</TableCell>
              <TableCell className='align-top text-sm'>{r.collegeName}</TableCell>
              <TableCell className='align-top text-right tabular-nums'>
                {r.monthlyPay === null ? '—' : INR.format(r.monthlyPay)}
              </TableCell>
              <TableCell className='align-top text-right tabular-nums'>
                {r.result.band === null
                  ? '—'
                  : r.result.band.min === r.result.band.max
                    ? INR.format(r.result.band.min)
                    : `${INR.format(r.result.band.min)} – ${INR.format(r.result.band.max)}`}
              </TableCell>
              <TableCell className='align-top text-right font-medium tabular-nums'>
                {amountOf(r)}
              </TableCell>
              <TableCell className='align-top'>
                <div className='flex flex-col items-start gap-1'>
                  <VerdictBadge result={r.result} />
                  {r.result.belowGuaranteedMinimum && (
                    <span className='text-xs text-muted-foreground'>
                      Under the college minimum
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PayBandCheckPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.salary', 'view');

  const {
    data: directory,
    isLoading: staffLoading,
    error: staffError,
    refetch: refetchStaff,
    isFetching: staffFetching,
  } = useStaffSalaryDirectory({ refetchOnMount: 'always' });

  const {
    data: policies,
    isLoading: policyLoading,
    error: policyError,
    refetch: refetchPolicies,
    isFetching: policyFetching,
  } = usePayBandPolicies({ enabled: canView });

  const [tab, setTab] = useState('below');

  /**
   * Every ACTIVE person, checked against their college's band.
   *
   * Relieved employees are excluded. The directory admits them when they still
   * carry an unsuperseded salary — the same 22 rows that made the Salaries
   * screen's "monthly commitment" card overstate by 6,33,440 a month — and a
   * band breach on somebody the organisation no longer pays is not a finding.
   */
  const checked = useMemo<CheckedRow[]>(() => {
    if (!directory || !policies) return [];

    return directory
      .filter((row) => row.is_active)
      .map((row) => {
        const policy = policies.byInstitution.get(row.works_at_id) ?? null;
        return {
          staffUuid: row.staff_uuid,
          name: row.person_name,
          code: row.staff_code,
          designation: row.role_title,
          monthlyPay: row.monthly_gross,
          collegeId: row.works_at_id,
          collegeName: row.works_at_name,
          result: checkPayBand(
            { designation: row.role_title, monthlyPay: row.monthly_gross },
            policy
          ),
        };
      });
  }, [directory, policies]);

  const collegesWithBand = useMemo(
    () => new Set(policies ? [...policies.byInstitution.keys()] : []),
    [policies]
  );

  const perCollege = useMemo(
    () => summarisePayBandByCollege(checked, collegesWithBand),
    [checked, collegesWithBand]
  );

  const below = useMemo(
    () =>
      checked
        .filter((r) => r.result.verdict === 'below_band')
        .sort((a, b) => b.result.shortfall - a.result.shortfall),
    [checked]
  );
  const above = useMemo(
    () =>
      checked
        .filter((r) => r.result.verdict === 'above_band')
        .sort((a, b) => b.result.excess - a.result.excess),
    [checked]
  );
  const unknown = useMemo(
    () =>
      checked
        .filter((r) => r.result.verdict === 'cannot_tell')
        .sort((a, b) => a.collegeName.localeCompare(b.collegeName)),
    [checked]
  );
  const within = useMemo(() => checked.filter((r) => r.result.verdict === 'within_band'), [checked]);

  const totals = useMemo(() => {
    const shortfall = perCollege.reduce((sum, c) => sum + c.totalShortfall, 0);
    const excess = perCollege.reduce((sum, c) => sum + c.totalExcess, 0);
    const underMinimum = checked.filter((r) => r.result.belowGuaranteedMinimum).length;
    return {
      shortfall: Math.round(shortfall * 100) / 100,
      excess: Math.round(excess * 100) / 100,
      underMinimum,
      collegesWithoutBand: perCollege.filter((c) => !c.hasBand).length,
      colleges: perCollege.length,
    };
  }, [checked, perCollege]);

  const isLoading = permsLoading || staffLoading || policyLoading;
  const isFetching = staffFetching || policyFetching;
  const error = staffError ?? policyError;

  // Denial is enforced by the salary RPC and the bands route; this only
  // explains it. Never a silent
  // redirect — somebody who lands here must be told why the page is empty.
  if (!permsLoading && !canView) {
    return (
      <ContentLayout title='Pay Band Check'>
        <Alert variant='destructive' className='mt-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertDescription>
            You do not have access to the pay band check. It reads what every team member
            earns, which is restricted to the Super Administrator and the HR Head. Ask the
            HR Head if you need this.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Pay Band Check'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href='/dashboard'>Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href='/hr'>HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/hr/payroll/organisation'>Payroll</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Pay Band Check</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mb-5 flex flex-wrap items-start justify-between gap-3'>
        <div className='max-w-3xl'>
          <h1 className='text-2xl font-semibold tracking-tight'>Pay Band Check</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Compares what each team member is paid against the pay band recorded for their
            college. Reporting only — nothing here changes anyone&apos;s pay. The band is set
            on{' '}
            <Link href='/hr/admin/policies/pay-scales' className='underline'>
              Pay Scales
            </Link>{' '}
            and the pay on{' '}
            <Link href='/hr/payroll/salaries' className='underline'>
              Employee Salaries
            </Link>
            .
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => { refetchStaff(); refetchPolicies(); }}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-4'>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className='flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
          Comparing pay against the bands…
        </div>
      ) : (
        <>
          {/* The honest headline: most people cannot be checked at all. */}
          {totals.collegesWithoutBand > 0 && (
            <Alert className='mb-4'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>
                <span className='font-medium'>
                  {totals.collegesWithoutBand} of {totals.colleges} colleges have no pay band
                  recorded.
                </span>{' '}
                Nobody who works at those colleges can be checked — they are counted under
                &ldquo;Cannot tell&rdquo; below, not as compliant. A band is recorded per
                college on{' '}
                <Link href='/hr/admin/policies/pay-scales' className='underline'>
                  Pay Scales
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}

          <div className='mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard
              icon={ArrowDownCircle}
              label='Below band'
              value={String(below.length)}
              sub={
                totals.shortfall > 0
                  ? `${INR.format(totals.shortfall)} a month to reach the floor`
                  : undefined
              }
            />
            <StatCard
              icon={ArrowUpCircle}
              label='Above band'
              value={String(above.length)}
              sub={totals.excess > 0 ? `${INR.format(totals.excess)} a month above` : undefined}
            />
            <StatCard
              icon={Scale}
              label='Within band'
              value={String(within.length)}
              sub={`of ${checked.length} active team members`}
            />
            <StatCard
              icon={HelpCircle}
              label='Cannot tell'
              value={String(unknown.length)}
              sub='Not the same as compliant'
            />
          </div>

          {totals.underMinimum > 0 && (
            <Alert className='mb-5'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>
                <span className='font-medium'>
                  {totals.underMinimum} team members are paid under the minimum basic their
                  college guarantees.
                </span>{' '}
                This is counted separately from the band: a job title&apos;s band can sit
                below the college&apos;s guaranteed minimum, so somebody can be inside their
                band and under the guarantee at the same time.
              </AlertDescription>
            </Alert>
          )}

          {/* Per college */}
          <h2 className='mb-2 text-lg font-semibold'>By college</h2>
          <div className='mb-6 overflow-x-auto rounded-md border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>College</TableHead>
                  <TableHead className='text-right'>Team members</TableHead>
                  <TableHead className='text-right'>Below</TableHead>
                  <TableHead className='text-right'>Above</TableHead>
                  <TableHead className='text-right'>Within</TableHead>
                  <TableHead className='text-right'>Cannot tell</TableHead>
                  <TableHead className='text-right'>Monthly shortfall</TableHead>
                  <TableHead className='text-right'>Monthly excess</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perCollege.map((c) => (
                  <TableRow key={c.collegeId}>
                    <TableCell>
                      <span className='font-medium'>{c.collegeName}</span>
                      {!c.hasBand && (
                        <Badge variant='secondary' className='ml-2 font-normal'>
                          No band recorded
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{c.people}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {c.below > 0 ? <span className='font-medium text-destructive'>{c.below}</span> : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {c.above > 0 ? c.above : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{c.within || '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{c.cannotTell || '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {c.totalShortfall > 0 ? INR.format(c.totalShortfall) : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {c.totalExcess > 0 ? INR.format(c.totalExcess) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {perCollege.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className='text-sm text-muted-foreground'>
                      No active team members are in scope for you.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* People */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className='mb-3'>
              <TabsTrigger value='below'>Below band ({below.length})</TabsTrigger>
              <TabsTrigger value='above'>Above band ({above.length})</TabsTrigger>
              <TabsTrigger value='unknown'>Cannot tell ({unknown.length})</TabsTrigger>
            </TabsList>

            <TabsContent value='below'>
              <PeopleTable
                rows={below}
                amountHeader='Shortfall'
                amountOf={(r) => INR.format(r.result.shortfall)}
                emptyMessage={
                  collegesWithBand.size === 0
                    ? 'Nobody can be checked yet, because no college has a pay band recorded.'
                    : 'Nobody in scope is paid below the band for their job title.'
                }
              />
            </TabsContent>

            <TabsContent value='above'>
              <PeopleTable
                rows={above}
                amountHeader='Excess'
                amountOf={(r) => INR.format(r.result.excess)}
                emptyMessage={
                  collegesWithBand.size === 0
                    ? 'Nobody can be checked yet, because no college has a pay band recorded.'
                    : 'Nobody in scope is paid above the band for their job title.'
                }
              />
            </TabsContent>

            <TabsContent value='unknown'>
              <p className='mb-3 text-sm text-muted-foreground'>
                These people were not compared against anything. The reason is on each row,
                and it is the thing to fix before the check can answer for them.
              </p>
              <PeopleTable
                rows={unknown}
                amountHeader='Shortfall'
                amountOf={() => '—'}
                emptyMessage='Everybody in scope could be checked.'
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </ContentLayout>
  );
}
