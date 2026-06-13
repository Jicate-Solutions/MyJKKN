import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DistributePanel } from '../distribute-panel';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}));
vi.mock('@/hooks/admission/use-unassigned-leads', () => ({
  useUnassignedLeads: () => ({ data: { leads: [], totalCount: 0 }, isLoading: false }),
}));
vi.mock('@/hooks/admission/use-source-counselors-with-load', () => ({
  useSourceCounselorsWithLoad: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/admission/use-bulk-assign', () => ({
  useBulkAssign: () => ({
    bulkOne: { mutateAsync: vi.fn(), isPending: false },
    autoRoute: { mutateAsync: vi.fn(), isPending: false },
    roundRobin: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { usePermissions } from '@/hooks/use-permissions';

function renderPanel(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DistributePanel
        sourceId="test-src-id"
        sourceEnum={'whatsapp' as any}
        institutionId="test-inst"
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('DistributePanel permission gate', () => {
  it('renders nothing when user lacks admission.settings.sources.manage', () => {
    (usePermissions as any).mockReturnValue({
      canAccess: () => false,
      isSuperAdmin: false,
    });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it('also renders nothing when there are no unassigned leads and panel is collapsed', () => {
    (usePermissions as any).mockReturnValue({
      canAccess: (mod: string, action: string) =>
        mod === 'admission.settings.sources' && action === 'manage',
      isSuperAdmin: false,
    });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });
});
