/**
 * SignatureWidget — canvas-based signature capture renderer.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 *
 * Captures mouse and touch drawing on an HTML5 <canvas>, serializes to PNG
 * data URL on every stroke end. Submission payload stores the data URL string.
 * For a production storage path the dataURL can be uploaded to Storage on form
 * submit; the substrate keeps it inline for simplicity.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { SignatureWidget as SignatureWidgetType } from '@/types/hr-forms';

interface SignatureWidgetProps {
  widget: SignatureWidgetType;
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
}

export function SignatureWidget({
  widget,
  value,
  onChange,
  readOnly,
}: SignatureWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  // Restore existing signature on mount when value is supplied.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = value;
  }, [value]);

  function pointerPos(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleStart(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || readOnly) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handleEnd() {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && onChange) onChange(canvas.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onChange?.('');
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {widget.signatory_role ? (
        <p className="text-xs text-muted-foreground">
          Signatory: {widget.signatory_role}
        </p>
      ) : null}
      <div className="rounded border bg-white">
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="block w-full touch-none"
          onPointerDown={handleStart}
          onPointerMove={handleMove}
          onPointerUp={handleEnd}
          onPointerLeave={handleEnd}
          aria-label={`Signature canvas for ${widget.label}`}
        />
      </div>
      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          className="text-xs"
        >
          <Eraser className="mr-1 h-3 w-3" /> Clear signature
        </Button>
      ) : null}
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
