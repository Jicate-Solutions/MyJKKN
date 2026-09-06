'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, ScanLine, SwitchCamera } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Camera barcode / QR scanner in a dialog.
 *
 * Two things worth knowing before reaching for this:
 *
 * 1. USB and Bluetooth barcode guns emulate a KEYBOARD — they type the code
 *    and press Enter. They need no camera and no component: any focused text
 *    input already handles them. This dialog exists for the phone/tablet case
 *    where there is no gun.
 * 2. `html5-qrcode` is imported dynamically. It is ~350 KB and pulls in a
 *    WASM-ish ZXing fallback; a static import would land in the billing page's
 *    first-load bundle for every clerk who never scans anything.
 */

const READER_ID = 'barcode-scan-dialog-reader';

// Formats printed on institutional ID cards. CODE_128 and CODE_39 cover the
// register/roll-number barcodes; EAN/UPC are included because pre-printed
// stock cards sometimes carry them. Narrowing the list materially speeds up
// each decode attempt — the decoder tries every enabled format per frame.
const ID_CARD_FORMAT_NAMES = [
  'CODE_128',
  'CODE_39',
  'CODE_93',
  'CODABAR',
  'ITF',
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'QR_CODE',
  'DATA_MATRIX'
] as const;

interface BarcodeScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once per accepted scan with the decoded text (already trimmed). */
  onScan: (value: string) => void;
  title?: string;
  description?: string;
}

export function BarcodeScanDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Scan ID card',
  description = 'Point the camera at the barcode or QR code on the student ID card.'
}: BarcodeScanDialogProps) {
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>(
    'starting'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );

  const scannerRef = useRef<any>(null);
  // onScan lives in a ref so flipping the camera (or the parent re-rendering)
  // does not tear down and restart the camera stream — restarting costs ~1.5 s
  // of black viewfinder on most Android devices.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const handleDecoded = useCallback(
    (decodedText: string) => {
      const value = decodedText.trim();
      if (!value) return;
      navigator.vibrate?.(80);
      onScanRef.current(value);
    },
    []
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let scanner: any = null;

    const start = async () => {
      setStatus('starting');
      setErrorMessage(null);

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          'html5-qrcode'
        );

        // The enum is a numeric TS enum, so it carries a reverse mapping
        // (number -> name) as well as the forward one. That makes its type
        // incompatible with Record<string, number> directly — go through
        // `unknown`, and keep the runtime typeof guard below, which is what
        // actually protects against an upstream rename.
        const formatEnum = Html5QrcodeSupportedFormats as unknown as Record<
          string,
          number
        >;
        const formatsToSupport = ID_CARD_FORMAT_NAMES.map(
          (name) => formatEnum[name]
        ).filter((v): v is number => typeof v === 'number');

        if (cancelled) return;

        scanner = new Html5Qrcode(READER_ID, {
          formatsToSupport,
          // Uses the browser's native BarcodeDetector when present (Chrome on
          // Android). An order of magnitude faster than the JS decoder.
          useBarCodeDetectorIfSupported: true,
          verbose: false
        } as any);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode },
          {
            fps: 12,
            // 1D barcodes are WIDE and short. A square qrbox (the library
            // default) crops the ends off a CODE_128 strip and it never
            // decodes — this is the single most common "scanner doesn't work"
            // cause.
            qrbox: (viewWidth: number, viewHeight: number) => ({
              width: Math.floor(Math.min(viewWidth, viewHeight * 2) * 0.85),
              height: Math.floor(Math.min(viewHeight * 0.45, 220))
            }),
            aspectRatio: 1.6
          },
          handleDecoded,
          () => {
            // Per-frame "no code in view" callback. Expected constantly.
          }
        );

        if (!cancelled) setStatus('scanning');
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Could not start the camera. Check browser permissions.'
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      const active = scanner || scannerRef.current;
      scannerRef.current = null;
      if (!active) return;
      try {
        if (active.isScanning) {
          active
            .stop()
            .then(() => active.clear?.())
            .catch(() => {});
        } else {
          active.clear?.();
        }
      } catch {
        // Already torn down.
      }
    };
  }, [open, facingMode, handleDecoded]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ScanLine className='h-5 w-5' />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='relative overflow-hidden rounded-lg bg-black'>
          <div id={READER_ID} className='w-full [&_video]:w-full' />

          {status !== 'scanning' && (
            <div
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center',
                status === 'error' ? 'bg-background' : 'bg-black/70'
              )}
            >
              {status === 'starting' ? (
                <>
                  <Loader2 className='h-6 w-6 animate-spin text-white' />
                  <p className='text-sm text-white'>Starting camera…</p>
                </>
              ) : (
                <>
                  <AlertCircle className='h-6 w-6 text-destructive' />
                  <p className='text-sm font-medium'>Camera unavailable</p>
                  <p className='text-xs text-muted-foreground'>
                    {errorMessage}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className='flex items-center justify-between gap-2'>
          <p className='text-xs text-muted-foreground'>
            A USB/Bluetooth scanner needs no camera — just scan into the search
            box.
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
            }
            disabled={status === 'starting'}
          >
            <SwitchCamera className='mr-2 h-4 w-4' />
            Flip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
