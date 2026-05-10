import type {
  ApiModuleConfig,
  ApiEndpoint,
  ApiParameter,
  ApiResponse,
  ApiErrorResponse,
  ApiCodeExample,
  ApiAiPrompt,
  ApiRequestBody,
  ApiAuthentication,
  ApiRateLimit,
} from '@/lib/types/api-documentation';

/**
 * Convert a structured ApiModuleConfig into a complete, self-contained markdown
 * document suitable for download. Captures every field the type system exposes:
 * description, base URL, auth, common errors, general notes, and per-endpoint
 * parameters/request body/responses/code examples/AI prompts/rate limit/notes.
 */
export function apiModuleConfigToMarkdown(config: ApiModuleConfig): string {
  const lines: string[] = [];

  lines.push(`# ${config.moduleName} API Documentation`);
  lines.push('');
  lines.push(config.moduleDescription);
  lines.push('');
  lines.push(`**Base URL:** \`${config.baseUrl}\``);
  lines.push('');

  if (config.authenticationOverview) {
    lines.push('## Authentication');
    lines.push('');
    lines.push(config.authenticationOverview);
    lines.push('');
  }

  if (config.generalNotes && config.generalNotes.length > 0) {
    lines.push('## General Notes');
    lines.push('');
    for (const note of config.generalNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (config.commonErrors && config.commonErrors.length > 0) {
    lines.push('## Common Error Responses');
    lines.push('');
    lines.push('These error responses apply to every endpoint in this module.');
    lines.push('');
    lines.push(renderErrorTable(config.commonErrors));
    lines.push('');
  }

  lines.push('## Table of Contents');
  lines.push('');
  for (const endpoint of config.endpoints) {
    const anchor = slugify(endpoint.title);
    lines.push(`- [\`${endpoint.method}\` ${endpoint.title}](#${anchor}) — \`${endpoint.path}\``);
  }
  lines.push('');

  lines.push('## Endpoints');
  lines.push('');

  for (const endpoint of config.endpoints) {
    lines.push(...renderEndpoint(endpoint));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`_Generated from ${config.moduleName} API config on ${new Date().toISOString().split('T')[0]}._`);
  lines.push('');

  return lines.join('\n');
}

function renderEndpoint(endpoint: ApiEndpoint): string[] {
  const out: string[] = [];

  out.push(`### ${endpoint.title}`);
  out.push('');
  out.push(`**\`${endpoint.method}\` \`${endpoint.path}\`**`);
  out.push('');
  if (endpoint.deprecated) {
    out.push(`> **Deprecated.** ${endpoint.deprecationMessage ?? ''}`.trim());
    out.push('');
  }
  out.push(endpoint.description);
  out.push('');

  if (endpoint.tags && endpoint.tags.length > 0) {
    out.push(`**Tags:** ${endpoint.tags.map((t) => `\`${t}\``).join(', ')}`);
    out.push('');
  }

  if (endpoint.authentication) {
    out.push(...renderAuthentication(endpoint.authentication));
  }

  if (endpoint.pathParameters && endpoint.pathParameters.length > 0) {
    out.push('#### Path Parameters');
    out.push('');
    out.push(renderParameterTable(endpoint.pathParameters));
    out.push('');
  }

  if (endpoint.queryParameters && endpoint.queryParameters.length > 0) {
    out.push('#### Query Parameters');
    out.push('');
    out.push(renderParameterTable(endpoint.queryParameters));
    out.push('');
  }

  if (endpoint.requestBody) {
    out.push(...renderRequestBody(endpoint.requestBody));
  }

  if (endpoint.successResponses && endpoint.successResponses.length > 0) {
    out.push('#### Success Responses');
    out.push('');
    for (const res of endpoint.successResponses) {
      out.push(...renderResponse(res));
    }
  }

  if (endpoint.errorResponses && endpoint.errorResponses.length > 0) {
    out.push('#### Error Responses');
    out.push('');
    out.push(renderErrorTable(endpoint.errorResponses));
    out.push('');
  }

  if (endpoint.codeExamples && endpoint.codeExamples.length > 0) {
    out.push('#### Code Examples');
    out.push('');
    for (const ex of endpoint.codeExamples) {
      out.push(...renderCodeExample(ex));
    }
  }

  if (endpoint.aiPrompts && endpoint.aiPrompts.length > 0) {
    out.push('#### AI Usage Prompts');
    out.push('');
    for (const p of endpoint.aiPrompts) {
      out.push(...renderAiPrompt(p));
    }
  }

  if (endpoint.rateLimit) {
    out.push(...renderRateLimit(endpoint.rateLimit));
  }

  if (endpoint.notes && endpoint.notes.length > 0) {
    out.push('#### Notes');
    out.push('');
    for (const note of endpoint.notes) {
      out.push(`- ${note}`);
    }
    out.push('');
  }

  if (endpoint.relatedEndpoints && endpoint.relatedEndpoints.length > 0) {
    out.push(`**Related endpoints:** ${endpoint.relatedEndpoints.map((r) => `\`${r}\``).join(', ')}`);
    out.push('');
  }

  return out;
}

function renderAuthentication(auth: ApiAuthentication): string[] {
  const out: string[] = [];
  out.push('#### Authentication');
  out.push('');
  out.push(`- **Type:** \`${auth.type}\``);
  if (auth.headerName) out.push(`- **Header:** \`${auth.headerName}\``);
  out.push(`- **Example:** \`${auth.example}\``);
  if (auth.scopes && auth.scopes.length > 0) {
    out.push(`- **Scopes:** ${auth.scopes.map((s) => `\`${s}\``).join(', ')}`);
  }
  out.push('');
  out.push(auth.description);
  out.push('');
  return out;
}

function renderParameterTable(params: ApiParameter[]): string {
  const rows: string[] = [];
  rows.push('| Name | Type | Required | Default | Description |');
  rows.push('|------|------|----------|---------|-------------|');
  for (const p of params) {
    const enumPart = p.enum && p.enum.length > 0 ? ` _(one of: ${p.enum.map((v) => `\`${v}\``).join(', ')})_` : '';
    const examplePart = p.example !== undefined ? ` _(e.g. \`${formatScalar(p.example)}\`)_` : '';
    const desc = `${escapeCell(p.description)}${enumPart}${examplePart}`.trim();
    rows.push(
      `| \`${p.name}\` | \`${p.type}\` | ${p.required ? 'Yes' : 'No'} | ${p.default !== undefined ? `\`${formatScalar(p.default)}\`` : '—'} | ${desc} |`
    );
  }
  return rows.join('\n');
}

function renderRequestBody(body: ApiRequestBody): string[] {
  const out: string[] = [];
  out.push('#### Request Body');
  out.push('');
  out.push(`**Content-Type:** \`${body.contentType}\``);
  out.push('');
  if (body.description) {
    out.push(body.description);
    out.push('');
  }
  if (body.schema && body.schema.length > 0) {
    out.push(renderParameterTable(body.schema));
    out.push('');
  }
  if (body.example) {
    out.push('**Example:**');
    out.push('');
    out.push('```json');
    out.push(JSON.stringify(body.example, null, 2));
    out.push('```');
    out.push('');
  }
  return out;
}

function renderResponse(res: ApiResponse): string[] {
  const out: string[] = [];
  out.push(`**${res.statusCode}** — ${res.description} _(\`${res.contentType}\`)_`);
  out.push('');
  if (res.headers) {
    out.push('Headers:');
    out.push('');
    for (const [name, value] of Object.entries(res.headers)) {
      out.push(`- \`${name}: ${value}\``);
    }
    out.push('');
  }
  if (res.example) {
    out.push('```json');
    out.push(JSON.stringify(res.example, null, 2));
    out.push('```');
    out.push('');
  }
  return out;
}

function renderErrorTable(errors: ApiErrorResponse[]): string {
  const rows: string[] = [];
  rows.push('| Status | Code | Message |');
  rows.push('|--------|------|---------|');
  for (const e of errors) {
    rows.push(`| ${e.statusCode} | \`${e.errorCode}\` | ${escapeCell(e.message)} |`);
  }
  return rows.join('\n');
}

function renderCodeExample(ex: ApiCodeExample): string[] {
  const out: string[] = [];
  out.push(`**${ex.label}**`);
  out.push('');
  if (ex.description) {
    out.push(ex.description);
    out.push('');
  }
  out.push('```' + ex.language);
  out.push(ex.code);
  out.push('```');
  out.push('');
  return out;
}

function renderAiPrompt(p: ApiAiPrompt): string[] {
  const out: string[] = [];
  out.push(`**${p.title}** _(category: ${p.category}, complexity: ${p.complexity})_`);
  out.push('');
  out.push('```');
  out.push(p.prompt);
  out.push('```');
  out.push('');
  if (p.expectedOutput) {
    out.push(`*Expected output:* ${p.expectedOutput}`);
    out.push('');
  }
  if (p.tags && p.tags.length > 0) {
    out.push(`*Tags:* ${p.tags.map((t) => `\`${t}\``).join(', ')}`);
    out.push('');
  }
  return out;
}

function renderRateLimit(limit: ApiRateLimit): string[] {
  const out: string[] = [];
  out.push('#### Rate Limit');
  out.push('');
  out.push(limit.description);
  out.push('');
  if (limit.requestsPerMinute) out.push(`- **Per minute:** ${limit.requestsPerMinute}`);
  if (limit.requestsPerHour) out.push(`- **Per hour:** ${limit.requestsPerHour}`);
  if (limit.requestsPerDay) out.push(`- **Per day:** ${limit.requestsPerDay}`);
  if (limit.burstLimit) out.push(`- **Burst limit:** ${limit.burstLimit}`);
  out.push('');
  return out;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}
