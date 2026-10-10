'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, X, Loader2, Plus, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useVendorsForSelect } from '@/hooks/procurement/use-rfqs';
import { useCreateQuotation, useCreateVendor } from '@/hooks/procurement/use-quotations';
import { ProcurementQuotationService } from '@/lib/services/procurement/quotation-service';
import { readQuotationPdf, type ExtractResult } from '@/lib/procurement/read-quotation-pdf';
import { checkQuotationMath } from '@/lib/procurement/quotation-math';
import { matchVendor, normalizeGstin } from '@/lib/procurement/vendor-match';
import { namesAgree } from '@/lib/procurement/item-name-match';
import { comparePacks, isMeasuredUnit, parsePack, perPieceFactor, qtyWithPack, requestedPack, type PackCheck } from '@/lib/procurement/pack-size';
import { specConflict } from '@/lib/procurement/spec-check';
import { bestNameGuess, codeKey, itemKeyOf, quotedKey, recall, recallKey, type ItemAlias } from '@/lib/procurement/item-aliases';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { RfqWithDetails } from '@/types/procurement';

/**
 * Upload several vendor quotation PDFs at once. The AI reads each one; the person
 * then checks one vendor at a time.
 *
 * The review is built around what was ASKED FOR, not around the PDF: for every
 * requested item the question is "what did this vendor quote for it?", answered by
 * picking the line(s) the AI read from the PDF (pre-picked where the AI matched
 * them), typing a price, or "not in this quote". A set asked for as one item
 * ("Computer × 5") is often quoted as its parts — CPU, RAM, monitor… — so one item
 * may take several lines, and its unit price is their sum. When a vendor offers two
 * brands for one item, the cheaper one is taken and the other kept as an option.
 * Lines the vendor quoted that nobody asked for are listed at the end. Nothing is
 * saved until Save.
 *
 * Memory: every "Yes, that is the item" / "No" is kept per vendor name
 * (procurement_item_aliases), so the vendor's own name for an item is asked once.
 */

type RowStatus = 'reading' | 'ready' | 'failed' | 'saving' | 'saved';

/** One priced line the AI read from the PDF. */
interface ReadLine {
  idx: number;
  name: string;
  price: number;
  /** The pack this price is for, as the vendor printed it ("100 ml"). '' = not printed. */
  pack: string;
  manufacturer: string;
  quality_grade: string;
  concentration: string;
  other_specs: string;
  /** GST rate / HSN printed on this line — carried to the PO so nobody types them. */
  gst_percent: number | null;
  hsn: string;
  /** Quantity printed on the vendor's line; null = not printed. */
  qty: number | null;
  role: 'item' | 'part' | 'option';
  /** Two readings agreed this line is its item. */
  checked: boolean;
  /** Why the AI paired it ("NaOH is sodium hydroxide") — shown with the question. */
  reason: string;
  /** The vendor's catalogue / part code, '' = not printed. */
  code: string;
}

/** How a line came to answer an item — saved with the price. */
type MatchSource = 'ai' | 'memory' | 'person';

/**
 * The answer for one requested item. undefined = not answered yet.
 * `idxs` holds one line for a plain item, or every part of a set (never empty).
 */
type Choice =
  | {
      kind: 'line';
      idxs: number[];
      confirmed: boolean;
      source: MatchSource;
      /** Other options the vendor offered for this item (dearer than the one taken). */
      alts?: number[];
    }
  | { kind: 'custom'; price: string }
  | { kind: 'none' };

interface Row {
  key: string;
  file: File;
  status: RowStatus;
  error?: string;
  vendorId: string; // existing vendor id, or '' when creating a new vendor
  newVendor: { name: string; gstin: string; phone: string; email: string; address: string; contact: string };
  vendorNote?: string;
  quoteNumber: string;
  quoteDate: string;
  validityDate: string;
  deliveryDays: string;
  paymentTerms: string;
  warranty: string;
  lines: ReadLine[];
  choices: Record<string, Choice | undefined>;
  /** Where the reading disagrees with the quotation's own printed numbers. */
  readIssues: string[];
  /** Vendor lines a person said are NOT a given item — remembered on save. */
  rejected: Array<{ itemId: string; idx: number }>;
}

type RfqItem = RfqWithDetails['items'][number];

/** How a quoted line's pack relates to what was asked for. */
const packCheckOf = (it: RfqItem, l: ReadLine | undefined): PackCheck =>
  comparePacks(requestedPack(it), l ? parsePack(l.pack) : null, {
    soldByMeasure: !!it.is_chemical || isMeasuredUnit(it.unit_label),
  });

/**
 * The vendor printed a different quantity from what was asked — "10" against 25.
 * A smaller pack bought in proportion (5 × 100 ml for 1 × 500 ml) is the same amount.
 */
const qtyDiffers = (it: RfqItem, l: ReadLine | undefined): boolean => {
  if (!l || l.qty == null || !(Number(it.quantity) > 0)) return false;
  const asked = Number(it.quantity);
  if (Math.abs(l.qty - asked) < 1e-9) return false;
  const want = requestedPack(it);
  const got = parsePack(l.pack);
  if (want && got && want.dim === got.dim) return Math.abs(l.qty * got.base - asked * want.base) > 1e-6;
  // 5 boxes of 100 for 500 Nos is the quantity asked.
  const n = piecesPerPack(it, l);
  if (n) return Math.abs(l.qty * n - asked) > 1e-9;
  return true;
};

/**
 * Pieces in the vendor's pack when the item is counted singly ("500 Nos") and the
 * vendor priced a pack ("Box of 100"). null when the price is already per piece —
 * the vendor's own qty is then the pieces asked for.
 */
const piecesPerPack = (it: RfqItem, l: ReadLine | undefined): number | null => {
  if (!l) return null;
  const f = perPieceFactor(it, `${l.pack} ${l.name} ${l.other_specs}`);
  if (!f) return null;
  if (l.qty != null && Math.abs(l.qty - Number(it.quantity)) < 1e-9) return null;
  return Math.round(1 / f);
};

/** The vendor's price on the footing of what was asked: per requested pack, or per piece. */
const askedPrice = (it: RfqItem, l: ReadLine): number => {
  const chk = packCheckOf(it, l);
  if (chk.kind === 'scaled') return round2(l.price * chk.factor);
  const n = piecesPerPack(it, l);
  return n ? round2(l.price / n) : l.price;
};

/** A grade / strength the vendor offers that is not the one specified (chemicals only). */
const specOf = (it: RfqItem, l: ReadLine | undefined): string | null =>
  l && (it.is_chemical || isMeasuredUnit(it.unit_label))
    ? specConflict(`${it.item_name} ${it.item_spec ?? ''}`, [l.name, l.quality_grade, l.concentration, l.other_specs].join(' '))
    : null;

/** "1 × 500 ml" when the pack is known, else "20 Nos". */
const askedLabel = (it: RfqItem) => {
  const p = requestedPack(it);
  const q = Number(it.quantity);
  return p ? `${q} × ${p.label}` : qtyWithPack(q, it);
};

/** The one value every entry shares, else null. */
const sameOf = <T,>(xs: (T | null)[]): T | null =>
  xs.length && xs[0] != null && xs.every((x) => x === xs[0]) ? xs[0] : null;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Each read is one short API call; six side by side keeps a stack of quotes quick.
const READ_CONCURRENCY = 6;
/** What the reader takes: PDFs, phone photos of a printed quote, Excel/CSV sheets. */
export const QUOTE_FILE_ACCEPT = 'application/pdf,.pdf,image/jpeg,image/png,image/webp,.xlsx,.xls,.csv';
const isQuoteFile = (f: File) =>
  /\.(pdf|jpe?g|png|webp|xlsx|xls|csv)$/i.test(f.name) || /^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type);
const NEW_VENDOR = '__new__';
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const emptyVendor = () => ({ name: '', gstin: '', phone: '', email: '', address: '', contact: '' });
const linesOf = (r: Row, c: Choice | undefined): ReadLine[] =>
  c?.kind === 'line' ? r.lines.filter((l) => c.idxs.includes(l.idx)) : [];
/** Lines already given to some requested item (as its price or as one of its options). */
const usedIdxs = (choices: Row['choices']) =>
  new Set(Object.values(choices).flatMap((c) => (c?.kind === 'line' ? [...c.idxs, ...(c.alts ?? [])] : [])));

export function BulkQuotationUpload({
  rfq,
  quotedSupplierIds,
  open,
  onOpenChange,
  files,
  onFilesTaken,
}: {
  rfq: RfqWithDetails;
  quotedSupplierIds: Set<string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** PDFs the page already picked (its button opens the file picker directly). */
  files?: File[] | null;
  onFilesTaken?: () => void;
}) {
  const { profile } = useAuth();
  const { data: allVendors = [] } = useVendorsForSelect(rfq.institution_id);
  const createQuotation = useCreateQuotation();
  const createVendor = useCreateVendor();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The last step before saving: every item with the qty and pack it is saved for. */
  const [reviewing, setReviewing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Reads finish asynchronously; the ref lets them match against the current list.
  const vendorsRef = useRef(allVendors);
  useEffect(() => {
    vendorsRef.current = allVendors;
  }, [allVendors]);
  // What staff said before about vendor names for these items.
  const itemKeys = useMemo(() => [...new Set(rfq.items.map(itemKeyOf))], [rfq.items]);
  const { data: aliases = [] } = useQuery({
    queryKey: ['procurement-item-aliases', rfq.institution_id, itemKeys],
    queryFn: () => ProcurementQuotationService.getItemAliases(rfq.institution_id, itemKeys),
    enabled: open && itemKeys.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const aliasesRef = useRef<ItemAlias[]>(aliases);
  useEffect(() => {
    aliasesRef.current = aliases;
  }, [aliases]);

  const patch = (key: string, p: Partial<Row> | ((r: Row) => Partial<Row>)) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)));

  const setChoice = (key: string, itemId: string, choice: Choice) =>
    patch(key, (r) => ({ choices: { ...r.choices, [itemId]: choice } }));

  const applyResult = (key: string, result: ExtractResult) => {
    const lines: ReadLine[] = [];
    for (const [idx, line] of (result.lines ?? []).entries()) {
      const price = typeof line.unit_price === 'number' ? line.unit_price : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;
      lines.push({
        idx,
        name: line.item_name || 'Unnamed line',
        price,
        // Older reads (and the office runner) have no `pack`; the size is then
        // usually in the specs or in the line's own name ("Molisch Reagent 100ml").
        pack: line.pack || parsePack(line.other_specs)?.label || parsePack(line.item_name)?.label || '',
        manufacturer: line.manufacturer ?? '',
        quality_grade: line.quality_grade ?? '',
        concentration: line.concentration ?? '',
        other_specs: line.other_specs ?? '',
        gst_percent: typeof line.gst_percent === 'number' ? line.gst_percent : null,
        hsn: line.hsn ?? '',
        qty: typeof line.quantity === 'number' && line.quantity > 0 ? line.quantity : null,
        role: line.role ?? 'item',
        checked: !!line.checked,
        reason: line.reason ?? '',
        code: line.catalog_code ?? '',
      });
    }
    const byIdx = new Map(lines.map((l) => [l.idx, l]));

    // The vendor first: the memory is kept per vendor.
    let vendorId = '';
    let vendorNote: string | undefined;
    const newVendor = emptyVendor();
    const v = result.vendor;
    if (v) {
      const match = matchVendor(v, vendorsRef.current);
      if (match) {
        vendorId = match.vendor.id;
        vendorNote = `found by ${match.by === 'gstin' ? 'GSTIN' : match.by}`;
      } else if (v.name) {
        newVendor.name = v.name;
        newVendor.gstin = normalizeGstin(v.gstin) ?? v.gstin ?? '';
        newVendor.phone = v.phone ?? '';
        newVendor.email = v.email ?? '';
        newVendor.address = v.address ?? '';
        newVendor.contact = v.contact_person ?? '';
        vendorNote = 'new vendor — will be added';
      }
    }
    const memory = aliasesRef.current;
    const said = (it: RfqItem, l: ReadLine) => {
      const byName = recall(memory, vendorId || null, l.name, itemKeyOf(it));
      return byName ?? recallKey(memory, vendorId || null, codeKey(l.code), itemKeyOf(it));
    };

    // A line is taken without asking when a person confirmed this name before, when
    // two separate AI readings agree (a vendor's own name, "Whatman No.1"), or when the
    // AI was sure AND the names share a word — in every case only if the pack and the
    // quantity fit. Anything else is asked once: "Is this the item?"
    const settle = (it: RfqItem, l: ReadLine, aiSure: boolean): { confirmed: boolean; source: MatchSource } => {
      const fits = packCheckOf(it, l).kind !== 'mismatch' && !qtyDiffers(it, l) && !specOf(it, l);
      if (said(it, l) === true) return { confirmed: fits, source: 'memory' };
      return { confirmed: fits && (l.checked || (aiSure && namesAgree(it.item_name, l.name))), source: 'ai' };
    };

    // The AI's matches, grouped per requested item — minus any pairing a person already said "no" to.
    const grouped = new Map<string, Array<{ l: ReadLine; sure: boolean }>>();
    for (const [idx, line] of (result.lines ?? []).entries()) {
      const l = byIdx.get(idx);
      const it = line.rfq_item_id ? rfq.items.find((x) => x.id === line.rfq_item_id) : undefined;
      if (!l || !it || said(it, l) === false) continue;
      grouped.set(it.id, [...(grouped.get(it.id) ?? []), { l, sure: !line.uncertain || l.checked }]);
    }

    const choices: Row['choices'] = {};
    for (const [itemId, group] of grouped) {
      const it = rfq.items.find((x) => x.id === itemId)!;
      if (group.length === 1) {
        choices[itemId] = { kind: 'line', idxs: [group[0].l.idx], ...settle(it, group[0].l, group[0].sure) };
        continue;
      }
      if (group.some((g) => g.l.role === 'part') && !group.some((g) => g.l.role === 'option')) {
        // The parts of a set: their sum is the price. A person looks once.
        choices[itemId] = { kind: 'line', idxs: group.map((g) => g.l.idx), confirmed: false, source: 'ai' };
        continue;
      }
      // Two or more offers for one item: the cheapest (on the requested pack) is taken,
      // the rest stay as options a person can switch to.
      const sorted = [...group].sort((a, b) => askedPrice(it, a.l) - askedPrice(it, b.l));
      choices[itemId] = {
        kind: 'line',
        idxs: [sorted[0].l.idx],
        alts: sorted.slice(1).map((g) => g.l.idx),
        ...settle(it, sorted[0].l, sorted[0].sure),
      };
    }

    // Items the AI left unmatched: a name a person confirmed before for this item,
    // else the line whose name fits best — as a guess to confirm, never as a match.
    const usedIdx = usedIdxs(choices);
    for (const it of rfq.items) {
      if (choices[it.id]) continue;
      const free = lines.filter((l) => !usedIdx.has(l.idx) && said(it, l) !== false);
      const known = free.find((l) => said(it, l) === true);
      const hit = known ?? bestNameGuess(it.item_name, free);
      if (hit) {
        choices[it.id] = known
          ? { kind: 'line', idxs: [hit.idx], ...settle(it, hit, true) }
          : { kind: 'line', idxs: [hit.idx], confirmed: false, source: 'ai' };
        usedIdx.add(hit.idx);
      }
    }

    patch(key, {
      status: 'ready',
      lines,
      choices,
      vendorId,
      newVendor,
      vendorNote,
      quoteNumber: result.quote_number ?? '',
      quoteDate: result.quote_date ?? '',
      validityDate: result.validity_date ?? '',
      deliveryDays: result.delivery_days ? String(result.delivery_days) : '',
      paymentTerms: result.payment_terms ?? '',
      warranty: result.warranty ?? '',
      readIssues: [...(result.read_notes ?? []), ...checkQuotationMath(result).issues],
      rejected: [],
    });
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const pdfs = [...files].filter(isQuoteFile);
    if (pdfs.length < files.length) toast.warning('Only PDFs, photos (JPG/PNG) and Excel/CSV files can be read — others were skipped.');
    if (!pdfs.length) return;
    const fresh: Row[] = pdfs.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      status: 'reading',
      vendorId: '',
      newVendor: emptyVendor(),
      quoteNumber: '',
      quoteDate: '',
      validityDate: '',
      deliveryDays: '',
      paymentTerms: '',
      warranty: '',
      lines: [],
      choices: {},
      readIssues: [],
      rejected: [],
    }));
    setRows((prev) => [...prev, ...fresh]);
    setSelectedKey((k) => k ?? fresh[0].key);
    setReviewing(false);

    // Read a few at a time so a stack of PDFs doesn't flood the reader.
    const queue = [...fresh];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          applyResult(next.key, await readQuotationPdf(next.file, rfq));
        } catch (e) {
          patch(next.key, { status: 'failed', error: errorMessage(e, 'AI could not read this PDF') });
        }
      }
    };
    for (let i = 0; i < Math.min(READ_CONCURRENCY, fresh.length); i++) void worker();
  };

  // Files chosen on the page arrive here; read them as if dropped in.
  useEffect(() => {
    if (open && files?.length) {
      addFiles(files);
      onFilesTaken?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, files]);



  const priceOf = (r: Row, itemId: string): number | null => {
    const c = r.choices[itemId];
    if (!c || c.kind === 'none') return null;
    if (c.kind === 'custom') return Number(c.price) > 0 ? Number(c.price) : null;
    // One of each part per set: the set's unit price is the parts' unit prices added up.
    const parts = linesOf(r, c);
    if (parts.length !== 1) return parts.length ? parts.reduce((s, l) => s + l.price, 0) : null;
    // One line: put its price on the requested pack — ₹135 for 100 ml of a 500 ml
    // requirement is ₹675, not ₹135.
    const it = rfq.items.find((x) => x.id === itemId);
    return it ? askedPrice(it, parts[0]) : parts[0].price;
  };

  /**
   * What the saved price stands on, kept with the quote so Compare & award shows it:
   * "Quoted 100 ml @ ₹135 — ×5 for 500 ml". Empty when the packs match or are unknown.
   */
  const packNote = (it: RfqItem, c: Choice | undefined, line: ReadLine | undefined): string => {
    if (c?.kind !== 'line' || !line) return '';
    const chk = packCheckOf(it, line);
    const asked = requestedPack(it)?.label;
    const n = piecesPerPack(it, line);
    const spec = specOf(it, line);
    return [
      chk.kind === 'scaled' ? `Quoted ${line.pack} @ ${rupees(line.price)} — ×${chk.factor} for ${asked}` : '',
      chk.kind === 'mismatch' ? `Quoted ${line.pack}, asked ${asked} — accepted by reviewer` : '',
      n ? `Pack of ${n} @ ${rupees(line.price)} — ${rupees(askedPrice(it, line))} each` : '',
      spec ? `${spec} — accepted by reviewer` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  /** Audit: how the line came to be this item, saved with the price. */
  const matchNoteFor = (r: Row, it: RfqItem): string | null => {
    const c = r.choices[it.id];
    if (c?.kind === 'custom') return 'Price typed in';
    if (c?.kind !== 'line') return null;
    const parts = linesOf(r, c);
    const how =
      c.source === 'memory'
        ? 'Known vendor name (confirmed before)'
        : c.source === 'person'
          ? 'Checked by the person saving'
          : parts.some((p) => p.checked)
            ? 'Two AI readings agreed'
            : 'AI match';
    const why = parts.find((p) => p.reason)?.reason;
    const one = parts.length === 1 ? packNote(it, c, parts[0]) : '';
    return [how, why ? `AI: ${why}` : '', parts[0]?.code ? `Cat. ${parts[0].code}` : '', one].filter(Boolean).join(' · ');
  };

  /** Items still waiting for an answer: unanswered, an unconfirmed AI guess, or a blank typed price. */
  // The one thing that needs a person: an AI match it was unsure of. A price left
  // empty is simply "not quoted by this vendor" — no separate choice to make.
  const toCheck = (r: Row) =>
    rfq.items.filter((it) => {
      const c = r.choices[it.id];
      return c?.kind === 'line' && !c.confirmed;
    }).length;

  // Per-PDF status, computed live — drives the left list, the footer and Save.
  const statusOf = useMemo(() => {
    const out: Record<string, { label: string; tone: 'ok' | 'warn' | 'busy' | 'done'; blocker: string | null }> = {};
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.status === 'reading') { out[r.key] = { label: 'Reading…', tone: 'busy', blocker: 'reading' }; continue; }
      if (r.status === 'saving') { out[r.key] = { label: 'Saving…', tone: 'busy', blocker: 'saving' }; continue; }
      if (r.status === 'saved') { out[r.key] = { label: 'Saved', tone: 'done', blocker: 'saved' }; continue; }
      const pending = toCheck(r);
      const priced = rfq.items.filter((it) => priceOf(r, it.id) !== null).length;
      let blocker: string | null = null;
      let label = 'Ready';
      if (!r.vendorId && !r.newVendor.name.trim()) { blocker = 'Choose or add the vendor'; label = 'Add vendor'; }
      else if (r.vendorId && quotedSupplierIds.has(r.vendorId)) { blocker = 'This vendor has already quoted'; label = 'Already quoted'; }
      else if (pending > 0) { blocker = `${pending} item${pending === 1 ? '' : 's'} to check`; label = `${pending} to check`; }
      else if (priced === 0) { blocker = 'No price for any item'; label = 'No prices'; }
      const vendorKey = r.vendorId || `new:${r.newVendor.name.trim().toLowerCase()}`;
      if (!blocker && seen.has(vendorKey)) { blocker = `Same vendor as ${seen.get(vendorKey)}`; label = 'Duplicate'; }
      if (!blocker) seen.set(vendorKey, r.file.name);
      out[r.key] = { label, tone: blocker ? 'warn' : 'ok', blocker };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rfq.items, quotedSupplierIds]);

  const savable = rows.filter((r) => statusOf[r.key]?.tone === 'ok');
  const stillReading = rows.some((r) => r.status === 'reading');
  const selected = rows.find((r) => r.key === selectedKey) ?? rows.find((r) => r.status !== 'saved') ?? null;

  // One object URL per shown PDF, released when it changes (not one per render).
  const selectedFile = selected?.file ?? null;
  const pdfUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : null), [selectedFile]);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const vendorName = (r: Row) =>
    r.vendorId ? allVendors.find((v) => v.id === r.vendorId)?.name ?? 'Vendor' : r.newVendor.name.trim() || 'Vendor not found';

  const saveAll = async () => {
    if (!profile?.id) return;
    setSaving(true);
    let ok = 0;
    const pdfJobs: Array<{ quotationId: string; file: File }> = [];
    const savedKeys = new Set<string>();
    for (const r of savable) {
      patch(r.key, { status: 'saving' });
      try {
        let supplierId = r.vendorId;
        if (!supplierId) {
          const created = await createVendor.mutateAsync({
            institution_id: rfq.institution_id,
            name: r.newVendor.name.trim(),
            code: null,
            email: r.newVendor.email || null,
            gstin: r.newVendor.gstin || null,
            phone: r.newVendor.phone || null,
            address: r.newVendor.address || null,
            contact_person: r.newVendor.contact || null,
            payment_terms: r.paymentTerms || null,
          });
          supplierId = created.id;
          patch(r.key, { vendorId: created.id }); // a retry must not create it twice
        }

        const created = await createQuotation.mutateAsync({
          dto: {
            institution_id: rfq.institution_id,
            rfq_id: rfq.id,
            supplier_id: supplierId,
            vendor_quote_number: r.quoteNumber || null,
            quote_date: r.quoteDate || null,
            validity_date: r.validityDate || null,
            delivery_time_days: r.deliveryDays ? Number(r.deliveryDays) : null,
            payment_terms: r.paymentTerms || null,
            warranty: r.warranty || null,
            document_url: null,
            document_file_id: null,
            items: rfq.items.map((it) => {
              const c = r.choices[it.id];
              const parts = linesOf(r, c);
              const line = parts.length === 1 ? parts[0] : undefined;
              const price = priceOf(r, it.id);
              return {
                rfq_item_id: it.id,
                unit_price: price, // null = not quoted
                quantity: it.quantity,
                // What the vendor printed, so Compare & award shows their own name and qty.
                quoted_name: price == null ? null : line?.name ?? (parts.length > 1 ? `Set of ${parts.length} parts` : null),
                quoted_qty: line?.qty ?? null,
                quoted_pack: line?.pack || null,
                match_note: price == null ? null : matchNoteFor(r, it),
                match_source: price == null ? null : c?.kind === 'custom' ? 'typed' : c?.kind === 'line' ? c.source : null,
                manufacturer: line?.manufacturer || null,
                quality_grade: line?.quality_grade || null,
                concentration: line?.concentration || null,
                // A set's parts share one rate when the vendor printed one; else leave it for the PO.
                gst_percent: sameOf(parts.map((p) => p.gst_percent)),
                hsn: line?.hsn || null,
                // A set keeps its breakdown, so the comparison still shows what the price buys.
                other_specs:
                  parts.length > 1
                    ? `Set of ${parts.length} parts: ${parts.map((p) => `${p.name} ${rupees(p.price)}`).join('; ')}`
                    : [packNote(it, r.choices[it.id], line), line?.other_specs].filter(Boolean).join(' · ') || null,
              };
            }),
          },
          userId: profile.id,
        });
        // Remember every answer for next time — best-effort, the quote is already saved.
        void rememberAnswers(r, supplierId);
        patch(r.key, { status: 'saved' });
        savedKeys.add(r.key);
        ok++;
        pdfJobs.push({ quotationId: created.id, file: r.file });
      } catch (e) {
        patch(r.key, { status: 'ready', error: errorMessage(e, 'Could not save') });
      }
    }
    setSaving(false);
    setReviewing(false);
    queryClient.invalidateQueries({ queryKey: ['procurement-vendors-select', rfq.institution_id] });
    if (ok) toast.success(`${ok} quotation${ok === 1 ? '' : 's'} saved`);
    // Attach the PDFs to Drive in the background — the prices are already saved.
    void attachPdfs(pdfJobs);
    // Side effects stay out of the setRows updater: React runs updaters during
    // render, and closing the dialog there updates the parent page mid-render.
    const left = rows.filter((r) => r.status !== 'saved' && !savedKeys.has(r.key));
    setRows((prev) => prev.filter((r) => r.status !== 'saved'));
    if (left.length === 0) {
      setSelectedKey(null);
      onOpenChange(false);
    } else {
      setSelectedKey(left[0].key);
    }
  };

  /**
   * "This vendor's name is this item" for every line taken, "is not" for every No.
   * A line taken on the AI's word alone is remembered too: the person saw it and saved.
   */
  const rememberAnswers = async (r: Row, supplierId: string) => {
    const rows: ItemAlias[] = [];
    const add = (it: RfqItem, l: ReadLine | undefined, same: boolean) => {
      if (!l) return;
      const key = quotedKey(l.name);
      const base = { supplier_id: supplierId, item_key: itemKeyOf(it), item_name: it.item_name, same };
      if (key) rows.push({ ...base, quoted_name: l.name, quoted_key: key });
      // The catalogue code too: the next quote may spell the name differently, never the code.
      const code = codeKey(l.code);
      if (code) rows.push({ ...base, quoted_name: `Cat. ${l.code}`, quoted_key: code });
    };
    for (const it of rfq.items) {
      const c = r.choices[it.id];
      if (c?.kind !== 'line' || !c.confirmed) continue;
      for (const l of linesOf(r, c)) add(it, l, true);
    }
    for (const no of r.rejected) {
      const now = r.choices[no.itemId];
      // Said "No", then picked that very line again: the later answer stands.
      if (now?.kind === 'line' && now.idxs.includes(no.idx)) continue;
      const it = rfq.items.find((x) => x.id === no.itemId);
      if (it) add(it, r.lines.find((l) => l.idx === no.idx), false);
    }
    // One row per (name, item): the last answer wins.
    const unique = [...new Map(rows.map((x) => [`${x.quoted_key}|${x.item_key}`, x])).values()];
    try {
      await ProcurementQuotationService.rememberItemNames(rfq.institution_id, unique);
      void queryClient.invalidateQueries({ queryKey: ['procurement-item-aliases', rfq.institution_id] });
    } catch {
      /* the quote is saved; the next upload simply asks again */
    }
  };

  const attachPdfs = async (jobs: Array<{ quotationId: string; file: File }>) => {
    if (!jobs.length) return;
    const results = await Promise.all(
      jobs.map(async (j) => {
        try {
          const fd = new FormData();
          fd.append('file', j.file);
          fd.append('institutionId', rfq.institution_id);
          fd.append('rfqNumber', rfq.rfq_number);
          const res = await fetch('/api/procurement/quotations/upload', { method: 'POST', body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body?.attachment) return false;
          await ProcurementQuotationService.attachQuotationDocument(
            j.quotationId,
            body.attachment.url,
            body.attachment.driveFileId
          );
          return true;
        } catch {
          return false;
        }
      })
    );
    queryClient.invalidateQueries({ queryKey: ['procurement-quotations', rfq.id] });
    const failed = results.filter((x) => !x).length;
    if (failed) toast.warning(`${failed} PDF${failed === 1 ? ' was' : 's were'} not attached (file storage failed) — the prices are saved.`);
  };

  const close = (o: boolean) => {
    if (!o && (saving || stillReading)) return;
    if (!o) {
      setRows([]);
      setSelectedKey(null);
      setReviewing(false);
    }
    onOpenChange(o);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={QUOTE_FILE_ACCEPT}
      multiple
      className="hidden"
      onChange={(e) => {
        addFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );


  const many = rows.length > 1;
  // Phones: the item takes the first line; price, total and remove share the second.
  const COLS = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px] items-center gap-x-2.5 gap-y-2 sm:grid-cols-[minmax(0,1fr)_120px_100px_28px] sm:gap-3';
  const totalOf = (r: Row) => rfq.items.reduce((sum, it) => sum + (priceOf(r, it.id) ?? 0) * Number(it.quantity), 0);
  const titleOf = (r: Row) =>
    r.status === 'reading' ? 'Reading the quote…' : r.vendorId || r.newVendor.name.trim() ? `Quote from ${vendorName(r)}` : 'Add quote';

  // ── Review before save: per vendor, every item with Asked | Vendor quoted | Price | Total.
  const notReady = rows.filter((r) => r.status !== 'saved' && statusOf[r.key]?.tone !== 'ok').length;
  const reviewBody = (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
      {notReady > 0 && (
        <p className="rounded-lg bg-secondary/20 px-3 py-2 text-[13px] text-foreground">
          {notReady} quote{notReady === 1 ? ' is' : 's are'} not ready and will not be saved now.
        </p>
      )}
      {savable.map((r) => (
        <section key={r.key} className="overflow-hidden rounded-xl border">
          <header className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/50 px-4 py-2.5">
            <span className="font-semibold">{vendorName(r)}</span>
            <span className="text-sm">
              Total <b className="tabular-nums">{rupees(totalOf(r))}</b>
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">Asked</th>
                  <th className="px-2 py-2 font-semibold">Vendor quoted</th>
                  <th className="px-2 py-2 text-right font-semibold">Price / unit</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {rfq.items.map((it) => {
                  const c = r.choices[it.id];
                  const price = priceOf(r, it.id);
                  const parts = linesOf(r, c);
                  const one = parts.length === 1 ? parts[0] : undefined;
                  const chk = one ? packCheckOf(it, one) : null;
                  const quoted =
                    price == null
                      ? 'Not quoted'
                      : c?.kind === 'custom'
                        ? 'Price typed in'
                        : parts.length > 1
                          ? `Set of ${parts.length} parts`
                          : `${one?.name ?? ''} · ${one?.qty != null ? `qty ${one.qty} · ` : ''}${one?.pack || 'pack not printed'} @ ${rupees(one?.price ?? 0)}`;
                  const tone =
                    chk?.kind === 'mismatch'
                      ? 'bg-secondary/20'
                      : chk?.kind === 'scaled'
                        ? 'bg-primary/10'
                        : '';
                  return (
                    <tr key={it.id} className={cn('border-b last:border-0 align-top', tone, price == null && 'text-muted-foreground')}>
                      <td className="px-4 py-2">
                        <span className="font-medium">{it.item_name}</span>
                        {it.item_spec && <span className="block text-xs text-muted-foreground">{it.item_spec}</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums">{askedLabel(it)}</td>
                      <td className="px-2 py-2">
                        {quoted}
                        {chk?.kind === 'scaled' && (
                          <span className="block text-xs text-primary">
                            ×{chk.factor} for {requestedPack(it)?.label}
                          </span>
                        )}
                        {chk?.kind === 'mismatch' && (
                          <span className="block text-xs font-medium text-foreground">⚠ {chk.reason}</span>
                        )}
                        {one && piecesPerPack(it, one) && (
                          <span className="block text-xs text-primary">
                            Pack of {piecesPerPack(it, one)} → {rupees(askedPrice(it, one))} each
                          </span>
                        )}
                        {one && specOf(it, one) && (
                          <span className="block text-xs font-medium text-foreground">⚠ {specOf(it, one)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{price != null ? rupees(price) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">
                        {price != null ? rupees(price * Number(it.quantity)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={`flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 ${
          many || reviewing ? 'max-w-3xl' : rows.length === 1 ? 'max-w-xl' : 'max-w-md'
        }`}
      >
        {fileInput}

        {rows.length === 0 ? (
          <>
            <DialogHeader className="px-6 pb-2 pt-5">
              <DialogTitle className="text-lg">Add quotes</DialogTitle>
              <DialogDescription>Choose the vendors&apos; quotations — PDF, photo or Excel. The AI reads each one.</DialogDescription>
            </DialogHeader>
            <div className="p-6 pt-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="font-medium">Choose quotation files</span>
                <span className="text-xs text-muted-foreground">or drop them here · several at once</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── Header: whose quote, which file, View PDF ───────────────── */}
            <DialogHeader className="space-y-0.5 border-b px-6 pb-3 pt-5 pr-12 text-left">
              <DialogTitle className="text-lg">
                {many ? (
                  <>
                    Add quotes <span className="text-sm font-normal text-muted-foreground">· {rows.length} PDFs</span>
                  </>
                ) : (
                  titleOf(rows[0])
                )}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 text-[13px]">
                {!many && selected && (
                  <>
                    <span className="truncate">{selected.file.name}</span>
                    {selected.vendorNote && selected.vendorId && (
                      <span className="text-primary">· ✓ vendor {selected.vendorNote}</span>
                    )}
                    {pdfUrl && (
                      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        · View file
                      </a>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-50"
                  onClick={() => inputRef.current?.click()}
                  disabled={saving}
                >
                  {many ? '+ More PDFs' : '· + Another PDF'}
                </button>
              </DialogDescription>
            </DialogHeader>

            {reviewing ? reviewBody : (
            <div className={`grid min-h-0 flex-1 overflow-hidden ${many ? 'grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] sm:grid-rows-1' : 'grid-cols-1'}`}>
              {/* ── Vendor rail (several PDFs): name + one status word. A strip across
                  the top on phones, a side rail from sm. ─────── */}
              {many && (
                <nav aria-label="Quotes" className="flex gap-1 overflow-x-auto border-b bg-muted/40 p-2 sm:flex-col sm:overflow-y-auto sm:overflow-x-visible sm:border-b-0 sm:border-r">
                  {rows.map((r) => {
                    const st = statusOf[r.key];
                    const isSel = selected?.key === r.key;
                    const dot =
                      st?.tone === 'ok' ? 'text-primary' : st?.tone === 'warn' ? 'text-foreground' : 'text-muted-foreground';
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setSelectedKey(r.key)}
                        className={cn(
                          'flex max-w-[12rem] shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors sm:max-w-none',
                          isSel ? 'border-primary bg-background' : 'border-transparent hover:bg-background/70'
                        )}
                      >
                        <span className="truncate text-sm font-semibold" title={r.file.name}>
                          {r.status === 'reading' ? r.file.name : vendorName(r)}
                        </span>
                        <span className={`flex items-center gap-1 text-xs ${dot}`}>
                          {st?.tone === 'busy' ? <Loader2 className="h-3 w-3 animate-spin" /> : '●'} {st?.label}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              )}

              {/* ── The selected quote ─────────────────────────────────────── */}
              <div className="min-h-0 overflow-y-auto">
                {!selected ? null : selected.status === 'reading' ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Reading {selected.file.name}…
                    <span className="text-xs">A one-page quote takes a few seconds; a long one up to a minute.</span>
                  </div>
                ) : (
                  <>
                    {selected.readIssues.length > 0 && (
                      <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-secondary/20 px-3 py-2 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <div>
                          <p className="font-medium">The reading does not match this quotation&apos;s own numbers</p>
                          <ul className="list-disc pl-4 text-xs text-muted-foreground">
                            {selected.readIssues.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {many && (
                      <div className="px-5 pt-4">
                        <p className="font-semibold">{vendorName(selected)}</p>
                        <p className="text-xs text-muted-foreground">
                          {selected.file.name}
                          {pdfUrl && (
                            <>
                              {' · '}
                              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                View file
                              </a>
                            </>
                          )}
                          {' · '}
                          <button
                            type="button"
                            className="hover:text-foreground"
                            onClick={() => {
                              setRows((prev) => prev.filter((x) => x.key !== selected.key));
                              setSelectedKey(null);
                            }}
                          >
                            Remove
                          </button>
                        </p>
                      </div>
                    )}

                    {selected.error && (
                      <p className="mx-5 mt-4 rounded-lg bg-secondary/20 px-3 py-2 text-[13px] text-foreground">
                        {selected.error}
                      </p>
                    )}

                    {/* Vendor (asked only when not recognised). Quote no., delivery and payment
                        are not asked — when the AI reads them they are saved and shown here. */}
                    <div className="space-y-3 px-5 pt-4 empty:hidden">
                      {(!selected.vendorId || quotedSupplierIds.has(selected.vendorId)) && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Vendor</span>
                          <div className="flex flex-wrap gap-2">
                            <Select
                              value={selected.vendorId || NEW_VENDOR}
                              onValueChange={(val) => patch(selected.key, { vendorId: val === NEW_VENDOR ? '' : val, vendorNote: undefined })}
                              disabled={selected.status === 'saving'}
                            >
                              <SelectTrigger className="h-9 min-w-0 flex-1 sm:max-w-56" aria-label="Vendor">
                                <SelectValue placeholder="Choose a vendor…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NEW_VENDOR}>+ New vendor</SelectItem>
                                {allVendors.map((v) => (
                                  <SelectItem key={v.id} value={v.id} disabled={quotedSupplierIds.has(v.id)}>
                                    {v.name}
                                    {quotedSupplierIds.has(v.id) ? ' (already quoted)' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!selected.vendorId && (
                              <Input
                                className="h-9 min-w-0 flex-1"
                                placeholder="New vendor's name"
                                aria-label="New vendor's name"
                                value={selected.newVendor.name}
                                onChange={(e) =>
                                  patch(selected.key, (row) => ({ newVendor: { ...row.newVendor, name: e.target.value } }))
                                }
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {(selected.quoteNumber || selected.deliveryDays || selected.paymentTerms) && (
                      <p className="px-5 pt-3 text-xs text-muted-foreground">
                        {[
                          selected.quoteNumber ? `Quote ${selected.quoteNumber}` : null,
                          selected.deliveryDays ? `${selected.deliveryDays} days delivery` : null,
                          selected.paymentTerms || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}

                    {/* Items: ONE aligned grid — item | price / unit | total */}
                    <div className="mt-4 border-t">
                      <div className={`${COLS} hidden bg-muted/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid`}>
                        <span>Item</span>
                        <span className="text-right">Price / unit</span>
                        <span className="text-right">Total</span>
                        <span />
                      </div>
                      {rfq.items.map((it) => {
                        const c = selected.choices[it.id];
                        const price = priceOf(selected, it.id);
                        const parts = linesOf(selected, c);
                        const isSet = parts.length > 1;
                        const unsure = c?.kind === 'line' && !c.confirmed;
                        const unanswered = !c;
                        const notQuoted = c?.kind === 'none';
                        const pack = !isSet && c?.kind === 'line' && parts[0] ? packCheckOf(it, parts[0]) : null;
                        const amber = unsure;
                        const qty = Number(it.quantity);
                        const lineValue = c ? (c.kind === 'line' ? (isSet ? '' : `line:${c.idxs[0]}`) : c.kind) : '';
                        const onPick = (v: string) => {
                          if (v === 'none') setChoice(selected.key, it.id, { kind: 'none' });
                          else if (v === 'custom') setChoice(selected.key, it.id, { kind: 'custom', price: price != null ? String(price) : '' });
                          else {
                            const n = Number(v.slice(5));
                            // Switching between a vendor's options keeps the others listed.
                            const offers = c?.kind === 'line' && c.idxs.length === 1 && c.alts?.length ? [...c.idxs, ...c.alts] : [];
                            setChoice(selected.key, it.id, {
                              kind: 'line',
                              idxs: [n],
                              confirmed: true,
                              source: 'person',
                              alts: offers.includes(n) ? offers.filter((x) => x !== n) : undefined,
                            });
                          }
                        };
                        const setParts = (idxs: number[]) =>
                          setChoice(selected.key, it.id, idxs.length ? { kind: 'line', idxs, confirmed: true, source: 'person' } : { kind: 'none' });
                        // "No, that is not the item": nothing is priced, and the answer is remembered.
                        const sayNo = () =>
                          patch(selected.key, (row) => ({
                            choices: { ...row.choices, [it.id]: { kind: 'none' } },
                            rejected: [...row.rejected, ...parts.map((p) => ({ itemId: it.id, idx: p.idx }))],
                          }));
                        const qtyOff = !isSet && qtyDiffers(it, parts[0]);
                        const alts = c?.kind === 'line' ? (c.alts ?? []).map((i) => selected.lines.find((l) => l.idx === i)).filter((l): l is ReadLine => !!l) : [];
                        const taken = usedIdxs(selected.choices);
                        const addable = c?.kind === 'line' ? selected.lines.filter((l) => !taken.has(l.idx)) : [];
                        // Typing in the price box always wins over what the AI read.
                        const typed = (v: string) => setChoice(selected.key, it.id, { kind: 'custom', price: v });
                        // Every row ends in the same small menu: pick another line from the PDF,
                        // or mark the item not quoted / quoted again.
                        const rowMenu = selected.lines.length === 0 ? <span /> : (
                          <Select value={lineValue} onValueChange={onPick} disabled={selected.status === 'saving'}>
                            <SelectTrigger
                              className="h-7 w-7 justify-center border-0 p-0 text-muted-foreground shadow-none hover:bg-muted focus:ring-0 [&>svg:last-child]:hidden"
                              aria-label={`More for ${it.item_name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </SelectTrigger>
                            <SelectContent align="end" className="max-w-[520px]">
                              <SelectItem value="none">Not quoted by this vendor</SelectItem>
                              {selected.lines.length > 0 && (
                                <div className="px-2 py-1 text-xs text-muted-foreground">Use a line from the PDF</div>
                              )}
                              {selected.lines.map((l) => (
                                <SelectItem key={l.idx} value={`line:${l.idx}`}>
                                  <span className="flex w-full items-center justify-between gap-4">
                                    <span className="truncate">
                                      {l.name}
                                      {l.pack && <span className="text-muted-foreground"> · {l.pack}</span>}
                                    </span>
                                    <b className="shrink-0 tabular-nums">{rupees(l.price)}</b>
                                  </span>
                                </SelectItem>
                              ))}

                            </SelectContent>
                          </Select>
                        );
                        return (
                          <div
                            key={it.id}
                            className={cn(COLS, 'border-t px-5 py-3', amber && 'bg-secondary/20')}
                          >
                            <div className="col-span-3 min-w-0 sm:col-span-1">
                              <p className="truncate text-sm font-semibold">
                                {it.item_name}{' '}
                                <span className="font-normal text-muted-foreground">· {askedLabel(it)}</span>
                              </p>
                              {/* What the vendor's price is for, against what was asked. */}
                              {pack?.kind === 'scaled' && (
                                <p className="truncate text-xs text-primary">
                                  Quoted {parts[0].pack} @ {rupees(parts[0].price)} → ×{pack.factor} for {requestedPack(it)?.label}
                                </p>
                              )}
                              {pack?.kind === 'mismatch' && (
                                <p className="truncate text-xs font-medium text-foreground">⚠ {pack.reason}</p>
                              )}
                              {!isSet && piecesPerPack(it, parts[0]) && (
                                <p className="truncate text-xs text-primary">
                                  Pack of {piecesPerPack(it, parts[0])} @ {rupees(parts[0].price)} → {rupees(askedPrice(it, parts[0]))} each
                                </p>
                              )}
                              {!isSet && specOf(it, parts[0]) && (
                                <p className="truncate text-xs font-medium text-foreground">⚠ {specOf(it, parts[0])}</p>
                              )}
                              {/* one short status — actions live in the row's ⋯ menu */}
                              {unsure ? (
                                <div className="mt-0.5 text-xs text-foreground">
                                  <p className="whitespace-normal">
                                    {isSet ? (
                                      <>Do these {parts.length} parts make one {it.item_name}?</>
                                    ) : (
                                      <>
                                        Vendor wrote <b>“{parts[0]?.name}”</b> — is this the item
                                        {qtyOff ? ' and quantity' : ''}?
                                        {parts[0]?.reason && (
                                          <span className="block text-muted-foreground">AI: {parts[0].reason}</span>
                                        )}
                                      </>
                                    )}
                                  </p>
                                  {qtyOff && (
                                    <p className="font-medium">
                                      Vendor qty {parts[0]?.qty} · asked {Number(it.quantity)}
                                    </p>
                                  )}
                                  <span className="mt-1 flex gap-1.5">
                                    <button
                                      type="button"
                                      className="rounded bg-primary px-2 py-0.5 font-semibold text-primary-foreground hover:bg-primary/90"
                                      onClick={() => c?.kind === 'line' && setChoice(selected.key, it.id, { ...c, confirmed: true, source: 'person' })}
                                    >
                                      Yes
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded border px-2 py-0.5 font-semibold hover:bg-muted"
                                      onClick={sayNo}
                                    >
                                      No
                                    </button>
                                  </span>
                                </div>
                              ) : unanswered || notQuoted || c?.kind === 'custom' ? null : (
                                <p className="truncate text-xs text-primary" title={parts.map((p) => p.name).join(', ')}>
                                  ✓ {isSet ? `Set of ${parts.length} parts` : parts[0]?.name}
                                  {c?.kind === 'line' && c.source === 'memory' && (
                                    <span className="text-muted-foreground"> · known name</span>
                                  )}
                                  {parts[0]?.qty != null && !isSet && (
                                    <span className="text-muted-foreground"> · qty {parts[0].qty}</span>
                                  )}
                                </p>
                              )}
                              {alts.length > 0 && (
                                <p className="truncate text-xs text-muted-foreground">
                                  Cheapest of {alts.length + 1} offers · also {alts.map((a) => `${a.name} ${rupees(a.price)}`).join(', ')}
                                </p>
                              )}
                              {isSet && (
                                <details className="mt-1 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer text-primary">See the {parts.length} parts</summary>
                                  <ul className="mt-1 space-y-0.5">
                                    {parts.map((p) => (
                                      <li key={p.idx} className="flex items-center justify-between gap-2">
                                        <span className="truncate">{p.name}</span>
                                        <span className="flex shrink-0 items-center gap-1 tabular-nums">
                                          {rupees(p.price)}
                                          <button
                                            type="button"
                                            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                                            aria-label={`Remove ${p.name} from ${it.item_name}`}
                                            onClick={() => setParts(c?.kind === 'line' ? c.idxs.filter((i) => i !== p.idx) : [])}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  {addable.length > 0 && c?.kind === 'line' && (
                                    <Select key={c.idxs.length} onValueChange={(v) => setParts([...c.idxs, Number(v.slice(5))])}>
                                      <SelectTrigger className="mt-1 h-7 w-auto gap-1 px-2 text-xs" aria-label={`Add a part to ${it.item_name}`}>
                                        <Plus className="h-3 w-3" /> Add a part
                                      </SelectTrigger>
                                      <SelectContent className="max-w-[520px]">
                                        {addable.map((l) => (
                                          <SelectItem key={l.idx} value={`line:${l.idx}`}>
                                            <span className="flex w-full items-center justify-between gap-4">
                                              <span className="truncate">{l.name}</span>
                                              <b className="shrink-0 tabular-nums">{rupees(l.price)}</b>
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </details>
                              )}
                            </div>

                            {(
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                aria-label={`Price per unit for ${it.item_name}`}
                                placeholder="Not quoted"
                                className={cn(
                                  'h-9 bg-background text-right tabular-nums',
                                  amber && 'border-secondary'
                                )}
                                value={c?.kind === 'custom' ? c.price : price != null ? String(price) : ''}
                                onChange={(e) => typed(e.target.value)}
                                disabled={selected.status === 'saving'}
                              />
                            )}
                            <span className={`text-right text-sm tabular-nums ${price != null ? 'font-semibold' : 'text-muted-foreground'}`}>
                              {price != null ? rupees(price * qty) : '—'}
                            </span>
                            {rowMenu}
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      const used = usedIdxs(selected.choices);
                      const spare = selected.lines.filter((l) => !used.has(l.idx));
                      return spare.length ? (
                        <details className="border-t px-5 py-3 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            {spare.length} line{spare.length === 1 ? '' : 's'} in this quote not used — not asked for
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {spare.map((l) => (
                              <li key={l.idx} className="flex justify-between gap-3">
                                <span className="truncate">
                                  {l.name}
                                  {l.pack && ` · ${l.pack}`}
                                </span>
                                <span className="shrink-0 tabular-nums">{rupees(l.price)}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1">If one of these is a requested item, pick it from that item’s ⋯ menu.</p>
                        </details>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
            </div>
            )}

            {/* ── Footer: total, what is left, Save ─────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-5 py-3">
              <span className="min-w-0 flex-1 text-sm">
                {reviewing ? (
                  <span className="text-muted-foreground">
                    Check each item&apos;s quantity and pack against the vendor&apos;s quote, then confirm.
                  </span>
                ) : stillReading ? (
                  <span className="text-muted-foreground">Reading the PDFs…</span>
                ) : many ? (
                  <>
                    <b>
                      {savable.length} of {rows.length}
                    </b>{' '}
                    ready
                    {selected && statusOf[selected.key]?.tone === 'warn' && (
                      <span className="text-foreground"> · {vendorName(selected)}: {statusOf[selected.key]?.blocker}</span>
                    )}
                  </>
                ) : selected ? (
                  <>
                    <span className="block">
                      Total <b className="tabular-nums">{rupees(totalOf(selected))}</b>
                    </span>
                    {statusOf[selected.key]?.tone === 'warn' && (
                      <span className="block text-xs text-foreground">{statusOf[selected.key]?.blocker}</span>
                    )}
                  </>
                ) : null}
              </span>
              {reviewing ? (
                <Button variant="ghost" onClick={() => setReviewing(false)} disabled={saving}>
                  Back to edit
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => close(false)} disabled={saving || stillReading}>
                  Cancel
                </Button>
              )}
              {/* Nothing is saved straight from the edit view: the person first sees every
                  item with the quantity and pack it is being saved for. */}
              <Button
                className="h-11 w-full px-5 sm:h-9 sm:w-auto"
                onClick={reviewing ? saveAll : () => setReviewing(true)}
                disabled={saving || stillReading || savable.length === 0}
              >
                {saving
                  ? 'Saving…'
                  : reviewing
                    ? savable.length > 1 ? `Confirm & save ${savable.length} quotes` : 'Confirm & save'
                    : 'Review items & qty'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
