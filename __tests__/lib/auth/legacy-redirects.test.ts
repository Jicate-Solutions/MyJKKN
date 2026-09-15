import { describe, it, expect } from 'vitest';
import { LEGACY_REDIRECTS, resolveLegacyRedirect } from '@/lib/auth/legacy-redirects';

describe('legacy redirects served from proxy.ts (route budget, 2026-09-14)', () => {
  it('a prefix rule covers the bare path and everything under it, remainder kept', () => {
    expect(resolveLegacyRedirect('/admin/hr')).toEqual({ pathname: '/hr/admin', status: 307 });
    expect(resolveLegacyRedirect('/admin/hr/leave/policy')).toEqual({ pathname: '/hr/admin/leave/policy', status: 307 });
    expect(resolveLegacyRedirect('/api/solutions/compliance/x/y')).toEqual({ pathname: '/api/solutions/ai-solution-compliance/x/y', status: 308 });
  });

  it('the two carve-outs win over their prefix twin, exactly as next.config ordered them', () => {
    expect(resolveLegacyRedirect('/iqac')).toEqual({ pathname: '/accreditation', status: 308 });
    expect(resolveLegacyRedirect('/iqac/reports')).toEqual({ pathname: '/accreditation/naac/reports', status: 308 });
    expect(resolveLegacyRedirect('/admin/pde/naac-evidence')).toEqual({ pathname: '/pde/admin/accreditation-evidence/naac', status: 308 });
    expect(resolveLegacyRedirect('/admin/pde/naac-evidence/2026')).toEqual({ pathname: '/pde/admin/naac-evidence/2026', status: 308 });
    expect(resolveLegacyRedirect('/admin/pde/settings')).toEqual({ pathname: '/pde/admin/settings', status: 308 });
  });

  it('an exact rule does not swallow neighbours', () => {
    expect(resolveLegacyRedirect('/admission/marketing/campaigns/roi')).toEqual({ pathname: '/admission/marketing/automations/roi', status: 301 });
    expect(resolveLegacyRedirect('/admission/marketing/campaigns/roi/extra')).toBeNull();
    expect(resolveLegacyRedirect('/learners/my-attendance-feedback')).toEqual({ pathname: '/learners/class-feedback', status: 307 });
  });

  it('a prefix rule needs a segment boundary — /admin/hrx is not /admin/hr', () => {
    expect(resolveLegacyRedirect('/admin/hrx')).toBeNull();
    expect(resolveLegacyRedirect('/hr/admin')).toBeNull();
    expect(resolveLegacyRedirect('/')).toBeNull();
  });

  it('carries every entry that next.config.ts used to hold (27) plus the 3 campaign 301s', () => {
    expect(LEGACY_REDIRECTS).toHaveLength(30);
    const exactBeforePrefix = (from: string) => {
      const i = LEGACY_REDIRECTS.findIndex((r) => r.from === from && r.exact);
      const j = LEGACY_REDIRECTS.findIndex((r) => r.from === from && !r.exact);
      return i >= 0 && j >= 0 && i < j;
    };
    expect(exactBeforePrefix('/iqac')).toBe(true);
    expect(LEGACY_REDIRECTS.findIndex((r) => r.from === '/admin/pde/naac-evidence')).toBeLessThan(
      LEGACY_REDIRECTS.findIndex((r) => r.from === '/admin/pde')
    );
  });
});
