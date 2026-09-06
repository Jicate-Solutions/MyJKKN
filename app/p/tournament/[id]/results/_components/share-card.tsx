'use client';

// Shareable results card — drawn entirely on a <canvas> and exported as a PNG
// data URL for download. No external libraries (no html2canvas). Self-contained.
// Section 3, Events/Tournament go-live.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { ParticipantResults } from '../types';

const MEDAL_LABEL: Record<string, string> = {
  gold: 'GOLD MEDAL',
  silver: 'SILVER MEDAL',
  bronze: 'BRONZE MEDAL',
};

const MEDAL_ACCENT: Record<string, string> = {
  gold: '#eab308',
  silver: '#9ca3af',
  bronze: '#d97706',
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function ShareCard({ data }: { data: ParticipantResults }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    const entry = data.entry;
    const medal = entry.medal;
    const accent = medal ? MEDAL_ACCENT[medal] : '#0b6d41';

    // Background — JKKN green gradient.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b6d41');
    g.addColorStop(1, '#064e3b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Soft inner card.
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, 70, 70, W - 140, H - 140, 40);
    ctx.fill();

    // Top ribbon.
    ctx.fillStyle = '#ffde59';
    roundRect(ctx, W / 2 - 150, 120, 300, 56, 28);
    ctx.fill();
    ctx.fillStyle = '#0b6d41';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JKKN TOURNAMENTS', W / 2, 158);

    // Medal / result headline.
    ctx.textAlign = 'center';
    if (medal) {
      ctx.fillStyle = accent;
      ctx.font = 'bold 120px Arial, sans-serif';
      ctx.fillText(medal === 'gold' ? '🥇' : medal === 'silver' ? '🥈' : '🥉', W / 2, 340);
      ctx.fillStyle = '#ffde59';
      ctx.font = 'bold 52px Arial, sans-serif';
      ctx.fillText(MEDAL_LABEL[medal], W / 2, 420);
    } else {
      ctx.fillStyle = '#ffde59';
      ctx.font = 'bold 96px Arial, sans-serif';
      ctx.fillText('🏆', W / 2, 330);
      ctx.font = 'bold 44px Arial, sans-serif';
      ctx.fillText('PARTICIPANT', W / 2, 410);
    }

    // Entry name.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Arial, sans-serif';
    const name = entry.entry_name.length > 22 ? entry.entry_name.slice(0, 21) + '…' : entry.entry_name;
    ctx.fillText(name, W / 2, 540);

    // Institution.
    if (entry.institution_name) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '34px Arial, sans-serif';
      const inst =
        entry.institution_name.length > 34
          ? entry.institution_name.slice(0, 33) + '…'
          : entry.institution_name;
      ctx.fillText(inst, W / 2, 590);
    }

    // Division line.
    const div = data.division;
    if (div) {
      const divText = [div.sport, div.age_band, div.gender && div.gender !== 'open' ? div.gender : null]
        .filter(Boolean)
        .join(' · ');
      ctx.fillStyle = '#ffde59';
      ctx.font = '30px Arial, sans-serif';
      ctx.fillText(divText, W / 2, 648);
    }

    // Stat tiles: Rank / Played / Won.
    const st = data.standing;
    const tiles: { label: string; value: string }[] = [
      {
        label: 'RANK',
        value: entry.final_rank ? `#${entry.final_rank}` : '—',
      },
      { label: 'PLAYED', value: String(st?.played ?? 0) },
      { label: 'WON', value: String(st?.won ?? 0) },
    ];
    const tileW = 260;
    const tileH = 180;
    const gap = 24;
    const totalW = tiles.length * tileW + (tiles.length - 1) * gap;
    let tx = (W - totalW) / 2;
    const ty = 720;
    for (const t of tiles) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, tx, ty, tileW, tileH, 24);
      ctx.fill();
      ctx.fillStyle = '#ffde59';
      ctx.font = 'bold 78px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.value, tx + tileW / 2, ty + 100);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText(t.label, tx + tileW / 2, ty + 145);
      tx += tileW + gap;
    }

    // Tournament footer.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '32px Arial, sans-serif';
    ctx.textAlign = 'center';
    const tname =
      data.tournament.name.length > 40
        ? data.tournament.name.slice(0, 39) + '…'
        : data.tournament.name;
    ctx.fillText(tname, W / 2, 970);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText('jkkn.ai · Every learner, every result', W / 2, 1010);

    setReady(true);
  }, [data]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const slug = data.entry.entry_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    a.href = url;
    a.download = `jkkn-tournament-result-${slug || 'card'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [data]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-gray-800">Shareable result card</p>
      <div className="overflow-hidden rounded-lg border">
        {/* The canvas is the preview AND the export source. */}
        <canvas ref={canvasRef} className="block h-auto w-full" />
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={!ready}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {ready ? <Download className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        Download image
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Save it and share on WhatsApp, Instagram or your school group.
      </p>
    </div>
  );
}
