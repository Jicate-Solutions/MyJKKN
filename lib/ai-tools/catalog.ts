// lib/ai-tools/catalog.ts
//
// Reading and calling the ONE list of AI tools (public.ai_tool_catalog), as
// served per person by fn_ai_tool_menu. See
// supabase/migrations/20270301090000_ai_tool_catalog.sql for the table and the
// params convention.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ToolAudience = 'assistant' | 'door';

/** JSON Schema object for a tool's arguments, plus two vendor keywords. */
export interface CatalogParams {
  type?: 'object';
  properties?: Record<string, { type?: string; description?: string; [k: string]: unknown }>;
  required?: string[];
  additionalProperties?: boolean;
  /** The function takes this argument; the caller fills it with the person's own id. */
  'x-self-arg'?: string;
  /** Send these as null when not given (disambiguates overloaded functions). */
  'x-always-send'?: string[];
}

export interface CatalogTool {
  name: string;
  kind: 'rpc' | 'http';
  target: string;
  description: string;
  params: CatalogParams;
  is_write: boolean;
}

const SAFE_FUNCTION_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * The tools this signed-in person may use. `client` must be a client signed in
 * AS the person (fn_ai_tool_menu reads auth.uid()).
 */
export async function fetchToolMenu(
  client: SupabaseClient,
  audience: ToolAudience
): Promise<CatalogTool[]> {
  const { data, error } = await client.rpc('fn_ai_tool_menu', { p_audience: audience });
  if (error) throw new Error(`fn_ai_tool_menu failed: ${error.message}`);
  if (!Array.isArray(data)) return [];
  return (data as CatalogTool[]).filter(
    (t) => t && typeof t.name === 'string' && typeof t.target === 'string'
  );
}

/** The schema an outside AI is shown: the catalog params minus our vendor keywords. */
export function publicInputSchema(params: CatalogParams): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(params ?? {}) };
  delete rest['x-self-arg'];
  delete rest['x-always-send'];
  return { type: 'object', properties: {}, ...rest };
}

export class ToolArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolArgsError';
  }
}

/**
 * Builds the named arguments for an rpc tool call:
 *  - keeps only arguments the tool declares (a model cannot smuggle p_user_id
 *    or anything else in),
 *  - fills the self argument with the person's OWN id,
 *  - sends x-always-send arguments as null when absent,
 *  - refuses a call missing a required argument.
 */
export function buildRpcArgs(
  tool: CatalogTool,
  input: Record<string, unknown> | undefined,
  ownUserId: string
): Record<string, unknown> {
  const params = tool.params ?? {};
  const declared = params.properties ?? {};
  const args: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input ?? {})) {
    if (Object.prototype.hasOwnProperty.call(declared, key) && value !== undefined) {
      args[key] = value;
    }
  }

  for (const key of params.required ?? []) {
    if (args[key] === undefined || args[key] === null) {
      throw new ToolArgsError(`Missing required argument: ${key}`);
    }
  }

  for (const key of params['x-always-send'] ?? []) {
    if (!(key in args)) args[key] = null;
  }

  const selfArg = params['x-self-arg'];
  if (selfArg) args[selfArg] = ownUserId;

  return args;
}

/**
 * Calls an rpc tool with `client` — which MUST be the person's own session
 * client, never the service role.
 */
export async function callRpcTool(
  client: SupabaseClient,
  tool: CatalogTool,
  input: Record<string, unknown> | undefined,
  ownUserId: string
): Promise<unknown> {
  if (tool.kind !== 'rpc') throw new ToolArgsError(`Tool ${tool.name} is not an rpc tool`);
  if (!SAFE_FUNCTION_NAME.test(tool.target)) throw new ToolArgsError(`Tool ${tool.name} has an invalid target`);
  const args = buildRpcArgs(tool, input, ownUserId);
  const { data, error } = await client.rpc(tool.target, args);
  if (error) throw new Error(error.message);
  return data;
}
