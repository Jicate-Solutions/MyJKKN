'use client';

// Agency Payout Readiness — who cannot be paid, and which of those matter.
//
// 129 of the 152 active agencies are missing a bank account or a PAN. That number
// has been carried around as the job to do. It isn't: 113 of the 129 have no
// 2026-27 referrals at all, so collecting their details buys nothing. Sixteen
// agencies are holding up thirty-six real referrals.
//
// The screen is built around that difference. It opens on the agencies with
// referrals waiting, ordered by how many, so the desk works down a phone list
// instead of down an alphabet. The idle ones are still here — behind a toggle,
// because they are a data-tidiness job and not a payment one.
//
// Nothing is edited here. Filling in the missing details happens on the agency's
// own edit screen, which already owns that form.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Download, PhoneCall, CheckCircle2, Pencil } from 'lucide-react';
import {
  ConsultantPayoutReadinessService,
  type AgencyPayoutReadiness,
  type PayoutReadinessResult,
} from '@/lib/services/admission/consultant-payout-readiness-service';

const YEARS = [2025, 2026];

function yearLabel(y: number) {
  return `${y}–${String(y + 1).slice(2)}`;
}

export default function PayoutReadinessPage() {
  const [year, setYear] = useState<number>(2026);
  const [showIdle, setShowIdle] = useState(false);

  const { data, isLoading, error } = useQuery<PayoutReadinessResult>({
    queryKey: ['consultant-payout-readiness', year],
    queryFn: () => ConsultantPayoutReadinessService.get(year),
  });

  const s = data?.summary;

  // The chase list, then optionally the idle tail. Ready agencies are never
  // listed — this screen is about what is missing.
  const rows = useMemo(() => {
    const all = data?.agencies ?? [];
    const blocked = all.filter((a) => !a.generator_ready);
    return showIdle ? blocked : blocked.filter((a) => a.referrals > 0);
  }, [data, showIdle]);

  const download = () => {
    const csv = ConsultantPayoutReadinessService.toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agency-payout-chase-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} agenc${rows.length === 1 ? 'y' : 'ies'} exported.`);
  };

  return (
    <ContentLayout title="Agency Payout Readiness">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Agency Payout Readiness</h1>
            <p className="text-sm text-muted-foreground">
              An agency with no bank account or PAN on file cannot be paid, however correct its
              referrals are. This is who to chase, starting with the ones holding up the most.
            </p>
          </div>

          {/* The headline: the difference between a phone list and a cleanup project. */}
          <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PhoneCall className="h-5 w-5" />
                {isLoading
                  ? 'Counting…'
                  : (s?.blocked_with_referrals ?? 0) === 0
                    ? 'Nobody is holding up a referral'
                    : `${s?.blocked_with_referrals} agenc${s?.blocked_with_referrals === 1 ? 'y is' : 'ies are'} holding up ${s?.referrals_stuck} referral${s?.referrals_stuck === 1 ? '' : 's'}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <p>
                    {s?.blocked} of {s?.total} active agencies are missing a bank account or a PAN.
                    But <strong>{s?.blocked_idle} of them have no {yearLabel(year)} referrals at
                    all</strong>, so collecting their details would move no money. The list below is
                    the {s?.blocked_with_referrals} that would.
                  </p>
                  <p className="text-muted-foreground">
                    {s?.ready} agenc{s?.ready === 1 ? 'y is' : 'ies are'} ready to be paid the moment
                    a rate is set.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Academic year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{yearLabel(y)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="show-idle" checked={showIdle} onCheckedChange={setShowIdle} />
              <Label htmlFor="show-idle" className="text-sm">
                Also show the {s?.blocked_idle ?? 0} with no referrals
              </Label>
            </div>

            <Button variant="outline" size="sm" onClick={download} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-1" /> Export this list
            </Button>
          </div>

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                Could not load payout readiness: {(error as Error).message}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                {showIdle ? 'Every agency missing payout details' : 'Agencies with referrals waiting'}
              </CardTitle>
              <CardDescription>
                Ordered by referrals waiting, so the first row is the most worth a phone call.
                Details are filled in on each agency&apos;s own page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : !rows.length ? (
                <div className="py-10 text-center space-y-2">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
                  <p className="text-sm text-muted-foreground">
                    {showIdle
                      ? `Every active agency has a bank account and a PAN on file.`
                      : `No agency with ${yearLabel(year)} referrals is missing its payout details.`}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agency</TableHead>
                        <TableHead>Who to contact</TableHead>
                        <TableHead className="text-right">Referrals waiting</TableHead>
                        <TableHead>Missing</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((a) => (
                        <AgencyRow key={a.consultant_id} a={a} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}

function AgencyRow({ a }: { a: AgencyPayoutReadiness }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={`/admission/consultants/${a.consultant_id}`} className="text-primary hover:underline">
          {a.name}
        </Link>
      </TableCell>
      <TableCell className="text-sm">
        {a.contact_person || a.email || a.phone ? (
          <div className="space-y-0.5">
            {a.contact_person && <div>{a.contact_person}</div>}
            {a.phone && (
              <a href={`tel:${a.phone}`} className="block text-muted-foreground hover:underline">
                {a.phone}
              </a>
            )}
            {a.email && (
              <a href={`mailto:${a.email}`} className="block text-muted-foreground hover:underline">
                {a.email}
              </a>
            )}
          </div>
        ) : (
          // No phone, no email, no named person — the chase itself is blocked.
          <span className="text-muted-foreground">No contact on file</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {a.referrals > 0 ? (
          <span className="font-medium">{a.referrals}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {a.missing.map((m) => (
            <Badge key={m} variant="secondary">{m}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/admission/consultants/${a.consultant_id}/edit`}>
            <Pencil className="h-4 w-4 mr-1" /> Add details
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
