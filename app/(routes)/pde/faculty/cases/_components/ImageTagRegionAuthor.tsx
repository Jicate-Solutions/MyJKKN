'use client';

// ImageTagRegionAuthor — load an image, let faculty draw bounding boxes on a canvas
// overlay, label each region, and capture reasoning. Output is the serialized
// region array stored in pde_assessment_questions.expected_regions.
//
// Coordinates are stored as fractions of natural image dimensions (0..1) so that
// CSS-resized images can match clicks proportionally on the student side.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus } from 'lucide-react';
import type { ImageTagRegion } from '@/types/pde';

interface Props {
  imageUrl: string;
  regions: ImageTagRegion[];
  onChange: (next: ImageTagRegion[]) => void;
}

type DrawState =
  | { mode: 'idle' }
  | { mode: 'drawing'; startX: number; startY: number; curX: number; curY: number };

export function ImageTagRegionAuthor({ imageUrl, regions, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [draw, setDraw] = useState<DrawState>({ mode: 'idle' });
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const updateNatural = useCallback(() => {
    if (imgRef.current) {
      setNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
      setImgLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (imgRef.current?.complete) updateNatural();
  }, [imageUrl, updateNatural]);

  const containerRect = () => containerRef.current?.getBoundingClientRect();

  const toFraction = (clientX: number, clientY: number) => {
    const rect = containerRect();
    if (!rect) return { x: 0, y: 0 };
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgLoaded) return;
    const { x, y } = toFraction(e.clientX, e.clientY);
    setDraw({ mode: 'drawing', startX: x, startY: y, curX: x, curY: y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draw.mode !== 'drawing') return;
    const { x, y } = toFraction(e.clientX, e.clientY);
    setDraw({ ...draw, curX: x, curY: y });
  };

  const handleMouseUp = (_e: React.MouseEvent) => {
    if (draw.mode !== 'drawing') return;
    const x = Math.min(draw.startX, draw.curX);
    const y = Math.min(draw.startY, draw.curY);
    const w = Math.abs(draw.curX - draw.startX);
    const h = Math.abs(draw.curY - draw.startY);
    if (w > 0.01 && h > 0.01) {
      const newRegion: ImageTagRegion = {
        label: `Region ${regions.length + 1}`,
        x,
        y,
        w,
        h,
        tolerance_px: 16,
      };
      onChange([...regions, newRegion]);
      setSelectedIdx(regions.length);
    }
    setDraw({ mode: 'idle' });
  };

  const updateRegion = (i: number, patch: Partial<ImageTagRegion>) => {
    const next = regions.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };

  const removeRegion = (i: number) => {
    const next = regions.filter((_r, idx) => idx !== i);
    onChange(next);
    if (selectedIdx === i) setSelectedIdx(null);
  };

  if (!imageUrl) {
    return (
      <div className="border rounded p-4 text-sm text-muted-foreground bg-muted/30">
        Add an image URL above to draw click regions.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative inline-block cursor-crosshair border rounded overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => draw.mode === 'drawing' && setDraw({ mode: 'idle' })}
        style={{ maxWidth: '100%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Case image"
          onLoad={updateNatural}
          onError={() => setImgLoaded(false)}
          className="block max-w-full h-auto pointer-events-none"
          draggable={false}
        />

        {/* Existing regions */}
        {regions.map((r, i) => (
          <div
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIdx(i);
            }}
            className={`absolute border-2 ${
              selectedIdx === i ? 'border-green-500 bg-green-500/10' : 'border-orange-500 bg-orange-500/10'
            } pointer-events-auto`}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
            }}
          >
            <span className="absolute -top-5 left-0 bg-orange-500 text-white text-[10px] px-1 rounded">
              {r.label}
            </span>
          </div>
        ))}

        {/* Currently drawing rectangle */}
        {draw.mode === 'drawing' ? (
          <div
            className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
            style={{
              left: `${Math.min(draw.startX, draw.curX) * 100}%`,
              top: `${Math.min(draw.startY, draw.curY) * 100}%`,
              width: `${Math.abs(draw.curX - draw.startX) * 100}%`,
              height: `${Math.abs(draw.curY - draw.startY) * 100}%`,
            }}
          />
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Click-and-drag on the image to draw a region. Selected region:{' '}
        {selectedIdx !== null ? regions[selectedIdx]?.label : 'none'}.
        {naturalSize.w ? ` (Image natural size: ${naturalSize.w}×${naturalSize.h}px)` : ''}
      </p>

      {regions.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-xs">Regions ({regions.length})</Label>
          {regions.map((r, i) => (
            <div
              key={i}
              className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-end border rounded p-2 ${
                selectedIdx === i ? 'border-green-500 bg-green-50/40' : ''
              }`}
              onClick={() => setSelectedIdx(i)}
            >
              <div className="sm:col-span-3">
                <Label className="text-xs">Label</Label>
                <Input
                  value={r.label}
                  onChange={(e) => updateRegion(i, { label: e.target.value })}
                  placeholder="e.g. Wickham striae"
                />
              </div>
              <div className="sm:col-span-5">
                <Label className="text-xs">Reasoning (optional)</Label>
                <Input
                  value={r.reasoning || ''}
                  onChange={(e) => updateRegion(i, { reasoning: e.target.value })}
                  placeholder="Why this region matters clinically"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Tolerance (px)</Label>
                <Input
                  type="number"
                  min={0}
                  value={r.tolerance_px ?? 16}
                  onChange={(e) =>
                    updateRegion(i, { tolerance_px: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="sm:col-span-2 flex gap-1 justify-end">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRegion(i);
                  }}
                  className="text-red-600"
                  title="Remove region"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Plus className="h-3 w-3" /> No regions yet — drag on the image to add the first.
        </div>
      )}
    </div>
  );
}
