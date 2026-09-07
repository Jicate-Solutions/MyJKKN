// lib/id-cards/render-card.tsx
// Phase 2 — the ID-card compositor (JSX for next/og ImageResponse).
//
// Card canvas: 1014x638 px = CR80 landscape at 300dpi.
//
// Two render paths:
//   1. DEFAULT design — used when id_card_templates.front_layout_json is empty
//      (the prod reality today): #0b6d41 header band with JKKN + institution
//      name, white body, photo left, name/roll/course lines, valid-until
//      bottom-left, QR bottom-right.
//   2. CUSTOM layout — when front_layout_json carries recognizable content:
//      optional background/header overrides and absolutely-positioned
//      `elements` resolved through field_mappings (card_field -> db_column).
//      Unrecognizable JSON falls back to the default design — a malformed
//      template must never break rendering.
//
// Satori (the engine behind ImageResponse) requires display:flex on every
// element with more than one child; everything below honors that. All images
// are pre-fetched data URLs, so the compositor itself does no network I/O.
//
// ── PORTRAIT MODE (dark, template-opt-in — 2026-07-25) ───────────────────────
// front_layout_json.orientation: 'portrait' | 'portrait-flipped' composes the
// card as a PORTRAIT-READING layout (638x1014 logical) and rotates it — as ONE
// wrapper container, no per-element rotation — into the unchanged 1014x638
// output canvas. BRIDGE CONTRACT IS AN INVARIANT: the delivered PNG stays
// exactly 1014x638 landscape; the Windows print bridge rotates it 90° at print
// time exactly as it does today.
//
// ⚠️ ROTATION DIRECTION IS EMPIRICALLY UNKNOWN. The bridge's 90° direction
// cannot be tested without burning a ribbon panel, so BOTH directions ship:
//   'portrait'         → composition rotated +90° (clockwise): the portrait
//                        TOP edge lands on the canvas RIGHT edge. Reads
//                        upright if the bridge rotates counter-clockwise.
//   'portrait-flipped' → composition rotated −90° (counter-clockwise): the
//                        portrait TOP edge lands on the canvas LEFT edge.
//                        Reads upright if the bridge rotates clockwise.
// ONE physical verification print settles which is correct — flip the
// template's orientation value if the first print comes out upside-down.
//
// Rotation mechanics: sharp is not available and no output-bitmap rotation
// exists here — the rotation happens INSIDE the JSX via CSS transform, which
// satori supports. The portrait box is absolutely positioned so its center
// coincides with the landscape canvas center, then rotated ±90° about its own
// center (satori's default transform-origin is the element center), which
// makes the 638x1014 box exactly fill the 1014x638 canvas.
//
// Absent / any other orientation value → the landscape path runs completely
// unchanged (zero risk to existing templates).

import type { ReactElement } from 'react';
import {
  CARD_FIELDS,
  BACK_CARD_FIELDS,
  resolveMappedValue,
  initialsFromName,
  truncateForCard,
  svgCoverImageDataUrl,
  type CardField,
  type BackCardField,
  type CardPersonData,
  type FieldMapping
} from '@/lib/id-cards/render-data';
import { fitText } from '@/lib/id-cards/text-fit';
import { artworkPlacement, imageDimensionsFromDataUrl } from '@/lib/id-cards/render-data';
import type { TemplateInstitutionData } from '@/lib/id-cards/render-data';

export const CARD_WIDTH = 1014;
export const CARD_HEIGHT = 638;

// Portrait logical canvas — the landscape canvas turned on its side. The
// OUTPUT canvas is always CARD_WIDTH x CARD_HEIGHT (bridge invariant).
export const PORTRAIT_WIDTH = CARD_HEIGHT; // 638
export const PORTRAIT_HEIGHT = CARD_WIDTH; // 1014

// ── Responsive text (2026-09-05) ─────────────────────────────────────────────
// Every VALUE the card draws is sized by fitText: start at the field's ideal
// size, shrink only as far as its box demands, wrap where the box has height,
// and elide only when even the readability floor cannot hold the text.
// Static labels authored in a template keep their designed size verbatim.
const VALUE_LINE_HEIGHT = 1.15;
/** Readability floor for any value on the card (300 dpi canvas px = ~6.5 pt). */
const VALUE_MIN_FONT = 17;
const ADDRESS_MIN_FONT = 16;
/** Ideal sizes for template-placed VALUE elements when the author set a smaller one. */
const PREFERRED_VALUE_FONT: Record<string, number> = {
  name_line_1: 32,
  roll_number: 26,
  course: 26,
  department: 26,
  study_period: 26,
  staff_id: 26,
  valid_until: 22,
  blood_group: 34,
  date_of_birth: 27,
  guardian: 24,
  address: 24,
  contact_phone: 27,
  institution_email: 20,
  institution_phone: 20,
  institution_address: 20,
  institution_website: 20
};
/** Fields that read as key identity data — bold unless the template says otherwise. */
const BOLD_VALUE_FIELDS = new Set([
  'name_line_1',
  'roll_number',
  'course',
  'department',
  'study_period',
  'staff_id',
  'blood_group',
  'date_of_birth',
  'guardian',
  'address',
  'contact_phone',
  'valid_until',
  'institution_email',
  'institution_phone',
  'institution_address',
  'institution_website'
]);
/** How many lines a value may wrap onto inside a template box. */
function maxLinesFor(field: string): number {
  if (field === 'address' || field === 'institution_address') return 8;
  if (field === 'name_line_1' || field === 'course' || field === 'department' || field === 'guardian') return 3;
  return 2;
}

type BoxLike = { field: string; x: number; y: number; width?: number; height?: number };

/**
 * The room a template element really has: its own width/height when authored,
 * otherwise the space to the canvas edge horizontally and to the NEXT element
 * below it (overlapping horizontally) vertically — so a value can grow or wrap
 * without ever running into the field beneath.
 */
function elementBox(
  element: BoxLike,
  all: readonly BoxLike[],
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } {
  const width = element.width ?? Math.max(40, canvasWidth - element.x - 24);
  if (element.height !== undefined) return { width, height: element.height };
  const left = element.x;
  const right = element.x + width;
  let nextY = canvasHeight - 12;
  for (const other of all) {
    if (other === element || other.y <= element.y) continue;
    const oLeft = other.x;
    const oRight = other.x + (other.width ?? Math.max(40, canvasWidth - other.x - 24));
    const overlaps = oLeft < right && oRight > left;
    if (overlaps && other.y < nextY) nextY = other.y;
  }
  return { width, height: Math.max(20, nextY - element.y - 4) };
}

/**
 * CSS object-fit for card ARTWORK drawn with a plain <img>: 'fill' when the
 * bitmap is within 3% of the canvas ratio (imperceptible), else 'contain' so
 * the design — frame included — is never cropped. Mirrors artworkPlacement.
 */
function artworkObjectFit(dataUrl: string, boxW: number, boxH: number): 'fill' | 'contain' {
  const dims = imageDimensionsFromDataUrl(dataUrl);
  if (!dims) return 'fill';
  const p = artworkPlacement(boxW, boxH, dims.width, dims.height);
  return p && p.left === 0 && p.top === 0 && p.width === boxW && p.height === boxH ? 'fill' : 'contain';
}

/** Style + text for a template-placed value element, sized to its box. */
function fitElementText(
  element: BoxLike & { font_size?: number; font_weight?: number },
  value: string,
  all: readonly BoxLike[],
  canvasWidth: number,
  canvasHeight: number
): { text: string; fontSize: number; fontWeight: number; width: number; lines: number } {
  const box = elementBox(element, all, canvasWidth, canvasHeight);
  const preferred = Math.max(element.font_size ?? 26, PREFERRED_VALUE_FONT[element.field] ?? 26);
  const fontWeight = element.font_weight ?? (BOLD_VALUE_FIELDS.has(element.field) ? 700 : 400);
  const isAddress = element.field === 'address' || element.field === 'institution_address';
  const fit = fitText(value, {
    maxWidth: box.width,
    maxHeight: box.height,
    maxFontSize: preferred,
    minFontSize: Math.min(preferred, isAddress ? ADDRESS_MIN_FONT : VALUE_MIN_FONT),
    maxLines: maxLinesFor(element.field),
    lineHeight: VALUE_LINE_HEIGHT,
    bold: fontWeight >= 600,
    preserveTail: isAddress
  });
  return { text: fit.text, fontSize: fit.fontSize, fontWeight, width: box.width, lines: fit.lines };
}

/** Template-opt-in portrait orientations; absent/anything-else = landscape. */
export type CardOrientation = 'portrait' | 'portrait-flipped';

const BRAND_GREEN = '#0b6d41';
// Name color on the institution's portrait card design (red, bold, caps).
const PORTRAIT_NAME_RED = '#c8102e';

type LayoutElementOf<F extends string> = {
  field: F | 'static_text';
  text?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  font_size?: number;
  font_weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
};

export type FrontLayoutElement = LayoutElementOf<CardField>;
export type BackLayoutElement = LayoutElementOf<BackCardField>;

export type FrontLayout = {
  /**
   * 'portrait' / 'portrait-flipped' → portrait-reading composition rotated
   * into the landscape output canvas (see the header note — the two values
   * differ only in rotation direction). Absent → landscape (all prod today).
   */
  orientation?: CardOrientation;
  background_color?: string;
  /**
   * Full-bleed card artwork URL (designed externally, e.g. Canva, 1014x638).
   * The ROUTE validates the URL against the id-card-assets bucket allowlist
   * and pre-fetches it to a data URL — the compositor only ever sees
   * CardRenderInput.backgroundDataUrl. When artwork is present the default
   * header band is suppressed (the artwork IS the design).
   */
  background_image?: string;
  header?: {
    show?: boolean;
    text?: string;
    background_color?: string;
    text_color?: string;
  };
  elements?: FrontLayoutElement[];
  /** Institution block maintained in the template by the ID-card in-charge. */
  institution?: TemplateInstitutionData;
};

export type CardRenderInput = {
  person: CardPersonData;
  /** Pre-fetched photo as a data URL, or null → initials placeholder. */
  photoDataUrl: string | null;
  /** Pre-generated QR as a data URL, or null → QR omitted. */
  qrDataUrl: string | null;
  /** Pre-fetched card artwork as a data URL, or null → no background layer. */
  backgroundDataUrl: string | null;
  /** Pre-fetched institution logo (template block → institutions.logo_url). */
  institutionLogoDataUrl?: string | null;
  /** Pre-fetched principal signature from the template block. */
  signatureDataUrl?: string | null;
  layout: FrontLayout | null;
  mappings: FieldMapping[];
  validUntilLabel: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Layout parsing (defensive — unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/** Only plain hex colors pass through — anything else could throw inside satori. */
function safeColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
    ? value.trim()
    : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Shared defensive parser for a layout's `elements` array. Identical rules
 * for front and back — only the allowed-field alphabet differs. `bounds`
 * carries the logical canvas the elements are clamped into: landscape
 * (default, and always for the back) or portrait when the front layout has
 * opted into portrait orientation.
 */
function parseElements<F extends string>(
  raw: unknown,
  allowedFields: readonly F[],
  bounds?: { maxX: number; maxY: number }
): LayoutElementOf<F>[] {
  const maxX = bounds?.maxX ?? CARD_WIDTH;
  const maxY = bounds?.maxY ?? CARD_HEIGHT;
  if (!Array.isArray(raw)) return [];
  const elements: LayoutElementOf<F>[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const el = entry as Record<string, unknown>;
    const field = el.field;
    if (typeof field !== 'string') continue;
    if (field !== 'static_text' && !(allowedFields as readonly string[]).includes(field)) {
      continue;
    }
    const x = Number(el.x);
    const y = Number(el.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const parsed: LayoutElementOf<F> = {
      field: field as LayoutElementOf<F>['field'],
      x: clamp(Math.round(x), 0, maxX),
      y: clamp(Math.round(y), 0, maxY)
    };
    if (typeof el.text === 'string') parsed.text = el.text;
    const width = Number(el.width);
    if (Number.isFinite(width) && width > 0) {
      parsed.width = clamp(Math.round(width), 1, maxX);
    }
    const height = Number(el.height);
    if (Number.isFinite(height) && height > 0) {
      parsed.height = clamp(Math.round(height), 1, maxY);
    }
    const fontSize = Number(el.font_size);
    if (Number.isFinite(fontSize)) parsed.font_size = clamp(Math.round(fontSize), 8, 120);
    const fontWeight = Number(el.font_weight);
    if ([400, 500, 600, 700, 800].includes(fontWeight)) parsed.font_weight = fontWeight;
    const color = safeColor(el.color);
    if (color) parsed.color = color;
    if (el.align === 'left' || el.align === 'center' || el.align === 'right') {
      parsed.align = el.align;
    }
    elements.push(parsed);
  }
  return elements;
}

/**
 * Parse id_card_templates.front_layout_json. Returns null when there is no
 * recognizable content (e.g. the `{}` in prod today) → caller renders the
 * default design.
 */
const INSTITUTION_TEXT_KEYS = [
  'name',
  'header_text',
  'email',
  'phone',
  'website',
  'address',
  'principal_name',
  'principal_designation'
] as const;
const INSTITUTION_IMAGE_KEYS = ['logo_image', 'principal_signature_image'] as const;

/** Defensive parse of front_layout_json.institution (unit-tested). */
export function parseTemplateInstitution(
  raw: Record<string, unknown>
): TemplateInstitutionData | null {
  const out: TemplateInstitutionData = {};
  for (const key of INSTITUTION_TEXT_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim().slice(0, 300);
  }
  for (const key of INSTITUTION_IMAGE_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim())) out[key] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function parseFrontLayout(raw: unknown): FrontLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const layout: FrontLayout = {};

  // Exact lowercase strings only — 'landscape', casing variants and junk all
  // mean "not portrait" so existing templates cannot accidentally opt in.
  if (obj.orientation === 'portrait' || obj.orientation === 'portrait-flipped') {
    layout.orientation = obj.orientation;
  }

  const bg = safeColor(obj.background_color);
  if (bg) layout.background_color = bg;

  // URL shape only — the route enforces the id-card-assets allowlist before
  // any fetch happens (parse stays pure and unit-testable).
  if (
    typeof obj.background_image === 'string' &&
    /^https:\/\/\S+$/i.test(obj.background_image.trim())
  ) {
    layout.background_image = obj.background_image.trim();
  }

  if (obj.header && typeof obj.header === 'object' && !Array.isArray(obj.header)) {
    const h = obj.header as Record<string, unknown>;
    const header: NonNullable<FrontLayout['header']> = {};
    if (typeof h.show === 'boolean') header.show = h.show;
    if (typeof h.text === 'string' && h.text.trim() !== '') header.text = h.text.trim();
    const hBg = safeColor(h.background_color);
    if (hBg) header.background_color = hBg;
    const hColor = safeColor(h.text_color);
    if (hColor) header.text_color = hColor;
    if (Object.keys(header).length > 0) layout.header = header;
  }

  // Institution block — plain strings; image values must be https URLs (the
  // route enforces the id-card-assets allowlist before fetching).
  if (obj.institution && typeof obj.institution === 'object' && !Array.isArray(obj.institution)) {
    const inst = parseTemplateInstitution(obj.institution as Record<string, unknown>);
    if (inst) layout.institution = inst;
  }

  // Portrait layouts position elements in PORTRAIT coordinates.
  const elements = parseElements(
    obj.elements,
    CARD_FIELDS,
    layout.orientation !== undefined
      ? { maxX: PORTRAIT_WIDTH, maxY: PORTRAIT_HEIGHT }
      : undefined
  );
  if (elements.length > 0) layout.elements = elements;

  if (layout.institution) return layout;
  const hasContent =
    layout.orientation !== undefined ||
    layout.background_color !== undefined ||
    layout.background_image !== undefined ||
    layout.header !== undefined ||
    (layout.elements?.length ?? 0) > 0;
  return hasContent ? layout : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Back layout (id_card_templates.back_layout_json) — DARK feature
// ─────────────────────────────────────────────────────────────────────────────
//
// Schema (every key optional; unknown keys ignored):
//   {
//     "background_color": "#ffffff",       // hex only (safeColor)
//     "background_image": "https://…",     // URL shape here; the ROUTE enforces
//                                          //   the id-card-assets bucket allowlist
//     "show_blood_group": true,            // default-back blocks, all default TRUE
//     "show_dob": true,
//     "show_guardian": true,
//     "show_address": true,
//     "show_barcode": true,                // Code 39 of roll number / staff id
//     "show_contact": true,                // the person's own phone line
//     "footer_text": "TAMIL NADU, INDIA",  // bottom green band text override
//     "elements": [ … ]                    // same element schema as the front,
//                                          //   alphabet = BACK_CARD_FIELDS
//                                          //   (+ 'static_text'); on the back
//                                          //   elements OVERLAY the default
//                                          //   design (they do not replace it) —
//                                          //   this is how a template supplies
//                                          //   its institution's contact/email/
//                                          //   website lines without the code
//                                          //   hardcoding any institution.
//   }
//
// Gating semantics (differs from the front on purpose):
//   back_layout_json NULL  → back side NOT CONFIGURED (route 404s) — the DARK
//                            default for every template in prod today.
//   back_layout_json {}    → back side enabled with the default design.
// parseBackLayout therefore returns a layout for ANY object (even {}), and
// null only for non-object junk.

export type BackLayout = {
  /**
   * Mirrors front_layout_json.orientation. A portrait FRONT must have a
   * portrait BACK or the two faces print at 90° to each other on the same
   * piece of plastic. Absent → landscape, as every prod back is today.
   */
  orientation?: CardOrientation;
  background_color?: string;
  background_image?: string;
  show_blood_group?: boolean;
  show_dob?: boolean;
  show_guardian?: boolean;
  show_address?: boolean;
  show_barcode?: boolean;
  show_contact?: boolean;
  /** Institution PH/email/website block on the default back (from `institutions`). */
  show_institution_contact?: boolean;
  /**
   * Field headings (BLOOD GROUP / DATE OF BIRTH / ADDRESS / CONTACT / GUARDIAN).
   * Default FALSE (2026-09-05): backs show values only — the artwork carries icons
   * for each row, so headings only crowd the space. Set true to print them.
   */
  show_field_labels?: boolean;
  /**
   * Icon mode (2026-09-05): the back artwork draws an icon per row where the
   * heading used to be. With headings hidden, every text element moves RIGHT by
   * this many px so it sits beside the icon, and a value that was authored
   * under its heading re-anchors onto the heading's row (beside the icon)
   * instead of below it. Default 80 when headings are hidden AND artwork is
   * present; 0 otherwise. Set explicitly to tune or disable (0).
   */
  icon_gutter?: number;
  footer_text?: string;
  elements?: BackLayoutElement[];
};

const BACK_BOOLEAN_KEYS = [
  'show_blood_group',
  'show_dob',
  'show_guardian',
  'show_address',
  'show_barcode',
  'show_contact',
  'show_institution_contact',
  'show_field_labels'
] as const;

/**
 * Parse id_card_templates.back_layout_json. Defensive like parseFrontLayout,
 * but `{}` is a VALID enabled layout (defaults), not "no content" — see the
 * gating-semantics note above. Returns null only for non-object input.
 */
export function parseBackLayout(raw: unknown): BackLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const layout: BackLayout = {};

  if (obj.orientation === 'portrait' || obj.orientation === 'portrait-flipped') {
    layout.orientation = obj.orientation;
  }

  const bg = safeColor(obj.background_color);
  if (bg) layout.background_color = bg;

  if (
    typeof obj.background_image === 'string' &&
    /^https:\/\/\S+$/i.test(obj.background_image.trim())
  ) {
    layout.background_image = obj.background_image.trim();
  }

  for (const key of BACK_BOOLEAN_KEYS) {
    if (typeof obj[key] === 'boolean') layout[key] = obj[key] as boolean;
  }

  if (typeof obj.footer_text === 'string' && obj.footer_text.trim() !== '') {
    layout.footer_text = obj.footer_text.trim();
  }
  const gutter = Number(obj.icon_gutter);
  if (Number.isFinite(gutter)) layout.icon_gutter = clamp(Math.round(gutter), 0, 400);

  // Portrait backs carry portrait coordinates, so they must clamp to the
  // portrait canvas — clamping them to 1014x638 would squash anything below
  // y=638 onto the edge.
  const elements = parseElements(
    obj.elements,
    BACK_CARD_FIELDS,
    layout.orientation
      ? { maxX: PORTRAIT_WIDTH, maxY: PORTRAIT_HEIGHT }
      : undefined
  );
  if (elements.length > 0) layout.elements = elements;

  return layout;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fragments
// ─────────────────────────────────────────────────────────────────────────────

function photoBox(
  photoDataUrl: string | null,
  fullName: string,
  width: number,
  height: number
): ReactElement {
  if (photoDataUrl) {
    return (
      <img
        src={photoDataUrl}
        alt=""
        width={width}
        height={height}
        style={{ objectFit: 'cover', width, height }}
      />
    );
  }
  // Locally-drawn initials placeholder — no image bytes required.
  return (
    <div
      style={{
        display: 'flex',
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e7f1ec'
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: Math.round(width * 0.36),
          fontWeight: 700,
          color: BRAND_GREEN
        }}
      >
        {initialsFromName(fullName)}
      </div>
    </div>
  );
}

/**
 * ROTATION-SAFE cover image (2026-07-25): satori mispaints bitmaps inside a
 * transformed (rotated) subtree whenever any crop machinery is involved —
 * objectFit:'cover' lands the bitmap at a wrong offset/scale (isolated by
 * Lane H), and an overflow-clipped absolutely-positioned <img> mispaints too
 * (verified locally while building this fix). The ONE image shape proven
 * good under the rotation is the QR's: a plain in-flow <img> at its exact
 * natural size with no cropping at the satori level. So the cover-crop
 * happens INSIDE an SVG-wrapper data URL (the SVG viewport cuts the
 * overflow; resvg rasterizes nested data-URL images — that is how every
 * card bitmap already renders), and satori only ever sees an exact-size
 * plain <img>. Used for EVERY bitmap inside the rotated portrait wrapper;
 * landscape paths keep objectFit unchanged (proven fine without an ancestor
 * transform).
 */
function rotationSafeCoverImg(
  dataUrl: string,
  boxW: number,
  boxH: number,
  cornerRadius: number = 0,
  mode: 'cover' | 'artwork' = 'cover'
): ReactElement {
  const cropped = svgCoverImageDataUrl(dataUrl, boxW, boxH, cornerRadius, mode);
  if (!cropped) {
    // Unparseable bitmap header → stretch-fill fallback: mild distortion
    // beats a mispainted or missing photo, and still no crop machinery.
    return (
      <img
        src={dataUrl}
        alt=""
        width={boxW}
        height={boxH}
        style={{ width: boxW, height: boxH }}
      />
    );
  }
  return (
    <img
      src={cropped}
      alt=""
      width={boxW}
      height={boxH}
      style={{ width: boxW, height: boxH }}
    />
  );
}

/** photoBox for the rotated portrait subtree — same API, rotation-safe. */
function rotationSafePhotoBox(
  photoDataUrl: string | null,
  fullName: string,
  width: number,
  height: number,
  cornerRadius: number = 0
): ReactElement {
  if (!photoDataUrl) {
    // Initials placeholder is plain divs — already rotation-safe (proven in
    // the #2385 portrait renders).
    return photoBox(null, fullName, width, height);
  }
  return rotationSafeCoverImg(photoDataUrl, width, height, cornerRadius);
}

function headerBand(
  institutionName: string | null,
  overrides?: FrontLayout['header'],
  logoDataUrl?: string | null
): ReactElement {
  const bg = overrides?.background_color ?? BRAND_GREEN;
  const color = overrides?.text_color ?? '#ffffff';
  const title = overrides?.text ?? 'JKKN';
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 104,
        backgroundColor: bg,
        alignItems: 'center',
        padding: '0 36px'
      }}
    >
      {logoDataUrl ? (
        <img
          src={logoDataUrl}
          alt=""
          width={80}
          height={80}
          style={{ width: 80, height: 80, objectFit: 'contain', marginRight: 20 }}
        />
      ) : null}
      <div
        style={{
          display: 'flex',
          fontSize: 48,
          fontWeight: 900,
          color,
          letterSpacing: 2
        }}
      >
        {truncateForCard(title, 14)}
      </div>
      {institutionName ? (
        <div
          style={{
            display: 'flex',
            width: 4,
            height: 56,
            backgroundColor: color,
            opacity: 0.8,
            marginLeft: 24,
            marginRight: 24
          }}
        />
      ) : null}
      {institutionName
        ? (() => {
            // Room left of the band after the title + divider (title <= 14 chars
            // at 48px ~ 470px, divider 52px, paddings 72px).
            const fit = fitText(institutionName, {
              maxWidth: CARD_WIDTH - 72 - 470 - 52,
              maxHeight: 96,
              maxFontSize: 30,
              minFontSize: 20,
              maxLines: 2,
              lineHeight: VALUE_LINE_HEIGHT,
              bold: true
            });
            return (
              <div
                style={{
                  display: 'flex',
                  fontSize: fit.fontSize,
                  lineHeight: VALUE_LINE_HEIGHT,
                  fontWeight: 800,
                  color,
                  opacity: 1
                }}
              >
                {fit.text}
              </div>
            );
          })()
        : null}
    </div>
  );
}

/** "Roll No: X • Reg No: Y" for learners; designation for team members. */
function identityLine(person: CardPersonData): string {
  if (person.kind === 'learner') {
    const parts: string[] = [];
    if (person.rollNumber) parts.push(`Roll No: ${person.rollNumber}`);
    if (person.registerNumber) parts.push(`Reg No: ${person.registerNumber}`);
    return parts.join('   •   ');
  }
  return person.designation ?? '';
}

function courseLine(person: CardPersonData): string {
  return [person.courseName, person.departmentName].filter(Boolean).join('   •   ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Default design
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Principal signature + name/designation from the template institution block.
 * Renders nothing when the template carries neither (fail-soft).
 */
function principalBlock(input: CardRenderInput, mode: 'landscape' | 'portrait'): ReactElement | null {
  const { person, signatureDataUrl } = input;
  const label = person.principalName
    ? `${person.principalName}${person.principalDesignation ? ' · ' + person.principalDesignation : ''}`
    : person.principalDesignation ?? (signatureDataUrl ? 'PRINCIPAL' : null);
  if (!signatureDataUrl && !label) return null;
  const width = mode === 'portrait' ? 260 : 300;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width,
        marginBottom: mode === 'portrait' ? 8 : 0
      }}
    >
      {signatureDataUrl ? (
        <img
          src={signatureDataUrl}
          alt=""
          width={width}
          height={70}
          style={{ width, height: 70, objectFit: 'contain' }}
        />
      ) : null}
      {label ? (
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 2,
            color: BRAND_GREEN,
            marginTop: 4
          }}
        >
          {truncateForCard(label.toUpperCase(), 34)}
        </div>
      ) : null}
    </div>
  );
}

function defaultDesign(input: CardRenderInput, headerOverrides?: FrontLayout['header']): ReactElement {
  const { person, photoDataUrl, qrDataUrl, validUntilLabel, backgroundDataUrl } = input;
  const idLine = identityLine(person);
  const course = courseLine(person);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: backgroundDataUrl
          ? 'transparent'
          : (input.layout?.background_color ?? '#ffffff'),
        fontFamily: 'sans-serif'
      }}
    >
      {backgroundDataUrl ? (
        <img
          src={backgroundDataUrl}
          alt=""
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            objectFit: artworkObjectFit(backgroundDataUrl, CARD_WIDTH, CARD_HEIGHT)
          }}
        />
      ) : null}
      {/* With full-bleed artwork the band would cover the design — skip it. */}
      {backgroundDataUrl ? null : headerBand(person.institutionName, headerOverrides, input.institutionLogoDataUrl)}

      <div style={{ display: 'flex', flexGrow: 1, padding: '28px 36px' }}>
        {/* Photo area (left) */}
        <div
          style={{
            display: 'flex',
            width: 300,
            height: 380,
            borderRadius: 16,
            border: `4px solid ${BRAND_GREEN}`,
            overflow: 'hidden',
            flexShrink: 0
          }}
        >
          {photoBox(photoDataUrl, person.fullName, 300, 380)}
        </div>

        {/* Details column (right) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            marginLeft: 36,
            height: '100%'
          }}
        >
          {(() => {
            // Details column width: canvas - paddings - photo - gutter.
            const colWidth = CARD_WIDTH - 72 - 300 - 36;
            const nameFit = fitText(person.fullName, {
              maxWidth: colWidth,
              maxFontSize: 46,
              minFontSize: 28,
              maxLines: 2,
              lineHeight: VALUE_LINE_HEIGHT,
              bold: true
            });
            const idFit = fitText(idLine, {
              maxWidth: colWidth,
              maxFontSize: 28,
              minFontSize: VALUE_MIN_FONT,
              maxLines: 2,
              lineHeight: VALUE_LINE_HEIGHT,
              bold: true
            });
            const courseFit = fitText(course, {
              maxWidth: colWidth,
              maxFontSize: 27,
              minFontSize: VALUE_MIN_FONT,
              maxLines: 2,
              lineHeight: VALUE_LINE_HEIGHT,
              bold: true
            });
            // satori needs a bounded width to wrap text, and no Fragments.
            return (
              <div style={{ display: 'flex', flexDirection: 'column', width: colWidth }}>
                <div
                  style={{
                    display: 'flex',
                    width: colWidth,
                    fontSize: nameFit.fontSize,
                    fontWeight: 800,
                    color: '#111827',
                    lineHeight: VALUE_LINE_HEIGHT
                  }}
                >
                  {nameFit.text}
                </div>

                {idLine !== '' ? (
                  <div
                    style={{
                      display: 'flex',
                      width: colWidth,
                      fontSize: idFit.fontSize,
                      fontWeight: 700,
                      lineHeight: VALUE_LINE_HEIGHT,
                      color: '#1f2937',
                      marginTop: 14
                    }}
                  >
                    {idFit.text}
                  </div>
                ) : null}

                {course !== '' ? (
                  <div
                    style={{
                      display: 'flex',
                      width: colWidth,
                      fontSize: courseFit.fontSize,
                      fontWeight: 700,
                      lineHeight: VALUE_LINE_HEIGHT,
                      color: '#374151',
                      marginTop: 10
                    }}
                  >
                    {courseFit.text}
                  </div>
                ) : null}
              </div>
            );
          })()}

          <div style={{ display: 'flex', flexGrow: 1 }} />

          {/* Bottom row: valid-until (left) + QR (right) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end'
            }}
          >
            {principalBlock(input, 'landscape')}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 16,
                  letterSpacing: 3,
                  color: '#6b7280'
                }}
              >
                VALID UNTIL
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 26,
                  fontWeight: 700,
                  color: BRAND_GREEN,
                  marginTop: 6
                }}
              >
                {validUntilLabel}
              </div>
            </div>

            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt=""
                width={150}
                height={150}
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: 8,
                  border: '4px solid #e5e7eb'
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom layout (absolutely-positioned elements)
// ─────────────────────────────────────────────────────────────────────────────

function elementValue(
  element: { field: CardField | 'static_text'; text?: string },
  input: { person: CardPersonData; mappings: FieldMapping[]; validUntilLabel: string }
): string {
  const { person, mappings, validUntilLabel } = input;
  switch (element.field) {
    case 'static_text':
      return element.text ?? '';
    case 'name_line_1':
      return resolveMappedValue('name_line_1', mappings, person.valueBag, person.fullName);
    case 'roll_number':
      // A template element sits next to its own authored label ("ROLL NO :"),
      // so the value is the bare number — identityLine's "Roll No: …" prefix
      // belongs to the default landscape design only. Team members keep the
      // designation line as before.
      return resolveMappedValue(
        'roll_number',
        mappings,
        person.valueBag,
        person.kind === 'learner' ? (person.rollNumber ?? '') : identityLine(person)
      );
    case 'course':
      return resolveMappedValue('course', mappings, person.valueBag, person.courseName ?? '');
    case 'department':
      return resolveMappedValue(
        'department',
        mappings,
        person.valueBag,
        person.departmentName ?? ''
      );
    case 'valid_until':
      return resolveMappedValue('valid_until', mappings, person.valueBag, validUntilLabel);
    case 'study_period':
      return resolveMappedValue(
        'study_period',
        mappings,
        person.valueBag,
        person.studyPeriod ?? ''
      );
    case 'staff_id':
      return resolveMappedValue('staff_id', mappings, person.valueBag, person.staffId ?? '');
    case 'principal_name':
      return [person.principalName, person.principalDesignation].filter(Boolean).join(', ');
    case 'institution_email':
      return person.institutionEmail ?? '';
    case 'institution_phone':
      return person.institutionPhone ?? '';
    case 'institution_address':
      return person.institutionAddress ?? '';
    default:
      return '';
  }
}

/**
 * Absolutely-positioned custom layout. `width`/`height` describe the LOGICAL
 * canvas the elements were authored in — the landscape card by default, or
 * the portrait canvas when the layout opted into portrait orientation (the
 * portrait wrapper then rotates this whole composition into the output).
 * `rotationSafeImages` is set ONLY by the portrait path: every bitmap then
 * renders via the geometric cover-crop (satori mispaints objectFit under a
 * rotated ancestor — see rotationSafeCoverImg). Landscape defaults stay
 * byte-identical.
 */
function customDesign(
  input: CardRenderInput,
  layout: FrontLayout,
  width: number = CARD_WIDTH,
  height: number = CARD_HEIGHT,
  rotationSafeImages: boolean = false
): ReactElement {
  const { person, photoDataUrl, qrDataUrl, backgroundDataUrl } = input;
  const children: ReactElement[] = [];

  if (backgroundDataUrl) {
    children.push(
      rotationSafeImages ? (
        <div
          key="background"
          style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}
        >
          {rotationSafeCoverImg(backgroundDataUrl, width, height, 0, 'artwork')}
        </div>
      ) : (
        <img
          key="background"
          src={backgroundDataUrl}
          alt=""
          width={width}
          height={height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            objectFit: artworkObjectFit(backgroundDataUrl, width, height)
          }}
        />
      )
    );
  }

  if (layout.header?.show) {
    children.push(
      <div key="header" style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}>
        {headerBand(person.institutionName, layout.header, input.institutionLogoDataUrl)}
      </div>
    );
  }

  (layout.elements ?? []).forEach((element, index) => {
    const key = `el-${index}`;
    if (element.field === 'photo') {
      const w = element.width ?? 300;
      const h = element.height ?? 380;
      if (rotationSafeImages && photoDataUrl) {
        // No overflow:'hidden' and no objectFit under the rotated wrapper —
        // both mispaint (see rotationSafeCoverImg). The bitmap is cropped and
        // corner-rounded inside its SVG wrapper; the border draws its own
        // rounding. Photo sized to the content box (border is 4px each side).
        children.push(
          <div
            key={key}
            style={{
              display: 'flex',
              position: 'absolute',
              left: element.x,
              top: element.y,
              width: w,
              height: h,
              borderRadius: 12,
              border: `4px solid ${BRAND_GREEN}`
            }}
          >
            {rotationSafePhotoBox(photoDataUrl, person.fullName, w - 8, h - 8, 8)}
          </div>
        );
        return;
      }
      children.push(
        <div
          key={key}
          style={{
            display: 'flex',
            position: 'absolute',
            left: element.x,
            top: element.y,
            width: w,
            height: h,
            borderRadius: 12,
            border: `4px solid ${BRAND_GREEN}`,
            overflow: 'hidden'
          }}
        >
          {photoBox(photoDataUrl, person.fullName, w, h)}
        </div>
      );
      return;
    }
    if (element.field === 'institution_logo' || element.field === 'principal_signature') {
      const src =
        element.field === 'institution_logo' ? input.institutionLogoDataUrl : input.signatureDataUrl;
      if (!src) return;
      const w = element.width ?? (element.field === 'institution_logo' ? 160 : 220);
      const h = element.height ?? (element.field === 'institution_logo' ? 160 : 90);
      children.push(
        <img
          key={key}
          src={src}
          alt=""
          width={w}
          height={h}
          style={{ position: 'absolute', left: element.x, top: element.y, width: w, height: h, objectFit: 'contain' }}
        />
      );
      return;
    }
    if (element.field === 'qr_code') {
      if (!qrDataUrl) return;
      const size = element.width ?? 150;
      children.push(
        <img
          key={key}
          src={qrDataUrl}
          alt=""
          width={size}
          height={size}
          style={{
            position: 'absolute',
            left: element.x,
            top: element.y,
            width: size,
            height: size
          }}
        />
      );
      return;
    }
    const value = elementValue(element, input).trim();
    if (value === '') return;
    // Static labels keep their authored size; data values size to their box.
    const sized =
      element.field === 'static_text'
        ? {
            text: truncateForCard(value, 80),
            fontSize: element.font_size ?? 26,
            fontWeight: element.font_weight ?? 400,
            width: element.width ?? 0,
            lines: 1
          }
        : fitElementText(element, value, layout.elements ?? [], width, height);
    children.push(
      <div
        key={key}
        style={{
          display: 'flex',
          position: 'absolute',
          left: element.x,
          top: element.y,
          ...(element.width !== undefined
            ? { width: element.width }
            : element.field !== 'static_text' && (element.align ?? 'left') === 'left'
              ? { width: sized.width }
              : {}),
          justifyContent:
            element.align === 'center'
              ? 'center'
              : element.align === 'right'
                ? 'flex-end'
                : 'flex-start',
          textAlign: element.align ?? 'left',
          fontSize: sized.fontSize,
          lineHeight: VALUE_LINE_HEIGHT,
          fontWeight: sized.fontWeight,
          color: element.color ?? '#111827'
        }}
      >
        {sized.text}
      </div>
    );
  });

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width,
        height,
        backgroundColor: backgroundDataUrl
          ? 'transparent'
          : (layout.background_color ?? '#ffffff'),
        fontFamily: 'sans-serif'
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Portrait mode (dark, template-opt-in) — see the header note for the
// rotation-direction caveat. The composition below is PORTRAIT-READING
// (638x1014); rotatePortraitIntoCanvas turns it into the 1014x638 output.
// ─────────────────────────────────────────────────────────────────────────────

/** Label + value line for the portrait default design (fail-soft). */
function portraitFieldRow(key: string, label: string, value: string): ReactElement {
  // Value column: portrait canvas - body padding (2x32) - field padding (2x42) - label.
  const valueWidth = PORTRAIT_WIDTH - 64 - 84 - 150;
  const fit = fitText(value, {
    maxWidth: valueWidth,
    maxFontSize: 27,
    minFontSize: VALUE_MIN_FONT,
    maxLines: 2,
    lineHeight: VALUE_LINE_HEIGHT,
    bold: true
  });
  return (
    <div key={key} style={{ display: 'flex', alignItems: 'flex-start', marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          width: 150,
          flexShrink: 0,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 2,
          color: '#374151',
          marginTop: 3
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          width: valueWidth,
          fontSize: fit.fontSize,
          lineHeight: VALUE_LINE_HEIGHT,
          fontWeight: 700,
          color: '#111827'
        }}
      >
        {fit.text}
      </div>
    </div>
  );
}

/**
 * The institution's portrait card design (no-artwork default): header band,
 * photo (~300x380) under a left ribbon zone, name (red, bold, caps), field
 * lines (ROLL NO / COURSE / YEAR for learners; STAFF ID / DEPT / DESIG for
 * team members), small VALID UPTO, QR bottom. Full-bleed portrait artwork
 * (background_image, same allowlist path) suppresses the band + ribbon —
 * the artwork IS the design, matching landscape behavior.
 */
function portraitDefaultDesign(input: CardRenderInput): ReactElement {
  const { person, photoDataUrl, qrDataUrl, backgroundDataUrl, validUntilLabel } = input;
  const header = input.layout?.header;
  const headerBg = header?.background_color ?? BRAND_GREEN;
  const headerColor = header?.text_color ?? '#ffffff';
  const headerTitle = header?.text ?? 'JKKN';

  const fieldRows: ReactElement[] = [];
  if (person.kind === 'learner') {
    if (person.rollNumber) fieldRows.push(portraitFieldRow('roll', 'ROLL NO', person.rollNumber));
    if (person.courseName) fieldRows.push(portraitFieldRow('course', 'COURSE', person.courseName));
    if (person.studyPeriod) fieldRows.push(portraitFieldRow('year', 'YEAR', person.studyPeriod));
  } else {
    if (person.staffId) fieldRows.push(portraitFieldRow('staffid', 'STAFF ID', person.staffId));
    if (person.departmentName) fieldRows.push(portraitFieldRow('dept', 'DEPT', person.departmentName));
    if (person.designation) fieldRows.push(portraitFieldRow('desig', 'DESIG', person.designation));
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: PORTRAIT_WIDTH,
        height: PORTRAIT_HEIGHT,
        backgroundColor: backgroundDataUrl
          ? 'transparent'
          : (input.layout?.background_color ?? '#ffffff'),
        fontFamily: 'sans-serif'
      }}
    >
      {backgroundDataUrl ? (
        // Geometric cover — objectFit is unreliable under the rotated wrapper.
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}>
          {rotationSafeCoverImg(backgroundDataUrl, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, 0, 'artwork')}
        </div>
      ) : null}

      {/* Header band — suppressed under full-bleed artwork */}
      {backgroundDataUrl ? null : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: 96,
            backgroundColor: headerBg,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 34,
              fontWeight: 800,
              color: headerColor,
              letterSpacing: 2
            }}
          >
            {truncateForCard(headerTitle, 14)}
          </div>
          {person.institutionName ? (
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontWeight: 600,
                color: headerColor,
                opacity: 0.95,
                marginTop: 4
              }}
            >
              {truncateForCard(person.institutionName, 44)}
            </div>
          ) : null}
        </div>
      )}

      {/* Body — photo under the left ribbon zone, then name + fields */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          flexGrow: 1,
          alignItems: 'center',
          padding: '0 32px'
        }}
      >
        {/* Vertical ribbon zone (left) — suppressed under artwork */}
        {backgroundDataUrl ? null : (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              left: 46,
              top: 0,
              width: 52,
              height: 150,
              backgroundColor: BRAND_GREEN
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 12,
                height: '100%',
                marginLeft: 20,
                backgroundColor: '#ffde59'
              }}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            width: 300,
            height: 380,
            marginTop: 52,
            borderRadius: 14,
            border: `4px solid ${BRAND_GREEN}`,
            // overflow:'hidden' clips mispaint bitmaps under the rotated
            // wrapper — only the (plain-div) initials placeholder may use it.
            ...(photoDataUrl ? {} : { overflow: 'hidden' }),
            flexShrink: 0
          }}
        >
          {rotationSafePhotoBox(photoDataUrl, person.fullName, 292, 372, 10)}
        </div>

        {/* Name — red, bold, caps; fills the column, wraps to 2 lines before shrinking below 22 */}
        {(() => {
          const fit = fitText(person.fullName.toUpperCase(), {
            maxWidth: PORTRAIT_WIDTH - 64,
            maxFontSize: 36,
            minFontSize: 22,
            maxLines: 2,
            lineHeight: VALUE_LINE_HEIGHT,
            bold: true
          });
          return (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                width: PORTRAIT_WIDTH - 64,
                marginTop: 26,
                fontSize: fit.fontSize,
                lineHeight: VALUE_LINE_HEIGHT,
                fontWeight: 800,
                color: PORTRAIT_NAME_RED,
                textAlign: 'center'
              }}
            >
              {fit.text}
            </div>
          );
        })()}

        {/* Field lines */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            marginTop: 18,
            padding: '0 42px'
          }}
        >
          {fieldRows}
        </div>

        <div style={{ display: 'flex', flexGrow: 1 }} />

        {principalBlock(input, 'portrait')}

        {/* Small VALID UPTO */}
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 15,
              letterSpacing: 3,
              color: '#6b7280'
            }}
          >
            VALID UPTO
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              fontWeight: 700,
              color: BRAND_GREEN,
              marginLeft: 12
            }}
          >
            {validUntilLabel}
          </div>
        </div>

        {/* QR bottom area */}
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt=""
            width={150}
            height={150}
            style={{
              width: 150,
              height: 150,
              borderRadius: 8,
              border: '4px solid #e5e7eb',
              marginBottom: 26
            }}
          />
        ) : (
          <div style={{ display: 'flex', height: 26 }} />
        )}
      </div>
    </div>
  );
}

/**
 * Rotate a portrait composition into the landscape output canvas as ONE
 * wrapper (no per-element rotation). Center-rotation identity: the portrait
 * box is placed so its center coincides with the canvas center, then rotated
 * ±90° about its own center — satori's default transform-origin — which makes
 * the 638x1014 box exactly fill 1014x638. 'portrait' = +90° (clockwise),
 * 'portrait-flipped' = −90°; one physical print settles which one the
 * bridge's rotation undoes (see the header note).
 */
function rotatePortraitIntoCanvas(
  content: ReactElement,
  orientation: CardOrientation
): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#ffffff'
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: (CARD_WIDTH - PORTRAIT_WIDTH) / 2, // 188
          top: (CARD_HEIGHT - PORTRAIT_HEIGHT) / 2, // -188
          width: PORTRAIT_WIDTH,
          height: PORTRAIT_HEIGHT,
          transform: orientation === 'portrait' ? 'rotate(90deg)' : 'rotate(-90deg)'
        }}
      >
        {content}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export type BuildOptions = {
  /**
   * Preview mode: return a portrait composition UNROTATED (638x1014) so a
   * human sees the card upright. The printer path never sets this — the bridge
   * invariant (1014x638 landscape output) is untouched.
   */
  upright?: boolean;
};

/** Output canvas for a front layout under the given options. */
export function frontCanvasSize(
  layout: FrontLayout | null,
  options: BuildOptions = {}
): { width: number; height: number } {
  const portrait = layout?.orientation === 'portrait' || layout?.orientation === 'portrait-flipped';
  return portrait && options.upright
    ? { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT }
    : { width: CARD_WIDTH, height: CARD_HEIGHT };
}

/** Output canvas for a back layout under the given options. */
export function backCanvasSize(
  layout: BackLayout,
  options: BuildOptions = {}
): { width: number; height: number } {
  const portrait = layout.orientation === 'portrait' || layout.orientation === 'portrait-flipped';
  return portrait && options.upright
    ? { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT }
    : { width: CARD_WIDTH, height: CARD_HEIGHT };
}

export function buildCardElement(input: CardRenderInput, options: BuildOptions = {}): ReactElement {
  const layout = input.layout;

  // PORTRAIT (dark, template-opt-in): compose portrait-reading, rotate as one
  // wrapper into the unchanged 1014x638 output. Custom `elements` are in
  // portrait coordinates (parseFrontLayout clamps them so).
  if (layout?.orientation === 'portrait' || layout?.orientation === 'portrait-flipped') {
    const content =
      layout.elements && layout.elements.length > 0
        ? customDesign(input, layout, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, true)
        : portraitDefaultDesign(input);
    // upright = human preview: the portrait composition as designed, no turn.
    return options.upright ? content : rotatePortraitIntoCanvas(content, layout.orientation);
  }

  if (layout?.elements && layout.elements.length > 0) {
    return customDesign(input, layout);
  }
  // Styling-only overrides (background / header) ride on the default design.
  return defaultDesign(input, layout?.header);
}

// ─────────────────────────────────────────────────────────────────────────────
// Back side (DARK) — default design + overlay elements
// ─────────────────────────────────────────────────────────────────────────────

export type BackRenderInput = {
  person: CardPersonData;
  /** Pre-fetched back artwork as a data URL (route-allowlisted), or null. */
  backgroundDataUrl: string | null;
  /**
   * Pre-generated Code 39 SVG data URL (lib/id-cards/barcode.ts with
   * showText:false — the value line below the bars is drawn with satori
   * text, since resvg has no fonts for SVG <text>). null → barcode omitted.
   */
  barcodeDataUrl: string | null;
  layout: BackLayout;
  mappings: FieldMapping[];
  validUntilLabel: string;
};

const BACK_FOOTER_HEIGHT = 64;
const DEFAULT_BACK_FOOTER_TEXT = 'TAMIL NADU, INDIA';

// Overlay elements are capped at BACK_ELEMENT_MAX_CHARS as a last line of
// defence for STATIC text; data values are sized/wrapped by fitElementText.
const BACK_ELEMENT_MAX_CHARS = 80;

/** Headings that templates author as static_text above each data row. */
const FIELD_HEADINGS = new Set([
  'BLOOD GROUP',
  'DATE OF BIRTH',
  'DOB',
  'ADDRESS',
  'CONTACT',
  'CONTACT NO',
  'CONTACT NUMBER',
  'PHONE',
  'MOBILE',
  'GUARDIAN',
  'PARENT',
  'FATHER',
  'MOTHER'
]);
function isFieldHeading(text: string): boolean {
  return FIELD_HEADINGS.has(text.trim().toUpperCase().replace(/\s*:\s*$/, ''));
}

/** Label + value row for the back's info block. */
function backInfoRow(
  key: string,
  label: string,
  value: string,
  canvasWidth: number,
  options?: {
    valueSize?: number;
    valueColor?: string;
    valueWeight?: number;
    /** Address rows elide the middle so district/state/PIN always print. */
    preserveTail?: boolean;
    /** Print the heading column (default: values only). */
    showLabel?: boolean;
    /** Gap above the row in px (default 14 with labels, 18 without). 0 for the first row. */
    topGap?: number;
  }
): ReactElement {
  const showLabel = options?.showLabel === true;
  // Label column narrows on the portrait back so the value keeps real room;
  // with headings hidden the value has the whole row.
  const labelWidth = showLabel ? (canvasWidth >= CARD_WIDTH ? 250 : 190) : 0;
  const valueWidth = canvasWidth - 72 - labelWidth;
  const fit = fitText(value, {
    maxWidth: valueWidth,
    maxFontSize: options?.valueSize ?? 27,
    minFontSize: options?.preserveTail ? ADDRESS_MIN_FONT : VALUE_MIN_FONT,
    maxLines: options?.preserveTail ? 4 : 2,
    lineHeight: VALUE_LINE_HEIGHT,
    bold: (options?.valueWeight ?? 700) >= 600,
    preserveTail: options?.preserveTail
  });
  return (
    <div
      key={key}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        marginTop: options?.topGap ?? (showLabel ? 14 : 18)
      }}
    >
      {showLabel ? (
        <div
          style={{
            display: 'flex',
            width: labelWidth,
            flexShrink: 0,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 1,
            color: '#374151',
            marginTop: 4
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          width: valueWidth,
          fontSize: fit.fontSize,
          lineHeight: VALUE_LINE_HEIGHT,
          fontWeight: options?.valueWeight ?? 700,
          color: options?.valueColor ?? '#111827'
        }}
      >
        {fit.text}
      </div>
    </div>
  );
}

/** Value resolution for back overlay elements (superset of the front's). */
function backElementValue(element: BackLayoutElement, input: BackRenderInput): string {
  const { person } = input;
  switch (element.field) {
    case 'blood_group':
      return person.bloodGroup ?? '';
    case 'date_of_birth':
      return person.dateOfBirthLabel ?? '';
    case 'guardian':
      return [person.guardianName, person.guardianPhone].filter(Boolean).join('   •   ');
    case 'address':
      return person.address ?? '';
    case 'contact_phone':
      return person.contactPhone ?? '';
    case 'institution_email':
      return person.institutionEmail ?? '';
    case 'institution_phone':
      return person.institutionPhone ?? '';
    case 'institution_address':
      return person.institutionAddress ?? '';
    case 'institution_website':
      // Printed exactly as entered on the Institution tab (2026-09-05 decision).
      return person.institutionWebsite ?? '';
    case 'barcode':
      return ''; // rendered as an image, not text
    case 'name_line_1':
    case 'roll_number':
    case 'course':
    case 'department':
    case 'valid_until':
    case 'static_text':
      // Explicit case list (not `default:`) so the object passed on carries
      // the narrowed front alphabet under any compiler configuration.
      return elementValue({ field: element.field, text: element.text }, input);
    default:
      return '';
  }
}

/**
 * The back-side compositor. Unlike the front, overlay `elements` ADD to the
 * default design rather than replacing it — the default back is the
 * institution-approved layout, and elements exist to place per-template
 * static lines (institution contact / email / website) plus optional extras.
 * Full-bleed back artwork suppresses the green footer band (the artwork IS
 * the design), matching the front's header-band behavior.
 */
export function buildBackElement(input: BackRenderInput, options: BuildOptions = {}): ReactElement {
  const { person, layout, backgroundDataUrl, barcodeDataUrl } = input;
  const showBloodGroup = layout.show_blood_group ?? true;
  const showDob = layout.show_dob ?? true;
  const showGuardian = layout.show_guardian ?? true;
  const showAddress = layout.show_address ?? true;
  const showBarcode = layout.show_barcode ?? true;
  const showContact = layout.show_contact ?? true;
  const showLabels = layout.show_field_labels === true;
  const footerText = layout.footer_text ?? DEFAULT_BACK_FOOTER_TEXT;

  // Portrait backs compose in portrait coordinates and rotate into the
  // unchanged 1014x638 output, exactly as buildCardElement does for the front.
  const portrait =
    layout.orientation === 'portrait' || layout.orientation === 'portrait-flipped';
  const canvasWidth = portrait ? PORTRAIT_WIDTH : CARD_WIDTH;
  const canvasHeight = portrait ? PORTRAIT_HEIGHT : CARD_HEIGHT;

  const infoRows: ReactElement[] = [];
  if (showBloodGroup && person.bloodGroup) {
    infoRows.push(
      backInfoRow('blood', 'BLOOD GROUP', person.bloodGroup, canvasWidth, {
        showLabel: showLabels,
        // First row: no gap above — it sits at the top of the info block.
        topGap: 0,
        valueSize: 34,
        valueColor: BRAND_GREEN,
        valueWeight: 800
      })
    );
  }
  if (showDob && person.dateOfBirthLabel) {
    infoRows.push(
      backInfoRow('dob', 'DATE OF BIRTH', person.dateOfBirthLabel, canvasWidth, { showLabel: showLabels })
    );
  }
  if (showGuardian && person.guardianName) {
    infoRows.push(
      backInfoRow(
        'guardian',
        'GUARDIAN',
        [person.guardianName, person.guardianPhone].filter(Boolean).join('   •   '),
        canvasWidth,
        { showLabel: showLabels }
      )
    );
  }
  if (showAddress && person.address) {
    infoRows.push(
      backInfoRow('address', 'ADDRESS', person.address, canvasWidth, {
        showLabel: showLabels,
        valueSize: 24,
        preserveTail: true
      })
    );
  }
  if (showContact && person.contactPhone) {
    infoRows.push(
      backInfoRow('contact', 'CONTACT', person.contactPhone, canvasWidth, { showLabel: showLabels })
    );
  }

  // Overlay elements — absolutely positioned above the default blocks.
  const overlays: ReactElement[] = [];
  // Icon mode: headings hidden + artwork present (the artwork carries the icons).
  // Hidden headings become row anchors; the value authored beneath a heading
  // moves up onto that row and every text element shifts right past the icon.
  const iconMode = !showLabels && backgroundDataUrl !== null;
  const iconGutter = layout.icon_gutter ?? (iconMode ? 80 : 0);
  const hiddenHeadings = (layout.elements ?? []).filter(
    (el) => el.field === 'static_text' && !showLabels && isFieldHeading((el.text ?? '').trim())
  );
  // Artwork icons are ~60px tall and start at the heading's top, so the row's
  // centre is heading.y + ICON_HALF. The value's WHOLE block (all wrapped
  // lines) is centred on it — a three-line address puts its middle line level
  // with the icon, exactly like the approved reference.
  const ICON_HALF = 30;
  // The icon column starts where the headings were authored (their min x);
  // every text line gets ONE uniform left edge just past it.
  const iconColumnX = hiddenHeadings.length > 0 ? Math.min(...hiddenHeadings.map((h) => h.x)) : null;
  const uniformLeft = iconColumnX !== null ? iconColumnX + iconGutter : null;
  // Nearest hidden heading ABOVE the value (within one row), regardless of x —
  // live templates author the value at a different x than its heading.
  const headingAbove = (el: BackLayoutElement): BackLayoutElement | null => {
    if (!iconMode || el.field === 'static_text') return null;
    let best: BackLayoutElement | null = null;
    for (const h of hiddenHeadings) {
      const dy = el.y - h.y;
      if (dy >= 0 && dy <= 90 && (!best || h.y > best.y)) best = h;
    }
    return best;
  };
  const anchorFor = (el: BackLayoutElement, fontSize: number, lines: number): number | null => {
    const best = headingAbove(el);
    return best
      ? Math.round(best.y + ICON_HALF - (fontSize * VALUE_LINE_HEIGHT * Math.max(1, lines)) / 2)
      : null;
  };

  (layout.elements ?? []).forEach((element, index) => {
    const key = `back-el-${index}`;
    if (element.field === 'barcode') {
      if (!barcodeDataUrl) return;
      const w = element.width ?? 400;
      const h = element.height ?? 90;
      overlays.push(
        <img
          key={key}
          src={barcodeDataUrl}
          alt=""
          width={w}
          height={h}
          style={{ position: 'absolute', left: element.x, top: element.y, width: w, height: h }}
        />
      );
      return;
    }
    const value = backElementValue(element, input).trim();
    if (value === '') return;
    // Field headings authored as static_text are hidden by default — the
    // template artwork carries an icon per row and the heading only crowds
    // the value (show_field_labels: true prints them).
    if (element.field === 'static_text' && !showLabels && isFieldHeading(value)) return;
    // Static labels keep their authored size. Data values size to the room
    // they really have (own width, and the gap down to the next element), so
    // a long address wraps neatly and the middle is elided only when even the
    // readability floor cannot hold it — district/state/PIN always survive.
    const sized =
      element.field === 'static_text'
        ? {
            text: truncateForCard(value, BACK_ELEMENT_MAX_CHARS),
            fontSize: element.font_size ?? 24,
            // Icon mode: static lines beside icons (college phone / e-mail /
            // website) read as values too — bold unless the template says otherwise.
            fontWeight: element.font_weight ?? (iconMode ? 700 : 400),
            width: element.width ?? 0,
            lines: 1
          }
        : fitElementText(element, value, layout.elements ?? [], canvasWidth, canvasHeight);
    const anchoredTop = anchorFor(element, sized.fontSize, sized.lines);
    // Icon mode: anchored values take the uniform left edge; other text (the
    // static contact lines) is pushed to it only if it starts inside the icon
    // column — never shifted twice when already authored to the right.
    let left = element.x;
    if (iconMode && uniformLeft !== null) {
      left = anchoredTop !== null ? uniformLeft : Math.max(element.x, uniformLeft);
    } else if (iconMode) {
      left = element.x + iconGutter;
    }
    const shift = left - element.x;
    const boxWidth =
      element.width !== undefined
        ? Math.max(40, element.width - shift)
        : element.field !== 'static_text' && (element.align ?? 'left') === 'left'
          ? Math.max(40, sized.width - shift)
          : undefined;
    overlays.push(
      <div
        key={key}
        style={{
          display: 'flex',
          position: 'absolute',
          left,
          top: anchoredTop ?? element.y,
          ...(boxWidth !== undefined ? { width: boxWidth } : {}),
          justifyContent:
            element.align === 'center'
              ? 'center'
              : element.align === 'right'
                ? 'flex-end'
                : 'flex-start',
          textAlign: element.align ?? 'left',
          fontSize: sized.fontSize,
          lineHeight: VALUE_LINE_HEIGHT,
          fontWeight: sized.fontWeight,
          color: element.color ?? '#111827'
        }}
      >
        {sized.text}
      </div>
    );
  });

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: backgroundDataUrl
          ? 'transparent'
          : (layout.background_color ?? '#ffffff'),
        fontFamily: 'sans-serif'
      }}
    >
      {backgroundDataUrl ? (
        <img
          src={backgroundDataUrl}
          alt=""
          width={canvasWidth}
          height={canvasHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            objectFit: artworkObjectFit(backgroundDataUrl, canvasWidth, canvasHeight)
          }}
        />
      ) : null}

      {/* Info blocks (upper area) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          padding: '22px 36px 0 36px'
        }}
      >
        {infoRows}

        <div style={{ display: 'flex', flexGrow: 1 }} />

        {/* Institution contact block — from `institutions` for the learner's own
            college (fail-soft: omitted when nothing is on file). */}
        {(() => {
          // Default ON only for the bare default back. A template-designed back
          // (any elements) already places its own contact lines — the seeded
          // college backs carry them as static_text at the same spot — so it
          // must opt in explicitly or the two would print on top of each other.
          const designed = (layout.elements?.length ?? 0) > 0;
          const showInstitution = layout.show_institution_contact ?? !designed;
          const lines = [
            person.institutionPhone ? 'PH: ' + person.institutionPhone : null,
            person.institutionEmail,
            person.institutionWebsite
          ].filter((v): v is string => !!v && v.trim() !== '');
          if (!showInstitution || lines.length === 0) return null;
          const blockWidth = canvasWidth - 72;
          return (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: blockWidth,
                marginBottom: 14
              }}
            >
              {lines.map((line, i) => {
                const fit = fitText(line, {
                  maxWidth: blockWidth,
                  maxFontSize: 20,
                  minFontSize: 15,
                  maxLines: 2,
                  lineHeight: VALUE_LINE_HEIGHT,
                  bold: true
                });
                return (
                  <div
                    key={'inst-' + i}
                    style={{
                      display: 'flex',
                      width: blockWidth,
                      fontSize: fit.fontSize,
                      lineHeight: VALUE_LINE_HEIGHT,
                      fontWeight: 700,
                      color: '#111827',
                      marginTop: i === 0 ? 0 : 4
                    }}
                  >
                    {fit.text}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Centered Code 39 barcode with the encoded value beneath */}
        {showBarcode && barcodeDataUrl ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: 18
            }}
          >
            <img
              src={barcodeDataUrl}
              alt=""
              width={560}
              height={110}
              style={{ width: 560, height: 110 }}
            />
            {person.idCode ? (
              <div
                style={{
                  display: 'flex',
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: 6,
                  color: '#111827',
                  marginTop: 6
                }}
              >
                {truncateForCard(person.idCode.toUpperCase(), 32)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {overlays}

      {/* Bottom full-width green band — suppressed under full-bleed artwork */}
      {backgroundDataUrl ? null : (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: BACK_FOOTER_HEIGHT,
            backgroundColor: BRAND_GREEN,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 6,
              color: '#ffffff'
            }}
          >
            {truncateForCard(footerText, 46)}
          </div>
        </div>
      )}
    </div>
  );

  return portrait && layout.orientation && !options.upright
    ? rotatePortraitIntoCanvas(content, layout.orientation)
    : content;
}
