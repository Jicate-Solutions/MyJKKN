// The six dynamic intake routes are one catch-all (route budget). The fold is
// only safe if every URL the screens call still lands on the same handler with
// the same verbs and the same id, so this walks the original six paths.

import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => undefined,
}));

import {
  HTTP_METHODS,
  INTAKE_ROUTES,
  exportedMethods,
  matchIntakeRoute,
} from '@/lib/api/hr/recruitment/intake/dispatch';

const ID = '2f1c8c8e-0000-4000-8000-000000000001';

// Written out by hand from the deleted route files: the URL under
// /api/hr/recruitment/intake/, the handler that owned it, its verbs.
const ORIGINAL = [
  { url: `batches/${ID}`, key: 'batch', methods: ['GET', 'DELETE'] },
  { url: `batches/${ID}/apply`, key: 'batch-apply', methods: ['POST'] },
  { url: `batches/${ID}/prepare`, key: 'batch-prepare', methods: ['POST'] },
  { url: `batches/${ID}/upload-urls`, key: 'batch-upload-urls', methods: ['POST'] },
  { url: `rows/${ID}/decide`, key: 'row-decide', methods: ['POST'] },
  { url: `rules/${ID}`, key: 'rule', methods: ['DELETE'] },
];

describe('intake dispatch table', () => {
  it.each(ORIGINAL)('$url resolves to $key with the id', ({ url, key, methods }) => {
    const match = matchIntakeRoute(url.split('/'));
    expect(match?.entry.key).toBe(key);
    expect(match?.params).toEqual({ id: ID });
    expect([...(match?.entry.methods ?? [])]).toEqual(methods);
  });

  it('covers exactly the six original routes', () => {
    expect(INTAKE_ROUTES.map((e) => e.key).sort()).toEqual(ORIGINAL.map((o) => o.key).sort());
  });

  it.each(INTAKE_ROUTES.map((e) => [e.key, e] as const))('%s declares the verbs its module exports', (_k, entry) => {
    expect(exportedMethods(entry)).toEqual(HTTP_METHODS.filter((m) => entry.methods.includes(m)));
  });

  it.each([
    [[]],
    [['batches']],
    [['batches', '']],
    [['batches', '', 'apply']],
    [['batches', ID, 'nope']],
    [['rows', ID]],
    [['rules', ID, 'extra']],
    [['institutions', ID]],
  ])('%j is not a folded route', (segments) => {
    expect(matchIntakeRoute(segments)).toBeNull();
  });
});
