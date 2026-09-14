'use client';

// Attribution Orphans — read-only review screen.
//
// consultant_lead_attributions says "this agency brought someone". 168 of its
// 1,856 rows (production, 2026-09-12) do not say who: learner_profile_id is
// NULL. Rule 4 of the referral spec says a row that may represent money owed is
// never skipped silently and never deleted — so it gets a list and a human,
// which is all this page is.
//
// This is the mirror image of Unlinked Referrals next door. There the learner is
// known and the agency is not, so that screen can link write-once. Here the
// agency is known and the learner is not, so there is nothing to link TO. The
// page therefore has no action at all, and says so loudly — a review list with
// buttons a reviewer cannot use is worse than one without.
//
// Measured before building:
//     9 of the 168 are RECOVERABLE — the lead behind them does carry a learner,
//       the attribution just never had the link copied across. They sort first.
//   159 are genuinely orphaned — the lead has no learner either, so the enquiry
//       never became an admission and no learner exists to name.
// Two further reasons (lead_missing, no_admission_id) are empty today but are
// still rendered, because intake writes to this table daily and a row that fits
// no bucket must not vanish from a screen whose whole job is not losing rows.
//
// Deliberately NOT built: a "copy the learner across" button for the 9. The lead
// knowing the learner is strong evidence, not proof, and a wrong copy writes a
// person into a money path. Whether that copy happens, and who confirms it, is
// the Director's decision and a later screen.

import { useEffect, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AlertTriangle, Eye, Wrench } from 'lucide-react';
import {
  ReferralAttributionOrphanService,
  type ReferralAttributionOrphan,
  type ReferralAttributionOrphanReason,
} from '@/lib/services/admission/referral-attribution-orphan-service';

/**
 * One plain-English explanation per reason, written for an admission admin who
 * does not read SQL: what the row means, and what to do about it.
 */
const REASON_COPY: Record<
  ReferralAttributionOrphanReason,
  { title: string; meaning: string; whatToDo: string; recoverable: boolean }
> = {
  lead_has_learner: {
    title: 'The enquiry does know the learner',
    meaning:
      'The enquiry behind this credit has a learner attached, but the credit record itself was never given that link. Nothing is lost — the two records simply were never joined.',
    whatToDo:
      'Check that the learner on the enquiry really is the person this agency referred. Once someone has confirmed it, the link can be copied across. Nothing on this page copies anything.',
    recoverable: true,
  },
  lead_not_converted: {
    title: 'The enquiry never became a learner',
    meaning:
      'The agency was credited when the enquiry came in, but that enquiry has no learner on it either — as far as our records go, this person never joined.',
    whatToDo:
      'Confirm with the agency or the institution whether the person joined under a different record. If they never joined, the credit stands unpaid and no one needs to do anything else.',
    recoverable: false,
  },
  lead_missing: {
    title: 'The enquiry it points at is gone',
    meaning:
      'This credit names an enquiry that no longer exists in the system, so there is no trail back to a person from here.',
    whatToDo:
      'Raise it with whoever maintains the enquiry records before anything else is decided about this credit.',
    recoverable: false,
  },
  no_admission_id: {
    title: 'No enquiry recorded at all',
    meaning:
      'This credit was created without any enquiry attached, so it names an agency and nothing else.',
    whatToDo:
      'Ask the agency and the person who created the record which enquiry it was meant for.',
    recoverable: false,
  },
};

const REASON_ORDER: ReferralAttributionOrphanReason[] = [
  'lead_has_learner',
  'lead_not_converted',
  'lead_missing',
  'no_admission_id',
];

/**
 * The RPC raises a bare Postgres exception when the caller fails its gate, and
 * PostgREST returns a 404 when the function has not been applied yet. Neither
 * string tells a reader what to do, so both are translated here — rule 27 asks
 * for an explicit refusal that names WHO to ask, the way PermissionNotice does
 * (components/auth/permission-guard.tsx).
 */
type LoadFailure = { title: string; detail: string; permissionKey?: string };

export function classifyLoadError(message?: string | null): LoadFailure {
  const raw = (message || '').toLowerCase();

  if (raw.includes('not authorised to view referral attribution orphans')) {
    return {
      title: 'This page is not open to you',
      detail:
        'Nothing is broken. None of your roles include the permission below, so the list stays hidden. To get it, ask whoever manages roles for your institution to add that permission under Users, then Role Management. If you think you should already have it, tap the red bug button at the bottom right of this screen and report it.',
      permissionKey: 'admission.consultants.commissions.view',
    };
  }

  // PostgREST answers a missing function with 404 / PGRST202.
  if (raw.includes('pgrst202') || raw.includes('could not find the function') || raw.includes('does not exist')) {
    return {
      title: 'This list is not switched on yet',
      detail:
        'The page has shipped but the database side of it has not been applied yet, so there is nothing to read. This is not a permission problem and nothing is lost. Tap the red bug button at the bottom right of this screen and report it.',
    };
  }

  return {
    title: 'Could not load attribution orphans',
    detail:
      message ||
      'Something went wrong reading the list. Reload the page to try again, and if it keeps happening tap the red bug button at the bottom right of this screen and report it.',
  };
}

export default function AttributionOrphansPage() {
  const [rows, setRows] = useState<ReferralAttributionOrphan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await ReferralAttributionOrphanService.listOrphans();
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(classifyLoadError(e?.message));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Group in a fixed order so an empty reason still gets named, rather than
  // disappearing from the page along with the rows it would have held.
  const grouped = useMemo(() => {
    return REASON_ORDER.map((reason) => ({
      reason,
      rows: rows.filter((r) => r.reason === reason),
    }));
  }, [rows]);

  const recoverableCount = grouped.find((g) => g.reason === 'lead_has_learner')?.rows.length ?? 0;

  return (
    <ContentLayout title="Attribution Orphans">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Attribution Orphans</h1>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Every one of these records says an agency brought someone in, but does not say which
              learner. They cannot be paid, because nobody can name the person — and they are not
              thrown away either, because each one may represent someone who is owed. They sit here
              until a human works through them.
            </p>
          </div>

          {/* The single most important thing a reader can know about this page. */}
          <Card className="border-sky-500/40 bg-sky-50/60 dark:bg-sky-950/20">
            <CardContent className="flex items-start gap-3 py-4">
              <Eye className="h-5 w-5 mt-0.5 shrink-0 text-sky-700 dark:text-sky-400" />
              <p className="text-sm text-sky-900 dark:text-sky-100">
                <span className="font-semibold">This page only shows. </span>
                Nothing here pays anyone, changes any record, or deletes anything — there are no
                buttons to press. It is a list to work through, one conversation at a time.
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : loadError ? (
            <Card>
              <CardContent className="flex items-start gap-3 py-6">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium text-foreground">{loadError.title}</p>
                  <p className="text-muted-foreground">{loadError.detail}</p>
                  {loadError.permissionKey ? (
                    <code className="inline-block rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                      {loadError.permissionKey}
                    </code>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10">
                <p className="text-sm text-muted-foreground text-center">
                  Every agency credit names a learner. Nothing to work through.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {rows.length} record{rows.length === 1 ? '' : 's'} with no learner
                {recoverableCount > 0 && (
                  <>
                    {' '}— and {recoverableCount} of them look fixable, listed first.
                  </>
                )}
              </p>

              {grouped.map(({ reason, rows: group }) => (
                <ReasonSection key={reason} reason={reason} rows={group} />
              ))}
            </>
          )}
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}

/**
 * One bucket. Rendered even when empty, so the page always names every way a
 * record can end up here — a reason that silently disappears is a reason nobody
 * will think to look for when it comes back.
 */
function ReasonSection({
  reason,
  rows,
}: {
  reason: ReferralAttributionOrphanReason;
  rows: ReferralAttributionOrphan[];
}) {
  const copy = REASON_COPY[reason];

  return (
    <Card className={copy.recoverable ? 'border-emerald-500/50 shadow-sm' : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{copy.title}</CardTitle>
          {copy.recoverable ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
              <Wrench className="h-3 w-3 mr-1" />
              Looks fixable
            </Badge>
          ) : (
            <Badge variant="outline">Needs a decision</Badge>
          )}
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <CardDescription className="max-w-3xl space-y-2 pt-1">
          <span className="block">{copy.meaning}</span>
          <span className="block">
            <span className="font-medium text-foreground">What to do: </span>
            {copy.whatToDo}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            None right now. Listed so it is not a surprise when one appears.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency credited</TableHead>
                  <TableHead>Who the enquiry names</TableHead>
                  <TableHead className="min-w-[170px]">Who to ring</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Programme</TableHead>
                  <TableHead>Credited on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.attribution_id}>
                    <TableCell className="font-medium">
                      {row.consultant_name || (
                        <span className="text-muted-foreground italic">No agency name on record</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.lead_name || (
                        <span className="text-muted-foreground italic">No name recorded</span>
                      )}
                      {row.application_number && (
                        <div className="text-xs text-muted-foreground">
                          Application {row.application_number}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <ContactLeads row={row} />
                    </TableCell>
                    <TableCell>{row.institution_name || '—'}</TableCell>
                    <TableCell>{row.program_name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Who can say who this person is. The Unlinked Referrals screen learned the hard
 * way that the answer is rarely in the row — it is with one of these people, so
 * they belong on the row rather than one click away.
 */
function ContactLeads({ row }: { row: ReferralAttributionOrphan }) {
  const leads: { label: string; value: string }[] = [];
  if (row.lead_phone) leads.push({ label: 'Enquirer', value: row.lead_phone });
  if (row.parent_phone) leads.push({ label: row.parent_name || 'Parent', value: row.parent_phone });
  if (row.lead_alt_phone) leads.push({ label: 'Alternate', value: row.lead_alt_phone });

  return (
    <div className="space-y-0.5">
      {leads.map((l) => (
        <div key={l.label + l.value}>
          <span className="text-muted-foreground">{l.label}: </span>
          <a href={`tel:${l.value}`} className="hover:underline">{l.value}</a>
        </div>
      ))}
      {row.lead_email && <div className="text-muted-foreground break-all">{row.lead_email}</div>}
      {row.recorded_by_name && (
        <div className="text-muted-foreground">Entered by {row.recorded_by_name}</div>
      )}
      {!leads.length && !row.lead_email && !row.recorded_by_name && (
        <span className="text-muted-foreground">No contact on file</span>
      )}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
