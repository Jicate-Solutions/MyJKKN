export const dynamic = 'force-dynamic';

// app/api/admission/whatsapp-broadcast/upload/route.ts
// POST: Parse uploaded CSV, validate phone numbers, return parsed contacts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ParsedContact {
  phone: string;
  name: string;
  variables: Record<string, string>;
  valid: boolean;
  error?: string;
}

function cleanPhone(raw: string): string {
  let cleaned = raw.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '91' + cleaned.substring(1);
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  return cleaned;
}

/**
 * Validates a raw phone string before any cleaning.
 * Rules:
 *   - Must not contain alphabetic characters (rejects "abc123", "N/A", etc.)
 *   - After stripping allowed separators (+, space, dash, parens, dots),
 *     only digits may remain and there must be at least 10 of them.
 *   - Rejects obvious placeholders (all-identical digits, e.g. "0000000000").
 * Returns null when valid, or a human-readable error string when invalid.
 */
function validateRawPhone(raw: string): string | null {
  if (!raw || raw.trim() === '') return 'Empty phone number';

  // Reject anything containing letters
  if (/[a-zA-Z]/.test(raw)) return 'Phone number contains letters';

  // Strip allowed separators: +, space, dash, parentheses, dots
  const digitsOnly = raw.replace(/[\s+\-().]/g, '');

  // After stripping separators only digits should remain
  if (!/^\d+$/.test(digitsOnly)) return 'Phone number contains invalid characters';

  if (digitsOnly.length < 10) return 'Phone number too short (minimum 10 digits)';
  if (digitsOnly.length > 15) return 'Phone number too long (maximum 15 digits)';

  // Reject obvious placeholder values (all same digit, e.g. 0000000000)
  if (/^(\d)\1+$/.test(digitsOnly)) return 'Phone number is a placeholder (all identical digits)';

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { rows, column_map } = body as {
      rows: Record<string, string>[];
      column_map?: { phone: string; name?: string; [key: string]: string | undefined };
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    if (rows.length > 10000) {
      return NextResponse.json({ error: 'Maximum 10,000 contacts per upload' }, { status: 400 });
    }

    // Auto-detect phone column if not mapped
    const phoneCol = column_map?.phone || autoDetectColumn(rows[0], ['phone', 'mobile', 'whatsapp', 'contact', 'number', 'tel']);
    const nameCol = column_map?.name || autoDetectColumn(rows[0], ['name', 'full_name', 'student_name', 'contact_name']);

    if (!phoneCol) {
      return NextResponse.json(
        { error: 'Could not detect phone number column. Please provide column_map.' },
        { status: 400 }
      );
    }

    // Parse and validate
    const contacts: ParsedContact[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const rawPhone = row[phoneCol] || '';
      const phone = cleanPhone(rawPhone);
      const name = nameCol ? (row[nameCol] || '') : '';

      // Build variables from all columns
      const variables: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key !== phoneCol && value) {
          variables[key] = value.trim();
        }
      }
      if (name) variables.name = name;

      if (!rawPhone || !isValidPhone(rawPhone)) {
        contacts.push({ phone, name, variables, valid: false, error: 'Invalid phone number' });
        continue;
      }

      if (seen.has(phone)) {
        contacts.push({ phone, name, variables, valid: false, error: 'Duplicate' });
        continue;
      }

      seen.add(phone);
      contacts.push({ phone, name, variables, valid: true });
    }

    const valid = contacts.filter(c => c.valid);
    const invalid = contacts.filter(c => !c.valid);

    return NextResponse.json({
      total: contacts.length,
      valid_count: valid.length,
      invalid_count: invalid.length,
      contacts: valid,
      errors: invalid.slice(0, 50), // Cap error display
      detected_columns: {
        phone: phoneCol,
        name: nameCol,
        all: Object.keys(rows[0] || {}),
      },
    });
  } catch (error) {
    console.error('[whatsapp-broadcast/upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse contacts' },
      { status: 500 }
    );
  }
}

function autoDetectColumn(row: Record<string, string>, candidates: string[]): string | null {
  const originalKeys = Object.keys(row);
  const keys = originalKeys.map(k => k.toLowerCase().trim());

  // Pass 1: Exact match (e.g., "phone" matches "phone" but not "phonenum")
  for (const candidate of candidates) {
    const idx = keys.findIndex(k => k === candidate);
    if (idx !== -1) return originalKeys[idx];
  }

  // Pass 2: startsWith (e.g., "phone_number" matches "phone")
  for (const candidate of candidates) {
    const idx = keys.findIndex(k => k.startsWith(candidate));
    if (idx !== -1) return originalKeys[idx];
  }

  // Pass 3: includes as loose fallback (e.g., "my_phone" matches "phone")
  for (const candidate of candidates) {
    const idx = keys.findIndex(k => k.includes(candidate));
    if (idx !== -1) return originalKeys[idx];
  }

  return null;
}
