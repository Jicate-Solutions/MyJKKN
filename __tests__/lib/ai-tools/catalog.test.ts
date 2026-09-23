/**
 * lib/ai-tools/catalog.ts — building the arguments for a catalog rpc tool.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildRpcArgs,
  callRpcTool,
  publicInputSchema,
  ToolArgsError,
  type CatalogTool,
} from '@/lib/ai-tools/catalog';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';

function tool(params: CatalogTool['params'], overrides: Partial<CatalogTool> = {}): CatalogTool {
  return { name: 't', kind: 'rpc', target: 'ai_rpc_t', description: 'd', params, is_write: false, ...overrides };
}

describe('buildRpcArgs', () => {
  it('keeps only declared arguments and fills the self argument with the person’s own id', () => {
    const t = tool({
      type: 'object',
      properties: { p_status: { type: 'string' } },
      'x-self-arg': 'p_user_id',
    });
    expect(buildRpcArgs(t, { p_status: 'active', p_user_id: 'forged', other: 1 }, OWNER)).toEqual({
      p_status: 'active',
      p_user_id: OWNER,
    });
  });

  it('does not add p_user_id to a function that does not take it', () => {
    const t = tool({ type: 'object', properties: { p_institution_id: { type: 'string' } } });
    expect(buildRpcArgs(t, { p_user_id: 'forged' }, OWNER)).toEqual({});
  });

  it('sends x-always-send arguments as null when absent (overload disambiguation)', () => {
    const t = tool({
      type: 'object',
      properties: { p_status: { type: 'string' }, p_limit: { type: 'integer' } },
      'x-self-arg': 'p_user_id',
      'x-always-send': ['p_status'],
    });
    expect(buildRpcArgs(t, { p_limit: 5 }, OWNER)).toEqual({ p_limit: 5, p_status: null, p_user_id: OWNER });
    expect(buildRpcArgs(t, { p_status: 'open' }, OWNER)).toEqual({ p_status: 'open', p_user_id: OWNER });
  });

  it('refuses a call missing a required argument', () => {
    const t = tool({ type: 'object', properties: { p_staff_id: { type: 'string' } }, required: ['p_staff_id'] });
    expect(() => buildRpcArgs(t, {}, OWNER)).toThrow(ToolArgsError);
  });

  it('drops empty-string arguments, as the in-app assistant does (a "" would fail a ::uuid cast)', () => {
    const t = tool({
      type: 'object',
      properties: { p_department_id: { type: 'string' }, p_date_from: { type: 'string' }, p_status: { type: 'string' } },
      'x-self-arg': 'p_user_id',
    });
    expect(buildRpcArgs(t, { p_department_id: '', p_date_from: '   ', p_status: 'active' }, OWNER)).toEqual({
      p_status: 'active',
      p_user_id: OWNER,
    });
  });

  it('treats an empty string for a required argument as missing', () => {
    const t = tool({ type: 'object', properties: { p_staff_id: { type: 'string' } }, required: ['p_staff_id'] });
    expect(() => buildRpcArgs(t, { p_staff_id: '' }, OWNER)).toThrow(ToolArgsError);
  });
});

describe('publicInputSchema', () => {
  it('hides the vendor keywords from outside AIs', () => {
    const s = publicInputSchema({
      type: 'object',
      properties: { p_x: { type: 'string' } },
      'x-self-arg': 'p_user_id',
      'x-always-send': ['p_x'],
    });
    expect(s).toEqual({ type: 'object', properties: { p_x: { type: 'string' } } });
  });
});

describe('callRpcTool', () => {
  it('refuses a non-rpc tool and an unsafe target without calling anything', async () => {
    const rpc = vi.fn();
    const client = { rpc } as never;
    await expect(callRpcTool(client, tool({}, { kind: 'http' }), {}, OWNER)).rejects.toBeInstanceOf(ToolArgsError);
    await expect(callRpcTool(client, tool({}, { target: 'x; drop' }), {}, OWNER)).rejects.toBeInstanceOf(ToolArgsError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
