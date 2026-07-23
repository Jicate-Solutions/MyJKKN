'use client';

// CDC staff — Employer Requirements list + moderation queue. Shows company
// submissions from both the public portal (status='pending_review' until
// approved) and CDC staff direct entry. Reads /api/cdc/requirements.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { Plus, Inbox, Building2, ChevronRight } from 'lucide-react';
import type { EmployerRequirementWithRoles, EmployerRequirementStatus } from '@/types/cdc/employer-requirements';

const STATUS_META: Record<EmployerRequirementStatus, { label: string; cls: string }> = {
  pending_review: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:       { label: 'Approved',       cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  published:      { label: 'Published',      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected:       { label: 'Rejected',       cls: 'bg-red-100 text-red-700 border-red-200' },
  closed:         { label: 'Closed',         cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const SOURCE_LABEL: Record<string, string> = {
  public_portal: 'Public portal', cdc_staff: 'CDC staff', email: 'Email', walk_in: 'Walk-in',
};

const TABS: { key: string; label: string }[] = [
  { key: 'pending_review', label: 'Pending review' },
  { key: 'approved', label: 'Approved' },
  { key: 'published', label: 'Published' },
  { key: 'all', label: 'All' },
];

function Content() {
  const [tab, setTab] = useState('pending_review');
  const [rows, setRows] = useState<EmployerRequirementWithRoles[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cdc/requirements?status=${tab}`, { cache: 'no-store' });
      const json = await res.json();
      setRows(res.ok ? (json.data ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <ContentLayout title="Employer Requirements">
      <PageBreadcrumb items={[{ label: 'CDC', href: '/cdc' }, { label: 'Employer Requirements' }]} />

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          Company job-vacancy submissions. Public-portal entries wait here for review before students see them.
        </p>
        <Link href="/cdc/requirements/new">
          <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> New requirement</Button>
        </Link>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BeatLoader color="#4f46e5" size={12} /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-slate-400">
          <Inbox className="mx-auto h-10 w-10 mb-3 opacity-50" />
          <p>No requirements in “{TABS.find((t) => t.key === tab)?.label}”.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Link key={r.id} href={`/cdc/requirements/${r.id}`}>
              <Card className="hover:border-indigo-300 transition cursor-pointer">
                <CardContent className="py-4 flex items-center gap-4">
                  <div className="rounded-lg bg-slate-100 p-2.5"><Building2 className="h-5 w-5 text-slate-500" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 truncate">{r.company_name}</span>
                      <Badge variant="outline" className={STATUS_META[r.status]?.cls}>{STATUS_META[r.status]?.label}</Badge>
                      <span className="text-xs text-slate-400">{SOURCE_LABEL[r.source] ?? r.source}</span>
                    </div>
                    <p className="text-sm text-slate-500 truncate mt-0.5">
                      {(r.roles?.length ?? 0)} role{(r.roles?.length ?? 0) === 1 ? '' : 's'}
                      {r.roles?.length ? ' · ' + r.roles.slice(0, 3).map((x) => x.role_title).join(', ') : ''}
                      {(r.roles?.length ?? 0) > 3 ? '…' : ''}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:block">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </ContentLayout>
  );
}

export default function CdcRequirementsPage() {
  return (
    <PermissionGuard module="cdc.requirements" action="view">
      <Content />
    </PermissionGuard>
  );
}
