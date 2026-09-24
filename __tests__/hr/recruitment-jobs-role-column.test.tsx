// @vitest-environment jsdom
/**
 * BUG-004905 — on /hr/recruitment/jobs the Role category column printed
 * "Learning Facilitator (Teaching Faculty)" in a 160px column, which wrapped and
 * crowded the Job title out of view. The reporter asked for "LF". The table now
 * shows a short label on one line and keeps the full label as the tooltip.
 */
import '@testing-library/jest-dom';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CellContext } from '@tanstack/react-table';

import { getJobColumns } from '@/app/(routes)/hr/recruitment/jobs/_components/jobs-columns';
import type { HRRecruitmentJob } from '@/types/hr-recruitment';

afterEach(cleanup);

function renderRoleCell(role: HRRecruitmentJob['role_category']) {
  const columns = getJobColumns({
    institutionNameById: new Map(),
    departmentNameById: new Map(),
    onEdit: () => {},
    onDelete: () => {},
  });
  const col = columns.find((c) => (c as { accessorKey?: string }).accessorKey === 'role_category')!;
  const cell = col.cell as (ctx: CellContext<HRRecruitmentJob, unknown>) => React.ReactNode;
  const row = { original: { role_category: role } as HRRecruitmentJob };
  return render(<>{cell({ row } as unknown as CellContext<HRRecruitmentJob, unknown>)}</>);
}

describe('Jobs table — role category column', () => {
  it('shows "LF" for teaching faculty, with the full label as the tooltip', () => {
    const { container } = renderRoleCell('teaching_faculty');
    const span = container.querySelector('span')!;
    expect(span).toHaveTextContent(/^LF$/);
    expect(span).toHaveAttribute('title', 'Learning Facilitator (Teaching Faculty)');
  });

  it('keeps every category label short enough for one line', () => {
    for (const role of ['teaching_faculty', 'medical', 'non_teaching', 'senior_leadership', 'contract'] as const) {
      const { container } = renderRoleCell(role);
      expect(container.querySelector('span')!.textContent!.length).toBeLessThanOrEqual(12);
      cleanup();
    }
  });
});
