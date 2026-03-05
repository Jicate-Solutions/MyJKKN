'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';
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
    return <div className="text-center py-8 text-muted-foreground">Loading queue...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>MRR Verification Queue</CardTitle>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <p className="text-muted-foreground">All verified! No pending MRR claims.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">MRR Amount</TableHead>
                <TableHead className="text-right">Paying Users</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.registration?.team_name || 'Unknown'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ₹{item.mrr_amount}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.paying_users_count}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(item.proof_urls || []).map((url: string, i: number) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          Proof {i + 1} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                      {(!item.proof_urls || item.proof_urls.length === 0) && (
                        <Badge variant="outline" className="text-xs">No proof</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {rejectingId === item.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <Input
                          placeholder="Reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="w-40 h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(item.id)}
                          disabled={rejectMrr.isPending || !rejectReason.trim()}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600"
                          onClick={() => verifyMrr.mutate(item.id)}
                          disabled={verifyMrr.isPending}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" /> Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => setRejectingId(item.id)}
                        >
                          <XCircle className="mr-1 h-3 w-3" /> Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
