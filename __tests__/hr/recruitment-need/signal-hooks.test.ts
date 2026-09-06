import { describe, it, expect } from 'vitest';

/**
 * Signal Hooks — Query Key Structure Tests
 *
 * React Query hooks are 'use client' — they can't be imported in vitest
 * directly (no React render context). Instead we test the exported query key
 * factory `signalKeys` which IS importable and is the part most likely to
 * regress (wrong cache key → stale data bugs).
 *
 * For full hook behavior (loading → data states, cache invalidation), the
 * project would need a renderHook setup with QueryClientProvider — that's
 * outside scope for this first test pass but noted here for expansion.
 */

// signalKeys is exported from the hooks file but the file has 'use client'
// directive. vitest can still import it since the directive is only
// meaningful at the bundler level, not the Node runtime.
import { signalKeys } from '../../../hooks/hr/recruitment-need/use-recruitment-signal';

describe('signalKeys — query key factory', () => {
  it('signalKeys.all is a stable base key', () => {
    expect(signalKeys.all).toEqual(['hr-recruitment-signal']);
  });

  it('signalKeys.cache produces key with filters', () => {
    const key = signalKeys.cache({ institution_id: 'inst-1' });
    expect(key).toEqual(['hr-recruitment-signal', 'cache', { institution_id: 'inst-1' }]);
  });

  it('signalKeys.cache with empty filters', () => {
    const key = signalKeys.cache({});
    expect(key).toEqual(['hr-recruitment-signal', 'cache', {}]);
  });

  it('signalKeys.single includes institution and program', () => {
    const key = signalKeys.single('inst-1', 'prog-1');
    expect(key).toEqual(['hr-recruitment-signal', 'single', 'inst-1', 'prog-1']);
  });

  it('signalKeys.single defaults programId to "all"', () => {
    const key = signalKeys.single('inst-1');
    expect(key).toEqual(['hr-recruitment-signal', 'single', 'inst-1', 'all']);
  });

  it('signalKeys.single with null programId defaults to "all"', () => {
    const key = signalKeys.single('inst-1', null);
    expect(key).toEqual(['hr-recruitment-signal', 'single', 'inst-1', 'all']);
  });

  it('signalKeys.inputs is stable', () => {
    expect(signalKeys.inputs()).toEqual(['hr-recruitment-signal', 'inputs']);
  });

  it('signalKeys.input includes key and params', () => {
    const key = signalKeys.input('sfr', { institution_id: 'inst-1', program_id: 'prog-1' });
    expect(key).toEqual([
      'hr-recruitment-signal',
      'input',
      'sfr',
      { institution_id: 'inst-1', program_id: 'prog-1' },
    ]);
  });

  it('signalKeys.suppressions with institution', () => {
    const key = signalKeys.suppressions('inst-1');
    expect(key).toEqual(['hr-recruitment-signal', 'suppressions', 'inst-1']);
  });

  it('signalKeys.suppressions without institution defaults to "all"', () => {
    const key = signalKeys.suppressions();
    expect(key).toEqual(['hr-recruitment-signal', 'suppressions', 'all']);
  });

  it('signalKeys.escalations with both params', () => {
    const key = signalKeys.escalations('inst-1', 'pending');
    expect(key).toEqual(['hr-recruitment-signal', 'escalations', 'inst-1', 'pending']);
  });

  it('signalKeys.escalations without params defaults to "all"', () => {
    const key = signalKeys.escalations();
    expect(key).toEqual(['hr-recruitment-signal', 'escalations', 'all', 'all']);
  });

  it('signalKeys.snapshots with institution', () => {
    const key = signalKeys.snapshots('inst-1');
    expect(key).toEqual(['hr-recruitment-signal', 'snapshots', 'inst-1']);
  });

  it('signalKeys.snapshots without institution', () => {
    const key = signalKeys.snapshots();
    expect(key).toEqual(['hr-recruitment-signal', 'snapshots', 'all']);
  });

  it('signalKeys.lastVisit is stable', () => {
    expect(signalKeys.lastVisit()).toEqual(['hr-recruitment-signal', 'last-visit']);
  });
});

describe('signalKeys — cache invalidation hierarchy', () => {
  it('all keys start with signalKeys.all prefix', () => {
    const base = signalKeys.all;
    const keys = [
      signalKeys.cache({}),
      signalKeys.single('i', 'p'),
      signalKeys.inputs(),
      signalKeys.input('sfr', { institution_id: 'i' }),
      signalKeys.suppressions(),
      signalKeys.escalations(),
      signalKeys.snapshots(),
      signalKeys.lastVisit(),
    ];

    for (const key of keys) {
      expect(key[0]).toBe(base[0]);
    }
  });

  it('different filter values produce different keys', () => {
    const key1 = signalKeys.cache({ institution_id: 'inst-1' });
    const key2 = signalKeys.cache({ institution_id: 'inst-2' });
    expect(key1).not.toEqual(key2);
  });
});
