'use client';
// app/(routes)/resource-management/qr-stickers/page.tsx
//
// Printable InstaSolver QR stickers — one per room or item.
//
// Director rulings (30 Sep – 1 Oct 2026): a QR sticker in every room; scanning
// it opens /instasolver/r/<token> with the room and item already filled in.
// The estate office picks a college and a category and prints A4 sheets.
//
// Each sticker's QR encodes the FULL URL, so any phone camera opens the report
// page directly. (The older single-item label sheet on the resource detail
// page encodes the bare token for the in-app scanner — those stickers are not
// replaced by this page, and a phone camera cannot open them as a link.)
//
// Resources with no qr_code_token get one through qrCodeService's existing
// generate-or-fetch method before printing. That is a write, so the page needs
// resources.resources.edit; row-level security still decides which rows the
// signed-in person can read and update.

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Loader2, Printer, QrCode } from 'lucide-react';
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
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ParentCategoryService } from '@/lib/services/resource-management/parent-category-service';
import { qrCodeService } from '@/lib/services/resource-management/qr-code-service';
import { formatPlace, stickerUrl } from '@/lib/instasolver/resource-report';

const ALL = 'all';
/** 3 × 5 = 15 stickers per A4 sheet: big enough to scan from a metre away. */
const PER_SHEET = 15;

interface StickerRow {
  id: string;
  name: string;
  building_number: string | null;
  block_number: string | null;
  floor_number: string | null;
  room_number: string | null;
  qr_code_token: string | null;
}

interface Sticker {
  id: string;
  name: string;
  place: string;
  qrDataUrl: string;
}

export default function QrStickersPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions } = useUserInstitutionAccess();
  const canPrint = isSuperAdmin || canAccess('resources.resources', 'edit');

  const [institutionId, setInstitutionId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<StickerRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ParentCategoryService.getParentCategoriesForSelect()
      .then(setCategories)
      .catch(() => setError('Could not load the categories. Refresh to try again.'));
  }, []);

  useEffect(() => {
    if (!institutionId && institutions.length > 0) {
      setInstitutionId(institutions[0].institution_id);
    }
  }, [institutions, institutionId]);

  const loadRows = useCallback(async () => {
    if (!institutionId) return;
    setLoadingRows(true);
    setError(null);
    setStickers([]);
    try {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('resources')
        .select('id, name, building_number, block_number, floor_number, room_number, qr_code_token')
        .eq('institution_id', institutionId)
        .order('name', { ascending: true })
        .limit(1000);
      if (categoryId !== ALL) query = query.eq('parent_category_id', categoryId);
      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setRows((data ?? []) as StickerRow[]);
    } catch {
      setError('Could not load the rooms and items for this college.');
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [institutionId, categoryId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const missingTokens = useMemo(() => rows.filter((r) => !r.qr_code_token).length, [rows]);

  const prepare = useCallback(async () => {
    setPreparing(true);
    setError(null);
    try {
      const out: Sticker[] = [];
      let failed = 0;
      for (const row of rows) {
        let token = row.qr_code_token;
        if (!token) {
          try {
            token = await qrCodeService.generateQrTokenForResource(row.id);
          } catch {
            failed += 1;
            continue;
          }
        }
        const qrDataUrl = await QRCode.toDataURL(stickerUrl(token), {
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        out.push({ id: row.id, name: row.name, place: formatPlace(row), qrDataUrl });
      }
      setStickers(out);
      if (failed > 0) {
        setError(
          `${failed} item${failed === 1 ? '' : 's'} had no sticker code and one could not be created, so they are left out.`
        );
      }
    } finally {
      setPreparing(false);
    }
  }, [rows]);

  if (permissionsLoading) {
    return (
      <ContentLayout title="QR stickers">
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </ContentLayout>
    );
  }

  if (!canPrint) {
    return (
      <ContentLayout title="QR stickers">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">You don&apos;t have access to print stickers</p>
              <p className="text-sm text-muted-foreground">
                Printing stickers needs permission to edit resources. Ask your estate office or an
                administrator.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const sheets: Sticker[][] = [];
  for (let i = 0; i < stickers.length; i += PER_SHEET) sheets.push(stickers.slice(i, i + PER_SHEET));

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
          Pick a college and a category, prepare the stickers, then print. Stick one in each room or
          on each item — scanning it opens the InstaSolver report page with the place filled in.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>College</Label>
            <Select value={institutionId || undefined} onValueChange={setInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a college" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.institution_id} value={inst.institution_id}>
                    {inst.institution_name}
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={prepare} disabled={loadingRows || preparing || rows.length === 0}>
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
        {!loadingRows && rows.length === 0 && institutionId ? (
          <p className="text-sm text-muted-foreground">No rooms or items found for this choice.</p>
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
