// lib/procurement/quotation-extract-core.ts
//
// What the quotation reader asks the AI and how it reads the answer — pure, no I/O.
// quotation-pdf-direct.ts calls the API with this; the reader eval test
// (lib/procurement/__tests__/quotation-reader.eval.test.ts) uses the very same prompt,
// schema and parsing, so what it scores is what the app runs.

import type Anthropic from '@anthropic-ai/sdk';
import { namesAgree } from '@/lib/procurement/item-name-match';

export interface DirectExtractItem {
  id: string;
  item_name: string;
  /** What was asked for beyond the name — "1%, 500 ml". Tells same-named items apart. */
  item_spec?: string | null;
  quantity?: number | null;
  unit_label?: string | null;
  /** Names staff already confirmed as this item, from other quotations ("Whatman No.1"). */
  aka?: string[] | null;
}

/**
 * What one line is to its requested item: the item itself, one PART of a set
 * quoted in pieces (parts add up), or one OPTION among several the vendor offers
 * for the same item (two brands — only the cheapest counts, never the sum).
 */
export type LineRole = 'item' | 'part' | 'option';

export interface DirectExtractedLine {
  rfq_item_id: string | null;
  item_name: string;
  unit_price: number;
  /** The pack/size the price is for, as printed ("100 ml", "500 g"). null = not printed. */
  pack: string | null;
  /** The match to rfq_item_id is a guess a person must confirm. */
  uncertain: boolean;
  role: LineRole;
  /**
   * A second, focused look agreed this line is that item (two independent readings
   * agree) — enough to take a vendor's own name ("Whatman No.1") without asking.
   */
  checked?: boolean;
  /** Why the second look paired them, in a few words ("NaOH is sodium hydroxide"). Shown to the person. */
  reason?: string | null;
  /** The vendor's catalogue / part / model code for this line ("1.06498.0500", "RM-500"). */
  catalog_code?: string | null;
  manufacturer: string | null;
  quality_grade: string | null;
  concentration: string | null;
  other_specs: string | null;
  /** GST rate printed for this line ("5" for 5%). null = not printed. */
  gst_percent: number | null;
  /** HSN/SAC code printed for this line. */
  hsn: string | null;
  /** Quantity printed on this line (parts lists print 1). null = not printed. */
  quantity: number | null;
  /** Amount printed for this line, before GST. null = not printed. */
  line_total: number | null;
  /** Rate before the line discount, when the quotation prints both. */
  list_price: number | null;
  /** Discount % printed on the line. */
  discount_percent: number | null;
}

/** The seller as printed on the quotation letterhead. */
export interface DirectExtractedVendor {
  name: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_person: string | null;
}

/**
 * Same line shape as the ₹0 runner's job result, plus the quotation header.
 * `version: 2` marks results that carry the header — earlier cached reads
 * don't, so the route re-reads rather than reusing them.
 */
export interface DirectExtractResult {
  version: typeof EXTRACT_RESULT_VERSION;
  lines: DirectExtractedLine[];
  unmatched_note: string | null;
  vendor: DirectExtractedVendor | null;
  quote_number: string | null;
  /** YYYY-MM-DD, as printed on the quotation. */
  quote_date: string | null;
  /** YYYY-MM-DD — "valid for 30 days" is turned into a date from the quote date. */
  validity_date: string | null;
  delivery_days: number | null;
  payment_terms: string | null;
  /** Warranty as written ("1 year"), if stated. */
  warranty: string | null;
  /** The grand total printed on the quotation — used to check the lines add up. */
  stated_total: number | null;
  /** S.No of the last item line — a count the reading is checked against. */
  last_serial_no?: number | null;
  /** What the reader changed after the model answered, in words (empty = nothing). Shown to the person. */
  read_notes: string[];
  /** True when that printed total already includes GST. null = not clear. */
  total_includes_gst: boolean | null;
}

// 3: lines carry `uncertain` from a same/similar/none match grade. Readings saved
// at 2 are re-read instead of reused, so an old over-confident match never returns.
// 4: the parts of a set ("Computer" quoted as CPU + RAM + monitor…) are all tagged
// to that item, so a set quote is no longer read as one part.
// 5: lines carry `pack` (what the price is for), and the reader sees each item's
// specification — a 100 ml price is no longer taken for a 500 ml requirement.
// 6: the header also carries quote_date and validity_date, so nobody types them.
// 7: lines carry gst_percent + hsn and the header carries warranty, so the PO
// prints them without anyone typing them again.
// 8: lines carry the printed quantity and line amount, the header the printed total,
// so quotation-math.ts can check the reading adds up instead of trusting it.
// 9: unit_price is the NET rate after the line discount; list_price and discount_percent
// are captured too (a quote printing MRP 299 and net 134.55 was read as 299).
// 10: lines carry `role` — part of a set vs one of several options — so two brands
// offered for one item are no longer added up as if they were a set.
// 11: a second, text-only look settles what the first read left open (vendor names),
// marking lines `checked` with a `reason` — cached v10 reads never had it.
// 12: lines carry `catalog_code`; the second look also places the parts of a set.
// (Items now go to the model as short refs, I1…; the stored result is unchanged.)
export const EXTRACT_RESULT_VERSION = 12;

export const RECORD_TOOL: Anthropic.Tool = {
  name: 'record_quotation',
  description: "Record a vendor quotation: the seller's details, the header terms, and the unit price of each line item.",
  input_schema: {
    type: 'object',
    properties: {
      vendor: {
        type: 'object',
        description:
          'The SELLER who issued this quotation (letterhead/header/footer) — never the buyer, ' +
          'who is the college/institution it is addressed to. Omit fields that are not printed.',
        properties: {
          name: { type: 'string', description: 'Business name of the seller.' },
          gstin: { type: 'string', description: "The seller's 15-character GSTIN, if printed." },
          phone: { type: 'string', description: "The seller's phone/mobile number." },
          email: { type: 'string', description: "The seller's email address." },
          address: { type: 'string', description: "The seller's address, on one line." },
          contact_person: { type: 'string', description: 'Name of the person who signed or is named as contact.' },
        },
      },
      quote_number: { type: 'string', description: 'The quotation/reference number, if printed.' },
      quote_date: {
        type: 'string',
        description: 'Date of the quotation as YYYY-MM-DD, if printed. Omit if not printed.',
      },
      validity_date: {
        type: 'string',
        description:
          'Last date the quoted prices are valid, as YYYY-MM-DD. If it says "valid for N days", add N days to the ' +
          'quotation date. Omit if not stated.',
      },
      delivery_days: {
        type: 'integer',
        description: 'Delivery period in days, if stated (convert weeks to days). Omit if not stated.',
      },
      payment_terms: { type: 'string', description: 'Payment terms as written (e.g. "50% advance"), if stated.' },
      warranty: { type: 'string', description: 'Warranty as written (e.g. "1 year"), if stated. Omit if not stated.' },
      last_serial_no: {
        type: 'integer',
        description: 'The serial number (S.No) of the LAST item line, when the lines are numbered. Omit if not numbered.',
      },
      stated_total: {
        type: 'number',
        description:
          'The grand total printed at the bottom of the quotation, as a plain number. Omit if no total is printed.',
      },
      total_includes_gst: {
        type: 'boolean',
        description: 'true if the printed total already includes GST, false if GST is added on top. Omit if unclear.',
      },
      lines: {
        type: 'array',
        description: 'One entry per line item found on the quotation.',
        items: {
          type: 'object',
          properties: {
            item: {
              type: 'string',
              description:
                'The ref (I1, I2…) of the requested item this line is for, from the provided list. Empty string if it is for none of them.',
            },
            match: {
              type: 'string',
              enum: ['same', 'similar', 'none'],
              description:
                '"same" = clearly the same kind of product as the requested item (a different brand or model of it is fine). ' +
                '"similar" = plausibly it, but you are not sure. "none" = a different kind of product, or no requested item fits. ' +
                'Never pick an item just because it is the only one requested.',
            },
            role: {
              type: 'string',
              enum: ['item', 'part', 'option'],
              description:
                '"item" = this line is the requested item. "part" = one part of a requested SET quoted in pieces ' +
                '(the parts together make the item). "option" = the vendor offers several alternatives for the same ' +
                'requested item (different brands/models/grades) and this is one of them.',
            },
            item_name: {
              type: 'string',
              description: 'The line item name exactly as written on the quotation.',
            },
            unit_price: {
              type: 'number',
              description:
                'The NET unit price payable as a plain number (no currency symbol/commas), for ONE pack as printed: ' +
                'the rate AFTER any discount on the line, BEFORE GST. If the quotation shows a list/MRP rate and a ' +
                'discounted rate, this is the discounted one. If only a line total is shown, divide by the number of ' +
                'packs. Never convert it to the requested pack size.',
            },
            list_price: {
              type: 'number',
              description: 'The rate BEFORE the line discount (list/MRP rate), only when a discount is printed. Omit otherwise.',
            },
            discount_percent: {
              type: 'number',
              description: 'The discount % printed on this line, as a plain number (38 for 38%). Omit if none.',
            },
            pack: {
              type: 'string',
              description:
                'The pack/size ONE unit_price buys, exactly as printed for this line — e.g. "100 ml", "500 g", "2.5 L", "1 Nos". ' +
                'Look in the description, a pack/size column or the unit column. Omit if not printed.',
            },
            manufacturer: {
              type: 'string',
              description: 'Manufacturer/brand offered for this line, if stated on the quotation. Omit if not shown.',
            },
            quality_grade: {
              type: 'string',
              description: 'Quality/grade offered for this line, if stated. Omit if not shown.',
            },
            concentration: {
              type: 'string',
              description: 'Concentration/purity offered for this line (chemical items), if stated. Omit if not shown.',
            },
            gst_percent: {
              type: 'number',
              description:
                'GST rate for this line as a plain number (5 for 5%, 18 for 18%). If one rate is printed for the whole ' +
                'quotation, use it for every line. Omit if no GST rate is printed.',
            },
            hsn: { type: 'string', description: 'HSN/SAC code printed for this line. Omit if not shown.' },
            catalog_code: {
              type: 'string',
              description:
                'The catalogue / product / part / model number printed for this line (e.g. "1.06498.0500", "Cat. No. 4012"), ' +
                'NOT the HSN code. Omit if none.',
            },
            quantity: {
              type: 'number',
              description: 'The quantity printed on this line (a parts list usually prints 1). Omit if not printed.',
            },
            line_total: {
              type: 'number',
              description:
                'The amount for this line (net rate × quantity), after any discount and BEFORE GST, as a plain number. ' +
                'If the quotation also prints a final per-line total that includes GST, do NOT use that one here. Omit if not printed.',
            },
            other_specs: {
              type: 'string',
              description:
                'Any other product-specific detail printed for this line that does not fit the fields above. Omit if none.',
            },
          },
          required: ['item', 'match', 'item_name', 'unit_price'],
        },
      },
    },
    required: ['lines'],
  },
};

// Small models sometimes fill an absent field with a placeholder instead of
// omitting it. Those must read as "not printed", never land in a form.
const PLACEHOLDER = /^(<?\s*(unknown|n\/?a|na|none|null|nil|not (stated|specified|mentioned|available|provided|shown))\s*>?|-+|—|\?+)$/i;

/** A real YYYY-MM-DD date, or null — never pass a misread date on to the database. */
const isoDate = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

const asSpec = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && !PLACEHOLDER.test(s) ? s : null;
};

/** A GST rate as printed (0–28), or null — "5%" and 5 both read as 5. */
const gstRate = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace('%', '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 28 ? n : null;
};


/**
 * A quotation that prints a list rate, a discount and an amount after discount (qty × list rate
 * less the discount) must be priced at amount ÷ quantity — the model sometimes returns the list
 * rate. Fixed here, never silently: the lines changed come back as a note for the person.
 */
export function correctDiscountedPrices(lines: DirectExtractedLine[]): string[] {
  let n = 0;
  for (const l of lines) {
    const qty = l.quantity;
    const amount = l.line_total;
    if (!qty || !amount) continue;
    const net = Math.round((amount / qty) * 100) / 100;
    const gross = l.unit_price * qty;
    // The read rate × qty is more than the amount printed: a discount sits between them.
    if (!(gross - amount > Math.max(2, gross * 0.005))) continue;
    // An amount that is the rate plus GST is the same price, not a discount.
    if (Math.abs(gross * (1 + (l.gst_percent ?? 0) / 100) - amount) <= Math.max(2, amount * 0.005)) continue;
    // A plausible discount (3%–60%), and the printed discount % when there is one must agree.
    const ratio = net / l.unit_price;
    if (ratio < 0.4 || ratio > 0.97) continue;
    if (l.discount_percent != null && Math.abs(ratio - (1 - l.discount_percent / 100)) > 0.01) continue;
    // The rate the quotation printed IS the list rate; any list price the model made up is dropped.
    l.list_price = l.unit_price;
    l.unit_price = net;
    n++;
  }
  return n ? [`${n} price${n === 1 ? '' : 's'} taken as the amount after discount ÷ quantity, not the list rate`] : [];
}

/**
 * Requested items go to the model as short refs ("I7"), not their uuids. Reading time
 * is almost all output, and a matched line used to repeat a 36-character id — about a
 * quarter of every answer. The refs are mapped back here; a real id is still accepted
 * (older cached reads, the office runner).
 */
export const itemRef = (n: number) => `I${n + 1}`;

export function idFromRef(items: DirectExtractItem[], raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const m = /^I(\d+)$/i.exec(v);
  if (m) return items[Number(m[1]) - 1]?.id ?? null;
  return items.some((i) => i.id === v) ? v : null;
}

/** The instruction sent with the PDF, ending with the requested items. */
export function buildExtractPrompt(items: DirectExtractItem[]): string {
  // The specification and quantity go with the name: "Sodium Hydroxide — 10%, 500 g"
  // and "Sodium Hydroxide — 10%, 500 ml" are two different requests.
  const itemList = items
    .map((i, n) => {
      const qty = i.quantity ? `qty ${i.quantity}${i.unit_label ? ` ${i.unit_label}` : ''}` : '';
      const aka = i.aka?.length ? `also called: ${i.aka.slice(0, 5).join('; ')}` : '';
      return [itemRef(n), i.item_name, i.item_spec?.trim() || '', qty, aka].filter(Boolean).join(' — ');
    })
    .join('\n');

  return (
                "Record this vendor quotation: the seller's details, quotation number, delivery period " +
                'and payment terms from the header, and each line item with its UNIT price. ' +
                'For each line, decide which requested item it is FOR, by meaning (spelling and brand may differ): ' +
                'it must be the same kind of product — a PoE injector is not a keyboard, a switch is not a camera. ' +
                'Grade it: match "same", "similar" (unsure) or "none". When it is "none", set item to "". ' +
                'A quotation often lists things nobody asked for; leave those unmatched rather than forcing a fit. ' +
                'Exception — sets: when a requested item is a complete set (e.g. a computer or desktop, or a pair such as ' +
                '"Fehling\'s solution A & B" quoted as solution 1 and solution 2) and the ' +
                'quotation prices it as its parts (processor, motherboard, RAM, SSD, monitor, keyboard, mouse, cabinet…), ' +
                'give EVERY part line that requested item\'s id with match "similar" and role "part"; one item may then have many lines. ' +
                'When the vendor instead offers two or more ALTERNATIVES for one requested item (e.g. two brands), give ' +
                'each the same id with role "option" — they are choices, not parts. Otherwise role is "item". ' +
                'Vendors use their own names: a brand or trade name for the requested product is still a "same" match ' +
                '(e.g. "Whatman No.1" is filter paper). Some requested items list names team members already confirmed ("also called"). ' +
                'Give each part its own UNIT price, as quoted. ' +
                'Return unit_price as a plain number, for the pack printed on that line, and record that pack. ' +
                "Use each requested item's specification to tell apart items with the same name (a 500 g solid " +
                'vs a 500 ml solution); never adjust a price to the requested size yourself. ' +
                "Also capture each line's GST rate and HSN code, and the warranty from the header, when printed. " +
                "Copy the numbers exactly as printed: each line's quantity and amount, and the grand total at the bottom. " +
                'A discount, round-off or "final rate" line is not a product: leave it out of the lines, and still copy the printed grand total. ' +
                'When a line shows a list/MRP rate and a discount, unit_price is the DISCOUNTED rate (the price actually paid per unit), never the list rate. ' +
                'Also capture manufacturer, quality_grade, ' +
                'concentration, and other_specs when the quotation states them for that line — ' +
                'leave them out when not shown, do not guess.' +
                '\n\nRequested items (ref — name — specification — quantity):\n' +
                itemList
  );
}

/** Turn the model's `record_quotation` input into a clean result. Never trusts an id it was not given. */
export function normalizeExtraction(rawInput: unknown, items: DirectExtractItem[]): DirectExtractResult {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  // Small models sometimes hand the array back as a JSON string.
  let rawLines: unknown = input.lines;
  if (typeof rawLines === 'string') {
    try {
      rawLines = JSON.parse(rawLines);
    } catch {
      rawLines = null;
    }
  }
  const rows = Array.isArray(rawLines) ? (rawLines as Array<Record<string, unknown>>) : [];

  // Never trust an id the model invents: only refs/ids we actually sent map to an item.
  const lines: DirectExtractedLine[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const price = Number(row?.unit_price);
    if (!(price > 0)) continue;
    const name = String(row?.item_name ?? '').trim();
    const idRaw = idFromRef(items, row?.item ?? row?.rfq_item_id);
    const grade = String(row?.match ?? '').trim();
    const id = idRaw && grade !== 'none' ? idRaw : null;
    if (!id && name) unmatched.push(name);
    const requested = id ? items.find((i) => i.id === id)?.item_name ?? '' : '';
    const roleRaw = String(row?.role ?? '').trim();
    const role: LineRole = roleRaw === 'part' || roleRaw === 'option' ? roleRaw : 'item';
    lines.push({
      rfq_item_id: id,
      item_name: name,
      unit_price: price,
      pack: asSpec(row?.pack),
      // A person confirms anything the model was unsure of, and anything whose
      // name shares no word with what was asked for — whatever the model said.
      // Sure only when the model said "same" AND the vendor's name carries every key word
      // of the requested one: "Cupric sulphate" for "Magnesium sulphate" shares a word but
      // is not sure. Such lines go to the second look, which knows Copper = Cupric.
      uncertain: !!id && (grade !== 'same' || !namesAgree(requested, name)),
      role,
      manufacturer: asSpec(row?.manufacturer),
      quality_grade: asSpec(row?.quality_grade),
      concentration: asSpec(row?.concentration),
      other_specs: asSpec(row?.other_specs),
      gst_percent: gstRate(row?.gst_percent),
      hsn: asSpec(row?.hsn),
      catalog_code: asSpec(row?.catalog_code)?.slice(0, 60) ?? null,
      quantity: Number(row?.quantity) > 0 ? Number(row?.quantity) : null,
      line_total: Number(row?.line_total) > 0 ? Number(row?.line_total) : null,
      list_price: Number(row?.list_price) > 0 ? Number(row?.list_price) : null,
      discount_percent: Number(row?.discount_percent) > 0 && Number(row?.discount_percent) < 100 ? Number(row?.discount_percent) : null,
    });
  }

  const read_notes = correctDiscountedPrices(lines);

  const v = (input.vendor ?? {}) as Record<string, unknown>;
  const vendor: DirectExtractedVendor = {
    name: asSpec(v.name),
    gstin: asSpec(v.gstin),
    phone: asSpec(v.phone),
    email: asSpec(v.email),
    address: asSpec(v.address),
    contact_person: asSpec(v.contact_person),
  };
  const days = Number(input.delivery_days);

  return {
    version: EXTRACT_RESULT_VERSION,
    vendor: Object.values(vendor).some(Boolean) ? vendor : null,
    quote_number: asSpec(input.quote_number),
    quote_date: isoDate(input.quote_date),
    validity_date: isoDate(input.validity_date),
    delivery_days: Number.isInteger(days) && days > 0 ? days : null,
    payment_terms: asSpec(input.payment_terms),
    warranty: asSpec(input.warranty),
    stated_total: Number(input.stated_total) > 0 ? Number(input.stated_total) : null,
    last_serial_no: Number.isInteger(Number(input.last_serial_no)) && Number(input.last_serial_no) > 0 ? Number(input.last_serial_no) : null,
    read_notes,
    total_includes_gst: typeof input.total_includes_gst === 'boolean' ? input.total_includes_gst : null,
    lines,
    unmatched_note: unmatched.length
      ? `Not matched to any requested item: ${unmatched.join(', ')}`
      : null,
  };
}

// ── Second look ──────────────────────────────────────────────────────────────
// The first read does everything at once (seller, terms, every price, every match),
// so its matching is the weakest part — vendors use their own names. A second,
// text-only call looks at nothing but what is still open: requested items without
// a sure match, and vendor lines without a sure item. Cheap (no PDF, a few hundred
// tokens) and only made when something is open.

export const SECOND_LOOK_TOOL: Anthropic.Tool = {
  name: 'pair_lines',
  description: 'Say which vendor line is which requested item.',
  input_schema: {
    type: 'object',
    properties: {
      pairs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            line: { type: 'integer', description: 'The vendor line number (L#).' },
            item: { type: 'string', description: 'The requested item ref (I#), or "" when the line is none of them.' },
            verdict: {
              type: 'string',
              enum: ['same', 'part', 'not'],
              description:
                '"same" only when you are sure it is the same product. "part" when the requested item is a complete ' +
                'set (a computer, a microscope kit…) and this line is one of its parts. Otherwise "not".',
            },
            reason: { type: 'string', description: 'Why, in under 12 words (e.g. "NaOH is sodium hydroxide").' },
          },
          required: ['line', 'item', 'verdict', 'reason'],
        },
      },
    },
    required: ['pairs'],
  },
};

/** What is still open after the first read: unsure/unmatched lines, items without a sure line. */
export function openForSecondLook(result: DirectExtractResult, items: DirectExtractItem[]) {
  const sureItems = new Set(result.lines.filter((l) => l.rfq_item_id && !l.uncertain).map((l) => l.rfq_item_id));
  const openItems = items.map((i, n) => ({ ...i, ref: itemRef(n) })).filter((i) => !sureItems.has(i.id));
  const openLines = result.lines
    .map((l, n) => ({ l, n }))
    // Lines already tagged as parts of a set stay as they are; untagged lines are always looked at.
    .filter(({ l }) => !l.rfq_item_id || (l.uncertain && l.role !== 'part'));
  return { openItems, openLines };
}

export function buildSecondLookPrompt(
  openItems: Array<DirectExtractItem & { ref: string }>,
  openLines: Array<{ l: DirectExtractedLine; n: number }>,
): string {
  const itemList = openItems
    .map((i) => [i.ref, i.item_name, i.item_spec?.trim() || '', i.aka?.length ? `also called: ${i.aka.join('; ')}` : '']
      .filter(Boolean)
      .join(' — '))
    .join('\n');
  const lineList = openLines
    .map(({ l, n }) => `L${n}: ${[l.item_name, l.pack, l.manufacturer, l.catalog_code ? `cat. ${l.catalog_code}` : null, l.concentration, l.other_specs].filter(Boolean).join(' · ')}`)
    .join('\n');
  return (
    'You are the purchase officer of an Indian college checking a vendor quotation against the requisition. ' +
    'Vendors write items their own way: brand and trade names (Whatman No.1 = filter paper, Borosil = glassware), ' +
    'chemical formulas and synonyms (NaOH = sodium hydroxide, caustic soda; IPA = isopropyl alcohol), abbreviations, ' +
    'grades (AR, LR, GR) and catalogue codes. Use that knowledge.\n' +
    'For each vendor line below, say which requested item it is. A different pack size, brand, grade or strength ' +
    '(5N for 6N, 40% for 0.2%) of the same substance is still "same" — strength and pack are checked separately. ' +
    'Spelling slips count as the same name (Molish = Molisch). A related but different product (sodium chloride for sodium hydroxide, a cable for a ' +
    'switch) is "not". When a requested item is a complete set (a computer, a desktop, a kit) and the vendor priced it ' +
    'in parts (processor, RAM, monitor, keyboard, cabinet…), every such part line is "part" of that item. ' +
    'If you are unsure, answer "not" — a person will look.\n\n' +
    `Requested items (ref — name — specification):\n${itemList}\n\nVendor lines:\n${lineList}`
  );
}

/**
 * Fold the second look into the reading. A line both readings put on the same item
 * becomes `checked`; a line the second look places (the first had none) becomes a
 * match still to confirm, with the reason shown. It only ever adds: a "not" leaves the
 * first read's guess for a person. Never trusts an id or line number it was not given.
 */
export function applySecondLook(
  result: DirectExtractResult,
  items: DirectExtractItem[],
  openLines: Array<{ l: DirectExtractedLine; n: number }>,
  rawInput: unknown,
): void {
  const openNs = new Set(openLines.map((o) => o.n));
  const pairs = Array.isArray((rawInput as { pairs?: unknown })?.pairs)
    ? ((rawInput as { pairs: Array<Record<string, unknown>> }).pairs)
    : [];
  for (const p of pairs) {
    const n = Number(p.line);
    if (!Number.isInteger(n) || !openNs.has(n)) continue;
    const line = result.lines[n];
    const id = idFromRef(items, p.item) ?? '';
    const reason = asSpec(p.reason)?.slice(0, 120) ?? null;
    if (p.verdict === 'part' && id) {
      // One part of a requested set: the parts add up, and a person looks at a set once anyway.
      line.rfq_item_id = id;
      line.role = 'part';
      line.uncertain = true;
      line.reason = reason;
      continue;
    }
    // A "not" never removes the first read's guess: the guess stays for a person to
    // confirm in one click (the second look says "not" whenever it is unsure).
    if (p.verdict !== 'same' || !id) continue;
    if (line.rfq_item_id === id) {
      line.checked = true; // two readings agree
    } else {
      line.rfq_item_id = id;
      line.uncertain = true;
    }
    line.reason = reason;
  }
}

