'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerProfileId: string;
}

interface TokenData {
  token_url: string;
  expires_at: string;
  token_id: string;
}

export function StudentFormQRDialog({ open, onOpenChange, learnerProfileId }: Props) {
  const [token, setToken] = useState<TokenData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate when dialog opens
  useEffect(() => {
    if (!open) {
      setToken(null);
      return;
    }
    if (token) return;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Render QR + countdown when token available
  useEffect(() => {
    if (!token || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token.token_url, { width: 280, margin: 1 });
    const expiry = new Date(token.expires_at).getTime();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [token]);

  // Poll for student submission
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admission/student-form-tokens/${learnerProfileId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.is_profile_complete || data.token?.status === 'consumed') {
          toast.success('Student submitted the form');
          onOpenChange(false);
        }
      } catch {
        // Network blip — keep polling
      }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, learnerProfileId, onOpenChange]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/admission/student-form-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learner_profile_id: learnerProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      setToken(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate QR');
    } finally {
      setGenerating(false);
    }
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Student Self-Fill QR</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-4">
          {generating || !token ? (
            <div className="flex h-[280px] w-[280px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <canvas ref={canvasRef} />
              <div className="text-sm text-muted-foreground">
                Expires in <span className="tabular-nums font-medium">{mm}:{ss}</span>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-[280px]">
                Ask the student to scan with their phone camera. The form will
                close automatically when they submit.
              </p>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          {/* type='button' is defensive — Radix Dialog renders in a portal so
              these buttons are outside the form's DOM tree, but adding it
              avoids any framework-version surprise where form submission
              could leak through portals. */}
          <Button type="button" variant="outline" size="sm" onClick={generate} disabled={generating}>
            <RefreshCw className="h-4 w-4 mr-1" /> Regenerate
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
