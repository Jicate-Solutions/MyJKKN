'use client';

// =====================================================================
// /hr/automation — HR-officer view of automation rule firings
// =====================================================================
// Operational page (NOT the editor — that lives at /hr/admin/automation-rules).
// Shows recent rule firings from hr_automation_rule_fires, RLS-filtered to
// the HR officer's institutions. Staff see their own firings via the same
// page (RLS policy permits staff.profile_id ↔ auth.uid()).
//
// Workisy gap #1, Wave 1 (2026-05-15). The writer (cron) lands in Wave 2;
// until then this page renders an empty state pointing to the editor.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Inbox, Settings2 } from 'lucide-react';
import { format } from 'date-fns';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleFireRow {
  id: string;
  rule_key: string;
  staff_id: string;
  institution_id: string | null;
  fired_on: string;            // YYYY-MM-DD
  fired_at: string;            // ISO
  deduction_minutes: number | null;
  deduction_amount: number | null;
  occurrence_index: number;
  context: Record<string, unknown> | null;
  staff: { id: string; first_name: string | null; last_name: string | null } | null;
}

const RULE_KEY_LABEL: Record<string, string> = {
  late_entry: 'Late Entry',
  break: 'Break Overrun',
  early_exit: 'Early Exit',
  overtime: 'Overtime',
};

const LOOKBACK_DAYS = 30;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HRAutomationPage() {
  return (
    <ContentLayout title="HR Automation">
      <HRAutomationContent />
    </ContentLayout>
  );
}

function HRAutomationContent() {
  const [rows, setRows] = useState<RuleFireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ruleFilter, setRuleFilter] = useState<string>('all');
  const [staffQuery, setStaffQuery] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const since = new Date();
        since.setDate(since.getDate() - LOOKBACK_DAYS);
        const sinceDate = since.toISOString().slice(0, 10);

        const { data, error: qErr } = await supabase
          .from('hr_automation_rule_fires')
          .select(
            'id, rule_key, staff_id, institution_id, fired_on, fired_at, deduction_minutes, deduction_amount, occurrence_index, context, staff:staff_id ( id, first_name, last_name )',
          )
          .gte('fired_on', sinceDate)
          .order('fired_at', { ascending: false })
          .limit(500);

        if (qErr) {
          // PostgrestError has .message; default Error.toString() gives [object Object].
          const msg = qErr.message ?? (typeof qErr === 'string' ? qErr : JSON.stringify(qErr));
          throw new Error(msg);
        }
        if (cancelled) return;
        // PostgREST returns the joined staff as an object (single FK) when the
        // relationship is many-to-one; tolerate array shape just in case.
        const normalized: RuleFireRow[] = (data ?? []).map((r) => {
          const rawStaff = (r as { staff?: unknown }).staff;
          const staff = Array.isArray(rawStaff)
            ? (rawStaff[0] as RuleFireRow['staff']) ?? null
            : ((rawStaff as RuleFireRow['staff']) ?? null);
          return { ...(r as Omit<RuleFireRow, 'staff'>), staff };
        });
        setRows(normalized);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived list — filter by rule_key + staff name
  const filtered = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (ruleFilter !== 'all' && r.rule_key !== ruleFilter) return false;
      if (q) {
        const full = `${r.staff?.first_name ?? ''} ${r.staff?.last_name ?? ''}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [rows, ruleFilter, staffQuery]);

  // Distinct rule_keys seen in the recent window (for the filter dropdown).
  const ruleKeysInWindow = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.rule_key));
    return Array.from(set);
  }, [rows]);

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load HR automation firings</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Automation rule firings (last {LOOKBACK_DAYS} days)</CardTitle>
          <CardDescription>
            Every time an automation rule (late entry, break, early exit,
            overtime) fired against attendance data. Filtered to your
            institution&apos;s staff by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Search staff
              </label>
              <Input
                value={staffQuery}
                onChange={(e) => setStaffQuery(e.target.value)}
                placeholder="Type a name…"
                className="max-w-sm"
              />
            </div>
            <div className="w-full sm:w-56 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Rule type
              </label>
              <Select value={ruleFilter} onValueChange={setRuleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All rules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rules</SelectItem>
                  {ruleKeysInWindow.map((k) => (
                    <SelectItem key={k} value={k}>
                      {RULE_KEY_LABEL[k] ?? k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState totalRows={rows.length} />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Deduction</TableHead>
                    <TableHead>Occurrence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(r.fired_on), 'MMM d')}
                      </TableCell>
                      <TableCell>
                        {[r.staff?.first_name, r.staff?.last_name].filter(Boolean).join(' ') || (
                          <span className="text-xs text-muted-foreground">staff #{r.staff_id.slice(0, 8)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{RULE_KEY_LABEL[r.rule_key] ?? r.rule_key}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatDeduction(r)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        #{r.occurrence_index} of month
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDeduction(r: RuleFireRow): string {
  if (r.deduction_minutes != null) return `${r.deduction_minutes} min`;
  if (r.deduction_amount != null) return `₹${Number(r.deduction_amount).toFixed(2)}`;
  return '—';
}

function EmptyState({ totalRows }: { totalRows: number }) {
  if (totalRows === 0) {
    return (
      <Alert>
        <Inbox className="h-4 w-4" />
        <AlertTitle>No automation rules have fired yet</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            The HR attendance writer hasn&apos;t recorded any rule firings in
            the last {LOOKBACK_DAYS} days.
          </p>
          <p className="text-xs">
            Director can configure rules at{' '}
            <Link
              href="/hr/admin/automation-rules"
              className="underline underline-offset-2 inline-flex items-center gap-1"
            >
              <Settings2 className="h-3 w-3" />
              /hr/admin/automation-rules
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <Inbox className="h-4 w-4" />
      <AlertTitle>No firings match the current filters</AlertTitle>
      <AlertDescription>
        Try clearing the staff search or selecting <strong>All rules</strong>.
      </AlertDescription>
    </Alert>
  );
}
