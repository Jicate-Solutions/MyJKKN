'use client';

// ============================================================================
// IdCardPreviewDialog — preview-before-print for one or many learners.
// Created: 2026-09-05. Updated: 2026-09-07 — student-wise layout, validation
// summary, address check, PDF download, card-printer hand-off.
//
// Flow: resolve accounts + each learner's institution (batched) → pick EACH
// learner's template (their institution's active template; the picker value
// is only the fallback for learners whose institution has none) → render
// every front (+ back) through the SAME render endpoint the card printer uses
// → lay the cards on A4 sheets → Print / Download PDF only once every card is
// ready.
//
// Order: the sheets read STUDENT-WISE — Student 1 front, Student 1 back,
// Student 2 front, Student 2 back … — and the PDF and the print document are
// built from the same SheetPage[] as the preview, so all three agree.
// (A duplex mode — fronts sheet then mirrored backs sheet — stays available
// for double-sided PVC stock.)
//
// Data issues: the front render also returns a per-field report; any field
// the card would print blank, any permanent address the Address Check rules
// flag, and any template pinned to a DIFFERENT institution is painted RED —
// on the card (red frame + caption naming the fields), in the summary at the
// top, and in the issue list that names the learner, the field and the fix.
// The red marks are part of the print document and the PDF too: the preview
// is the single source of truth.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  RefreshCw,
  Send
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { resolveProfileIdsForLearners } from '@/lib/services/id-cards/print-jobs-client';
import {
  renderLearnerCards,
  resolveLearnerInstitutions,
  type PreviewLearnerInput,
  type RenderedCard,
  type RenderFailure
} from '@/lib/services/id-cards/card-preview-client';
import {
  buildPrintDocument,
  buildSheetPages,
  captionStyle,
  cellStyle,
  imageStyle,
  isFlagged,
  SHEET_CSS,
  SHEET_H_MM,
  SHEET_W_MM,
  sheetStyle,
  slotCaption,
  type DuplexFlip,
  type LayoutMode,
  type SheetPage
} from '@/lib/id-cards/sheet-layout';
import type { BulkPrintLearner } from './bulk-print-dialog';
import { emptyTemplateMessage, PurposeSelect, TemplateSelect, useIdCardTemplates } from './print-card-button';
import { pickTemplateForInstitution } from '@/lib/services/id-cards/institution-template';

// CSS mm → px at 96 dpi, the unit browsers lay `mm` out in on screen.
const MM_TO_PX = 96 / 25.4;

type Phase = 'idle' | 'resolving' | 'rendering' | 'ready' | 'error';

interface IdCardPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learners: BulkPrintLearner[];
  /** "Preview ID Card" (single) vs "Bulk ID Card Print" (many). */
  title?: string;
  /**
   * When given, a "Queue to card printer" action appears once the preview is
   * ready, handing back the learners in print order. The batch-print page uses
   * it so the Evolis queue can only be reached THROUGH the preview.
   */
  onSendToPrinter?: (learners: BulkPrintLearner[]) => void;
}

/** One line of the issue list: which learner, which field, what is wrong. */
export interface CardIssue {
  learnerId: string;
  name: string;
  rollNumber: string | null;
  ordinal: number;
  field: string;
  side: 'front' | 'back';
  kind: 'missing' | 'wrong' | 'template';
  detail: string;
  fix: string | null;
}

/** Flatten every flagged card into learner+field rows (exported for tests). */
export function collectCardIssues(cards: readonly RenderedCard[]): CardIssue[] {
  const out: CardIssue[] = [];
  cards.forEach((c, i) => {
    const base = { learnerId: c.learnerId, name: c.name, rollNumber: c.rollNumber, ordinal: i + 1 };
    if (c.institutionMismatch) {
      out.push({
        ...base,
        field: 'Institution template',
        side: 'front',
        kind: 'template',
        detail: `“${c.templateName ?? c.templateId}” belongs to a different institution than ${c.institutionName ?? 'this learner’s'} — its header, contacts and signature will be wrong`,
        fix: 'Activate a template for the learner’s own institution, or pick it as the fallback.'
      });
    }
    for (const m of c.missing) {
      out.push({ ...base, field: m.label, side: m.side, kind: 'missing', detail: 'blank on the card', fix: null });
    }
    for (const p of c.problems) {
      out.push({
        ...base,
        field: p.label,
        side: p.side,
        kind: 'wrong',
        detail: p.problem ?? 'flagged by the address check',
        fix: p.problem_fix ?? null
      });
    }
  });
  return out;
}

/** Parse an inline `a:b;c:d;` style string into a React style object. */
function inlineStyle(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val;
  }
  return out;
}

export function IdCardPreviewDialog({
  open,
  onOpenChange,
  learners,
  title,
  onSendToPrinter
}: IdCardPreviewDialogProps) {
  const { templates, selectedTemplateId, selectTemplate, inactiveOnly } =
    useIdCardTemplates(open);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [cards, setCards] = useState<RenderedCard[]>([]);
  const [failed, setFailed] = useState<RenderFailure[]>([]);
  const [skippedNoAccount, setSkippedNoAccount] = useState<string[]>([]);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('pairs');
  const [flip, setFlip] = useState<DuplexFlip>('long');
  // Purpose for this batch ('' = each institution's default learner template).
  const [purposeKey, setPurposeKey] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  // Guards a stale run from writing results after the template changed or the
  // dialog closed.
  const runIdRef = useRef(0);

  const isBulk = learners.length > 1;
  const dialogTitle = title ?? (isBulk ? 'Bulk ID Card Print' : 'Preview ID Card');

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setPhase('idle');
    setProgress({ done: 0, total: 0 });
    setCards([]);
    setFailed([]);
    setSkippedNoAccount([]);
    setFallbackCount(0);
    setErrorMessage(null);
    setPdfProgress(null);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const generate = useCallback(async () => {
    if (!templates || learners.length === 0) return;
    const runId = ++runIdRef.current;
    setPhase('resolving');
    setErrorMessage(null);
    setCards([]);
    setFailed([]);
    setSkippedNoAccount([]);
    setFallbackCount(0);

    let profileMap: Map<string, string>;
    let institutionMap: Map<string, { institutionId: string; institutionName: string | null }>;
    try {
      const ids = learners.map((l) => l.learnerId);
      [profileMap, institutionMap] = await Promise.all([
        resolveProfileIdsForLearners(ids),
        resolveLearnerInstitutions(ids)
      ]);
    } catch (err) {
      console.error('[id-cards] preview lookup failed:', err);
      if (runId !== runIdRef.current) return;
      setPhase('error');
      setErrorMessage('Failed to look up learner accounts. Please try again.');
      return;
    }
    if (runId !== runIdRef.current) return;

    // Each learner renders with THEIR institution's active LEARNER template for
    // the chosen purpose (or the institution's default). The picker's value is
    // only the fallback when that institution has none.
    const inputs: PreviewLearnerInput[] = [];
    const skipped: string[] = [];
    const noTemplate: string[] = [];
    let fellBack = 0;
    for (const l of learners) {
      const profileId = profileMap.get(l.learnerId);
      if (!profileId) {
        skipped.push(l.name);
        continue;
      }
      const inst = institutionMap.get(l.learnerId);
      const choice = pickTemplateForInstitution(templates, inst?.institutionId ?? null, selectedTemplateId, {
        audience: 'learner',
        purposeKey
      });
      if (!choice) {
        noTemplate.push(l.name);
        continue;
      }
      const template = choice.template;
      if (choice.usedFallback) fellBack += 1;
      inputs.push({
        learnerId: l.learnerId,
        profileId,
        templateId: template.id,
        templateName: template.name,
        name: l.name,
        rollNumber: l.rollNumber ?? null
      });
    }
    setSkippedNoAccount(skipped);
    setFallbackCount(fellBack);

    if (inputs.length === 0) {
      setPhase('error');
      setErrorMessage(
        noTemplate.length > 0
          ? 'No active ID-card template exists for these learners’ institution, and no fallback template is selected.'
          : isBulk
            ? 'None of the selected learners has an account yet, so no card can be rendered.'
            : 'No account yet — ID card becomes available once the learner account is activated.'
      );
      return;
    }

    setPhase('rendering');
    setProgress({ done: 0, total: inputs.length });
    const result = await renderLearnerCards(inputs, (done, total) => {
      if (runId === runIdRef.current) setProgress({ done, total });
    });
    if (runId !== runIdRef.current) return;

    setCards(result.cards);
    setFailed([
      ...result.failed,
      ...noTemplate.map((name) => ({
        learnerId: '',
        name,
        message: 'no active template for this institution'
      }))
    ]);
    if (result.cards.length === 0) {
      setPhase('error');
      setErrorMessage(result.failed[0]?.message ?? 'No card could be rendered.');
      return;
    }
    setPhase('ready');
  }, [templates, selectedTemplateId, purposeKey, learners, isBulk]);

  // Auto-generate once templates are known; regenerate on fallback change.
  useEffect(() => {
    if (!open || templates === null) return;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templates, selectedTemplateId, purposeKey]);

  const pages = useMemo<SheetPage[]>(
    () => buildSheetPages(cards, { mode: layoutMode, flip }),
    [cards, layoutMode, flip]
  );
  const hasBacks = useMemo(() => cards.some((c) => c.backDataUrl !== null), [cards]);
  const sideCount = useMemo(
    () => cards.reduce((n, c) => n + 1 + (c.backDataUrl ? 1 : 0), 0),
    [cards]
  );
  const issues = useMemo(() => collectCardIssues(cards), [cards]);
  const flaggedCount = useMemo(() => cards.filter(isFlagged).length, [cards]);
  const ready = phase === 'ready' && cards.length > 0;
  const busy = printing || pdfProgress !== null;

  const documentTitle = isBulk ? `ID Cards (${cards.length})` : `ID Card - ${cards[0]?.name ?? ''}`;

  const handlePrint = () => {
    if (!ready || busy) return;
    setPrinting(true);
    const html = buildPrintDocument(pages, documentTitle);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const cleanup = () => {
      setPrinting(false);
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 500);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        toast.error('Could not open the print view.');
        cleanup();
        return;
      }
      const imgs = Array.from(win.document.images);
      Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      ).then(() => {
        win.onafterprint = cleanup;
        win.focus();
        win.print();
        window.setTimeout(cleanup, 60_000);
      });
    };
    iframe.srcdoc = html;
  };

  const handleDownloadPdf = async () => {
    if (!ready || busy) return;
    setPdfProgress({ done: 0, total: sideCount });
    try {
      // Loaded on demand — jsPDF is ~300 KB and only this action needs it.
      const { buildSheetPdf, pdfFileName } = await import('@/lib/id-cards/sheet-pdf');
      const doc = await buildSheetPdf(pages, {
        title: documentTitle,
        onProgress: (done, total) => setPdfProgress({ done, total })
      });
      doc.save(pdfFileName(cards.length));
      toast.success(`PDF ready — ${pages.length} A4 ${pages.length === 1 ? 'sheet' : 'sheets'}.`);
    } catch (err) {
      console.error('[id-cards] PDF build failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not build the PDF.');
    } finally {
      setPdfProgress(null);
    }
  };

  const handleSendToPrinter = () => {
    if (!ready || !onSendToPrinter) return;
    onSendToPrinter(
      cards.map((c) => ({ learnerId: c.learnerId, name: c.name, rollNumber: c.rollNumber }))
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) runIdRef.current += 1; // abandon any in-flight run
    onOpenChange(next);
  };

  const emptyMessage = emptyTemplateMessage(templates, inactiveOnly);
  const sheetsWord = pages.length === 1 ? 'sheet' : 'sheets';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isBulk
              ? `${learners.length} learner${learners.length > 1 ? 's' : ''} in print order. Each card uses its own institution’s template. Review every card here first — the PDF and the printed sheets are exactly what you see below.`
              : 'The card uses the learner’s institution template. The PDF and the printed sheet are exactly what you see below.'}
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Purpose</p>
            <PurposeSelect
              templates={templates}
              audience="learner"
              value={purposeKey}
              onChange={setPurposeKey}
              className="h-9 w-[200px]"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Fallback template</p>
            <TemplateSelect
              templates={templates}
              value={selectedTemplateId}
              onChange={selectTemplate}
              className="h-9 w-[220px]"
            />
          </div>
          {hasBacks && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Sheet layout</p>
              <Select value={layoutMode} onValueChange={(v) => setLayoutMode(v as LayoutMode)}>
                <SelectTrigger className="h-9 w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pairs">Student-wise (front + back side by side)</SelectItem>
                  <SelectItem value="duplex">Duplex (fronts sheet, then backs sheet)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {hasBacks && layoutMode === 'duplex' && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Duplex flip</p>
              <Select value={flip} onValueChange={(v) => setFlip(v as DuplexFlip)}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long edge (portrait A4 default)</SelectItem>
                  <SelectItem value="short">Short edge (backs turned 180°)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void generate()}
            disabled={templates === null || phase === 'resolving' || phase === 'rendering' || busy}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
        </div>
        {emptyMessage && <p className="text-sm text-destructive">{emptyMessage}</p>}

        {/* Progress */}
        {(phase === 'resolving' || phase === 'rendering') && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === 'resolving'
                  ? 'Looking up learner accounts and institutions…'
                  : `Rendering card ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
              </span>
              {phase === 'rendering' && (
                <span>
                  {progress.done} / {progress.total}
                </span>
              )}
            </div>
            <Progress
              value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
              className="h-2"
            />
          </div>
        )}

        {pdfProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building PDF…
              </span>
              <span>
                {pdfProgress.done} / {pdfProgress.total}
              </span>
            </div>
            <Progress
              value={pdfProgress.total > 0 ? (pdfProgress.done / pdfProgress.total) * 100 : 0}
              className="h-2"
            />
          </div>
        )}

        {phase === 'error' && errorMessage && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Validation summary */}
        {ready && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-semibold">
              <span>
                {cards.length} {cards.length === 1 ? 'Student' : 'Students'}
              </span>
              <span className="text-muted-foreground">|</span>
              <span>{sideCount} ID Card Sides</span>
              <span className="text-muted-foreground">|</span>
              <span className={issues.length > 0 ? 'text-red-600' : 'text-[#0b6d41]'}>
                {issues.length} Data {issues.length === 1 ? 'Issue' : 'Issues'}
              </span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {pages.length} A4 {sheetsWord}
                {hasBacks
                  ? layoutMode === 'pairs'
                    ? ' · student-wise, front + back together'
                    : ' · duplex, fronts then mirrored backs'
                  : ' · front only (template has no back side)'}
              </span>
            </div>

            {issues.length > 0 ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Data Issues Found – Please Review Before Printing
                </p>
                <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-400/80">
                  {flaggedCount} of {cards.length} card{cards.length === 1 ? '' : 's'} flagged. Each is framed red
                  below with the field named under it. Fix the record, then Regenerate.
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-red-700 dark:text-red-400">
                  {issues.map((issue, i) => (
                    <li key={`${issue.learnerId}-${issue.field}-${i}`} className="flex items-start gap-2">
                      <span className="shrink-0 tabular-nums text-red-700/70 dark:text-red-400/70">
                        #{issue.ordinal}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{issue.name}</span>
                        {issue.rollNumber ? ` (${issue.rollNumber})` : ''} — <span className="font-medium">{issue.field}</span>
                        {' '}
                        <span className="text-red-700/80 dark:text-red-400/80">
                          [{issue.side}]{' '}
                          {issue.kind === 'missing' ? 'is missing' : issue.kind === 'wrong' ? `— ${issue.detail}` : `— ${issue.detail}`}
                        </span>
                        {issue.fix && (
                          <span className="block text-xs text-red-700/70 dark:text-red-400/70">{issue.fix}</span>
                        )}
                      </span>
                      {issue.learnerId && (
                        <Link
                          href={`/learners/profiles/${issue.learnerId}/edit`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 text-xs underline-offset-2 hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-[#0b6d41]">
                <CheckCircle2 className="h-4 w-4" />
                All required data present on every card.
              </p>
            )}

            {(skippedNoAccount.length > 0 || failed.length > 0 || fallbackCount > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                {fallbackCount > 0 && (
                  <p>
                    <span className="font-medium">{fallbackCount}</span> learner
                    {fallbackCount > 1 ? 's have' : ' has'} no active template for their own institution and used the
                    fallback template.
                  </p>
                )}
                {skippedNoAccount.length > 0 && (
                  <p>
                    <span className="font-medium">Skipped — no account yet ({skippedNoAccount.length}):</span>{' '}
                    {skippedNoAccount.join(', ')}
                  </p>
                )}
                {failed.length > 0 && (
                  <p>
                    <span className="font-medium">Could not render ({failed.length}):</span>{' '}
                    {failed.map((f) => `${f.name} — ${f.message}`).join('; ')}
                  </p>
                )}
              </div>
            )}

            {isBulk && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Print order ({cards.length})</summary>
                <ol className="mt-1 max-h-32 columns-2 gap-4 overflow-y-auto sm:columns-3">
                  {cards.map((c, i) => (
                    <li key={c.learnerId} className={isFlagged(c) ? 'text-red-600' : undefined}>
                      {i + 1}. {c.name}
                      {c.rollNumber ? ` · ${c.rollNumber}` : ''}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        )}

        {/* Sheet preview */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/40 p-3">
          {ready ? (
            <SheetPreview pages={pages} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {phase === 'error' ? 'Nothing to preview.' : 'Generating preview…'}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Close
            </Button>
            {onSendToPrinter && (
              <Button variant="outline" onClick={handleSendToPrinter} disabled={!ready || busy}>
                <Send className="mr-2 h-4 w-4" />
                Queue to card printer ({cards.length})
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleDownloadPdf()} disabled={!ready || busy}>
              {pdfProgress ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
            <Button onClick={handlePrint} disabled={!ready || busy}>
              {printing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {isBulk ? `Print All ID Cards (${cards.length})` : 'Print ID Card'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SheetPreview — the A4 sheets at true mm size, scaled to the dialog width.
// Uses the SAME SHEET_CSS + inline geometry + red annotations as the print
// document and the PDF; the tooltip is the only screen-only addition.
// ──────────────────────────────────────────────────────────────────────────────

function pageLabel(page: SheetPage): string {
  if (page.side === 'pairs') return 'Student-wise · front | back per row';
  if (page.side === 'front') return 'Front sides';
  return 'Back sides (mirrored for duplex)';
}

function SheetPreview({ pages }: { pages: SheetPage[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.min(1, width / (SHEET_W_MM * MM_TO_PX)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sheetHeightPx = SHEET_H_MM * MM_TO_PX * scale;

  return (
    <div ref={containerRef} className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      {pages.map((page) => (
        <div key={page.number} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Sheet {page.number} · {pageLabel(page)}
          </p>
          <div style={{ height: sheetHeightPx, overflow: 'hidden' }}>
            <div
              className="idc-sheet shadow-sm ring-1 ring-border"
              style={{
                ...inlineStyle(sheetStyle(page.geometry)),
                transform: `scale(${scale})`,
                transformOrigin: 'top left'
              }}
            >
              {page.slots.map((slot, i) => {
                const cell = inlineStyle(cellStyle(page.geometry));
                if (!slot) return <div key={i} className="idc-cell" style={cell} />;
                const src = slot.side === 'front' ? slot.card.frontDataUrl : slot.card.backDataUrl;
                const flagged = isFlagged(slot.card);
                const caption = slotCaption(slot);
                const tip = [`#${slot.ordinal} ${slot.card.name} — ${slot.side}`, caption]
                  .filter(Boolean)
                  .join(' — ');
                return (
                  <div key={i} className="idc-cell" style={cell}>
                    <div className={`idc-card${flagged ? ' idc-flagged' : ''}`} title={tip}>
                      {src ? (
                        <img
                          src={src}
                          alt={`${slot.card.name} ${slot.side}`}
                          style={inlineStyle(imageStyle(slot.rotation))}
                        />
                      ) : null}
                    </div>
                    {caption && (
                      <div style={inlineStyle(captionStyle(page.geometry))} title={caption}>
                        {caption}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
