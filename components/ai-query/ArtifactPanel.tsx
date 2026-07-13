'use client';

/**
 * ArtifactPanel
 * Right-side panel that renders one AI Assistant artifact (Phase 1: charts +
 * reports) with download. Opened by tapping an artifact card in the chat.
 *
 * Scope (server-enforced): fn_ai_get_artifact pins auth.uid() and filters
 * owner_id = auth.uid(), so a user can only ever open THEIR OWN artifacts —
 * a spoofed id returns nothing. Downloads are audit-logged (fn_ai_log_artifact_
 * download) BEFORE the file is produced.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  BarChart as RBarChart, Bar, LineChart as RLineChart, Line,
  PieChart as RPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Download, AlertTriangle, ShieldAlert, Image as ImageIcon } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { markdownComponents } from './markdown-components';
import type {
  ArtifactFull, ChartArtifactContent, ReportArtifactContent,
} from '@/types/ai-query';

// Accessible categorical palette (Tailwind-500 family — reads in both themes,
// consistent with the app's existing charts). Swap for the dataviz skill palette
// if/when its reference is restored on disk.
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];

// Caps so a runaway model-emitted chart can't freeze the browser tab.
const MAX_SERIES = 12;
const MAX_POINTS = 500;

type DerivedSeries = {
  key: string;                 // namespaced column key (never collides with 'x' or siblings)
  label: string;               // display label (legend/tooltip)
  color: string;
  data: { x: string | number; y: number }[];
};

/** Normalize the model's chart content into safe, namespaced, capped series.
 *  Shared by the on-screen chart and the PNG legend so they always agree. */
function deriveChartSeries(content: ChartArtifactContent): DerivedSeries[] {
  const raw = Array.isArray(content?.series) ? content.series : [];
  return raw.slice(0, MAX_SERIES).map((s, i) => ({
    key: `s${i}`,
    label: typeof s?.label === 'string' && s.label.trim() ? s.label : `Series ${i + 1}`,
    color: PALETTE[i % PALETTE.length],
    data: (Array.isArray(s?.data) ? s.data : [])
      .slice(0, MAX_POINTS)
      .filter((d) => d && (typeof d.x === 'string' || typeof d.x === 'number'))
      .map((d) => ({ x: d.x, y: Number(d.y) || 0 })),
  }));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeName(title: string | null, ext: string): string {
  const base = (title || 'artifact').replace(/[^\w\d-]+/g, '_').slice(0, 60) || 'artifact';
  return `${base}.${ext}`;
}

// ---- Chart view --------------------------------------------------------------

function ChartView({ content, chartRef }: { content: ChartArtifactContent; chartRef: React.RefObject<HTMLDivElement> }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const axis = isDark ? '#94a3b8' : '#64748b';
  const grid = isDark ? '#1e293b' : '#e2e8f0';

  const series = deriveChartSeries(content);
  const type = content.chartType;

  if (!series.some((s) => s.data.length > 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">This chart has no data to show.</p>;
  }

  if (type === 'pie' || type === 'doughnut') {
    const src = series.find((s) => s.data.length > 0)!; // first non-empty series
    const pieData = src.data.map((d) => ({ name: String(d.x), value: Number(d.y) || 0 }));
    return (
      <div ref={chartRef} className="w-full" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={type === 'doughnut' ? 70 : 0}
              outerRadius={110}
              label={{ fill: axis, fontSize: 11 }}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <RTooltip />
            <Legend wrapperStyle={{ fontSize: 11, color: axis }} />
          </RPieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // bar / line — merge into rows keyed by x in ONE pass; columns are namespaced
  // (s0, s1, …) so a series labelled "x" or a duplicate/blank label can't clobber
  // the axis or another series. Legend/tooltip show the real label via name=.
  const rowMap = new Map<string, Record<string, string | number>>();
  const xOrder: string[] = [];
  for (const s of series) {
    for (const d of s.data) {
      const xk = String(d.x);
      let row = rowMap.get(xk);
      if (!row) { row = { x: xk }; rowMap.set(xk, row); xOrder.push(xk); }
      row[s.key] = d.y;
    }
  }
  const rows = xOrder.map((xk) => {
    const row = rowMap.get(xk)!;
    for (const s of series) if (!(s.key in row)) row[s.key] = 0;
    return row;
  });

  return (
    <div ref={chartRef} className="w-full" style={{ height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'line' ? (
          <RLineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="x" tick={{ fill: axis, fontSize: 11 }} stroke={axis} />
            <YAxis tick={{ fill: axis, fontSize: 11 }} stroke={axis} />
            <RTooltip />
            <Legend wrapperStyle={{ fontSize: 11, color: axis }} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </RLineChart>
        ) : (
          <RBarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="x" tick={{ fill: axis, fontSize: 11 }} stroke={axis} />
            <YAxis tick={{ fill: axis, fontSize: 11 }} stroke={axis} />
            <RTooltip />
            <Legend wrapperStyle={{ fontSize: 11, color: axis }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
            ))}
          </RBarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ---- Report view -------------------------------------------------------------

function ReportView({ content, reportRef }: { content: ReportArtifactContent; reportRef: React.RefObject<HTMLDivElement> }) {
  const md = typeof content?.markdown === 'string' ? content.markdown : '';
  return (
    <div ref={reportRef} className="ai-response-content bg-background p-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {md}
      </ReactMarkdown>
    </div>
  );
}

// ---- Panel -------------------------------------------------------------------

export function ArtifactPanel({
  artifactId,
  open,
  onOpenChange,
}: {
  artifactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [full, setFull] = useState<ArtifactFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !artifactId) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    setRevealed(false);
    setExportError(null);
    setFull(null);
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        // fn not in generated types (ships with this migration).
        const { data, error } = await (supabase as any).rpc('fn_ai_get_artifact', { p_id: artifactId });
        if (cancelled) return;
        const row = Array.isArray(data) ? (data[0] as ArtifactFull | undefined) : undefined;
        if (error || !row) {
          setErrored(true);
        } else {
          setFull(row);
        }
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, artifactId]);

  // Audit a download BEFORE producing the file (A3). Best-effort: a logging
  // failure does not block the user's own download of their own artifact.
  const logDownload = useCallback(async (format: string) => {
    if (!artifactId) return;
    try {
      const supabase = createClientSupabaseClient();
      await (supabase as any).rpc('fn_ai_log_artifact_download', { p_id: artifactId, p_format: format });
    } catch {
      /* silent — audit is best-effort, never blocks the owner's download */
    }
  }, [artifactId]);

  const downloadReportPdf = useCallback(async () => {
    if (!reportRef.current || !full) return;
    setDownloading(true);
    setExportError(null);
    try {
      await logDownload('pdf');
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(safeName(full.title, 'pdf'));
    } catch (e) {
      console.error('[ArtifactPanel] report PDF failed:', e);
      setExportError('Could not build the PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [full, logDownload, isDark]);

  const downloadChartPng = useCallback(async () => {
    if (!chartRef.current || !full) return;
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;
    setDownloading(true);
    setExportError(null);
    try {
      await logDownload('png');
      const rect = svg.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const svgH = Math.max(1, Math.round(rect.height));

      // Recharts renders the legend as HTML OUTSIDE the <svg>, so serializing the
      // SVG alone loses series names. Re-draw a legend strip from the same derived
      // series (bar/line only; pie has inline slice labels).
      const content = full.content as ChartArtifactContent;
      const type = content?.chartType;
      const series = deriveChartSeries(content);
      const showLegend = (type === 'bar' || type === 'line') && series.length > 0;
      const legendH = showLegend ? 30 : 0;

      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(svgH));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const xml = new XMLSerializer().serializeToString(clone);
      const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg load failed'));
        img.src = svg64;
      });

      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = (svgH + legendH) * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setExportError('Could not generate the image. Please try again.'); return; }
      ctx.fillStyle = isDark ? '#0a0a0a' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, svgH);

      if (showLegend) {
        ctx.font = '12px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        let lx = 12;
        const ly = svgH + legendH / 2;
        for (const s of series) {
          if (lx > w - 70) break; // don't overflow the row
          ctx.fillStyle = s.color;
          ctx.fillRect(lx, ly - 5, 10, 10);
          lx += 14;
          ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
          ctx.fillText(s.label, lx, ly);
          lx += ctx.measureText(s.label).width + 18;
        }
      }

      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, safeName(full.title, 'png'));
          else setExportError('Could not generate the image. Please try again.');
          resolve();
        }, 'image/png');
      });
    } catch (e) {
      console.error('[ArtifactPanel] chart PNG failed:', e);
      setExportError('Could not generate the image. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [full, logDownload, isDark]);

  const isSensitiveGated = full?.is_sensitive && !revealed;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b text-left">
          <SheetTitle className="text-base pr-8 truncate">
            {full?.title || 'Artifact'}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {full ? `${full.type}${full.version > 1 ? ` · v${full.version}` : ''}` : 'Loading…'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : errored || !full ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <AlertTriangle className="mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">Couldn&rsquo;t load this artifact.</p>
            </div>
          ) : isSensitiveGated ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="max-w-sm">
                <p className="text-sm font-medium text-foreground">This artifact contains salary / fee data</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Just a heads-up before it&rsquo;s shown on your screen — these are figures you can already access.
                </p>
              </div>
              <Button size="sm" onClick={() => setRevealed(true)}>Show it</Button>
            </div>
          ) : full.type === 'chart' ? (
            <ChartView content={full.content as ChartArtifactContent} chartRef={chartRef} />
          ) : full.type === 'report' ? (
            <ReportView content={full.content as ReportArtifactContent} reportRef={reportRef} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <p className="text-sm">
                {full.type === 'spreadsheet' ? 'Spreadsheets' : 'Slides'} open here soon.
              </p>
              <p className="mt-1 text-xs">This artifact type arrives in the next update.</p>
            </div>
          )}
        </ScrollArea>

        {/* Footer: download (only for rendered, non-gated chart/report) */}
        {full && !isSensitiveGated && (full.type === 'chart' || full.type === 'report') && (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            {exportError && (
              <span className="mr-auto text-xs text-destructive">{exportError}</span>
            )}
            {full.type === 'report' && (
              <Button size="sm" variant="outline" disabled={downloading} onClick={downloadReportPdf}>
                {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Download PDF
              </Button>
            )}
            {full.type === 'chart' && (
              <Button size="sm" variant="outline" disabled={downloading} onClick={downloadChartPng}>
                {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1.5 h-4 w-4" />}
                Download PNG
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ArtifactPanel;
