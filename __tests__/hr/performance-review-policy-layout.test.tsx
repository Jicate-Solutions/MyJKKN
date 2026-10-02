// @vitest-environment jsdom
// =====================================================================
// HR appraisal settings — the promotion block must span the full row
// =====================================================================
// Seen in a browser run: the block sat in the two-column grid beside the
// Collegiality-example switch, so that switch's box stretched to the
// block's height and showed as a tall empty panel. Spanning both columns
// keeps each setting at its own height.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { Fragment, createElement, isValidElement, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Wrappers render whatever elements they were given, and nothing else.
function passThrough(props: Record<string, unknown>) {
  const nested = Object.values(props).flat().filter(isValidElement);
  return createElement(Fragment, null, ...nested);
}
vi.mock('@/components/auth/permission-guard', () => ({ PermissionGuard: passThrough }));
vi.mock('@/components/layout/content-layout', () => ({ ContentLayout: passThrough }));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));
vi.mock('@/app/(routes)/hr/admin/policies/_shared/policy-editor-shell', () => ({
  PolicyEditorShell: (p: {
    defaultValue: unknown;
    renderEditor: (v: unknown, onChange: () => void, disabled: boolean) => ReactNode;
  }) => <>{p.renderEditor(p.defaultValue, () => {}, false)}</>,
}));

import PerformanceReviewPage from '@/app/(routes)/hr/admin/policies/performance-review/page';

describe('performance review settings layout', () => {
  it('lets the promotion block span both columns of the grid', () => {
    render(<PerformanceReviewPage />);
    const block = screen.getByText('How ratings count towards promotion').closest('div.rounded-md');
    expect(block).not.toBeNull();
    expect(block!.className).toContain('md:col-span-2');
  });
});
