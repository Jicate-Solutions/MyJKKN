'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BibScannerProps {
  onScan: (bibNumber: string) => void;
  disabled?: boolean;
  className?: string;
}

const BIB_REGEX = /(?:BIB:)?([TFK]\d{3,4})/i;
const DEBOUNCE_MS = 3000;

export function BibScanner({ onScan, disabled, className }: BibScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<any>(null);
  const lastScanRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mountedRef = useRef(true);

  // Wake Lock management
  useEffect(() => {
    mountedRef.current = true;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock request failed (e.g., low battery)
      }
    };

    requestWakeLock();

    return () => {
      mountedRef.current = false;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // Camera scanner management
  useEffect(() => {
    if (!cameraActive) return;

    let scanner: any = null;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode('bib-qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            const now = Date.now();
            if (now - lastScanRef.current < DEBOUNCE_MS) return;

            const match = decodedText.match(BIB_REGEX);
            if (match) {
              lastScanRef.current = now;
              navigator.vibrate?.(100);
              onScan(match[1].toUpperCase());
            }
          },
          () => {
            // QR scan error (no code found) — expected, ignore
          }
        );
      } catch {
        // Camera permission denied or other error
        if (mountedRef.current) {
          setCameraActive(false);
        }
      }
    };

    startScanner();

    return () => {
      const s = scanner || scannerRef.current;
      if (s) {
        try {
          if (s.isScanning) {
            s.stop().catch(() => {});
          }
        } catch {
          // Scanner already stopped
        }
        scannerRef.current = null;
      }
    };
  }, [cameraActive, onScan]);

  const toggleCamera = () => {
    setCameraActive((prev) => !prev);
  };

  const handleManualSearch = () => {
    const value = manualInput.trim();
    if (!value) return;

    // Try to parse as BIB number, otherwise pass raw value (name/phone)
    const match = value.match(BIB_REGEX);
    onScan(match ? match[1].toUpperCase() : value);
    setManualInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleManualSearch();
    }
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Camera viewfinder */}
      <div
        id="bib-qr-reader"
        className={cn(
          'aspect-square max-h-[60vh] w-full overflow-hidden rounded-lg bg-black',
          !cameraActive && 'flex items-center justify-center'
        )}
      >
        {!cameraActive && (
          <p className="text-sm text-muted-foreground">Camera is off</p>
        )}
      </div>

      {/* Camera toggle */}
      <Button
        variant={cameraActive ? 'destructive' : 'default'}
        onClick={toggleCamera}
        disabled={disabled}
        className="w-full"
      >
        {cameraActive ? (
          <>
            <CameraOff className="mr-2 h-4 w-4" />
            Stop Camera
          </>
        ) : (
          <>
            <Camera className="mr-2 h-4 w-4" />
            Start Camera
          </>
        )}
      </Button>

      {/* Manual search fallback */}
      <div className="flex gap-2">
        <Input
          placeholder="BIB number, name, or phone"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <Button
          variant="secondary"
          onClick={handleManualSearch}
          disabled={disabled || !manualInput.trim()}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
