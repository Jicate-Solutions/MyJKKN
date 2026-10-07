'use client';

/**
 * PublicRegistrationCard — the drive page's "Public registration link" block.
 *
 * Shown once the drive is active (announced or later). A CDC team member with
 * cdc.drives.edit switches the no-login page /dr/<token> on, then copies the
 * link, downloads the QR, or shares it over WhatsApp / email. Everyone with
 * drive view access sees the link and the registration count.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, Download, ExternalLink, Loader2, Mail, MessageCircle, QrCode, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useCdcDrivePublicRegistration, useSetCdcDrivePublicRegistration } from '@/hooks/cdc/use-cdc-drives';
import type { CdcDrive } from '@/types/cdc';

const ACTIVE_STATUSES: CdcDrive['status'][] = [
  'announced',
  'willingness_open',
  'eligibility_locked',
  'attendance_day',
  'results_announced',
  'closed',
];

/** One shareable link: URL row, QR with PNG download, WhatsApp and email share. */
function LinkShare({ url, title, qrName, shareLead }: { url: string; title: string; qrName: string; shareLead: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
      .then((d) => {
        if (!cancelled) setQr(d);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const shareText = `${title} — ${shareLead}: ${url}`;
  const qrFileName = `${title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'drive'}_${qrName}_QR.png`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — select the link and copy it manually');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary hover:underline">
          {url}
        </a>
        <Button type="button" variant="ghost" size="sm" onClick={copyLink} aria-label="Copy link">
          <Copy className="h-4 w-4" />
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open link">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL
          <img src={qr} alt={`${qrName} QR code`} className="h-32 w-32 rounded-md border bg-white" />
        ) : null}
        <div className="flex flex-col gap-2">
          {qr ? (
            <Button asChild variant="outline" size="sm">
              <a href={qr} download={qrFileName}>
                <Download className="h-4 w-4 mr-2" /> Download QR (PNG)
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 mr-2" /> Share on WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText)}`}>
              <Mail className="h-4 w-4 mr-2" /> Share by email
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PublicRegistrationCard({ drive, canEdit }: { drive: CdcDrive; canEdit: boolean }) {
  const active = ACTIVE_STATUSES.includes(drive.status);
  const { data, isLoading, error } = useCdcDrivePublicRegistration(active ? drive.id : undefined);
  const setEnabled = useSetCdcDrivePublicRegistration(drive.id);

  const url =
    data?.enabled && data.token && typeof window !== 'undefined' ? `${window.location.origin}/dr/${data.token}` : null;

  // MyJKKN (login) link: the learner's own willingness page for this drive.
  const myjkknUrl = typeof window !== 'undefined' ? `${window.location.origin}/cdc/drives/${drive.id}/willingness` : null;

  // Only an active drive has a public link.
  if (!active) return null;

  const count = data?.registrations.length ?? 0;
  function toggle(next: boolean) {
    setEnabled.mutate(next, {
      onSuccess: () => toast.success(next ? 'Public registration link is on' : 'Public registration link is off'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update the public link'),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          Share this drive
        </CardTitle>
        <CardDescription>Two links, each with its own QR code, for WhatsApp, email or social media.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 1. MyJKKN link — learners sign in and respond on their own page */}
        <section className="space-y-2">
          <div>
            <p className="text-sm font-medium">MyJKKN link (login)</p>
            <p className="text-xs text-muted-foreground">
              Learners sign in to MyJKKN and give their willingness. Only learners in the drive&apos;s audience can respond.
            </p>
          </div>
          {myjkknUrl ? <LinkShare url={myjkknUrl} title={drive.title} qrName="MyJKKN" shareLead="respond in MyJKKN" /> : null}
        </section>

        {/* 2. Public link — no login */}
        <section className="space-y-3 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Public link (no login)</p>
            <p className="text-xs text-muted-foreground">
              A registration page anyone can open without a MyJKKN account.
            </p>
          </div>
          {canEdit && data?.available !== false ? (
            <div className="flex items-center gap-2 shrink-0">
              {setEnabled.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Switch
                checked={data?.enabled ?? false}
                disabled={isLoading || setEnabled.isPending}
                onCheckedChange={toggle}
                aria-label="Public registration link"
              />
            </div>
          ) : null}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Could not load the public link.'}</p>
        ) : data?.available === false ? (
          <p className="text-sm text-muted-foreground">{data.error}</p>
        ) : !data?.enabled || !url ? (
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? 'Switch this on to create the registration link and QR code.'
              : 'The public registration link is switched off for this drive.'}
            {count > 0 ? ` ${count} registration${count === 1 ? '' : 's'} already received.` : ''}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={data.open ? 'default' : 'secondary'}>{data.open ? 'Accepting registrations' : 'Closed to new registrations'}</Badge>
            </div>
            <LinkShare url={url} title={drive.title} qrName="Public" shareLead="register here" />
            {!data.open ? (
              <p className="text-xs text-muted-foreground">
                The page still opens, but new registrations are accepted only while the drive is Announced or collecting willingness.
              </p>
            ) : null}
          </>
        )}

        {data?.available !== false && !isLoading && !error ? (
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link href={`/cdc/drives/${drive.id}/registrations`}>
              <Users className="h-4 w-4 mr-2" /> View registrations ({count})
            </Link>
          </Button>
        ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
