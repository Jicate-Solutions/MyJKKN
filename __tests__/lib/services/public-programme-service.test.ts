// __tests__/lib/services/public-programme-service.test.ts
//
// Guards the ONE rule that keeps an internal programme off the open web: the
// public catalogue shows a row if and only if that row says is_published.
//
// These assert the TypeScript gatekeeper's own behaviour against a recording
// stub — they do not re-implement the SQL, and they are not evidence about the
// database policy (that is asserted inside the migration's own DO block).
//
// Every date literal here is fixed and FAR IN THE FUTURE on purpose. The
// service hides a programme once its end date has passed, so a "realistic"
// 2027 fixture would quietly start being filtered out in 2027 and take the fee,
// date and key-set assertions down with it — a red build on a date rather than
// on a code change. 2099 cannot arrive before this file is rewritten.

import { describe, it, expect } from 'vitest';
import { PublicProgrammeService } from '@/lib/services/programmes/public-programme-service';

type QueryResult = { data: unknown; error: { message: string } | null };

/** Minimal recording stand-in for the PostgREST builder chain. */
function makeClient(result: QueryResult) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    eq: [] as Array<[string, unknown]>,
    order: [] as string[],
    limit: [] as number[],
  };
  const builder: Record<string, unknown> = {
    select(columns: string) {
      calls.select.push(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.eq.push([column, value]);
      return builder;
    },
    order(column: string) {
      calls.order.push(column);
      return builder;
    },
    limit(count: number) {
      calls.limit.push(count);
      return builder;
    },
    then(onFulfilled: (value: QueryResult) => unknown) {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  const client = {
    from(table: string) {
      calls.from.push(table);
      return builder;
    },
  };
  return { client: client as never, calls };
}

const BASE_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'leading-with-ai',
  name: 'Leading with AI',
  summary: 'A short programme for people who have to make AI decisions at work.',
  audience: 'Company teams',
  is_free: false,
  fee_amount: 12000,
  fee_currency: 'INR',
  starts_on: '2099-01-12',
  ends_on: '2099-02-20',
  apply_url: 'https://example.org/apply',
  sort_order: 0,
};

describe('PublicProgrammeService.listPublished — the public gate', () => {
  it('reads only the catalogue table and only published rows', async () => {
    const { client, calls } = makeClient({ data: [BASE_ROW], error: null });
    await PublicProgrammeService.listPublished(client);

    expect(calls.from).toEqual(['public_programmes']);
    expect(calls.eq).toContainEqual(['is_published', true]);
  });

  it('caps the read — a public route must not become unbounded', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicProgrammeService.listPublished(client);

    expect(calls.limit).toHaveLength(1);
    expect(calls.limit[0]).toBeGreaterThan(0);
  });

  it('never selects every column — a column added later cannot leak by omission', async () => {
    const { client, calls } = makeClient({ data: [], error: null });
    await PublicProgrammeService.listPublished(client);

    expect(calls.select).toHaveLength(1);
    expect(calls.select[0]).not.toContain('*');
    // The published flag itself is not part of the payload handed to the page.
    expect(calls.select[0]).not.toContain('is_published');
    for (const column of ['id', 'slug', 'name', 'summary', 'audience', 'apply_url']) {
      expect(calls.select[0]).toContain(column);
    }
  });

  it('returns an empty catalogue when the read fails (fail closed)', async () => {
    const { client } = makeClient({ data: null, error: { message: 'boom' } });
    expect(await PublicProgrammeService.listPublished(client)).toEqual([]);
  });

  it('returns an empty catalogue when nothing is published — the shipping state', async () => {
    const { client } = makeClient({ data: [], error: null });
    expect(await PublicProgrammeService.listPublished(client)).toEqual([]);
  });

  it('drops a programme that has already finished, keeps one with no end date', async () => {
    const { client } = makeClient({
      data: [
        { ...BASE_ROW, id: 'a', slug: 'finished', ends_on: '2000-01-01' },
        { ...BASE_ROW, id: 'b', slug: 'open-ended', starts_on: null, ends_on: null },
        { ...BASE_ROW, id: 'c', slug: 'future', ends_on: '2999-12-31' },
      ],
      error: null,
    });

    const result = await PublicProgrammeService.listPublished(client);
    expect(result.map((p) => p.slug)).toEqual(['open-ended', 'future']);
  });
});

describe('PublicProgrammeService.listPublished — what a reader is shown', () => {
  it('labels a free programme "Free" and an unpriced one "Fee on request"', async () => {
    const { client } = makeClient({
      data: [
        { ...BASE_ROW, id: 'a', slug: 'free-one', is_free: true, fee_amount: null },
        { ...BASE_ROW, id: 'b', slug: 'unpriced', is_free: false, fee_amount: null },
      ],
      error: null,
    });

    const result = await PublicProgrammeService.listPublished(client);
    expect(result[0].priceLabel).toBe('Free');
    expect(result[1].priceLabel).toBe('Fee on request');
  });

  it('formats a fee as an amount, not a bare number', async () => {
    const { client } = makeClient({ data: [BASE_ROW], error: null });
    const [programme] = await PublicProgrammeService.listPublished(client);
    expect(programme.priceLabel).toContain('12,000');
  });

  it('renders a date range and a start-only date', async () => {
    const { client } = makeClient({
      data: [
        { ...BASE_ROW, id: 'a', slug: 'ranged' },
        { ...BASE_ROW, id: 'b', slug: 'start-only', ends_on: null },
        { ...BASE_ROW, id: 'c', slug: 'undated', starts_on: null, ends_on: null },
      ],
      error: null,
    });

    const result = await PublicProgrammeService.listPublished(client);
    expect(result[0].dateLabel).toMatch(/January.*February 2099/);
    expect(result[1].dateLabel).toMatch(/^Starts .*January 2099$/);
    expect(result[2].dateLabel).toBeNull();
  });

  it('renders an end-date-only programme as "Until <date>"', async () => {
    const { client } = makeClient({
      data: [{ ...BASE_ROW, starts_on: null }],
      error: null,
    });
    const [programme] = await PublicProgrammeService.listPublished(client);
    expect(programme.dateLabel).toMatch(/^Until .*February 2099$/);
  });

  it('calls a fee of zero "Free" rather than rendering a zero amount', async () => {
    const { client } = makeClient({
      data: [{ ...BASE_ROW, is_free: false, fee_amount: 0 }],
      error: null,
    });
    const [programme] = await PublicProgrammeService.listPublished(client);
    expect(programme.priceLabel).toBe('Free');
  });

  it('refuses an apply link whose scheme is not http, https or an in-app path', async () => {
    const { client } = makeClient({
      data: [
        { ...BASE_ROW, id: 'a', slug: 'script-link', apply_url: 'javascript:alert(1)' },
        { ...BASE_ROW, id: 'b', slug: 'in-app', apply_url: '/apply/leading-with-ai' },
        { ...BASE_ROW, id: 'c', slug: 'external', apply_url: 'https://example.org/apply' },
      ],
      error: null,
    });

    const result = await PublicProgrammeService.listPublished(client);
    expect(result[0].applyUrl).toBeNull();
    expect(result[1].applyUrl).toBe('/apply/leading-with-ai');
    expect(result[2].applyUrl).toBe('https://example.org/apply');
  });

  it('refuses an off-site link disguised as an in-app path', async () => {
    // '//evil.tld' is a protocol-relative URL and '/\evil.tld' is normalised to
    // the same thing by browsers. Both begin with '/', so a naive leading-slash
    // check would render either as a JKKN-branded link to somebody else's host.
    const { client } = makeClient({
      data: [
        { ...BASE_ROW, id: 'a', slug: 'protocol-relative', apply_url: '//evil.tld/pay' },
        { ...BASE_ROW, id: 'b', slug: 'backslash', apply_url: '/\\evil.tld/pay' },
        { ...BASE_ROW, id: 'c', slug: 'bare-root', apply_url: '/' },
        { ...BASE_ROW, id: 'd', slug: 'genuine-path', apply_url: '/apply/x' },
      ],
      error: null,
    });

    const result = await PublicProgrammeService.listPublished(client);
    expect(result[0].applyUrl).toBeNull();
    expect(result[1].applyUrl).toBeNull();
    expect(result[2].applyUrl).toBeNull();
    expect(result[3].applyUrl).toBe('/apply/x');
  });

  it('hands the page no field that could identify a person', async () => {
    const { client } = makeClient({ data: [BASE_ROW], error: null });
    const [programme] = await PublicProgrammeService.listPublished(client);

    expect(Object.keys(programme).sort()).toEqual(
      ['applyUrl', 'audience', 'dateLabel', 'id', 'name', 'priceLabel', 'slug', 'summary'].sort(),
    );
  });
});
