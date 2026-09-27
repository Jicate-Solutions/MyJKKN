// ============================================================================
// safeReportHref — the origin of a stored page_url is DISCARDED, always.
//
// `bug_reports.page_url` is written by the browser from window.location.href
// and stored raw, so it is untrusted. A live audit of the column found four
// origins (www.jkkn.ai 3246, my.jkkn.ac.in 161, myadmin.jkkn.ac.in 91,
// localhost:3000 1). Rendering the stored value as a link would be an open
// redirect and would point 252 reporters at hosts that no longer serve them.
//
// Every case below is its own `it`, so a regression names the exact shape that
// broke rather than a single collapsed assertion.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { safeReportHref } from '@/lib/bug-reports/safe-report-href';

describe('safeReportHref — real stored values', () => {
  it("keeps the path and drops the app's cache-buster (BUG-003162's own URL)", () => {
    expect(safeReportHref('https://www.jkkn.ai/dashboard?v=1775003469061')).toBe('/dashboard');
  });

  it('keeps only the path of a my.jkkn.ac.in report', () => {
    expect(safeReportHref('https://my.jkkn.ac.in/academic/attendance')).toBe('/academic/attendance');
  });

  it('keeps only the path of a myadmin.jkkn.ac.in report', () => {
    expect(safeReportHref('https://myadmin.jkkn.ac.in/admin/bug-reports')).toBe(
      '/admin/bug-reports'
    );
  });

  it('keeps only the path of the one localhost:3000 report', () => {
    expect(safeReportHref('http://localhost:3000/my-bug-reports')).toBe('/my-bug-reports');
  });

  it('keeps a genuine query string', () => {
    expect(safeReportHref('https://www.jkkn.ai/learners/my-bills?tab=outstanding')).toBe(
      '/learners/my-bills?tab=outstanding'
    );
  });
});

describe('safeReportHref — the origin can never leak into the href', () => {
  it('a foreign origin is stripped, not trusted, and not refused', () => {
    expect(safeReportHref('https://evil.example.com/learners/my-bills?tab=outstanding')).toBe(
      '/learners/my-bills?tab=outstanding'
    );
  });

  it('a foreign origin with credentials and a port is still reduced to its path', () => {
    expect(safeReportHref('https://user:pass@evil.example.com:8443/dashboard')).toBe('/dashboard');
  });
});

describe('safeReportHref — refuses anything that could navigate off-origin', () => {
  it('javascript: is null', () => {
    expect(safeReportHref('javascript:alert(1)')).toBeNull();
  });

  it('data: is null', () => {
    expect(safeReportHref('data:text/html,<h1>hi</h1>')).toBeNull();
  });

  it('vbscript: is null', () => {
    expect(safeReportHref('vbscript:msgbox(1)')).toBeNull();
  });

  it('a protocol-relative URL is null (it resolves to an innocent-looking path)', () => {
    expect(safeReportHref('//evil.example.com/x')).toBeNull();
  });

  it('a backslash-doubled protocol-relative URL is null', () => {
    expect(safeReportHref('\\\\evil.example.com/x')).toBeNull();
  });

  it('a path that is itself protocol-relative is null', () => {
    expect(safeReportHref('https://www.jkkn.ai//evil.example.com/x')).toBeNull();
  });

  it('a backslash path that normalises to protocol-relative is null', () => {
    expect(safeReportHref('https://www.jkkn.ai/\\evil.example.com')).toBeNull();
  });
});

describe('safeReportHref — nothing worth linking to', () => {
  it('null input is null', () => {
    expect(safeReportHref(null)).toBeNull();
  });

  it('an empty string is null', () => {
    expect(safeReportHref('')).toBeNull();
  });

  it('whitespace only is null', () => {
    expect(safeReportHref('   ')).toBeNull();
  });

  it('a bare origin with no path is null', () => {
    expect(safeReportHref('https://www.jkkn.ai/')).toBeNull();
  });

  it('a bare origin whose only param is a cache-buster is null', () => {
    expect(safeReportHref('https://www.jkkn.ai/?v=1775003469061')).toBeNull();
  });
});

describe('safeReportHref — query cleanup', () => {
  it('drops an empty-valued param', () => {
    expect(safeReportHref('https://www.jkkn.ai/dashboard?tab=')).toBe('/dashboard');
  });

  it('drops the cache-buster but keeps the real param alongside it', () => {
    expect(safeReportHref('https://www.jkkn.ai/dashboard?v=1775003469061&tab=open')).toBe(
      '/dashboard?tab=open'
    );
  });

  it('keeps a v param that is NOT all digits (it is not our cache-buster)', () => {
    expect(safeReportHref('https://www.jkkn.ai/dashboard?v=summary')).toBe('/dashboard?v=summary');
  });

  it('drops the fragment', () => {
    expect(safeReportHref('https://www.jkkn.ai/dashboard#section-2')).toBe('/dashboard');
  });
});
