export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface AIDebugRequest {
  query: string;
  roleKey?: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    // ── Auth check (same pattern as rls-policies/route.ts) ──
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Super admin check
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      (profile?.is_super_admin !== true && profile?.role !== 'super_admin')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Validate GEMINI_API_KEY ──
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured in environment' },
        { status: 500 }
      );
    }

    // ── Parse request body ──
    const body: AIDebugRequest = await request.json();
    const { query, conversationHistory } = body;
    let { roleKey } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'query is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // ── Resolve roleKey from query if not provided ──
    if (!roleKey) {
      const { data: allRoles } = await supabase
        .from('custom_roles')
        .select('role_key, role_name');

      if (allRoles && allRoles.length > 0) {
        const lowerQuery = query.toLowerCase();
        const matched = allRoles.find(
          (r) =>
            lowerQuery.includes(r.role_key.toLowerCase()) ||
            lowerQuery.includes(r.role_name.toLowerCase())
        );
        if (matched) {
          roleKey = matched.role_key;
        }
      }
    }

    // ── Fetch tri-layer context in parallel ──
    const baseUrl = request.nextUrl.origin;
    const cookieHeader = request.headers.get('cookie') || '';
    const fetchOpts = { headers: { cookie: cookieHeader } };

    const contextParts: string[] = [];
    let contextFetchError = false;

    try {
      const fetches: Array<Promise<Response | null>> = [
        fetch(`${baseUrl}/api/users/permissions-audit/rls-policies`, fetchOpts),
      ];

      if (roleKey) {
        fetches.push(
          fetch(
            `${baseUrl}/api/users/permissions-audit/unified?roleKey=${encodeURIComponent(roleKey)}`,
            fetchOpts
          )
        );
      } else {
        fetches.push(
          fetch(`${baseUrl}/api/users/permissions-audit/matrix`, fetchOpts)
        );
      }

      const results = await Promise.all(fetches);
      const [rlsRes, secondRes] = results;

      // Parse RLS policies
      if (rlsRes && rlsRes.ok) {
        const rlsData = await rlsRes.json();
        const policySummaries = (rlsData.tables || [])
          .filter((t: any) => t.policies && t.policies.length > 0)
          .map((t: any) => {
            const pols = t.policies
              .map(
                (p: any) =>
                  `  - ${p.policyName} (${p.command}): USING=${p.usingExpression || 'none'}, WITH CHECK=${p.withCheckExpression || 'none'}${p.parsed?.labels?.length ? ` [${p.parsed.labels.join(', ')}]` : ''}`
              )
              .join('\n');
            return `### ${t.tableName} (${t.module})${t.missingOperations?.length ? ` — missing: ${t.missingOperations.join(', ')}` : ''}\n${pols}`;
          })
          .join('\n\n');

        contextParts.push(
          `## RLS Policies\n\nTotal tables: ${rlsData.stats?.totalTables || 'unknown'}, Total policies: ${rlsData.stats?.totalPolicies || 'unknown'}\n\n${policySummaries}`
        );
      } else {
        contextFetchError = true;
        contextParts.push('## RLS Policies\n\n⚠️ Failed to fetch RLS policies data.');
      }

      // Parse second response (unified or matrix)
      if (secondRes && secondRes.ok) {
        const secondData = await secondRes.json();

        if (roleKey) {
          // Unified response for a specific role
          const role = secondData.role;
          const permissions = secondData.permissions || {};
          const navigation = secondData.navigation || {};
          const conflicts = secondData.conflicts || [];

          let roleSection = `## Role: ${role?.role_name || roleKey} (${role?.role_key || roleKey})\n\n`;
          roleSection += `Description: ${role?.description || 'N/A'}\n`;
          roleSection += `Status: ${role?.is_active ? 'Active' : 'Inactive'}\n\n`;

          // Grouped code permissions
          roleSection += `### Code Permissions (granted)\n\n`;
          const grouped: Record<string, string[]> = {};
          const perms = permissions.granted || permissions.permissions || [];
          if (Array.isArray(perms)) {
            for (const p of perms) {
              const key = typeof p === 'string' ? p : p.key || p.permission;
              if (!key) continue;
              const [mod] = key.split('.');
              if (!grouped[mod]) grouped[mod] = [];
              grouped[mod].push(key);
            }
          } else if (typeof perms === 'object') {
            for (const [mod, actions] of Object.entries(perms)) {
              if (!grouped[mod]) grouped[mod] = [];
              if (Array.isArray(actions)) {
                grouped[mod].push(...actions.map((a: any) => `${mod}.${typeof a === 'string' ? a : a.key || a}`));
              }
            }
          }
          for (const [mod, keys] of Object.entries(grouped)) {
            roleSection += `**${mod}**: ${keys.join(', ')}\n`;
          }

          // Navigation routes
          roleSection += `\n### Accessible Nav Routes\n\n`;
          const routes = navigation.accessibleRoutes || navigation.routes || [];
          if (Array.isArray(routes) && routes.length > 0) {
            for (const r of routes) {
              const label = typeof r === 'string' ? r : r.label || r.path || r.route;
              roleSection += `- ${label}\n`;
            }
          } else {
            roleSection += 'No navigation data available.\n';
          }

          // Conflicts
          if (conflicts.length > 0) {
            roleSection += `\n### Detected Conflicts\n\n`;
            for (const c of conflicts) {
              roleSection += `- ⚠️ ${typeof c === 'string' ? c : c.message || JSON.stringify(c)}\n`;
            }
          }

          contextParts.push(roleSection);
        } else {
          // Matrix summary (all roles)
          let matrixSection = `## Permission Matrix (All Roles)\n\n`;
          const roles = secondData.roles || secondData.matrix || secondData;
          if (Array.isArray(roles)) {
            for (const r of roles) {
              const name = r.role_name || r.roleName || r.name || 'Unknown';
              const key = r.role_key || r.roleKey || r.key || '';
              const count = r.permissionCount ?? r.permission_count ?? r.totalPermissions ?? '?';
              matrixSection += `- **${name}** (${key}): ${count} permissions\n`;
            }
          } else if (typeof roles === 'object') {
            matrixSection += '```json\n' + JSON.stringify(roles, null, 2).slice(0, 3000) + '\n```\n';
          }
          contextParts.push(matrixSection);
        }
      } else {
        contextFetchError = true;
        contextParts.push(
          roleKey
            ? '## Unified Role Data\n\n⚠️ Failed to fetch unified role data.'
            : '## Permission Matrix\n\n⚠️ Failed to fetch permission matrix data.'
        );
      }
    } catch (fetchErr) {
      contextFetchError = true;
      contextParts.push('## Context\n\n⚠️ Failed to fetch permission context. Proceeding with limited information.');
    }

    // ── Build system prompt ──
    const contextBlock = contextParts.join('\n\n---\n\n');
    const limitedNote = contextFetchError
      ? '\n\n> ⚠️ Note: Some context could not be fetched. Analysis may be incomplete.\n'
      : '';

    const systemPrompt = `You are an AI Permission Debugger for the MyJKKN education management platform.

Your job is to analyze permission issues across THREE layers of access control and provide specific, actionable diagnoses.

## The Three Permission Layers

1. **CODE PERMISSIONS** — Stored as JSONB in custom_roles.permissions table. Keys follow module.action pattern (e.g., admission.leads.view). Checked by usePermissions() hook in the frontend.

2. **DATABASE RLS (Row Level Security)** — Supabase policies on each table. These control actual data access at the database level. Common patterns:
   - Role-based: get_current_user_role() IN ('admin', 'super_admin')
   - Permission-based: user_has_permission('staff.create')
   - Institution-scoped: institution_id = get_current_user_institution_id()
   - Self-only: user_id = auth.uid()

3. **NAVIGATION** — MENU_PERMISSIONS in sidebarMenuLink.ts maps routes to required permission keys. Controls which pages are visible in the sidebar.

## Analysis Rules

- Always check ALL THREE layers — a permission issue could be in any one
- The most common root cause is a mismatch between layers
- When suggesting SQL fixes, always wrap them in \`\`\`sql code blocks
- Be specific: name exact permission keys, table names, policy names
- For RLS fixes, use CREATE POLICY with full definitions
- Consider institution scoping — some roles like admission have NULL institution_id
- When suggesting code permission changes, specify the exact JSONB key to toggle

## Response Format

- Start with a brief summary
- Use ✅ for layers that are properly configured
- Use ⚠️ for layers with issues
- Use ❌ for layers that are blocking access
- End with Root Cause and Suggested Fix sections
- If the fix involves SQL, provide complete ready-to-run SQL

## Current Context
${limitedNote}
${contextBlock}`;

    // ── Call Gemini with streaming ──
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const contents = [
      ...(conversationHistory || []).map((msg) => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }]
      })),
      { role: 'user' as const, parts: [{ text: query }] }
    ];

    const result = await model.generateContentStream({
      contents,
      systemInstruction: systemPrompt
    });

    // ── Stream as SSE ──
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'Stream error' })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (error) {
    console.error(
      'Error in POST /api/users/permissions-audit/ai-debug:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
