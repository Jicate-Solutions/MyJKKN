'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Archive, Camera, ChevronRight, Download, Eye, Plus } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import type { HRRecruitmentSignalSnapshot } from '@/types/hr-recruitment-need';

async function fetchSnapshots(): Promise<HRRecruitmentSignalSnapshot[]> {
  const res = await fetch('/api/hr/recruitment-need/snapshots');
  if (!res.ok) throw new Error('Failed to fetch snapshots');
  return res.json();
}

async function fetchSnapshot(id: string): Promise<HRRecruitmentSignalSnapshot> {
  const res = await fetch(`/api/hr/recruitment-need/snapshots/${id}`);
  if (!res.ok) throw new Error('Failed to fetch snapshot');
  return res.json();
}

async function createSnapshotApi(body: Record<string, unknown>): Promise<HRRecruitmentSignalSnapshot> {
  const res = await fetch('/api/hr/recruitment-need/snapshots', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? 'Failed'); }
  return res.json();
}

async function archiveSnapshotApi(id: string): Promise<void> {
  const res = await fetch(`/api/hr/recruitment-need/snapshots/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_archived: true }),
  });
  if (!res.ok) throw new Error('Failed to archive');
}

const STATUS_COLORS: Record<string, string> = {
  green: 'bg-green-100 text-green-800', amber: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-800', blocked: 'bg-gray-200 text-gray-600',
  insufficient_data: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: string }) {
  return <Badge className={`${STATUS_COLORS[status] ?? STATUS_COLORS.insufficient_data} hover:opacity-80`}>{status.replace(/_/g, ' ')}</Badge>;
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<HRRecruitmentSignalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFY, setFormFY] = useState('');
  const [creating, setCreating] = useState(false);
  const [detailSnap, setDetailSnap] = useState<HRRecruitmentSignalSnapshot | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchSnapshots()
      .then((d) => { setSnapshots(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  async function handleCreate() {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      const snap = await createSnapshotApi({ snapshot_name: formName.trim(), snapshot_description: formDesc.trim() || null, financial_year: formFY.trim() || null });
      setSnapshots((p) => [snap, ...p]);
      setCreateOpen(false); setFormName(''); setFormDesc(''); setFormFY('');
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setCreating(false); }
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this snapshot?')) return;
    try { await archiveSnapshotApi(id); setSnapshots((p) => p.filter((s) => s.id !== id)); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  async function handleViewDetail(id: string) {
    setDetailLoading(true); setDetailOpen(true);
    try { setDetailSnap(await fetchSnapshot(id)); } catch { setDetailSnap(null); }
    finally { setDetailLoading(false); }
  }

  function getSignalRows(snap: HRRecruitmentSignalSnapshot) {
    const data = snap.signal_data as { signals?: Array<Record<string, unknown>> };
    return data?.signals ?? [];
  }

  return (
    <SuperAdminOnly>
    <ContentLayout title="Signal Snapshots">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin/recruitment-need">Recruitment Need</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Snapshots</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Camera className="h-6 w-6 shrink-0 text-primary" /> Signal Snapshots</h1>
            <p className="text-sm text-muted-foreground mt-1">Point-in-time captures of recruitment signals for audit and historical comparison.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.open('/api/hr/recruitment-need/export?format=xlsx', '_blank')}>
              <Download className="h-4 w-4 mr-2" />Export XLSX
            </Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Take Snapshot</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? <div className="p-8 text-center text-muted-foreground">Loading snapshots...</div>
            : error ? <div className="p-8 text-center text-destructive">{error}</div>
            : snapshots.length === 0 ? <div className="p-8 text-center text-muted-foreground">No snapshots yet. Click &quot;Take Snapshot&quot; to capture current signal state.</div>
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Financial Year</TableHead>
                    <TableHead>Taken At</TableHead><TableHead>Signals</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snap) => (
                    <TableRow key={snap.id}>
                      <TableCell className="font-medium">{snap.snapshot_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{snap.snapshot_description || '-'}</TableCell>
                      <TableCell>{snap.financial_year || '-'}</TableCell>
                      <TableCell className="text-sm">{new Date(snap.taken_at).toLocaleDateString()} {new Date(snap.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell><Badge variant="secondary">{getSignalRows(snap).length} signal(s)</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View detail" onClick={() => handleViewDetail(snap.id)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Archive" onClick={() => handleArchive(snap.id)}><Archive className="h-4 w-4 text-muted-foreground" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Take Snapshot</DialogTitle>
            <DialogDescription>Captures the current recruitment signal state for audit.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label htmlFor="snap_name">Snapshot Name</Label><Input id="snap_name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Pre-admission Q2 2026" /></div>
            <div><Label htmlFor="snap_desc">Description (optional)</Label><Textarea id="snap_desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Why is this snapshot being taken?" rows={2} /></div>
            <div><Label htmlFor="snap_fy">Financial Year (optional)</Label><Input id="snap_fy" value={formFY} onChange={(e) => setFormFY(e.target.value)} placeholder="e.g. 2026-27" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !formName.trim()}>{creating ? 'Creating...' : 'Take Snapshot'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailSnap?.snapshot_name ?? 'Snapshot Detail'}</DialogTitle>
            {detailSnap?.snapshot_description && <DialogDescription>{detailSnap.snapshot_description}</DialogDescription>}
          </DialogHeader>
          {detailLoading ? <div className="py-8 text-center text-muted-foreground">Loading...</div>
          : !detailSnap ? <div className="py-8 text-center text-destructive">Failed to load snapshot</div>
          : (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">Taken:</span> {new Date(detailSnap.taken_at).toLocaleString()}</div>
                {detailSnap.financial_year && <div><span className="text-muted-foreground">FY:</span> {detailSnap.financial_year}</div>}
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Frozen Signal Data ({getSignalRows(detailSnap).length} rows)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {getSignalRows(detailSnap).length === 0 ? <div className="p-4 text-sm text-muted-foreground">No signal data captured.</div> : (
                    <div className="max-h-96 overflow-y-auto">
                      {getSignalRows(detailSnap).map((row: Record<string, unknown>, idx: number) => (
                        <Collapsible key={idx}>
                          <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 border-b hover:bg-muted/30 text-sm text-left">
                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform data-[state=open]:rotate-90" />
                            <span className="font-medium">{(row.institution_id as string)?.slice(0, 8) ?? `Row ${idx + 1}`}</span>
                            {row.overall_status && <StatusBadge status={row.overall_status as string} />}
                            {row.composite_score != null && <span className="ml-auto text-muted-foreground">Score: {Number(row.composite_score).toFixed(1)}</span>}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="p-3 bg-muted/20 border-b">
                            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(row, null, 2)}</pre>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
