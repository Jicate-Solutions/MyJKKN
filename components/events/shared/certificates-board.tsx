'use client';

// components/events/shared/certificates-board.tsx
// Shared certificates board for ANY event type (Events Platform Promotion PR6).
// Issue certificate IDs for finishers, see issue progress, and copy the public no-login verify link
// (/p/verify/[certId]) for each certificate. Decision #6: the public page shows a winner's photo but
// not a participant's — that split is enforced server-side in the verify RPC, so nothing here leaks it.
// Read-only when canManage is false.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Award, Check, Copy, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import {
  useEventCertificateStats,
  useEventCertificateList,
  useGenerateEventCertificates,
} from '@/hooks/events/shared/use-event-certificates';
import { certificateVerifyUrl } from '@/lib/services/events/shared/event-certificate-service';

function rankClass(rank: number | null): string {
  if (rank === 1) return 'text-yellow-500';
  if (rank === 2) return 'text-gray-400';
  if (rank === 3) return 'text-amber-600';
  return 'text-muted-foreground';
}

function CopyVerifyLink({ certId }: { certId: string }) {
  const [copied, setCopied] = useState(false);
  const path = certificateVerifyUrl(certId);

  const copy = async () => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the open-link button still works */
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={copy} title="Copy public verify link">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <a href={path} target="_blank" rel="noopener noreferrer" title="Open public verify page">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </a>
    </div>
  );
}

export function CertificatesBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { data: stats } = useEventCertificateStats(eventId);
  const { data: certs, isLoading } = useEventCertificateList(eventId);
  const generate = useGenerateEventCertificates(eventId);
  const [search, setSearch] = useState('');

  const pending = stats?.pending ?? 0;
  const rows = (certs ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.certificate_id.toLowerCase().includes(q) ||
      (c.bib_number?.toLowerCase().includes(q) ?? false) ||
      (c.registration?.participant_name?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Certificates</h3>
          <p className="text-sm text-muted-foreground">
            Issue certificate IDs and share the public verify link. Winners&apos; photos appear on the
            public page; participants&apos; do not.
          </p>
        </div>
        {canManage && (
          <Button size="sm" disabled={generate.isPending || pending === 0} onClick={() => generate.mutate()}>
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Issue Certificates
            {pending > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {pending}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Finishers', value: stats.total_finishers },
            { label: 'Issued', value: stats.generated },
            { label: 'Pending', value: stats.pending },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="py-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-2xl font-bold tabular-nums">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (certs ?? []).length === 0 ? (
        <div className="space-y-2 py-12 text-center text-muted-foreground">
          <Award className="mx-auto h-8 w-8 opacity-40" />
          <p className="text-sm">
            No certificates issued yet{canManage && pending > 0 ? ` — ${pending} finisher(s) ready.` : '.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            className="h-8 max-w-xs text-sm"
            placeholder="Search name, BIB, or cert ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="divide-y rounded-lg border">
            {rows.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`w-8 shrink-0 font-bold tabular-nums ${rankClass(c.rank_overall)}`}>
                  {c.rank_overall ? `#${c.rank_overall}` : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.registration?.participant_name ?? <span className="text-muted-foreground">—</span>}
                </span>
                <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
                  {c.certificate_id}
                </Badge>
                <CopyVerifyLink certId={c.certificate_id} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
