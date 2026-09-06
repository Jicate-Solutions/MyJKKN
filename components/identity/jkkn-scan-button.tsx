'use client';

/**
 * JkknScanButton — the one drop-in "scan a person" control.
 *
 * Opens the shared camera scanner (components/scanner/barcode-scan-dialog),
 * normalises whatever it decodes (JKKN ID with or without its dash, a legacy
 * card UUID, a roll number typed by hand), resolves it through
 * fn_resolve_person, and hands the caller the matched people.
 *
 * Built for reuse: attendance, library, events — any module that needs
 * "scan → who is this?" imports this instead of wiring its own lane. The
 * campus-living mess/gate doors deliberately do NOT use it (their resolvers
 * also enforce the leaver rule; see mess-scan-resolver.ts).
 *
 * USB/Bluetooth barcode guns emulate a keyboard, so they need no camera and
 * no dialog: any focused search input already handles them. This button is
 * the phone/tablet camera path.
 *
 * Requires the caller's surface to be gated on users.jkkn_id.view —
 * fn_resolve_person enforces it server-side regardless.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { ScanLine, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarcodeScanDialog } from '@/components/scanner/barcode-scan-dialog';
import { JkknPersonCardDialog } from '@/components/identity/jkkn-person-card';
import { classifyScannedCode } from '@/lib/identity/scan-normalize';
import {
  JkknIdentityService,
  isValidJkknId,
  type ResolveResult,
  type ResolvedPerson
} from '@/lib/services/users/jkkn-identity-service';

interface JkknScanButtonProps {
  /**
   * Module-specific scan handling. OMIT for the platform default: the person
   * is shown as their basic ID card (JkknPersonCardDialog) — so a module that
   * just needs "who is this?" drops this button in with no wiring at all.
   */
  onResolved?: (people: ResolvedPerson[], result: ResolveResult) => void;
  /** Fired when the scan resolved to nobody. Default: a toast. */
  onNotFound?: (query: string) => void;
  label?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function JkknScanButton({
  onResolved,
  onNotFound,
  label = 'Scan',
  variant = 'outline',
  size = 'default',
  className
}: JkknScanButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Default-mode result: the person shown as their basic ID card. */
  const [cardPerson, setCardPerson] = useState<ResolvedPerson | null>(null);

  const handleScan = async (value: string) => {
    setOpen(false);
    const { code, shape } = classifyScannedCode(value);
    if (code.length < 2) return;

    // A mistyped/misprinted JKKN ID is reported as a typo, not as "nobody" —
    // an empty result reads as "this person does not exist", which is the
    // wrong answer to a wrong digit.
    if (shape === 'jkkn_id' && !isValidJkknId(code)) {
      toast.error(`"${code}" is not a valid JKKN ID — the check digit does not match.`);
      return;
    }

    setBusy(true);
    try {
      const result = await JkknIdentityService.resolvePerson(code);
      if (result.results.length > 0) {
        if (onResolved) {
          onResolved(result.results, result);
        } else {
          // Platform default: show the basic ID card. A QR carries a JKKN ID,
          // which matches exactly one person; only free-typed text can
          // multi-match, and then the closest is shown with a note.
          setCardPerson(result.results[0]);
          if (result.results.length > 1) {
            toast.info(`${result.results.length} people matched — showing the closest. Use the search box to see all.`);
          }
        }
      } else if (onNotFound) {
        onNotFound(code);
      } else {
        toast.error(`Nobody matched "${code}".`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        {busy
          ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          : <ScanLine className="mr-1 h-4 w-4" />}
        {label}
      </Button>
      <BarcodeScanDialog
        open={open}
        onOpenChange={setOpen}
        onScan={handleScan}
        title="Scan a JKKN ID"
        description="Point the camera at the QR on an ID card. A barcode gun needs no camera — scan into the search box instead."
      />
      <JkknPersonCardDialog
        open={cardPerson !== null}
        onOpenChange={(o) => { if (!o) setCardPerson(null); }}
        person={cardPerson}
      />
    </>
  );
}
