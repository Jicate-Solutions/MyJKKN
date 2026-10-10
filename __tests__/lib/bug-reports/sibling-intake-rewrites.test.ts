/**
 * The college apps' bug-reporter SDK keeps calling its dynamic URLs; proxy.ts
 * rewrites each to a static route file (no [id] file, so no route-budget cost).
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveSiblingIntakeRewrite } from '@/lib/bug-reports/sibling-intake-rewrites';
import { proxy } from '@/proxy';

const BUG = '22222222-0000-4000-8000-000000000001';

describe('sibling intake rewrites (route budget)', () => {
  it('maps each SDK path to its static route file', () => {
    expect(resolveSiblingIntakeRewrite(`/api/v1/public/bug-reports/${BUG}`)).toEqual({
      pathname: '/api/v1/public/bug-reports/item',
      id: BUG,
    });
    expect(resolveSiblingIntakeRewrite(`/api/v1/public/bug-reports/${BUG}/messages`)).toEqual({
      pathname: '/api/v1/public/bug-reports/item-messages',
      id: BUG,
    });
    expect(resolveSiblingIntakeRewrite('/api/v1/public/leaderboard/some-app-id')).toEqual({
      pathname: '/api/v1/public/leaderboard',
    });
  });

  it('decodes an encoded id segment', () => {
    expect(resolveSiblingIntakeRewrite('/api/v1/public/bug-reports/BUG%201')).toEqual({
      pathname: '/api/v1/public/bug-reports/item',
      id: 'BUG 1',
    });
  });

  it('leaves the static routes and anything else alone', () => {
    for (const path of [
      '/api/v1/public/bug-reports',
      '/api/v1/public/bug-reports/',
      '/api/v1/public/bug-reports/me',
      '/api/v1/public/bug-reports/item',
      '/api/v1/public/bug-reports/item-messages',
      '/api/v1/public/bug-reports/me/messages',
      `/api/v1/public/bug-reports/${BUG}/other`,
      `/api/v1/public/bug-reports/${BUG}/messages/x`,
      '/api/v1/public/leaderboard',
      '/api/v1/public/leaderboard/',
      '/api/v1/public/leaderboard/a/b',
      '/api/bug-reports/123',
      '/api/v1/public/bug-reportsx/123',
    ]) {
      expect(resolveSiblingIntakeRewrite(path), path).toBeNull();
    }
  });

  it('proxy.ts rewrites (not redirects) each SDK URL, keeping the query string', async () => {
    const cases: Array<[string, string]> = [
      [
        `/api/v1/public/bug-reports/${BUG}?reporter_email=a%40b.c&include_messages=false`,
        `/api/v1/public/bug-reports/item?reporter_email=a%40b.c&include_messages=false&id=${BUG}`,
      ],
      [
        `/api/v1/public/bug-reports/${BUG}/messages?reporter_email=a%40b.c`,
        `/api/v1/public/bug-reports/item-messages?reporter_email=a%40b.c&id=${BUG}`,
      ],
      ['/api/v1/public/leaderboard/some-app-id?period=weekly', '/api/v1/public/leaderboard?period=weekly'],
    ];
    for (const [from, to] of cases) {
      const res = await proxy(new NextRequest(`https://www.jkkn.ai${from}`));
      expect(res, from).toBeDefined();
      expect(res!.status, from).toBe(200);
      expect(res!.headers.get('location'), from).toBeNull();
      expect(res!.headers.get('x-middleware-rewrite'), from).toBe(`https://www.jkkn.ai${to}`);
      expect(res!.headers.get('cache-control'), from).toMatch(/no-store/);
    }
  });
});
