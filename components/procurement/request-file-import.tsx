'use client';

// Upload a shared item list (Excel, CSV, PDF, photo, Word, text) on the New
// Request page. The server reads it with AI into clean lines; each line is then
// looked up in the catalog so a matching item is picked automatically. The
// requester checks everything before the lines are added — nothing is saved here.

import { useRef, useState } from 'react';
import { getAdapter } from '@/lib/services/procurement/domain-adapters/registry';
import type { CatalogItem, DomainCtx, ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';
import type { ReadRequestLine } from '@/lib/procurement/request-items-reader';
import { nameMatchScore } from '@/lib/procurement/item-name-match';
import type { CreatePurchaseRequestItemDto } from '@/types/procurement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileUp, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export type ImportedRow = CreatePurchaseRequestItemDto & { is_new: boolean };

const ACCEPT = '.xlsx,.xls,.csv,.ods,.pdf,.docx,.txt,.jpg,.jpeg,.png,.webp';
const NEW = '__new__';
/** Catalog match at or above this is picked automatically; below it the line starts as a new item. */
const AUTO_MATCH = 0.5;

interface Line extends ReadRequestLine {
  include: boolean;
  candidates: CatalogItem[];
  /** Picked catalog item id, or NEW. */
  choice: string;
}

async function findCandidates(domain: ProcurementDomain, ctx: DomainCtx, line: ReadRequestLine) {
  const adapter = getAdapter(domain);
  const full = `${line.item_name} ${line.spec ?? ''}`;
  // Search the whole name, then its first word, so "Nitrile gloves medium" still
  // finds a catalog item called "Gloves (Nitrile)".
  const firstWord = line.item_name.split(/\s+/).find((w) => w.length >= 3) ?? '';
  const results = await Promise.all(
    [line.item_name, firstWord !== line.item_name ? firstWord : ''].filter(Boolean).map((q) =>
      adapter.searchItems(q, ctx).catch(() => [] as CatalogItem[])
    )
  );
  const seen = new Set<string>();
  return results
    .flat()
    .filter((c) => (seen.has(c.domainItemId) ? false : (seen.add(c.domainItemId), true)))
    .map((c) => ({ c, score: nameMatchScore(c.name, full) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function RequestFileImport({
  domain,
  ctx,
  onAdd,
}: {
  domain: ProcurementDomain;
  ctx: DomainCtx;
  onAdd: (rows: ImportedRow[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const read = async (file: File) => {
    setOpen(true);
    setFileName(file.name);
    setReading(true);
    setError(null);
    setNote(null);
    setLines([]);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/procurement/requests/read-items', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as {
        lines?: ReadRequestLine[];
        note?: string | null;
        error?: string;
      };
      if (data.error || !res.ok) throw new Error(data.error || 'The file could not be read.');
      const found = data.lines ?? [];
      if (found.length === 0) throw new Error('No items were found in this file.');

      const matched = await Promise.all(
        found.map(async (l): Promise<Line> => {
          const scored = await findCandidates(domain, ctx, l);
          const best = scored[0];
          return {
            ...l,
            include: true,
            candidates: scored.map((s) => s.c),
            choice: best && best.score >= AUTO_MATCH ? best.c.domainItemId : NEW,
          };
        })
      );
      setLines(matched);
      setNote(data.note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    } finally {
      setReading(false);
    }
  };

  const update = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const chosen = lines.filter((l) => l.include);
  const inCatalog = chosen.filter((l) => l.choice !== NEW).length;

  const add = () => {
    const rows: ImportedRow[] = chosen.map((l) => {
      const c = l.choice === NEW ? null : l.candidates.find((x) => x.domainItemId === l.choice) ?? null;
      return c
        ? {
            is_new: false,
            domain_item_id: c.domainItemId,
            item_name: c.name,
            item_spec: l.spec ?? c.spec ?? '',
            required_quantity: l.quantity,
            unit_id: c.unitId ?? null,
            unit_label: c.unitLabel ?? l.unit ?? '',
            reason: l.reason ?? '',
            current_stock: c.currentStock ?? null,
            reorder_level: c.reorderLevel ?? null,
            estimated_cost: c.costPrice ?? undefined,
          }
        : {
            is_new: true,
            domain_item_id: null,
            item_name: l.item_name,
            item_spec: l.spec ?? '',
            required_quantity: l.quantity,
            unit_id: null,
            unit_label: l.unit ?? '',
            reason: l.reason ?? '',
            current_stock: null,
            reorder_level: null,
            estimated_cost: undefined,
          };
    });
    onAdd(rows);
    setOpen(false);
    const newCount = rows.filter((r) => r.is_new).length;
    toast.success(
      `${rows.length} item${rows.length === 1 ? '' : 's'} added` +
        (newCount ? ` — give a reason for the ${newCount} new item${newCount === 1 ? '' : 's'}` : '')
    );
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void read(f);
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 text-primary"
        disabled={!ctx.institutionId}
        title="Excel, CSV, PDF, Word, or a photo of a list — AI reads the items"
        onClick={() => inputRef.current?.click()}
      >
        <FileUp className="mr-1 h-4 w-4" />
        Upload a list
      </Button>

      <Dialog open={open} onOpenChange={(o) => !reading && setOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Items read from <span className="truncate font-normal text-muted-foreground">{fileName}</span>
            </DialogTitle>
          </DialogHeader>

          {reading ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Reading the file and finding each item in the catalog…
            </div>
          ) : error ? (
            <div className="space-y-3 py-6 text-center text-sm">
              <p className="text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                Try another file
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Check each line. Items found in the catalog are picked for you; change the pick if it is wrong, or
                untick anything you don&apos;t want.
              </p>
              <div className="max-h-[55vh] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2 font-medium">In your file</th>
                      <th className="px-2 py-2 font-medium">Add as</th>
                      <th className="w-20 px-2 py-2 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((l, i) => (
                      <tr key={i} className={l.include ? '' : 'opacity-50'}>
                        <td className="px-2 py-1.5 align-top">
                          <Checkbox
                            className="mt-1"
                            checked={l.include}
                            aria-label={`Include ${l.item_name}`}
                            onCheckedChange={(c) => update(i, { include: !!c })}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span className="font-medium">{l.item_name}</span>
                          {(l.spec || l.unit) && (
                            <span className="block text-xs text-muted-foreground">
                              {[l.spec, l.unit].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Select value={l.choice} onValueChange={(v) => update(i, { choice: v })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NEW}>New item (not in catalog)</SelectItem>
                              {l.candidates.map((c) => (
                                <SelectItem key={c.domainItemId} value={c.domainItemId}>
                                  {c.name}
                                  {c.code ? ` · ${c.code}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input
                            type="number"
                            min={1}
                            className="h-8 text-sm"
                            aria-label={`Quantity of ${l.item_name}`}
                            value={l.quantity}
                            onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {note && <p className="text-xs text-amber-700 dark:text-amber-400">{note}</p>}
            </div>
          )}

          {!reading && !error && (
            <DialogFooter className="gap-2 sm:items-center sm:justify-between sm:gap-0">
              <span className="text-xs text-muted-foreground">
                {chosen.length} of {lines.length} selected · {inCatalog} from catalog · {chosen.length - inCatalog} new
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={chosen.length === 0} onClick={add}>
                  Add {chosen.length} item{chosen.length === 1 ? '' : 's'}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
