// The six dynamic intake routes are one STATIC op route (route budget). The fold
// is only safe if every call the screens make still lands on the same handler
// with the same verbs and the same id, so this walks the original six paths and
// the ?op= key that now stands for each.

import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => undefined,
}));

import {
  HTTP_METHODS,
  INTAKE_ROUTES,
  exportedMethods,
  matchIntakeOp,
} from '@/lib/api/hr/recruitment/intake/dispatch';
import { intakeOpPath } from '@/lib/hr/intake/api-client';

const ID = '2f1c8c8e-0000-4000-8000-000000000001';

// Written out by hand from the deleted route files: the folder under
// /api/hr/recruitment/intake/, the handler that owned it, its verbs.
const ORIGINAL = [
  { path: 'batches/[id]', key: 'batch', methods: ['GET', 'DELETE'] },
  { path: 'batches/[id]/apply', key: 'batch-apply', methods: ['POST'] },
  { path: 'batches/[id]/prepare', key: 'batch-prepare', methods: ['POST'] },
  { path: 'batches/[id]/upload-urls', key: 'batch-upload-urls', methods: ['POST'] },
  { path: 'rows/[id]/decide', key: 'row-decide', methods: ['POST'] },
  { path: 'rules/[id]', key: 'rule', methods: ['DELETE'] },
] as const;

describe('intake dispatch table', () => {
  it.each(ORIGINAL)('op=$key resolves to the $path handler with the id', ({ path, key, methods }) => {
    const match = matchIntakeOp(key, ID);
    expect(match?.entry.key).toBe(key);
    expect(match?.entry.path).toBe(path);
    expect(match?.params).toEqual({ id: ID });
    expect([...(match?.entry.methods ?? [])]).toEqual(methods);
  });

  it.each(ORIGINAL)('the client builds the op path for $key', ({ key }) => {
    const url = new URL(`http://x/api/hr/recruitment/intake${intakeOpPath(key, ID)}`);
    expect(url.pathname).toBe('/api/hr/recruitment/intake/op');
    expect(matchIntakeOp(url.searchParams.get('op'), url.searchParams.get('id'))?.entry.key).toBe(key);
  });

  it('covers exactly the six original routes', () => {
    expect(INTAKE_ROUTES.map((e) => e.key).sort()).toEqual(ORIGINAL.map((o) => o.key).sort());
  });

  it.each(INTAKE_ROUTES.map((e) => [e.key, e] as const))('%s declares the verbs its module exports', (_k, entry) => {
    expect(exportedMethods(entry)).toEqual(HTTP_METHODS.filter((m) => entry.methods.includes(m)));
  });

  it.each([
    [null, ID],
    ['', ID],
    ['batch', null],
    ['batch', ''],
    ['nope', ID],
    ['batches', ID],
    ['institutions', ID],
  ])('op=%j id=%j is not a folded route', (op, id) => {
    expect(matchIntakeOp(op, id)).toBeNull();
  });
});
