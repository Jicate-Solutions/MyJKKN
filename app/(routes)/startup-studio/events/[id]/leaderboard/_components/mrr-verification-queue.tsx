'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useMrrVerificationQueue,
  useVerifyMrr,
  useRejectMrr,
} from '@/hooks/startup-studio/use-event-leaderboard';

interface MrrVerificationQueueProps {
  eventId: string;
}

export function MrrVerificationQueue({ eventId }: MrrVerificationQueueProps) {
  const { data: queue = [], isLoading } = useMrrVerificationQueue(eventId);
  const verifyMutation = useVerifyMrr();
  const rejectMutation = useRejectMrr();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = (submissionId: string) => {
    if (!rejectReason.trim()) return;
    rejectMutation.mutate(
      { submissionId, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          setRejectingId(null);
          setRejectReason('');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Loading verification queue...
        </CardContent>
      </Card>
    );
  }

  if (queue.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">MRR Verification Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
            <p className="text-lg font-medium">All verified!</p>
            <p className="text-muted-foreground">No pending MRR verifications.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">MRR Verification Queue ({queue.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Name</TableHead>
                <TableHead className="text-right">MRR Amount</TableHead>
                <TableHead className="text-right">Paying Users</TableHead>
                <TableHead>Proof URLs</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.registration?.team_name ?? 'Unknown'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${item.mrr_amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">{item.paying_users_count}</TableCell>
                  <TableCell>
                    {item.proof_urls && item.proof_urls.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {item.proof_urls.map((url: string, i: number) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Proof {i + 1}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No proof</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {rejectingId === item.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <Input
                          placeholder="Rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="w-48"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleReject(item.id);
                            if (e.key === 'Escape') {
                              setRejectingId(null);
                              setRejectReason('');
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(item.id)}
                          disabled={!rejectReason.trim() || rejectMutation.isPending}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => verifyMutation.mutate(item.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingId(item.id)}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
