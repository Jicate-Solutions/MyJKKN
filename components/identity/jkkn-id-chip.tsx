'use client';

/**
 * JkknIdChip — the person's permanent JKKN ID + QR, as a drop-in line for any
 * detail page (learner profile, staff detail, user management…).
 *
 * Fetches through fn_jkkn_id_of, which is open to every authenticated user by
 * design (the number is card-printed and non-secret; the page's own
 * authorisation already decided the viewer may see this person). Fail-soft:
 * while loading or when the lookup fails it renders nothing at all — a detail
 * page must never degrade because the identity register hiccupped.
 *
 * Usage:
 *   <JkknIdChip kind="learner"     refId={learner.id} personName={name} />
 *   <JkknIdChip kind="team_member" refId={staff.id}   personName={name} />
 *   <JkknIdChip kind="profile"     refId={user.id}    personName={name} />
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JkknQrDialog } from '@/components/identity/jkkn-qr-dialog';
import { JkknIdentityService } from '@/lib/services/users/jkkn-identity-service';

interface JkknIdChipProps {
  kind: 'learner' | 'team_member' | 'profile';
  refId: string;
  /** For the QR dialog header and download file name. */
  personName?: string;
  className?: string;
}

export function JkknIdChip({ kind, refId, personName, className }: JkknIdChipProps) {
  // undefined = loading, null = no active ID, string = the number.
  const [jkknId, setJkknId] = useState<string | null | undefined>(undefined);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setJkknId(undefined);
    if (!refId) { setJkknId(null); return; }
    JkknIdentityService.getIdOf(kind, refId)
      .then((id) => { if (!cancelled) setJkknId(id); })
      .catch(() => { if (!cancelled) setJkknId(null); });
    return () => { cancelled = true; };
  }, [kind, refId]);

  if (jkknId === undefined) return null;

  if (jkknId === null) {
    return (
      <Badge variant="outline" className={`text-muted-foreground ${className ?? ''}`}>
        JKKN ID not yet issued
      </Badge>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">JKKN ID</span>
      <span className="font-mono font-medium tracking-wide">{jkknId}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setQrOpen(true)}
        aria-label={`Show QR for JKKN ID ${jkknId}`}
      >
        <QrCode className="h-4 w-4" />
      </Button>
      <JkknQrDialog open={qrOpen} onOpenChange={setQrOpen} jkknId={jkknId} personName={personName} />
    </div>
  );
}

/**
 * JkknQrBlock — the QR itself, inline, sized like a profile photo (h-24 w-24
 * by default so it sits as the photo's counterpart in a detail section).
 * Clicking it opens the full QR dialog with the PNG download. Renders nothing
 * while loading, when no active ID exists, or on any failure — a detail page
 * must never degrade because of the identity register.
 */
export function JkknQrBlock({
  kind,
  refId,
  personName,
  className
}: JkknIdChipProps) {
  const [jkknId, setJkknId] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setJkknId(null);
    setDataUrl(null);
    if (!refId) return;
    JkknIdentityService.getIdOf(kind, refId)
      .then(async (id) => {
        if (cancelled || !id) return;
        // Same settings family as the card engine; 192px is crisp at h-24.
        const url = await QRCode.toDataURL(id, { errorCorrectionLevel: 'M', margin: 1, width: 192 });
        if (!cancelled) { setJkknId(id); setDataUrl(url); }
      })
      .catch(() => { /* render nothing */ });
    return () => { cancelled = true; };
  }, [kind, refId]);

  if (!jkknId || !dataUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setQrOpen(true)}
        className={`flex flex-col items-center gap-1 ${className ?? ''}`}
        aria-label={`Show QR for JKKN ID ${jkknId}`}
        title="JKKN ID QR — click to enlarge or download"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
        <img src={dataUrl} alt="" className="h-24 w-24 rounded-md border bg-white p-1" />
        <span className="font-mono text-xs tracking-wide text-muted-foreground">{jkknId}</span>
      </button>
      <JkknQrDialog open={qrOpen} onOpenChange={setQrOpen} jkknId={jkknId} personName={personName} />
    </>
  );
}
