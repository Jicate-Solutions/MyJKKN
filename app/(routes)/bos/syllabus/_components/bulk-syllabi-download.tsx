'use client';

import { useState } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { FolderDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { renderCourseSyllabusPDF } from '@/lib/utils/bos/course-syllabus-pdf';
import type { BosCourseSyllabus } from '@/types/bos';
import { buildSyllabusPdfData, type SyllabusPdfContext } from './row-actions';
import type { InstitutionOption } from '../../_components/institution-picker';

/** COE board row as returned by /api/bos/boards. */
interface BoardOption {
  id: string;
  board_code?: string | null;
  board_name?: string | null;
  display_name?: string | null;
}

/**
 * Sanitizes one path component for a zip entry: drops characters that are
 * illegal or awkward on Windows, collapses whitespace runs to a single
 * underscore, and caps the length so nested paths stay under the OS limit.
 */
function safe(s: string): string {
  return (s ?? '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * Downloads every syllabus for the selected institution + board + regulation as
 * one .zip, filed under a folder per Board of Studies:
 *
 *   Syllabi_UTA_TAMIL_R-2024_2026-07-29.zip
 *     UTA_TAMIL/24UGTA01_GENERAL_TAMIL_I.pdf
 *     UTA_TAMIL/24UGTA02_GENERAL_TAMIL_II.pdf
 *     _Unassigned/…            ← syllabi with no board_id
 *
 * The grouping is board-keyed rather than flat so the layout stays identical if
 * the board filter is ever relaxed to allow a whole-regulation export.
 *
 * Each PDF is produced by buildSyllabusPdfData + renderCourseSyllabusPDF — the
 * SAME pair behind the per-row download button — so a course in this archive is
 * identical to the one you'd get by downloading it on its own.
 */
export function BulkSyllabiDownloadButton({
  institutionsId,
  regulationId,
  regulationLabel,
  boardId,
  stream,
  institutions,
  casInstitutionIds,
  cetInstitutionIds,
}: {
  /** MyJKKN institution UUID currently selected in the filter bar. */
  institutionsId?: string;
  /** Regulation UUID currently selected in the filter bar. Required. */
  regulationId?: string;
  /** Human label for the filename, e.g. "R-2024 (2024)". */
  regulationLabel?: string;
  /**
   * Board UUID currently selected in the filter bar. REQUIRED — see `ready`.
   * A whole regulation is 800+ courses at ~210 KB each, which takes minutes and
   * builds a ~175 MB archive in browser memory; one board is a few dozen.
   */
  boardId?: string;
  /** Optional stream filter, mirrored from the filter bar. */
  stream?: string;
  /** Institution list (already cached by the page) — resolves PDF header branding. */
  institutions: InstitutionOption[];
  casInstitutionIds: Set<string>;
  cetInstitutionIds: Set<string>;
}) {
  const [busy, setBusy] = useState(false);

  // Institution + Board + Regulation are ALL required. Board is what keeps the
  // job small: rendering an entire regulation client-side (836 courses for CAS
  // R-2024) ran for minutes and assembled a ~175 MB blob in the tab. Board-at-a-
  // time is a few dozen PDFs and finishes quickly.
  const ready = !!institutionsId && !!regulationId && !!boardId;

  const handleClick = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const tid = toast.loading('Fetching syllabi…');

    try {
      // ── 1. Drain every page of the syllabus list ───────────────────────────
      // Never a single capped request: a regulation can hold far more syllabi
      // than one page (CAS R-2024 has 836), and a partial read here would ship
      // a silently incomplete archive.
      const PAGE_SIZE = 500;
      const MAX_PAGES = 40;
      const syllabi: BosCourseSyllabus[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({
          regulationId: regulationId!,
          institutionsId: institutionsId!,
          isLatest: 'true',
          limit: String(PAGE_SIZE),
          page: String(page),
        });
        params.set('boardId', boardId!);
        if (stream) params.set('stream', stream);

        const res = await fetch(`/api/bos/syllabus?${params}`);
        if (!res.ok) throw new Error('Failed to fetch syllabi');
        const json = await res.json();
        const rows: BosCourseSyllabus[] = json.data ?? [];
        syllabi.push(...rows);

        const total = json.metadata?.total ?? syllabi.length;
        toast.loading(`Fetched ${syllabi.length} of ${total} syllabi…`, { id: tid });
        if (rows.length === 0 || syllabi.length >= total) break;
      }

      if (syllabi.length === 0) {
        toast.error('No syllabi found for this board and regulation', { id: tid });
        return;
      }

      // ── 2. Board id → folder name ─────────────────────────────────────────
      // Board metadata lives in COE, keyed by institution. Failure is non-fatal:
      // folders fall back to the raw board id so no PDF is ever dropped.
      const boardFolderById = new Map<string, string>();
      try {
        const res = await fetch(`/api/bos/boards?institutionsId=${encodeURIComponent(institutionsId!)}`);
        if (res.ok) {
          const json = await res.json();
          for (const b of (json.data ?? []) as BoardOption[]) {
            const label = b.display_name ?? b.board_name ?? b.board_code ?? b.id;
            boardFolderById.set(b.id, safe(b.board_code ? `${b.board_code} ${label}` : label));
          }
        }
      } catch {
        // fall through to raw-id folders
      }

      // ── 3. Render one PDF per syllabus into its board folder ───────────────
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Shared across every course so taxonomy is fetched once per board rather
      // than once per course — see SyllabusPdfContext.
      const taxonomyCache: NonNullable<SyllabusPdfContext['taxonomyCache']> = new Map();

      // Guards against two courses colliding on one filename inside a folder
      // (jszip would silently overwrite the first).
      const usedNames = new Set<string>();
      const uniqueName = (folder: string, base: string) => {
        let name = `${folder}/${base}.pdf`;
        let n = 2;
        while (usedNames.has(name)) name = `${folder}/${base}_${n++}.pdf`;
        usedNames.add(name);
        return name;
      };

      const failed: string[] = [];
      let rendered = 0;

      for (const syllabus of syllabi) {
        try {
          const institutionName = institutions.find(
            (i) => i.id === syllabus.institutions_id
              || i.myjkkn_institution_ids.includes(syllabus.institutions_id),
          )?.name;

          const data = await buildSyllabusPdfData(syllabus, {
            institutionName,
            isCas: casInstitutionIds.has(syllabus.institutions_id),
            isCet: cetInstitutionIds.has(syllabus.institutions_id),
            taxonomyCache,
          });

          // Fresh single-course document — this is the unit added to the zip.
          const doc = new jsPDF('portrait', 'mm', 'a4');
          renderCourseSyllabusPDF(doc, data, { startNewPage: false });

          const folder = syllabus.board_id
            ? (boardFolderById.get(syllabus.board_id) ?? safe(syllabus.board_id))
            : '_Unassigned';
          const base = `${safe(syllabus.course_code)}_${safe(syllabus.course_name)}`;
          zip.file(uniqueName(folder, base), doc.output('arraybuffer'));
          rendered += 1;
        } catch {
          // One bad syllabus must not sink the whole archive — record and move on.
          failed.push(syllabus.course_code);
        }

        // Yield to the event loop periodically so the tab stays responsive and
        // the progress toast actually repaints during a long run.
        if (rendered % 10 === 0) {
          toast.loading(`Rendered ${rendered} of ${syllabi.length} syllabi…`, { id: tid });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (rendered === 0) {
        toast.error('Could not render any syllabus PDFs', { id: tid });
        return;
      }

      toast.loading('Building archive…', { id: tid });
      const blob = await zip.generateAsync({ type: 'blob' });

      const date = new Date().toISOString().split('T')[0];
      const boardTag = boardFolderById.get(boardId!) ?? '';
      const zipName = `Syllabi_${boardTag ? `${boardTag}_` : ''}${safe(regulationLabel ?? 'regulation')}_${date}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const folderCount = new Set([...usedNames].map((n) => n.split('/')[0])).size;
      const where = folderCount === 1 ? '1 board folder' : `${folderCount} board folders`;
      if (failed.length > 0) {
        toast.success(
          `Downloaded ${rendered} syllabi in ${where}. Failed: ${failed.join(', ')}`,
          { id: tid, duration: 8000 },
        );
      } else {
        toast.success(`Downloaded ${rendered} syllabi in ${where}`, { id: tid });
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to build syllabi archive', { id: tid });
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <Button size='sm' variant='outline' onClick={handleClick} disabled={!ready || busy}>
      {busy ? <Loader2 className='h-4 w-4 mr-2 animate-spin' /> : <FolderDown className='h-4 w-4 mr-2' />}
      Download All Syllabi
    </Button>
  );

  if (ready) return button;

  // Disabled buttons swallow pointer events, so the tooltip needs a wrapper to
  // explain WHY it's disabled rather than leaving the user guessing.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent side='top'>Select an institution, a board and a regulation first</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
