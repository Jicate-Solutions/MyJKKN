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
  resolveMappedValue,
  initialsFromName,
  truncateForCard,
  type CardField,
  type CardPersonData,
  type FieldMapping
} from '@/lib/id-cards/render-data';

export const CARD_WIDTH = 1014;
export const CARD_HEIGHT = 638;

const BRAND_GREEN = '#0b6d41';

export type FrontLayoutElement = {
  field: CardField | 'static_text';
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

export type FrontLayout = {
  background_color?: string;
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

  if (Array.isArray(obj.elements)) {
    const elements: FrontLayoutElement[] = [];
    for (const entry of obj.elements) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const el = entry as Record<string, unknown>;
      const field = el.field;
      if (typeof field !== 'string') continue;
      if (field !== 'static_text' && !(CARD_FIELDS as readonly string[]).includes(field)) {
        continue;
      }
      const x = Number(el.x);
      const y = Number(el.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const parsed: FrontLayoutElement = {
        field: field as FrontLayoutElement['field'],
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
    if (elements.length > 0) layout.elements = elements;
  }

  const hasContent =
    layout.background_color !== undefined ||
    layout.header !== undefined ||
    (layout.elements?.length ?? 0) > 0;
  return hasContent ? layout : null;
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
  const { person, photoDataUrl, qrDataUrl, validUntilLabel } = input;
  const idLine = identityLine(person);
  const course = courseLine(person);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: input.layout?.background_color ?? '#ffffff',
        fontFamily: 'sans-serif'
      }}
    >
      {headerBand(person.institutionName, headerOverrides)}

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
  element: FrontLayoutElement,
  input: CardRenderInput
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
  const { person, photoDataUrl, qrDataUrl } = input;
  const children: ReactElement[] = [];

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
        backgroundColor: layout.background_color ?? '#ffffff',
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
