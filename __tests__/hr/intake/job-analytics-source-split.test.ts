// A CVViZ import is a careers-page applicant, so the per-job source split counts
// it on the website side, never as an internal (HR-keyed) application.
import { describe, expect, it, vi } from 'vitest';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

describe('getJobAnalytics source_split', () => {
  it('counts cvviz_import with the website, not internal', async () => {
    vi.spyOn(RecruitmentService, 'listCandidatesForJob').mockResolvedValue([] as never);
    const apps = [
      { status: 'pending', submitted_at: '2026-09-01T00:00:00Z', reviewed_at: null, source: 'external_website' },
      { status: 'pending', submitted_at: '2026-09-01T00:00:00Z', reviewed_at: null, source: 'cvviz_import' },
      { status: 'pending', submitted_at: '2026-09-01T00:00:00Z', reviewed_at: null, source: 'cvviz_import' },
      { status: 'pending', submitted_at: '2026-09-01T00:00:00Z', reviewed_at: null, source: 'internal' },
    ];
    const chain = { select: () => chain, eq: () => chain, limit: async () => ({ data: apps, error: null }) };
    const supabase = { from: () => chain } as never;
    const out = await RecruitmentService.getJobAnalytics(supabase, 'job-1');
    expect(out.source_split).toEqual({ internal: 1, website: 3 });
  });
});
