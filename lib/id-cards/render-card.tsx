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

import type { ReactElement } from 'react';
import {
  CARD_FIELDS,
  BACK_CARD_FIELDS,
  resolveMappedValue,
  initialsFromName,
  truncateForCard,
  type CardField,
  type BackCardField,
  type CardPersonData,
  type FieldMapping
} from '@/lib/id-cards/render-data';

export const CARD_WIDTH = 1014;
export const CARD_HEIGHT = 638;

const BRAND_GREEN = '#0b6d41';

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
 * for front and back — only the allowed-field alphabet differs.
 */
function parseElements<F extends string>(
  raw: unknown,
  allowedFields: readonly F[]
): LayoutElementOf<F>[] {
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
      x: clamp(Math.round(x), 0, CARD_WIDTH),
      y: clamp(Math.round(y), 0, CARD_HEIGHT)
    };
    if (typeof el.text === 'string') parsed.text = el.text;
    const width = Number(el.width);
    if (Number.isFinite(width) && width > 0) {
      parsed.width = clamp(Math.round(width), 1, CARD_WIDTH);
    }
    const height = Number(el.height);
    if (Number.isFinite(height) && height > 0) {
      parsed.height = clamp(Math.round(height), 1, CARD_HEIGHT);
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

  const elements = parseElements(obj.elements, CARD_FIELDS);
  if (elements.length > 0) layout.elements = elements;

  const hasContent =
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

  const elements = parseElements(obj.elements, BACK_CARD_FIELDS);
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
    default:
      return '';
  }
}

function customDesign(input: CardRenderInput, layout: FrontLayout): ReactElement {
  const { person, photoDataUrl, qrDataUrl, backgroundDataUrl } = input;
  const children: ReactElement[] = [];

  if (backgroundDataUrl) {
    children.push(
      <img
        key="background"
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
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
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
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export function buildCardElement(input: CardRenderInput): ReactElement {
  const layout = input.layout;
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

/** Label + value row for the back's info block. */
function backInfoRow(
  key: string,
  label: string,
  value: string,
  options?: { valueSize?: number; valueColor?: string; valueWeight?: number }
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
        {truncateForCard(value, 60)}
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
    infoRows.push(backInfoRow('address', 'ADDRESS', person.address, { valueSize: 22 }));
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
          fontSize: element.font_size ?? 24,
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
        flexDirection: 'column',
        position: 'relative',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
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
}
