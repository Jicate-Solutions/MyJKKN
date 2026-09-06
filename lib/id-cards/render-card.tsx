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
  truncateAddressForCard,
  svgCoverImageDataUrl,
  type CardField,
  type BackCardField,
  type CardPersonData,
  type FieldMapping
} from '@/lib/id-cards/render-data';

export const CARD_WIDTH = 1014;
export const CARD_HEIGHT = 638;

// Portrait logical canvas — the landscape canvas turned on its side. The
// OUTPUT canvas is always CARD_WIDTH x CARD_HEIGHT (bridge invariant).
export const PORTRAIT_WIDTH = CARD_HEIGHT; // 638
export const PORTRAIT_HEIGHT = CARD_WIDTH; // 1014

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
};

export type CardRenderInput = {
  person: CardPersonData;
  /** Pre-fetched photo as a data URL, or null → initials placeholder. */
  photoDataUrl: string | null;
  /** Pre-generated QR as a data URL, or null → QR omitted. */
  qrDataUrl: string | null;
  /** Pre-fetched card artwork as a data URL, or null → no background layer. */
  backgroundDataUrl: string | null;
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

  // Portrait layouts position elements in PORTRAIT coordinates.
  const elements = parseElements(
    obj.elements,
    CARD_FIELDS,
    layout.orientation !== undefined
      ? { maxX: PORTRAIT_WIDTH, maxY: PORTRAIT_HEIGHT }
      : undefined
  );
  if (elements.length > 0) layout.elements = elements;

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
  footer_text?: string;
  elements?: BackLayoutElement[];
};

const BACK_BOOLEAN_KEYS = [
  'show_blood_group',
  'show_dob',
  'show_guardian',
  'show_address',
  'show_barcode',
  'show_contact'
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
  cornerRadius: number = 0
): ReactElement {
  const cropped = svgCoverImageDataUrl(dataUrl, boxW, boxH, cornerRadius);
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

function headerBand(institutionName: string | null, overrides?: FrontLayout['header']): ReactElement {
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
      <div
        style={{
          display: 'flex',
          fontSize: 46,
          fontWeight: 800,
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
            width: 3,
            height: 52,
            backgroundColor: color,
            opacity: 0.55,
            marginLeft: 24,
            marginRight: 24
          }}
        />
      ) : null}
      {institutionName ? (
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color, opacity: 0.95 }}>
          {truncateForCard(institutionName, 46)}
        </div>
      ) : null}
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
            objectFit: 'cover'
          }}
        />
      ) : null}
      {/* With full-bleed artwork the band would cover the design — skip it. */}
      {backgroundDataUrl ? null : headerBand(person.institutionName, headerOverrides)}

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
          <div
            style={{
              display: 'flex',
              fontSize: 42,
              fontWeight: 700,
              color: '#111827',
              lineHeight: 1.15
            }}
          >
            {truncateForCard(person.fullName, 40)}
          </div>

          {idLine !== '' ? (
            <div style={{ display: 'flex', fontSize: 26, color: '#374151', marginTop: 14 }}>
              {truncateForCard(idLine, 46)}
            </div>
          ) : null}

          {course !== '' ? (
            <div style={{ display: 'flex', fontSize: 24, color: '#4b5563', marginTop: 10 }}>
              {truncateForCard(course, 52)}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexGrow: 1 }} />

          {/* Bottom row: valid-until (left) + QR (right) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end'
            }}
          >
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
      return resolveMappedValue('roll_number', mappings, person.valueBag, identityLine(person));
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
          {rotationSafeCoverImg(backgroundDataUrl, width, height)}
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
            objectFit: 'cover'
          }}
        />
      )
    );
  }

  if (layout.header?.show) {
    children.push(
      <div key="header" style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}>
        {headerBand(person.institutionName, layout.header)}
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
    children.push(
      <div
        key={key}
        style={{
          display: 'flex',
          position: 'absolute',
          left: element.x,
          top: element.y,
          ...(element.width !== undefined ? { width: element.width } : {}),
          justifyContent:
            element.align === 'center'
              ? 'center'
              : element.align === 'right'
                ? 'flex-end'
                : 'flex-start',
          fontSize: element.font_size ?? 26,
          fontWeight: element.font_weight ?? 400,
          color: element.color ?? '#111827'
        }}
      >
        {truncateForCard(value, 80)}
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
  return (
    <div key={key} style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          width: 170,
          flexShrink: 0,
          fontSize: 17,
          letterSpacing: 2,
          color: '#6b7280'
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: '#111827' }}>
        {truncateForCard(value, 30)}
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
    // A school's "programme" IS a class (Standard 12), so a school card that
    // printed "COURSE: Standard 12" read as nonsense. The value is right either
    // way; only the label changes. Mirrors lib/utils/school-label-adapter.ts,
    // which does the same Program → Class swap everywhere else in the app but
    // was never wired into the card renderer.
    if (person.courseName)
      fieldRows.push(
        portraitFieldRow('course', person.isSchool ? 'CLASS' : 'COURSE', person.courseName)
      );
    if (person.studyPeriod) fieldRows.push(portraitFieldRow('year', 'YEAR', person.studyPeriod));
  } else {
    if (person.staffId) fieldRows.push(portraitFieldRow('staffid', 'STAFF ID', person.staffId));
    // Department → Wing for a school, same adapter, same reasoning as COURSE.
    if (person.departmentName)
      fieldRows.push(
        portraitFieldRow('dept', person.isSchool ? 'WING' : 'DEPT', person.departmentName)
      );
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
          {rotationSafeCoverImg(backgroundDataUrl, PORTRAIT_WIDTH, PORTRAIT_HEIGHT)}
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

        {/* Name — red, bold, caps */}
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 32,
            fontWeight: 800,
            color: PORTRAIT_NAME_RED,
            textAlign: 'center'
          }}
        >
          {truncateForCard(person.fullName.toUpperCase(), 30)}
        </div>

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

export function buildCardElement(input: CardRenderInput): ReactElement {
  const layout = input.layout;

  // PORTRAIT (dark, template-opt-in): compose portrait-reading, rotate as one
  // wrapper into the unchanged 1014x638 output. Custom `elements` are in
  // portrait coordinates (parseFrontLayout clamps them so).
  if (layout?.orientation === 'portrait' || layout?.orientation === 'portrait-flipped') {
    const content =
      layout.elements && layout.elements.length > 0
        ? customDesign(input, layout, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, true)
        : portraitDefaultDesign(input);
    return rotatePortraitIntoCanvas(content, layout.orientation);
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

// ── Address sizing ───────────────────────────────────────────────────────────
// Every overlay element is capped at BACK_ELEMENT_MAX_CHARS so it cannot
// overflow the fixed canvas. That single number is right for the one-line
// fields (name, roll, course, contact) but wrong for the address, which is the
// only card field that legitimately WRAPS inside its own box: the live
// Engineering back draws it in a 556px-wide box at font_size 18, where 80
// characters is barely two lines of a box with room for five.
//
// So the address gets its own budget derived from the box it is actually drawn
// in, never SMALLER than the generic cap (no existing template can lose text
// by this change) and never larger than a hard ceiling.
//
// CHAR_WIDTH_RATIO is measured, not guessed: in that 556px/18px box satori
// wrapped the first line of a real address after 43 uppercase characters, i.e.
// 556 / (18 * 43) => ~0.72 em per character. Addresses on these cards are
// uppercase, whose glyphs are the widest, so 0.72 is the conservative end.
//
// MAX_LINES 5 keeps the block inside the vertical room the live template
// leaves it (address at y=316, the next label at y=470 — 154px, and five lines
// at 18px occupy ~108px).
const BACK_ELEMENT_MAX_CHARS = 80;
const ADDRESS_MAX_LINES = 5;
const ADDRESS_CHAR_WIDTH_RATIO = 0.72;
const ADDRESS_HARD_MAX_CHARS = 260;

/**
 * Characters the address may use inside an element box of the given width and
 * font size. Falls back to the generic cap when the template pins no width
 * (an unbounded box cannot wrap, so more characters would run off the card).
 */
function addressCharBudget(width: number | undefined, fontSize: number): number {
  if (width === undefined || width <= 0 || fontSize <= 0) return BACK_ELEMENT_MAX_CHARS;
  const perLine = Math.floor(width / (fontSize * ADDRESS_CHAR_WIDTH_RATIO));
  if (perLine < 1) return BACK_ELEMENT_MAX_CHARS;
  return clamp(perLine * ADDRESS_MAX_LINES, BACK_ELEMENT_MAX_CHARS, ADDRESS_HARD_MAX_CHARS);
}

/** Label + value row for the back's info block. */
function backInfoRow(
  key: string,
  label: string,
  value: string,
  options?: {
    valueSize?: number;
    valueColor?: string;
    valueWeight?: number;
    /** Address rows elide the middle so district/state/PIN always print. */
    preserveTail?: boolean;
  }
): ReactElement {
  return (
    <div key={key} style={{ display: 'flex', alignItems: 'baseline', marginTop: 14 }}>
      <div
        style={{
          display: 'flex',
          width: 250,
          flexShrink: 0,
          fontSize: 18,
          letterSpacing: 3,
          color: '#6b7280'
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: options?.valueSize ?? 26,
          fontWeight: options?.valueWeight ?? 600,
          color: options?.valueColor ?? '#111827'
        }}
      >
        {options?.preserveTail
          ? truncateAddressForCard(value, 60)
          : truncateForCard(value, 60)}
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
export function buildBackElement(input: BackRenderInput): ReactElement {
  const { person, layout, backgroundDataUrl, barcodeDataUrl } = input;
  const showBloodGroup = layout.show_blood_group ?? true;
  const showDob = layout.show_dob ?? true;
  const showGuardian = layout.show_guardian ?? true;
  const showAddress = layout.show_address ?? true;
  const showBarcode = layout.show_barcode ?? true;
  const showContact = layout.show_contact ?? true;
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
      backInfoRow('blood', 'BLOOD GROUP', person.bloodGroup, {
        valueSize: 34,
        valueColor: BRAND_GREEN,
        valueWeight: 800
      })
    );
  }
  if (showDob && person.dateOfBirthLabel) {
    infoRows.push(backInfoRow('dob', 'DATE OF BIRTH', person.dateOfBirthLabel));
  }
  if (showGuardian && person.guardianName) {
    infoRows.push(
      backInfoRow(
        'guardian',
        'GUARDIAN',
        [person.guardianName, person.guardianPhone].filter(Boolean).join('   •   ')
      )
    );
  }
  if (showAddress && person.address) {
    infoRows.push(
      backInfoRow('address', 'ADDRESS', person.address, { valueSize: 22, preserveTail: true })
    );
  }
  if (showContact && person.contactPhone) {
    infoRows.push(backInfoRow('contact', 'CONTACT', person.contactPhone));
  }

  // Overlay elements — absolutely positioned above the default blocks.
  const overlays: ReactElement[] = [];
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
    const fontSize = element.font_size ?? 24;
    // The address is the one wrapping field: size it to its own box and elide
    // the middle so district/state/PIN survive. Every other field keeps the
    // generic head-only cap, byte-identical to before.
    const text =
      element.field === 'address'
        ? truncateAddressForCard(value, addressCharBudget(element.width, fontSize))
        : truncateForCard(value, BACK_ELEMENT_MAX_CHARS);
    overlays.push(
      <div
        key={key}
        style={{
          display: 'flex',
          position: 'absolute',
          left: element.x,
          top: element.y,
          ...(element.width !== undefined ? { width: element.width } : {}),
          justifyContent:
            element.align === 'center'
              ? 'center'
              : element.align === 'right'
                ? 'flex-end'
                : 'flex-start',
          fontSize,
          fontWeight: element.font_weight ?? 400,
          color: element.color ?? '#111827'
        }}
      >
        {text}
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
            objectFit: 'cover'
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

  return portrait && layout.orientation
    ? rotatePortraitIntoCanvas(content, layout.orientation)
    : content;
}
