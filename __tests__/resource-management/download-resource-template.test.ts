// __tests__/resource-management/download-resource-template.test.ts
//
// BUG-003977 — "Download Template" on the Resources page threw
//   Error: Sheet name cannot contain : \ / ? * [ ]
// because four reference worksheets were named "Reference: <thing>". SheetJS
// validates the name inside book_append_sheet, so a single bad name aborts the
// whole workbook write and the user gets no file at all.
//
// This guards every worksheet name the generator uses against Excel's rules.

import { describe, it, expect } from 'vitest';

// The component pulls in permission hooks whose service modules build a Supabase
// browser client at import time. Give them something to read before importing.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

const { TEMPLATE_SHEET_NAMES } = await import(
  '@/app/(routes)/resource-management/resources/_components/download-resource-template'
);

/** Characters Excel forbids in a worksheet name. */
const FORBIDDEN_SHEET_NAME_CHARS = /[:\\/?*\[\]]/;

/** Excel's hard cap on worksheet name length. */
const MAX_SHEET_NAME_LENGTH = 31;

const SHEET_NAME_ENTRIES = Object.entries(TEMPLATE_SHEET_NAMES) as [
  string,
  string
][];

describe('resource bulk-import template — worksheet names', () => {
  it('declares a name for each of the six sheets', () => {
    expect(SHEET_NAME_ENTRIES).toHaveLength(6);
  });

  it.each(SHEET_NAME_ENTRIES)(
    '%s ("%s") contains no character Excel forbids',
    (_key, name) => {
      expect(name).not.toMatch(FORBIDDEN_SHEET_NAME_CHARS);
    }
  );

  it.each(SHEET_NAME_ENTRIES)(
    '%s ("%s") is non-empty and within the 31-character limit',
    (_key, name) => {
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(MAX_SHEET_NAME_LENGTH);
    }
  );

  it('uses a distinct name for every sheet', () => {
    const names = Object.values(TEMPLATE_SHEET_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });

  // The import API (app/api/resource-management/resources/import/route.ts)
  // looks up this exact sheet name, so renaming it would break bulk upload.
  it('keeps the data sheet named "Resources" for the import API', () => {
    expect(TEMPLATE_SHEET_NAMES.resources).toBe('Resources');
  });
});
