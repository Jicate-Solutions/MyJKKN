'use client';
// app/(routes)/resource-management/qr-stickers/page.tsx
//
// Printable InstaSolver QR stickers — one per room or item.
//
// Director rulings (30 Sep – 1 Oct 2026): a QR sticker in every room; scanning
// it opens /instasolver/r/<token> with the room and item already filled in.
// Stickers are printed and stuck by ONE central team — JKKN Main Office — for
// every college (1 Oct 2026). So this page lets that team pick ANY college and
// shows, per college, the rooms and items still without a printed sticker.
//
// Each sticker's QR encodes the FULL URL, so any phone camera opens the report
// page directly. (The older single-item label sheet on the resource detail
// page encodes the bare token for the in-app scanner — those stickers are not
// replaced by this page, and a phone camera cannot open them as a link.)
//
// Everything goes through /api/instasolver/qr-stickers: a Main Office person's
// own row-level security only shows Main Office's rooms, so the route checks
// who is asking (super admin, or Main Office + resources.resources.edit) and
// then reads and writes for any college. Anyone else gets the route's reason
// on a card (rule #27).

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, CheckCircle2, Loader2, Printer, QrCode } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ParentCategoryService } from '@/lib/services/resource-management/parent-category-service';
import { formatPlace, stickerUrl } from '@/lib/instasolver/resource-report';

const ALL = 'all';
const API = '/api/instasolver/qr-stickers';
/** 3 × 5 = 15 stickers per A4 sheet: big enough to scan from a metre away. */
const PER_SHEET = 15;

type Show = 'unprinted' | 'all';

interface College {
  id: string;
  name: string;
  total: number;
  unprinted: number;
}

interface StickerRow {
  id: string;
  name: string;
  building_number: string | null;
  block_number: string | null;
  floor_number: string | null;
  room_number: string | null;
  qr_code_token: string | null;
  printed_at: string | null;
}

interface Sticker {
  id: string;
  name: string;
  place: string;
  qrDataUrl: string;
}

export default function QrStickersPage() {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);
  const [institutionId, setInstitutionId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [show, setShow] = useState<Show>('unprinted');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<StickerRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    ParentCategoryService.getParentCategoriesForSelect()
      .then(setCategories)
      .catch(() => setError('Could not load the categories. Refresh to try again.'));
  }, []);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    setError(null);
    setStickers([]);
    try {
      const qs = new URLSearchParams({ show });
      if (institutionId) qs.set('institution_id', institutionId);
      if (categoryId !== ALL) qs.set('category_id', categoryId);
      const res = await fetch(`${API}?${qs.toString()}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setRefusal(body.error ?? 'You don\'t have access to print stickers.');
        return;
      }
      if (!res.ok || !body.success) throw new Error(body.error ?? 'load_failed');
      setColleges(body.colleges ?? []);
      setRows(body.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message !== 'load_failed' ? e.message : 'Could not load the rooms and items for this college.');
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [institutionId, categoryId, show]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const missingTokens = rows.filter((r) => !r.qr_code_token).length;

  const post = useCallback(
    async (action: 'prepare' | 'mark_printed', ids: string[]) => {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, institution_id: institutionId, resource_ids: ids }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? 'Something went wrong. Please try again.');
      return body;
    },
    [institutionId]
  );

  const prepare = useCallback(async () => {
    setPreparing(true);
    setError(null);
    setNotice(null);
    try {
      const body = await post('prepare', rows.map((r) => r.id));
      const prepared = (body.rows ?? []) as StickerRow[];
      const out: Sticker[] = [];
      let missing = 0;
      for (const row of prepared) {
        if (!row.qr_code_token) {
          missing += 1;
          continue;
        }
        const qrDataUrl = await QRCode.toDataURL(stickerUrl(row.qr_code_token), {
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        out.push({ id: row.id, name: row.name, place: formatPlace(row), qrDataUrl });
      }
      setStickers(out);
      if (missing > 0) {
        setError(
          `${missing} item${missing === 1 ? '' : 's'} had no sticker code and one could not be created, so they are left out.`
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not prepare the stickers.');
    } finally {
      setPreparing(false);
    }
  }, [post, rows]);

  // Marked only when someone says the sheets came out of the printer — a print
  // dialog can be cancelled, so the Print button itself records nothing.
  const markPrinted = useCallback(async () => {
    setMarking(true);
    setError(null);
    try {
      const body = await post('mark_printed', stickers.map((s) => s.id));
      setNotice(
        `${body.marked} marked as printed.${body.skipped ? ` ${body.skipped} could not be marked — try again.` : ''}`
      );
      await loadRows();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not mark them as printed.');
    } finally {
      setMarking(false);
    }
  }, [post, stickers, loadRows]);

  if (refusal) {
    return (
      <ContentLayout title="QR stickers">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">You don&apos;t have access to print stickers</p>
              <p className="text-sm text-muted-foreground">{refusal}</p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const sheets: Sticker[][] = [];
  for (let i = 0; i < stickers.length; i += PER_SHEET) sheets.push(stickers.slice(i, i + PER_SHEET));
  const college = colleges.find((c) => c.id === institutionId) ?? null;
  const unprintedRows = rows.filter((r) => !r.printed_at);

  return (
    <ContentLayout title="QR stickers">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body * {
            visibility: hidden;
          }
          .instasolver-sticker-root,
          .instasolver-sticker-root * {
            visibility: visible;
          }
          .instasolver-sticker-root {
            position: absolute;
            inset: 0;
            margin: 0;
            padding: 0;
            background: white;
          }
          .instasolver-sticker-sheet {
            break-after: page;
            page-break-after: always;
          }
          .instasolver-sticker-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
        .instasolver-sticker-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(5, 1fr);
          gap: 3mm;
          width: 194mm;
          height: 281mm;
          margin: 0 auto;
        }
        .instasolver-sticker {
          border: 1px dashed #a1a1aa;
          padding: 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1mm;
          background: white;
          color: #18181b;
          break-inside: avoid;
          page-break-inside: avoid;
          text-align: center;
          overflow: hidden;
        }
        .instasolver-sticker img {
          width: 34mm;
          height: 34mm;
        }
        .instasolver-sticker-name {
          font: 600 9pt/1.15 ui-sans-serif, system-ui, sans-serif;
          max-width: 100%;
          word-break: break-word;
        }
        .instasolver-sticker-place {
          font: 7.5pt/1.1 ui-sans-serif, system-ui, sans-serif;
          color: #3f3f46;
        }
        .instasolver-sticker-cta {
          font: 600 7pt/1.1 ui-sans-serif, system-ui, sans-serif;
          color: #0b6b3a;
        }
      `}</style>

      <div className="space-y-4 print:hidden">
        <p className="text-sm text-muted-foreground">
          The central team at JKKN Main Office prints the stickers for every college. Pick a college
          and a category, prepare the stickers, print them, then mark them as printed. Stick one in
          each room or on each item — scanning it opens the InstaSolver report page with the place
          filled in.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>College</Label>
            <Select value={institutionId || undefined} onValueChange={setInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a college" />
              </SelectTrigger>
              <SelectContent>
                {colleges.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.unprinted} without a sticker
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Show</Label>
            <Select value={show} onValueChange={(v) => setShow(v as Show)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unprinted">Not printed yet</SelectItem>
                <SelectItem value="all">All, including printed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={prepare} disabled={!institutionId || loadingRows || preparing || rows.length === 0}>
            {preparing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="mr-2 h-4 w-4" />
            )}
            Prepare {rows.length} sticker{rows.length === 1 ? '' : 's'}
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={stickers.length === 0}>
            <Printer className="mr-2 h-4 w-4" /> Print {sheets.length} sheet
            {sheets.length === 1 ? '' : 's'}
          </Button>
          <Button variant="outline" onClick={markPrinted} disabled={stickers.length === 0 || marking}>
            {marking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Mark {stickers.length} as printed
          </Button>
          {loadingRows ? (
            <span className="text-sm text-muted-foreground">Loading…</span>
          ) : missingTokens > 0 ? (
            <span className="text-sm text-muted-foreground">
              {missingTokens} item{missingTokens === 1 ? '' : 's'} will get a new sticker code.
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-2 rounded-md border border-green-600/40 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        {institutionId && !loadingRows ? (
          <Card>
            <CardContent className="space-y-2 py-4">
              <p className="font-medium">
                Rooms and items still without a printed sticker
                {college ? ` — ${college.name}` : ''}: {unprintedRows.length}
                {categoryId !== ALL ? ' in this category' : ''}
              </p>
              {unprintedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every room and item here has a printed sticker.</p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                  {unprintedRows.map((r) => (
                    <li key={r.id} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{r.name}</span>
                      {formatPlace(r) ? <span className="text-muted-foreground">{formatPlace(r)}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        {!institutionId && !loadingRows ? (
          <p className="text-sm text-muted-foreground">Choose a college to see its rooms and items.</p>
        ) : null}
      </div>

      {stickers.length > 0 ? (
        <div className="instasolver-sticker-root mt-6 space-y-6 overflow-x-auto bg-zinc-50 p-4 print:mt-0 print:space-y-0 print:p-0">
          {sheets.map((sheet, idx) => (
            <div key={idx} className="instasolver-sticker-sheet">
              <div className="instasolver-sticker-grid">
                {sheet.map((s) => (
                  <div key={s.id} className="instasolver-sticker">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.qrDataUrl} alt={`QR for ${s.name}`} />
                    <div className="instasolver-sticker-name">{s.name}</div>
                    {s.place ? <div className="instasolver-sticker-place">{s.place}</div> : null}
                    <div className="instasolver-sticker-cta">Scan to report a problem · InstaSolver</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </ContentLayout>
  );
}
