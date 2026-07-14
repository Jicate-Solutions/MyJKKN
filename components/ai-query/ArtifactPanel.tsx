'use client';

/**
 * ArtifactPanel
 * Right-side panel that renders one AI Assistant artifact — charts, reports,
 * spreadsheets, and slides — with download. Opened by tapping an artifact card
 * in the chat. (Phase 1: charts + reports. Phase 2: spreadsheets + slides.)
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Download, AlertTriangle, ShieldAlert, Image as ImageIcon,
  FileSpreadsheet, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import XLSX from '@/lib/utils/excel-compat';
import { downloadCsv } from '@/lib/utils/csv-export';
import { markdownComponents } from './markdown-components';
import type {
  ArtifactFull, ChartArtifactContent, ReportArtifactContent,
  SpreadsheetArtifactContent, SlidesArtifactContent,
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

// ---- Spreadsheet view --------------------------------------------------------

type SpreadsheetColumn = { key: string; label?: string; type?: string };

// On-screen render cap so a huge dataset can't jank the tab. Downloads (xlsx/csv)
// always include EVERY row — A8 "build the whole thing" applies to the artifact,
// this cap is a UI courtesy with an explicit "download for all" note.
const MAX_TABLE_ROWS = 500;

/** Human-facing cell text for the on-screen table (mirrors QueryResultTable). */
function formatCell(value: unknown, type?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': {
      const n = Number(value);
      return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : String(value);
    }
    case 'percentage': {
      const n = Number(value);
      return Number.isFinite(n) ? `${n.toFixed(1)}%` : String(value);
    }
    case 'date': {
      const d = new Date(value as string);
      return isNaN(d.getTime())
        ? String(value)
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    case 'boolean':
      return value ? 'Yes' : 'No';
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/** Raw scalar for xlsx/csv — numbers stay numeric so the spreadsheet can compute. */
function rawCell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function SpreadsheetView({ content }: { content: SpreadsheetArtifactContent }) {
  const columns: SpreadsheetColumn[] = Array.isArray(content?.columns) ? content.columns : [];
  const rows: Record<string, unknown>[] = Array.isArray(content?.rows) ? content.rows : [];

  if (columns.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">This spreadsheet has no columns to show.</p>;
  }
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">This spreadsheet has no rows.</p>;
  }

  const shown = rows.slice(0, MAX_TABLE_ROWS);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap">{c.label || c.key}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row, ri) => (
              <TableRow key={ri}>
                {columns.map((c) => (
                  <TableCell key={c.key} className="whitespace-nowrap">
                    {formatCell(row[c.key], c.type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > MAX_TABLE_ROWS && (
        <p className="text-xs text-muted-foreground">
          Showing the first {MAX_TABLE_ROWS.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} rows —
          download the Excel or CSV to get them all.
        </p>
      )}
    </div>
  );
}

// ---- Slides view -------------------------------------------------------------

function SlidesView({ content }: { content: SlidesArtifactContent }) {
  const slides = Array.isArray(content?.slides) ? content.slides : [];
  const [idx, setIdx] = useState(0);

  if (slides.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">This deck has no slides.</p>;
  }

  const safeIdx = Math.min(Math.max(idx, 0), slides.length - 1);
  const slide = slides[safeIdx];
  const bullets = Array.isArray(slide?.bullets) ? slide.bullets : [];

  return (
    <div className="space-y-3">
      {/* Slide surface */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">
          {slide?.title || `Slide ${safeIdx + 1}`}
        </h3>
        {bullets.length > 0 && (
          <ul className="mt-4 space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/90">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/70" />
                <span>{String(b)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Speaker notes */}
      {slide?.notes && (
        <div className="rounded-lg border border-dashed bg-muted/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Speaker notes</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{slide.notes}</p>
        </div>
      )}

      {/* Prev / counter / next */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" disabled={safeIdx === 0} onClick={() => setIdx(safeIdx - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Prev
        </Button>
        <span className="text-xs text-muted-foreground">{safeIdx + 1} / {slides.length}</span>
        <Button size="sm" variant="outline" disabled={safeIdx === slides.length - 1} onClick={() => setIdx(safeIdx + 1)}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
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

  const downloadSpreadsheetXlsx = useCallback(async () => {
    if (!full) return;
    const content = full.content as SpreadsheetArtifactContent;
    const columns = (Array.isArray(content?.columns) ? content.columns : []) as SpreadsheetColumn[];
    const rows = Array.isArray(content?.rows) ? content.rows : [];
    if (columns.length === 0) return;
    setDownloading(true);
    setExportError(null);
    try {
      await logDownload('xlsx');
      const aoa: (string | number | null)[][] = [
        columns.map((c) => c.label || c.key),
        ...rows.map((row) => columns.map((c) => rawCell((row as Record<string, unknown>)[c.key]))),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      await XLSX.writeFile(wb, safeName(full.title, 'xlsx'));
    } catch (e) {
      console.error('[ArtifactPanel] spreadsheet XLSX failed:', e);
      setExportError('Could not build the Excel file. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [full, logDownload]);

  const downloadSpreadsheetCsv = useCallback(async () => {
    if (!full) return;
    const content = full.content as SpreadsheetArtifactContent;
    const columns = (Array.isArray(content?.columns) ? content.columns : []) as SpreadsheetColumn[];
    const rows = Array.isArray(content?.rows) ? content.rows : [];
    if (columns.length === 0) return;
    setExportError(null);
    try {
      await logDownload('csv');
      const base = (full.title || 'artifact').replace(/[^\w\d-]+/g, '_').slice(0, 60) || 'artifact';
      downloadCsv(
        rows as Record<string, unknown>[],
        columns.map((c) => ({
          header: c.label || c.key,
          accessor: (row: Record<string, unknown>) => rawCell(row[c.key]),
        })),
        base,
      );
    } catch (e) {
      console.error('[ArtifactPanel] spreadsheet CSV failed:', e);
      setExportError('Could not build the CSV. Please try again.');
    }
  }, [full, logDownload]);

  const downloadSlidesPptx = useCallback(async () => {
    if (!full) return;
    const content = full.content as SlidesArtifactContent;
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    if (slides.length === 0) return;
    setDownloading(true);
    setExportError(null);
    try {
      await logDownload('pptx');
      const { default: PptxGenJS } = await import('pptxgenjs');
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; // 13.3in × 7.5in
      for (const s of slides) {
        const slide = pptx.addSlide();
        slide.addText(String(s?.title || ''), {
          x: 0.5, y: 0.3, w: 12.3, h: 0.9, fontSize: 26, bold: true, color: '363636',
        });
        const bullets = Array.isArray(s?.bullets) ? s.bullets : [];
        if (bullets.length > 0) {
          slide.addText(
            bullets.map((b) => ({ text: String(b), options: { bullet: true } })),
            { x: 0.7, y: 1.4, w: 11.9, h: 5.2, fontSize: 16, color: '404040', valign: 'top' },
          );
        }
        if (s?.notes) slide.addNotes(String(s.notes));
      }
      const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
      downloadBlob(blob, safeName(full.title, 'pptx'));
    } catch (e) {
      console.error('[ArtifactPanel] slides PPTX failed:', e);
      setExportError('Could not build the slides. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [full, logDownload]);

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
          ) : full.type === 'spreadsheet' ? (
            <SpreadsheetView content={full.content as SpreadsheetArtifactContent} />
          ) : full.type === 'slides' ? (
            <SlidesView content={full.content as SlidesArtifactContent} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <p className="text-sm">This artifact can&rsquo;t be shown here.</p>
            </div>
          )}
        </ScrollArea>

        {/* Footer: download (only for rendered, non-gated artifacts) */}
        {full && !isSensitiveGated && ['chart', 'report', 'spreadsheet', 'slides'].includes(full.type) && (
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
            {full.type === 'spreadsheet' && (
              <>
                <Button size="sm" variant="outline" disabled={downloading} onClick={downloadSpreadsheetCsv}>
                  <Download className="mr-1.5 h-4 w-4" />
                  CSV
                </Button>
                <Button size="sm" variant="outline" disabled={downloading} onClick={downloadSpreadsheetXlsx}>
                  {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />}
                  Excel
                </Button>
              </>
            )}
            {full.type === 'slides' && (
              <Button size="sm" variant="outline" disabled={downloading} onClick={downloadSlidesPptx}>
                {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                PowerPoint
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ArtifactPanel;
