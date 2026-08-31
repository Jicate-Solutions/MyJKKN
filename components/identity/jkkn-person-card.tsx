'use client';

/**
 * JkknPersonCardDialog — the DEFAULT answer to "I scanned a QR, who is this?"
 *
 * Renders the resolved person in the printed ID card's format: institution
 * band, photo, name, kind and status, the permanent JKKN ID, the basic detail
 * grid (roll / register / team code / programme or designation / admission
 * year), and the QR itself. Modules with their own scan behaviour (mess door,
 * gate, attendance…) never open this — it is the fallback presentation when a
 * scan has no module-specific meaning, so every scanner in the platform
 * degrades to "show me the person" instead of a dead end.
 *
 * Data is a ResolvedPerson from fn_resolve_person — no extra round trip; the
 * resolver already returns everything the printed card shows.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogTitle
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ResolvedPerson } from '@/lib/services/users/jkkn-identity-service';

const KIND_LABEL: Record<string, string> = {
  learner: 'Learner',
  team_member: 'Team member',
  both: 'Learner & Team member',
  associate: 'Associate',
  external_participant: 'External participant',
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

interface JkknPersonCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: ResolvedPerson | null;
}

export function JkknPersonCardDialog({ open, onOpenChange, person }: JkknPersonCardDialogProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    setQrUrl(null);
    if (!open || !person?.jkkn_id) return;
    let cancelled = false;
    QRCode.toDataURL(person.jkkn_id, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((url) => { if (!cancelled) setQrUrl(url); })
      .catch(() => { /* card renders without the QR */ });
    return () => { cancelled = true; };
  }, [open, person?.jkkn_id]);

  if (!person) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-sm">
        <DialogTitle className="sr-only">{person.full_name} — ID card</DialogTitle>

        {/* Institution band, like the printed card's header. */}
        <div className="bg-primary px-4 py-3 text-center text-primary-foreground">
          <p className="truncate text-sm font-semibold">
            {person.institution_name ?? 'JKKN Institutions'}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 px-6 pt-4">
          <Avatar className="h-24 w-24 rounded-md border">
            {person.photo_url ? <AvatarImage src={person.photo_url} alt="" /> : null}
            <AvatarFallback className="rounded-md text-2xl">
              {initials(person.full_name)}
            </AvatarFallback>
          </Avatar>
          <p className="text-center text-lg font-semibold leading-tight">{person.full_name}</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Badge variant="secondary">{KIND_LABEL[person.person_kind] ?? person.person_kind}</Badge>
            {person.status ? (
              <Badge variant="outline" className="capitalize">{person.status}</Badge>
            ) : null}
          </div>
          {person.jkkn_id ? (
            <div className="text-center">
              <div className="font-mono text-2xl tracking-widest">{person.jkkn_id}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">JKKN ID</div>
            </div>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">ID not yet issued</Badge>
          )}
        </div>

        <dl className="space-y-1.5 border-t px-6 py-4">
          <DetailRow label="Roll Number" value={person.roll_number} />
          <DetailRow label="Register No" value={person.register_number} />
          <DetailRow label="Team Code" value={person.team_code} />
          <DetailRow
            label={person.person_kind === 'learner' ? 'Programme' : 'Designation'}
            value={person.programme}
          />
          <DetailRow label="Admitted" value={person.admission_year} />
          <DetailRow label="Application" value={person.application_number} />
        </dl>

        {qrUrl ? (
          <div className="flex justify-center border-t bg-muted/30 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
            <img src={qrUrl} alt={`QR for JKKN ID ${person.jkkn_id}`} className="h-24 w-24 rounded bg-white p-1" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
