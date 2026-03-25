// lib/mcp/tool-helpers.ts
import { hasModuleAccess, type ApiModule } from '@/lib/api-keys/authenticate';
import { logApiUsage } from '@/lib/api-keys/audit-logger';
import type { McpAuthContext, McpPaginatedResult } from '@/lib/mcp/types';

/**
 * Standard MCP tool response content shape.
 */
export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Returns an error response for MCP tools.
 */
export function mcpError(message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/**
 * Returns a success response with JSON data for MCP tools.
 */
export function mcpSuccess(data: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Checks if the MCP auth context has read access to the given module.
 * Returns an error result if not, or null if access is granted.
 */
export function checkModuleAccess(
  context: McpAuthContext,
  module: ApiModule
): McpToolResult | null {
  if (!hasModuleAccess(context.permissions.read, module)) {
    return mcpError(`Access denied: your API key does not have read access to the '${module}' module.`);
  }
  return null;
}

/**
 * Builds a standard paginated result object.
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): McpPaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    hasMore: (page - 1) * limit + items.length < total,
  };
}

/**
 * Fire-and-forget audit log for MCP tool calls.
 * Wraps the existing audit logger with MCP-specific defaults.
 */
export function logMcpToolCall(
  context: McpAuthContext,
  toolName: string,
  module: ApiModule,
  statusCode: number,
  startTime: number
): void {
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: `mcp:${toolName}`,
    module,
    institutionId: context.institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress: null,    // MCP transport does not expose IP easily
    userAgent: 'mcp-client',
  });
}
