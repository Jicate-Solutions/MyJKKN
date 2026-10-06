'use client';

// components/procurement/po-document-preview.tsx
//
// The purchase order as it will print — the same resolved model the PDF and Word
// files are drawn from, laid out like the paper PO. With `edit`, every blank on the
// paper is typed into right where it prints: no separate form, nothing to save
// (each box saves when you leave it), and anything optional can simply be skipped.

import type { PoDocumentModel } from '@/lib/procurement/po-document-model';

export interface PoPreviewEdit {
  /** Raw value of a header/footer box (quotation_no, delivery, special_note…). */
  value: (key: string) => string;
  onChange: (key: string, value: string) => void;
  /** Called when a box loses focus — the page saves then. */
  onCommit: () => void;
  /** Boxes the order can't go out without; shown highlighted while empty. */
  required: Set<string>;
  /** Item columns typed per line (HSN, GST %). */
  itemKeys: Set<string>;
  itemValue: (rowIndex: number, key: string) => string;
  /** False when the value came from the vendor's quotation — shown as printed, not typed. */
  itemEditable: (rowIndex: number, key: string) => boolean;
  onItemCommit: (rowIndex: number, key: string, value: string) => void;
  /** One value for every typed line of a column ("same GST for all"). */
  onApplyAll: (key: string, value: string) => void;
}

const alignClass = (a?: 'left' | 'center' | 'right') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

/** A blank on the paper you can type into. Looks like text until focused. */
function Blank({
  edit,
  k,
  placeholder,
  className = '',
}: {
  edit: PoPreviewEdit;
  k: string;
  placeholder?: string;
  className?: string;
}) {
  const v = edit.value(k);
  const missing = edit.required.has(k) && !v.trim();
  return (
    <input
      aria-label={k.replace(/_/g, ' ')}
      value={v}
      placeholder={missing ? 'Required' : (placeholder ?? '—')}
      onChange={(e) => edit.onChange(k, e.target.value)}
      onBlur={edit.onCommit}
      className={`w-full min-w-0 rounded border border-dashed bg-transparent px-1.5 py-0.5 font-semibold outline-none placeholder:font-normal focus:border-primary focus:bg-background ${
        missing
          ? 'border-secondary bg-secondary/25 placeholder:text-foreground'
          : 'border-transparent hover:border-border'
      } ${className}`}
    />
  );
}

export function PoDocumentPreview({ model, edit }: { model: PoDocumentModel; edit?: PoPreviewEdit }) {
  const cols = model.itemColumns.length;
  const show = (k: string, printed: string, placeholder?: string, className?: string) =>
    edit ? <Blank edit={edit} k={k} placeholder={placeholder} className={className} /> : printed;

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full min-w-[640px] border-collapse text-[13px] [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
        <tbody>
          <tr>
            <td colSpan={cols} className="px-3 py-2">
              <div className="flex items-center justify-between gap-3 font-semibold">
                <span>Ref: {model.refNo}</span>
                <span>Date: {model.refDate}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={cols} className="px-3 py-1.5 text-center font-bold tracking-wide">
              PURCHASE ORDER
            </td>
          </tr>
          <tr>
            <td colSpan={cols} className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]">
                <div className="space-y-0.5 px-3 py-2">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-bold">{model.vendor.name}</p>
                  {model.vendor.lines.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                  {model.vendor.phone && <p className="text-xs">{model.vendor.phone}</p>}
                </div>
                <dl className="divide-y border-t md:border-l md:border-t-0">
                  {model.quoteFields.map((f) => (
                    <div key={f.key} className="grid grid-cols-2 items-center gap-2 px-3 py-1">
                      <dt className="text-[11px] font-semibold uppercase text-muted-foreground">{f.label}</dt>
                      <dd className="font-semibold">{show(f.key, f.value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </td>
          </tr>
          <tr className="bg-muted/60">
            {model.itemColumns.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase">
                {c.label}
                {edit?.itemKeys.has(c.key) && model.itemRows.some((_, i) => edit.itemEditable(i, c.key)) && (
                  <input
                    aria-label={`${c.label} for all items`}
                    placeholder="All"
                    title="Same for every item"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) return;
                      edit.onApplyAll(c.key, v);
                      e.target.value = '';
                    }}
                    className="mt-1 block w-full min-w-0 rounded border border-dashed border-border bg-background px-1 text-center text-[11px] font-normal normal-case outline-none focus:border-primary"
                  />
                )}
              </th>
            ))}
          </tr>
          {model.itemRows.map((r, i) => (
            <tr key={i} className="tabular-nums">
              {r.cells.map((c) => (
                <td key={c.key} className={`px-2 py-1 ${alignClass(c.align)}`}>
                  {edit?.itemKeys.has(c.key) && edit.itemEditable(i, c.key) ? (
                    <input
                      // Remount when the saved value changes (e.g. "All" filled it in).
                      key={edit.itemValue(i, c.key)}
                      aria-label={`${c.label} row ${i + 1}`}
                      defaultValue={edit.itemValue(i, c.key)}
                      placeholder="—"
                      onBlur={(e) => {
                        if (e.target.value !== edit.itemValue(i, c.key)) edit.onItemCommit(i, c.key, e.target.value);
                      }}
                      className="w-full min-w-0 rounded border border-dashed border-transparent bg-transparent px-1 text-center outline-none hover:border-border focus:border-primary focus:bg-background"
                    />
                  ) : (
                    c.value
                  )}
                </td>
              ))}
            </tr>
          ))}
          {model.totals.map((t) => (
            <tr key={t.key} className="font-semibold tabular-nums">
              <td colSpan={cols - 1} className="px-2 py-1 text-right">
                {t.label}
              </td>
              <td className="px-2 py-1 text-right">{t.value}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={cols} className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr]">
                <dl className="space-y-1 px-3 py-2">
                  <p className="pb-1 text-center text-[11px] font-semibold uppercase">Terms &amp; condition</p>
                  {model.terms.map((t) => (
                    <div key={t.key} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                      <dt className="font-semibold">{t.label}</dt>
                      <dd className="flex items-center gap-1">
                        <span>:</span>
                        {show(t.key, t.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className="space-y-1 border-t px-3 py-2 md:border-l md:border-t-0">
                  <p className="pb-1 text-center text-[11px] font-semibold uppercase">Enclosure</p>
                  {(
                    [
                      ['payment_mode', 'Cheque / NEFT no.', model.enclosure.mode],
                      ['paid_on', 'Dated', model.enclosure.dated],
                      ['bank', 'Bank', model.enclosure.bank],
                      ['amount_paid', 'Amount (Rs.)', model.enclosure.amount],
                    ] as const
                  ).map(([k, label, printed]) => (
                    <div key={k} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                      <dt className="font-semibold">{label}</dt>
                      <dd>{show(k, printed)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="border-t px-3 py-2 md:border-l md:border-t-0">
                  <p className="pb-1 text-center text-[11px] font-semibold uppercase">Special note</p>
                  <div className="text-center font-semibold">
                    {show('special_note', model.specialNote, model.specialNote, 'text-center')}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
