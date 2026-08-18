'use client';

// ============================================================================
// IdCardAddressCheck — the addresses that will print wrong, per college,
// ranked so the office can work down a list before a batch goes to the printer.
// Created: 2026-08-14.
//
// It reads learners_profiles through the browser client, so RLS scopes the
// rows exactly as it does everywhere else, and classifies each permanent
// address with lib/id-cards/address-quality.ts. Nothing here writes: every
// row links out to the learner's own edit screen, because the defects that
// matter need a person to decide (a record holding two different PIN codes
// cannot be repaired by a rule).
//
// The list is split on ONE question — does a person have to make a judgement
// call, or will the address merely print long? Measured on production
// 2026-08-14, 86.9% of active learners are over the default back's 60-char
// cut simply because a correct Tamil Nadu address is that long, so a report
// that leads with length is a report nobody can act on.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download, Loader2, RefreshCw, Ruler, ShieldAlert, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { logger, serializeError } from '@/lib/utils/enhanced-logger';
import {
  ADDRESS_ISSUE_META,
  PRINTABLE_ADDRESS_CUSTOM_BACK_MAX,
  PRINTABLE_ADDRESS_DEFAULT_BACK_MAX,
  assessAddress,
  needsHumanDecision,
  type AddressAssessment,
} from '@/lib/id-cards/address-quality';

const LOG_MODULE = 'id-cards/address-check';
const FETCH_PAGE_SIZE = 1000;

// Stable identity — an inline array would re-fire the hook's effect forever.
const COHORT_ENTITY_TYPES: Array<'institution' | 'school'> = ['institution', 'school'];

/** Which learners could receive a card. Mirrors the batch-print cohort choices. */
const SCOPE_CHOICES = [
  { value: 'active', label: 'Active learners', statuses: ['active'] },
  {
    value: 'active_admitted',
    label: 'Active + newly admitted',
    statuses: ['active', 'admitted', 'account'],
  },
] as const;

type ScopeValue = (typeof SCOPE_CHOICES)[number]['value'];
type ViewFilter = 'decide' | 'long' | 'all';

interface LearnerAddressRow {
  id: string;
  name: string;
  rollNumber: string;
  assessment: AddressAssessment;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-amber-100 text-amber-900 border-amber-200',
  medium: 'bg-slate-100 text-slate-700 border-slate-200',
};

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function IdCardAddressCheck() {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: COHORT_ENTITY_TYPES,
  });

  const [institutionId, setInstitutionId] = useState<string>('');
  const [scope, setScope] = useState<ScopeValue>('active');
  const [view, setView] = useState<ViewFilter>('decide');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LearnerAddressRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId && institutions.length > 0) setInstitutionId(institutions[0].id);
  }, [institutions, institutionId]);

  const loadRows = useCallback(async () => {
    if (!institutionId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const supabase = createClientSupabaseClient();
      const statuses = SCOPE_CHOICES.find((c) => c.value === scope)?.statuses ?? ['active'];
      const collected: LearnerAddressRow[] = [];

      for (let from = 0; ; from += FETCH_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('learners_profiles')
          .select(
            'id, first_name, last_name, roll_number, permanent_address_street, permanent_address_taluk, permanent_address_district, permanent_address_state, permanent_address_pin_code'
          )
          .eq('institution_id', institutionId)
          .in('lifecycle_status', statuses)
          .order('id')
          .range(from, from + FETCH_PAGE_SIZE - 1);

        if (error) throw error;
        for (const record of data ?? []) {
          collected.push({
            id: record.id,
            name: [record.first_name, record.last_name].filter(Boolean).join(' ').trim() || 'Unnamed',
            rollNumber: record.roll_number ?? '',
            assessment: assessAddress({
              street: record.permanent_address_street,
              taluk: record.permanent_address_taluk,
              district: record.permanent_address_district,
              state: record.permanent_address_state,
              pinCode: record.permanent_address_pin_code,
            }),
          });
        }
        if (!data || data.length < FETCH_PAGE_SIZE) break;
      }

      collected.sort(
        (a, b) => b.assessment.score - a.assessment.score || a.name.localeCompare(b.name)
      );
      setRows(collected);
    } catch (error) {
      logger.error(LOG_MODULE, 'Failed to load addresses', serializeError(error));
      setLoadError('Could not load the addresses for this college. Try again in a moment.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [institutionId, scope]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const summary = useMemo(() => {
    let decide = 0;
    let long = 0;
    let clean = 0;
    let overCustom = 0;
    let overDefault = 0;
    for (const row of rows) {
      if (needsHumanDecision(row.assessment)) decide += 1;
      else if (row.assessment.issues.length > 0) long += 1;
      else clean += 1;
      if (row.assessment.overCustomBack) overCustom += 1;
      if (row.assessment.overDefaultBack) overDefault += 1;
    }
    return { decide, long, clean, overCustom, overDefault, total: rows.length };
  }, [rows]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === 'decide' && !needsHumanDecision(row.assessment)) return false;
      if (view === 'long' && (needsHumanDecision(row.assessment) || row.assessment.issues.length === 0))
        return false;
      if (view === 'all' && row.assessment.issues.length === 0) return false;
      if (term === '') return true;
      return (
        row.name.toLowerCase().includes(term) ||
        row.rollNumber.toLowerCase().includes(term) ||
        row.assessment.joined.toLowerCase().includes(term)
      );
    });
  }, [rows, view, search]);

  const collegeName = institutions.find((i) => i.id === institutionId)?.name ?? 'college';

  const handleExport = () => {
    if (visible.length === 0) {
      toast('Nothing to export in this view.');
      return;
    }
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [
      ['Rank', 'Learner', 'Roll number', 'Address as printed', 'Characters', 'Problems', 'What to do'].join(','),
      ...visible.map((row, index) =>
        [
          String(index + 1),
          escape(row.name),
          escape(row.rollNumber),
          escape(row.assessment.joined),
          String(row.assessment.length),
          escape(row.assessment.issues.map((code) => ADDRESS_ISSUE_META[code].label).join('; ')),
          escape(row.assessment.issues.map((code) => ADDRESS_ISSUE_META[code].fix).join(' ')),
        ].join(',')
      ),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `address-check-${collegeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visible.length} records.`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pick a college</CardTitle>
          <CardDescription>
            Every college is checked the same way. Nothing on this page changes a record — it points
            you at the ones a person has to fix.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="address-check-college">College</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="address-check-college">
                <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Choose a college'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address-check-scope">Who to check</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as ScopeValue)}>
              <SelectTrigger id="address-check-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => void loadRows()} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              Re-check
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={isLoading || visible.length === 0}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={Users}
          label="Learners checked"
          value={String(summary.total)}
          hint={collegeName}
        />
        <SummaryTile
          icon={ShieldAlert}
          label="Need a person to decide"
          value={String(summary.decide)}
          hint="Two PIN codes, a phone number, filler text or pasted form labels"
        />
        <SummaryTile
          icon={Ruler}
          label="Will print cut off"
          value={String(summary.overCustom)}
          hint={`Over ${PRINTABLE_ADDRESS_CUSTOM_BACK_MAX} characters, so every card layout trims the end`}
        />
        <SummaryTile
          icon={AlertTriangle}
          label="Address prints in full"
          value={String(summary.total - summary.overDefault)}
          hint={`Fits the ${PRINTABLE_ADDRESS_DEFAULT_BACK_MAX}-character line on the standard card back`}
        />
      </div>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Work list</CardTitle>
              <CardDescription>
                Worst first. Open a learner to fix the record, then re-check.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={view} onValueChange={(value) => setView(value as ViewFilter)}>
                <SelectTrigger className="w-[230px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decide">Needs a person ({summary.decide})</SelectItem>
                  <SelectItem value="long">Prints long or duplicated ({summary.long})</SelectItem>
                  <SelectItem value="all">Everything with a problem ({summary.decide + summary.long})</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, roll number or address"
                className="w-[260px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="py-10 text-center text-sm text-destructive">{loadError}</p>
          ) : isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Checking addresses…
            </p>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing to fix in this view.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Learner</TableHead>
                    <TableHead>What the card would print</TableHead>
                    <TableHead>Problems</TableHead>
                    <TableHead>What to do</TableHead>
                    <TableHead className="text-right">Fix</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium">{row.name}</p>
                        {row.rollNumber ? (
                          <p className="text-xs text-muted-foreground">{row.rollNumber}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="break-words text-sm">
                          {row.assessment.joined || <span className="italic text-muted-foreground">empty</span>}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.assessment.length} characters
                          {row.assessment.overCustomBack
                            ? ' — cut off on every layout'
                            : row.assessment.overDefaultBack
                              ? ' — cut off on the standard back'
                              : ''}
                          {row.assessment.conflictingPinCodes.length > 0
                            ? ` · PIN codes found: ${row.assessment.conflictingPinCodes.join(' and ')}`
                            : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.assessment.issues.map((code) => (
                            <Badge
                              key={code}
                              variant="outline"
                              className={SEVERITY_STYLE[ADDRESS_ISSUE_META[code].severity]}
                              title={ADDRESS_ISSUE_META[code].why}
                            >
                              {ADDRESS_ISSUE_META[code].label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-muted-foreground">
                        {ADDRESS_ISSUE_META[row.assessment.issues[0]].fix}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/learners/profiles/${row.id}/edit`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
