'use client';

// The Director's approve / reject list for the old InstaSolver site's purchase
// requests. See ../page.tsx for the ruling and the super-admin gate.
//
// APPROVE runs in three steps (the API route explains why): claim the row,
// raise the Procurement request through createPurchaseRequest with THIS
// browser session, then record it on the row. If the middle step fails, the
// claim is released so the row can be tried again.

import { useMemo, useState } from 'react';
import { Check, ImageIcon, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProcurementPurchaseRequestService } from '@/lib/services/procurement/purchase-request-service';
import {
  REASON_MAX,
  ageInDays,
  isOlderThanBulkCutoff,
  raisedOnLabel,
  validateReason,
} from '@/lib/instasolver/old-purchase-requests';
import type { CreatePurchaseRequestDto } from '@/types/procurement';

export interface OldRequestView {
  legacyId: number;
  details: string | null;
  category: string | null;
  place: string | null;
  priority: string | null;
  photoUrl: string | null;
  requestedAt: string | null;
  bulkLoaded: boolean;
  college: string | null;
  askedBy: string | null;
  requesterMatched: boolean;
  inProgress: boolean;
}

const API = '/api/instasolver/old-purchase-requests';

async function post(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success !== true) {
    throw new Error(String(json.error ?? `Request failed (${res.status}).`));
  }
  return json;
}

export function OldPurchaseRequestsClient({ initialRows }: { initialRows: OldRequestView[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('Older than two years — raise it again in MyJKKN if it is still needed.');
  const [bulkBusy, setBulkBusy] = useState(false);

  const oldCount = useMemo(
    () => rows.filter((r) => !r.inProgress && isOlderThanBulkCutoff(r.requestedAt)).length,
    [rows]
  );

  const drop = (ids: number[]) => setRows((prev) => prev.filter((r) => !ids.includes(r.legacyId)));

  async function approve(row: OldRequestView) {
    setBusyId(row.legacyId);
    try {
      const begun = await post({ action: 'begin', legacy_id: row.legacyId });
      if (begun.already_done) {
        drop([row.legacyId]);
        toast.success('Already sent to Procurement.');
        return;
      }
      let prId: string;
      try {
        const pr = await ProcurementPurchaseRequestService.createPurchaseRequest(
          begun.dto as CreatePurchaseRequestDto,
          String(begun.requested_by)
        );
        prId = pr.id;
      } catch (e: unknown) {
        await post({ action: 'release', legacy_id: row.legacyId }).catch(() => undefined);
        throw new Error(
          `Procurement did not accept it: ${e instanceof Error ? e.message : 'unknown error'}. Nothing was approved — try again.`
        );
      }
      await post({ action: 'complete', legacy_id: row.legacyId, purchase_request_id: prId });
      drop([row.legacyId]);
      toast.success('Approved — sent to Procurement as a purchase request waiting for their approval.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not approve it.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: OldRequestView) {
    const bad = validateReason(reason);
    if (bad) {
      toast.error(bad);
      return;
    }
    setBusyId(row.legacyId);
    try {
      const res = await post({ action: 'reject', legacy_id: row.legacyId, reason: reason.trim() });
      drop([row.legacyId]);
      setRejectingId(null);
      setReason('');
      toast.success(res.requester_notified ? 'Rejected — the person who asked has been told.' : 'Rejected.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not reject it.');
    } finally {
      setBusyId(null);
    }
  }

  async function bulkReject() {
    const bad = validateReason(bulkReason);
    if (bad) {
      toast.error(bad);
      return;
    }
    setBulkBusy(true);
    try {
      const res = await post({ action: 'bulk_reject', reason: bulkReason.trim() });
      drop(rows.filter((r) => !r.inProgress && isOlderThanBulkCutoff(r.requestedAt)).map((r) => r.legacyId));
      setBulkOpen(false);
      toast.success(`Rejected ${String(res.rejected)} old request(s).`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not reject them.');
    } finally {
      setBulkBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nothing is waiting. Every old purchase request has been decided.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">{rows.length}</span> waiting ·{' '}
            <span className="font-medium">{oldCount}</span> older than 2 years
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={oldCount === 0 || bulkBusy}
            onClick={() => setBulkOpen((v) => !v)}
          >
            Reject all older than 2 years
          </Button>
        </CardContent>
        {bulkOpen && (
          <CardContent className="space-y-3 border-t pt-4">
            <p className="text-sm">
              This closes <span className="font-medium">{oldCount}</span> request(s) and tells each person
              who asked (when they have a MyJKKN login). The reason below goes to them.
            </p>
            <Input
              value={bulkReason}
              maxLength={REASON_MAX}
              onChange={(e) => setBulkReason(e.target.value)}
              aria-label="Reason for rejecting all older than 2 years"
            />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={bulkReject}>
                {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Yes, reject {oldCount}
              </Button>
              <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => setBulkOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {rows.map((row) => {
        const age = ageInDays(row.requestedAt);
        const busy = busyId === row.legacyId;
        return (
          <Card key={row.legacyId}>
            <CardContent className="flex flex-col gap-4 py-4 sm:flex-row">
              {row.photoUrl ? (
                <a
                  href={row.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 overflow-hidden rounded-md border bg-muted"
                  aria-label="Open the photo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.photoUrl} alt="" className="h-24 w-24 object-cover" loading="lazy" />
                </a>
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                  <ImageIcon className="h-6 w-6" aria-hidden />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-words font-medium">{row.details || 'No details recorded'}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {row.category && <Badge variant="secondary">{row.category}</Badge>}
                  {row.priority && <Badge variant="outline">{row.priority}</Badge>}
                  {row.inProgress && <Badge variant="outline">Being approved…</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.college ?? 'College not known'}
                  {row.place ? ` · ${row.place}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  Asked by {row.askedBy ?? 'unknown'}
                  {row.requesterMatched ? '' : ' (no MyJKKN login found — raised in your name if approved)'} ·
                  raised {raisedOnLabel(row.requestedAt)}
                  {age !== null ? ` · ${age} days ago` : ''}
                  {row.bulkLoaded ? ' (bulk-loaded; real date unknown)' : ''}
                </p>

                {rejectingId === row.legacyId ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      autoFocus
                      value={reason}
                      maxLength={REASON_MAX}
                      placeholder="One-line reason (the person who asked will see it)"
                      onChange={(e) => setReason(e.target.value)}
                      aria-label="Reason for rejecting"
                    />
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" disabled={busy} onClick={() => reject(row)}>
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setRejectingId(null);
                          setReason('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy || busyId !== null} onClick={() => approve(row)}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || busyId !== null}
                      onClick={() => {
                        setRejectingId(row.legacyId);
                        setReason('');
                      }}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
