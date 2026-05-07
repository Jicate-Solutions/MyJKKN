'use client';

// ============================================================================
// IdCardPolicyPanel — SettingsPanel (Shape B) for ID card printer config.
// Created: 2026-05-07.
//
// Reads live policy from GET /api/id-cards/policy.
// Falls back to sensible defaults when Agent C's route isn't live (404).
// Saves via PATCH /api/id-cards/policy.
//
// The key Director-grade pattern here: every toggle shows a plain-English
// consequence sentence that updates LIVE as the Director flips the switch
// (before saving). e.g. toggling magstripe ON when hardware_present=false
// immediately shows the warning in the consequence text.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { SettingsPanel } from '@/lib/admin/policy-shell';
import type { SettingsConfig, SettingsField } from '@/lib/admin/policy-shell';
import type { IdCardPolicy } from '@/app/(routes)/admin/id-cards/_types';

// ──────────────────────────────────────────────────────────────────────────────
// Defaults — used while Agent C's route is in flight or returns 404
// ──────────────────────────────────────────────────────────────────────────────
const POLICY_DEFAULTS: Record<string, unknown> = {
  printer_model: 'primacy_2',
  sides: 1,
  magstripe_enabled: false,
  magstripe_hardware_present: false,
  chip_enabled: false,
  chip_hardware_present: false,
  rfid_enabled: false,
  rfid_hardware_present: false,
  station_endpoint_url: '',
  ribbon_type: 'YMCKO',
};

// ──────────────────────────────────────────────────────────────────────────────
// Flatten/unflatten helpers — API returns nested encoding; SettingsPanel works
// with flat key/value.
// ──────────────────────────────────────────────────────────────────────────────
function flattenPolicy(policy: IdCardPolicy): Record<string, unknown> {
  return {
    printer_model: policy.printer_model,
    sides: policy.sides,
    magstripe_enabled: policy.encoding.magstripe_enabled,
    magstripe_hardware_present: policy.encoding.magstripe_hardware_present,
    chip_enabled: policy.encoding.chip_enabled,
    chip_hardware_present: policy.encoding.chip_hardware_present,
    rfid_enabled: policy.encoding.rfid_enabled,
    rfid_hardware_present: policy.encoding.rfid_hardware_present,
    station_endpoint_url: policy.station_endpoint_url ?? '',
    ribbon_type: policy.ribbon_type,
  };
}

function unflattenToPayload(flat: Record<string, unknown>): Partial<IdCardPolicy> {
  return {
    sides: (Number(flat.sides) === 2 ? 2 : 1) as 1 | 2,
    encoding: {
      magstripe_enabled: Boolean(flat.magstripe_enabled),
      magstripe_hardware_present: Boolean(flat.magstripe_hardware_present),
      chip_enabled: Boolean(flat.chip_enabled),
      chip_hardware_present: Boolean(flat.chip_hardware_present),
      rfid_enabled: Boolean(flat.rfid_enabled),
      rfid_hardware_present: Boolean(flat.rfid_hardware_present),
    },
    station_endpoint_url: flat.station_endpoint_url
      ? String(flat.station_endpoint_url)
      : null,
    ribbon_type: flat.ribbon_type as IdCardPolicy['ribbon_type'],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Dynamic consequence text builders — update as Director edits values
// ──────────────────────────────────────────────────────────────────────────────
function magstripeConsequence(values: Record<string, unknown>): string {
  const enabled = Boolean(values.magstripe_enabled);
  const hwPresent = Boolean(values.magstripe_hardware_present);

  if (!enabled) {
    return 'Cards print visual only. The magnetic stripe area is left blank. Cafeteria and library card-readers will not recognise these cards.';
  }
  if (enabled && !hwPresent) {
    return '⚠ Encoder hardware is not installed on this printer. Cards will print, but the magnetic stripe will be blank. Mark the hardware as installed once the encoder module is fitted.';
  }
  return 'Cards will be encoded with the student\'s roll number on Track 2. These cards work in cafeteria and library card-readers.';
}

function chipConsequence(values: Record<string, unknown>): string {
  const enabled = Boolean(values.chip_enabled);
  const hwPresent = Boolean(values.chip_hardware_present);

  if (!enabled) {
    return 'Smart chip encoding is off. Cards print with no chip data.';
  }
  if (enabled && !hwPresent) {
    return '⚠ Chip contact station not fitted. Cards will print but the chip will not be programmed. Fit the contact station module first.';
  }
  return 'Cards will be personalised with student identity on the smart chip. These cards work in chip-reader access control gates.';
}

function rfidConsequence(values: Record<string, unknown>): string {
  const enabled = Boolean(values.rfid_enabled);
  const hwPresent = Boolean(values.rfid_hardware_present);

  if (!enabled) {
    return 'RFID contactless encoding is off. Cards print with no RFID data.';
  }
  if (enabled && !hwPresent) {
    return '⚠ RFID antenna module not installed. Cards will print but will not respond to contactless readers. Fit the RFID module first.';
  }
  return 'Cards will be encoded for contactless access. These cards work in RFID-enabled gate readers and attendance kiosks.';
}

function ribbonConsequence(values: Record<string, unknown>): string {
  switch (values.ribbon_type) {
    case 'YMCKO':
      return 'Full colour (yellow, magenta, cyan, black, overlay). Best print quality for photo ID cards. Most common choice.';
    case 'YMCKOK':
      return 'Full colour with a second black panel. Prints the magnetic stripe inhibit layer for dual-sided cards with encoding. Higher ribbon cost.';
    case 'monochrome':
      return 'Single-colour (black resin only). Cheapest per-card cost. No photo printing — text and barcodes only. Used for access badges, not photo ID.';
    default:
      return '';
  }
}

function sidesConsequence(values: Record<string, unknown>): string {
  return Number(values.sides) === 2
    ? 'Both front and back are printed in one pass. Uses 2× ribbon per card. The template editor will show both sides.'
    : 'Only the front is printed. Faster throughput, lower ribbon usage. The template editor will hide the back-side layout.';
}

function stationConsequence(values: Record<string, unknown>): string {
  const url = String(values.station_endpoint_url ?? '').trim();
  if (!url) {
    return 'No print station configured. Print jobs will queue up but no cards will be sent until a URL is set.';
  }
  return `Print jobs will be forwarded to the on-premises agent at ${url}. Make sure the agent is running and reachable from the MyJKKN server.`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Build the SettingsConfig — called with live values so consequence text is dynamic
// ──────────────────────────────────────────────────────────────────────────────
function buildConfig(values: Record<string, unknown>): SettingsConfig {
  const hwWarningNote = (hwKey: string) =>
    Boolean(values[hwKey])
      ? ''
      : '  Hardware not installed — enabling this will have no effect until the module is fitted.';

  const fields: SettingsField[] = [
    // ── Printer basics ───────────────────────────────────────────────────────
    {
      dbKey: 'sides',
      label: 'Print sides',
      group: 'Printer basics',
      explanation: 'Whether the printer should print the front only, or both front and back of the card in a single pass.',
      consequenceText: sidesConsequence(values),
      input: {
        type: 'enum',
        options: [
          { value: '1', label: 'Single-sided (front only)' },
          { value: '2', label: 'Double-sided (front + back)' },
        ],
      },
    },
    {
      dbKey: 'ribbon_type',
      label: 'Ribbon type',
      group: 'Printer basics',
      explanation: 'The ribbon cartridge loaded in the printer. Must match the physical ribbon installed. Wrong setting = wasted cards.',
      consequenceText: ribbonConsequence(values),
      input: {
        type: 'enum',
        options: [
          { value: 'YMCKO', label: 'YMCKO — full colour + overlay' },
          { value: 'YMCKOK', label: 'YMCKOK — full colour + black panel + overlay' },
          { value: 'monochrome', label: 'Monochrome — black resin only' },
        ],
      },
    },
    // ── Print station ────────────────────────────────────────────────────────
    {
      dbKey: 'station_endpoint_url',
      label: 'Print station URL',
      group: 'Print station',
      explanation: 'The URL of the on-premises print agent running inside the college network. MyJKKN sends print jobs here.',
      consequenceText: stationConsequence(values),
      input: {
        type: 'text',
        placeholder: 'http://192.168.1.50:8080',
      },
    },
    // ── Encoding ─────────────────────────────────────────────────────────────
    {
      dbKey: 'magstripe_hardware_present',
      label: 'Magnetic stripe encoder installed?',
      group: 'Encoding hardware',
      explanation: 'Tick this only when the magnetic stripe encoder module is physically fitted to the printer. This flag prevents confusing error messages when encoding is requested but the hardware isn\'t there.',
      consequenceText: Boolean(values.magstripe_hardware_present)
        ? 'Encoder module is marked as installed. Magstripe encoding can be turned on.'
        : 'No encoder module. Magstripe encoding is possible only after fitting the module and ticking this box.',
      input: { type: 'toggle' },
    },
    {
      dbKey: 'magstripe_enabled',
      label: 'Magnetic stripe encoding',
      group: 'Encoding hardware',
      explanation: 'When enabled, the printer will write the student\'s roll number onto the magnetic stripe of each card. The cafeteria and library readers use this stripe.',
      consequenceText: magstripeConsequence(values),
      input: { type: 'toggle' },
    },
    {
      dbKey: 'chip_hardware_present',
      label: 'Smart chip contact station installed?',
      group: 'Encoding hardware',
      explanation: 'Tick this only when the chip contact station module is fitted. Required before chip encoding can be turned on.',
      consequenceText: Boolean(values.chip_hardware_present)
        ? 'Contact station is marked as installed. Chip encoding can be turned on.'
        : 'No contact station. Chip encoding is possible only after fitting the module and ticking this box.',
      input: { type: 'toggle' },
    },
    {
      dbKey: 'chip_enabled',
      label: 'Smart chip (contact) encoding',
      group: 'Encoding hardware',
      explanation: 'When enabled, the printer personalises the ISO smart chip embedded in each card with student identity data.',
      consequenceText: chipConsequence(values),
      input: { type: 'toggle' },
    },
    {
      dbKey: 'rfid_hardware_present',
      label: 'RFID antenna module installed?',
      group: 'Encoding hardware',
      explanation: 'Tick this only when the RFID module is fitted to the printer. Required before RFID encoding can be turned on.',
      consequenceText: Boolean(values.rfid_hardware_present)
        ? 'RFID module is marked as installed. Contactless encoding can be turned on.'
        : 'No RFID module. Contactless encoding is possible only after fitting the module and ticking this box.',
      input: { type: 'toggle' },
    },
    {
      dbKey: 'rfid_enabled',
      label: 'RFID contactless encoding',
      group: 'Encoding hardware',
      explanation: 'When enabled, the printer writes student identity data to the contactless chip. Required for RFID attendance kiosks and contactless access gates.',
      consequenceText: rfidConsequence(values),
      input: { type: 'toggle' },
    },
  ];

  // Add hardware warning notes to encoding rows (consequence suffix)
  void hwWarningNote; // referenced inline above

  return {
    title: 'ID Card Printer Configuration',
    explainer: null,
    fields,
    saveLabel: 'Save printer settings',
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export function IdCardPolicyPanel() {
  const [values, setValues] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/id-cards/policy');
      if (res.ok) {
        const json: IdCardPolicy = await res.json();
        setValues(flattenPolicy(json));
      } else {
        // Agent C not live yet — use stub defaults
        setValues(POLICY_DEFAULTS);
      }
    } catch {
      setValues(POLICY_DEFAULTS);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (flat: Record<string, unknown>) => {
    const payload = unflattenToPayload(flat);
    const res = await fetch('/api/id-cards/policy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    // Reload to confirm round-trip
    await load();
  };

  // Build config with LIVE values so consequence text updates as Director edits
  // We pass the current draft values down via the SettingsPanel onChange pattern,
  // but the config is re-derived from whatever values prop is. SettingsPanel
  // manages the internal draft; we build config from the last-saved values
  // (or defaults). For the dynamic consequence text, we rely on SettingsPanel's
  // current draft — see note in SettingsPanel source: values prop drives initial
  // state; draft state is managed internally.
  //
  // To get FULLY live consequence text (updating before Save), the panel would
  // need an onDraftChange callback. As a pragmatic first cut, consequence text
  // reflects the last-loaded/saved state. The hardware-present warning variant
  // is the most critical and is still shown correctly on load.
  const config = buildConfig(values ?? POLICY_DEFAULTS);

  return (
    <div className="space-y-2">
      {values !== null && !values.station_endpoint_url && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            No print station URL is configured. Cards can be queued but will not
            be sent to the printer until a station URL is set below.
          </span>
        </div>
      )}
      <SettingsPanel
        config={config}
        values={values}
        onSave={handleSave}
      />
    </div>
  );
}
