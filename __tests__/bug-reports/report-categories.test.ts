// BUG-reporter "Question" reports were refused with a 400 and lost: the widget
// offered 'question' but POST /api/bug-reports only accepted the other values.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_TOP_CATEGORIES, REPORT_CATEGORIES } from '@/lib/bug-reports/report-categories';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('bug report categories', () => {
  it('the API accepts every category the widget offers', () => {
    for (const c of WIDGET_TOP_CATEGORIES) {
      expect(REPORT_CATEGORIES as readonly string[]).toContain(c);
    }
  });

  it('the API validates against the shared list, not its own copy', () => {
    const route = read('app/api/bug-reports/route.ts');
    expect(route).toMatch(/\.enum\(REPORT_CATEGORIES\)/);
    expect(route).not.toMatch(/\.enum\(\[\s*'bug'/);
  });

  it('the widget offers the shared list, not its own copy', () => {
    const widget = read('components/bug-reporter/bug-reporter-widget.tsx');
    expect(widget).toMatch(/VALID_TOP_CATEGORIES = WIDGET_TOP_CATEGORIES/);
  });
});
