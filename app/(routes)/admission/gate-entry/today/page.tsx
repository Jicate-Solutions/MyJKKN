'use client';

// ============================================================================
// app/(routes)/admission/gate-entry/today/page.tsx
// ----------------------------------------------------------------------------
// Today's Gate Entries — institution-scoped read-only list of every gate
// entry captured today. Useful for:
//   - Gate security verifying they entered a returning visitor correctly
//   - Admission team seeing the day's volume at a glance
//
// Permission: admission.gate_entry.view (granted to admission, admission_staff,
// gate_security). Counselors do NOT get .view to keep the leads-list-only model.
//
// Data source: joins admission_lead_source_captures (source='gate_entry',
// captured today) with admission_leads (name, phone, lifecycle).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Phone, Search, ScanLine, User } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface GateEntryRow {
  capture_id: string;
  captured_at: string;
  lead_id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  funnel_stage: string;
  gate_entry_count: number;
}

export default function GateEntryTodayPage() {
  return (
    <PermissionGuard module="admission" action="gate_entry.view">
      <ContentLayout title="Today's Gate Entries">
        <GateEntryTodayBody />
      </ContentLayout>
    </PermissionGuard>
  );
}

function GateEntryTodayBody() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  // Institution resolution mirrors the gate-entry capture form so the two
  // pages stay in lockstep. profile.institution_id alone is insufficient for
  // admission_staff / super_admin (their profile FK is often null even when
  // they have institution access via Role Management).
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  useEffect(() => {
    if (!isSuperAdmin && !isAdmissionGlobalUser && profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
    } else if (institutions.length === 1) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile?.institution_id, isSuperAdmin, isAdmissionGlobalUser, institutions]);

  // '_all' is the meta value: query without an institution_id filter and let
  // RLS scope the rows. Useful for admission_staff who manage several
  // campuses and want to see today's traffic across all of them.
  const canSelectInstitution =
    isSuperAdmin || isAdmissionGlobalUser || institutions.length > 1;
  const institutionId = selectedInstitutionId || '_all';

  const [rows, setRows] = useState<GateEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startIso = today.toISOString();

    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_lead_source_captures')
      .select(`
        id,
        captured_at,
        lead_id,
        institution_id,
        admission_leads!inner (
          first_name,
          last_name,
          phone,
          funnel_stage,
          gate_entry_count
        )
      `)
      .eq('source', 'gate_entry')
      .gte('captured_at', startIso)
      .order('captured_at', { ascending: false });

    // Only apply the institution filter when a specific institution is
    // chosen; '_all' lets RLS do the scoping.
    if (institutionId && institutionId !== '_all') {
      query = query.eq('institution_id', institutionId);
    }

    query.then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setRows([]);
        } else {
          const flat: GateEntryRow[] = (data ?? []).map((r: any) => {
            const lead = Array.isArray(r.admission_leads)
              ? r.admission_leads[0]
              : r.admission_leads;
            return {
              capture_id: r.id,
              captured_at: r.captured_at,
              lead_id: r.lead_id,
              first_name: lead?.first_name ?? '',
              last_name: lead?.last_name ?? null,
              phone: lead?.phone ?? '',
              funnel_stage: lead?.funnel_stage ?? 'new',
              gate_entry_count: lead?.gate_entry_count ?? 1,
            };
          });
          setRows(flat);
        }
      })
      .then(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [institutionId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = `${r.first_name} ${r.last_name ?? ''}`.toLowerCase();
      return name.includes(q) || r.phone.includes(q);
    });
  }, [rows, search]);

  const summary = useMemo(() => {
    const total = rows.length;
    const distinctLeads = new Set(rows.map((r) => r.lead_id)).size;
    const returning = rows.filter((r) => r.gate_entry_count > 1).length;
    return { total, distinctLeads, returning };
  }, [rows]);

  return (
    <div className="mx-auto space-y-4 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanLine className="h-6 w-6" />
            Today&rsquo;s Gate Entries
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admission/gate-entry">
            <ArrowLeft className="h-4 w-4 mr-1" /> Log new entry
          </Link>
        </Button>
      </div>

      {/* Institution selector — only when the user has access to more than
          one campus (or is super_admin). A wider scope ('_all') is offered
          so admission ops can see today's volume across the group without
          flipping between dropdowns. */}
      {canSelectInstitution && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground shrink-0">Institution:</label>
          <Select
            value={selectedInstitutionId || '_all'}
            onValueChange={(v) => setSelectedInstitutionId(v === '_all' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-full sm:w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All accessible institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total entries" value={summary.total} />
        <SummaryCard label="Distinct visitors" value={summary.distinctLeads} />
        <SummaryCard label="Returning" value={summary.returning} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load: {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No gate entries logged today yet.'
            : 'No entries match your search.'}
        </div>
      ) : (
        <div className="rounded-md border bg-card divide-y">
          {filtered.map((r) => (
            <div
              key={r.capture_id}
              className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="rounded-full bg-muted p-2 shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {r.first_name} {r.last_name ?? ''}
                    {r.gate_entry_count > 1 && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Visit {r.gate_entry_count}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {r.phone}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="text-sm font-medium tabular-nums">
                  {new Date(r.captured_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <Badge variant="secondary" className="text-xs">
                  {r.funnel_stage.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
