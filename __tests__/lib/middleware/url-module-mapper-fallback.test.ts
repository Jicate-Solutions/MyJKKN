// Tests for the top-level-slug fallback added to url-module-mapper on
// 2026-07-26, which is what takes usage tracking from the 12 prefixes in
// URL_MODULE_MAP to every module directory under app/(routes).
//
// The two properties that matter:
//   1. The explicit map still wins, so existing usage_events rows keep their
//      fine-grained module ('academic/attendance', not 'academic').
//   2. API paths get NO fallback — withUsageTracking's behaviour is unchanged.

import { describe, it, expect } from 'vitest';
import {
  mapUrlToModule,
  mapPathToModuleFallback,
} from '@/lib/middleware/url-module-mapper';

describe('mapPathToModuleFallback', () => {
  it('derives the module from the first path segment', () => {
    expect(mapPathToModuleFallback('/campus-living/hostel/allocation')).toBe(
      'campus-living'
    );
    expect(mapPathToModuleFallback('/okr/objectives/create')).toBe('okr');
    expect(mapPathToModuleFallback('/rcltp')).toBe('rcltp');
  });

  it('covers the modules the curated lists had drifted away from', () => {
    // None of these are in URL_MODULE_MAP; several are missing from
    // lib/navigation/modules.ts too. Before the fallback they logged nothing.
    for (const slug of [
      'okr',
      'cdc',
      'pde',
      'foundation',
      'improvement-board',
      'learners-council',
      'accreditation',
      'events',
      'health',
      'projects',
      'solutions',
      'tracker',
    ]) {
      expect(mapPathToModuleFallback(`/${slug}/anything/deep`)).toBe(slug);
    }
  });

  it('maps the root landing to the dashboard module', () => {
    expect(mapPathToModuleFallback('/')).toBe('dashboard');
    expect(mapPathToModuleFallback('')).toBe('dashboard');
  });

  it('refuses API paths so withUsageTracking behaviour is unchanged', () => {
    expect(mapPathToModuleFallback('/api/okr/objectives')).toBeNull();
    expect(mapPathToModuleFallback('/api/anything')).toBeNull();
  });

  it('rejects malformed slugs rather than inventing a module', () => {
    expect(mapPathToModuleFallback('/9leading-digit')).toBeNull();
    expect(mapPathToModuleFallback('/has_underscore')).toBeNull();
    expect(mapPathToModuleFallback(`/${'x'.repeat(41)}`)).toBeNull();
  });

  it('normalises case so one module never splits into two rollup groups', () => {
    // Case is normalised BEFORE the slug-shape check, so a mixed-case URL is
    // folded into the real module rather than rejected or double-counted.
    expect(mapPathToModuleFallback('/Campus-Living/rooms')).toBe(
      'campus-living'
    );
    expect(mapPathToModuleFallback('/UPPER')).toBe('upper');
  });
});

describe('mapUrlToModule with the fallback wired in', () => {
  it('still prefers the explicit map for mapped page paths', () => {
    const result = mapUrlToModule('/academic/attendance', 'GET');
    expect(result).not.toBeNull();
    // Fine-grained, NOT the bare 'academic' slug — existing rows stay comparable.
    expect(result!.module).toContain('academic');
    expect(result!.module).not.toBe('academic');
  });

  it('now resolves page paths the explicit map never covered', () => {
    const result = mapUrlToModule('/okr/objectives', 'GET');
    expect(result).not.toBeNull();
    expect(result!.module).toBe('okr');
    expect(result!.eventType).toBe('view');
  });

  it('strips the query string before deriving the module', () => {
    const result = mapUrlToModule('/projects/portfolio?tab=risks', 'GET');
    expect(result!.module).toBe('projects');
  });

  it('returns null for an unmapped API path (no fallback)', () => {
    expect(mapUrlToModule('/api/okr/objectives', 'GET')).toBeNull();
  });

  it('still honours the exclusion list', () => {
    expect(mapUrlToModule('/api/cron/anything', 'GET')).toBeNull();
    expect(mapUrlToModule('/api/health', 'GET')).toBeNull();
  });
});
