'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle, ExternalLink, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useMrrVerificationQueue, useVerifyMrr, useRejectMrr } from '@/hooks/startup-studio/use-event-leaderboard';

interface MrrVerificationQueueProps {
  eventId: string;
}

export function MrrVerificationQueue({ eventId }: MrrVerificationQueueProps) {
  const { data: queue = [], isLoading } = useMrrVerificationQueue(eventId);
  const verifyMrr = useVerifyMrr();
  const rejectMrr = useRejectMrr();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = (submissionId: string) => {
    if (!rejectReason.trim()) return;
    rejectMrr.mutate(
      { submissionId, reason: rejectReason },
      { onSuccess: () => { setRejectingId(null); setRejectReason(''); } }
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          MRR Verification Queue
        </CardTitle>
        <CardDescription>
          {queue.length > 0
            ? `${queue.length} pending claim${queue.length !== 1 ? 's' : ''} awaiting verification`
            : 'All claims have been verified'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-10 w-10 text-green-500/60 mx-auto mb-3" />
            <p className="text-sm font-medium">All Verified</p>
            <p className="text-xs text-muted-foreground mt-1">No pending MRR claims to review.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[140px]">Team</TableHead>
                  <TableHead className="text-right min-w-[100px]">MRR Amount</TableHead>
                  <TableHead className="text-right min-w-[100px]">Paying Users</TableHead>
                  <TableHead className="min-w-[120px]">Proof</TableHead>
                  <TableHead className="text-right min-w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item: any) => (
                  <TableRow key={item.id} className="group">
                    <TableCell>
                      <span className="font-medium text-sm">
                        {item.registration?.team_name || 'Unknown'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-sm font-semibold">₹{item.mrr_amount}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm">{item.paying_users_count}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {(item.proof_urls || []).map((url: string, i: number) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-0.5"
                          >
                            Proof {i + 1} <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                        {(!item.proof_urls || item.proof_urls.length === 0) && (
                          <Badge variant="outline" className="text-[10px]">No proof</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {rejectingId === item.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <Input
                            placeholder="Rejection reason..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="w-44 h-8 text-xs"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(item.id)}
                            disabled={rejectMrr.isPending || !rejectReason.trim()}
                            className="h-8 gap-1 text-xs"
                          >
                            {rejectMrr.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                            className="h-8 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                            onClick={() => verifyMrr.mutate(item.id)}
                            disabled={verifyMrr.isPending}
                          >
                            {verifyMrr.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => setRejectingId(item.id)}
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
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
