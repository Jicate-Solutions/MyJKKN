import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const exportSchema = z.object({
  module_name: z.string().optional(),
  status: z.string().optional(),
  include_console_logs: z.boolean().default(true)
});

function buildBugMarkdown(bug: any, includeConsoleLogs: boolean): string {
  const lines: string[] = [];

  lines.push(`# Bug Report: ${bug.display_id}`);
  lines.push('');
  lines.push('```yaml');
  lines.push(`id: ${bug.id}`);
  lines.push(`display_id: ${bug.display_id}`);
  lines.push(`status: ${bug.status}`);
  lines.push(`module: ${bug.module_name ?? 'other'}`);
  lines.push(`category: ${bug.category ?? 'bug'}`);
  lines.push(`reported_at: ${bug.created_at}`);
  if (bug.resolved_at) lines.push(`resolved_at: ${bug.resolved_at}`);
  lines.push('```');
  lines.push('');

  lines.push('## Reporter');
  if (bug.reporter_name) {
    lines.push(`- **Name:** ${bug.reporter_name}`);
    lines.push(`- **Email:** ${bug.reporter_email ?? 'N/A'}`);
    lines.push(`- **Role:** ${bug.reporter_role ?? 'N/A'}`);
  } else {
    lines.push('- Anonymous / No profile');
  }
  lines.push('');

  lines.push('## Page URL');
  lines.push(`\`${bug.page_url}\``);
  lines.push('');

  if (bug.institution_name) {
    lines.push(`**Institution:** ${bug.institution_name}`);
    lines.push('');
  }

  lines.push('## Description');
  lines.push(bug.description ?? 'No description provided.');
  lines.push('');

  if (bug.metadata) {
    const meta =
      typeof bug.metadata === 'string'
        ? JSON.parse(bug.metadata)
        : bug.metadata;
    if (meta.browser || meta.os) {
      lines.push('## Environment');
      if (meta.browser) lines.push(`- **Browser:** ${meta.browser}`);
      if (meta.os) lines.push(`- **OS:** ${meta.os}`);
      lines.push('');
    }
  }

  if (
    includeConsoleLogs &&
    bug.console_logs &&
    Array.isArray(bug.console_logs) &&
    bug.console_logs.length > 0
  ) {
    lines.push('## Console Logs');
    lines.push('```');
    for (const log of bug.console_logs.slice(0, 50)) {
      const level = log.level ?? log.type ?? 'log';
      const msg =
        typeof log.message === 'string'
          ? log.message
          : JSON.stringify(log.message ?? log);
      lines.push(`[${level.toUpperCase()}] ${msg}`);
    }
    lines.push('```');
    lines.push('');
  }

  if (bug.screenshot_url) {
    lines.push('## Screenshot');
    lines.push(`![Screenshot](${bug.screenshot_url})`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['admin', 'super_admin', 'administrator'].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: 'Admin permissions required' },
        { status: 403 }
      );
    }

    const json = await request.json();
    const { module_name, status, include_console_logs } =
      exportSchema.parse(json);

    const adminSupabase = createAdminClient();

    // adminSupabase typed to generated schema; as any needed for view not in types
    let query = (adminSupabase as any)
      .from('bug_reports_with_details')
      .select(
        'id, display_id, status, module_name, category, created_at, resolved_at, page_url, description, console_logs, screenshot_url, metadata, reporter_name, reporter_email, reporter_role, institution_name'
      )
      .order('module_name', { ascending: true })
      .order('created_at', { ascending: false });

    if (module_name) query = query.eq('module_name', module_name);
    if (status) query = query.eq('status', status);

    const { data: bugs, error } = await query;
    if (error) throw error;

    // Group bugs by module
    const byModule: Record<string, any[]> = {};
    for (const bug of bugs ?? []) {
      const mod = bug.module_name ?? 'other';
      (byModule[mod] ??= []).push(bug);
    }

    // Build ZIP with one markdown file per module
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const exportDate = new Date().toISOString().split('T')[0];

    for (const [mod, modBugs] of Object.entries(byModule)) {
      let content = `# Bug Reports — ${mod} module\n\n`;
      content += `> Exported: ${exportDate} | Total: ${modBugs.length} bug${modBugs.length !== 1 ? 's' : ''}\n\n`;
      content += `---\n\n`;
      for (const bug of modBugs) {
        content += buildBugMarkdown(bug, include_console_logs);
      }
      zip.file(`${mod}-bugs-${exportDate}.md`, content);
    }

    // Index file
    const summaryLines = [`# Bug Export Summary — ${exportDate}\n\n`];
    summaryLines.push(`Total bugs: ${(bugs ?? []).length}\n\n`);
    summaryLines.push(`## Modules\n\n`);
    for (const [mod, modBugs] of Object.entries(byModule)) {
      summaryLines.push(`- **${mod}**: ${modBugs.length} bugs\n`);
    }
    zip.file('_index.md', summaryLines.join(''));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="bug-reports-${exportDate}.zip"`
      }
    });
  } catch (error) {
    logger.error('bug-reports/export', 'Export failed', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
