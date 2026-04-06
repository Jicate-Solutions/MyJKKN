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

function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
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
  const keys = Object.keys(row).map(k => k.toLowerCase().trim());
  for (const candidate of candidates) {
    const match = keys.find(k => k.includes(candidate));
    if (match) {
      return Object.keys(row).find(k => k.toLowerCase().trim() === match) || null;
    }
  }
  return null;
}
