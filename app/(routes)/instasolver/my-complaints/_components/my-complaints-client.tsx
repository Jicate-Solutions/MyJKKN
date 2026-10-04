'use client';

// app/(routes)/instasolver/my-complaints/_components/my-complaints-client.tsx
//
// Phone-first list of the signed-in person's own complaints. One card per
// complaint; plain words throughout (no status codes, no 1970 dates).

import Link from 'next/link';
import { CheckCircle2, Clock, MessageSquarePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  formatComplaintDate,
  handledByLabel,
  statusInWords,
} from '@/lib/grievance/complaint-display';
import type { MyComplaint } from '@/lib/grievance/my-complaints';

function statusVariant(status: string | null): 'default' | 'outline' | 'destructive' {
  if (status === 'resolved' || status === 'closed') return 'outline';
  if (status === 'reopened') return 'destructive';
  return 'default';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

export function MyComplaintsClient({ complaints }: { complaints: MyComplaint[] }) {
  if (complaints.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="font-medium">You haven&apos;t raised a complaint yet.</p>
          <Button asChild>
            <Link href="/instasolver/complaint">
              <MessageSquarePlus className="mr-2 h-4 w-4" /> Raise a complaint
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {complaints.map((c) => {
        const done = c.status === 'resolved' || c.status === 'closed';
        const due = formatComplaintDate(c.sla_deadline);
        const updated = formatComplaintDate(c.last_update);
        return (
          <Card key={c.id}>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Clock className="h-5 w-5 text-sky-600" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{c.subject ?? 'Complaint'}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.ticket_number ? <span className="font-mono">{c.ticket_number}</span> : null}
                    {c.ticket_number && c.category ? ' · ' : null}
                    {c.category ?? null}
                  </p>
                </div>
                <Badge variant={statusVariant(c.status)} className="shrink-0">
                  {statusInWords(c.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Who is handling it">
                  {handledByLabel(c.assigned_to, c.handler_name)}
                </Field>
                <Field label="Answer due">{done ? 'Answered' : due ?? 'Not set'}</Field>
                <Field label="Last update">{updated ?? 'Not recorded'}</Field>
              </div>

              {c.resolution ? (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    What was done
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{c.resolution}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
