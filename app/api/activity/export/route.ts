import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ActivityService } from '@/lib/services/activity-service';
import { ActivityLogFilters } from '@/types/activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with role information
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only allow administrators and super admins to export data
    if (!['super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { format = 'csv', filters = {}, columns = [] } = body;

    // Validate format
    if (!['csv', 'xlsx', 'json'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    // Get all matching records (up to a reasonable limit)
    const result = await ActivityService.getActivityLogs({
      filters: filters as ActivityLogFilters,
      page: 1,
      limit: 10000, // Maximum export limit
      sortBy: 'created_at',
      sortOrder: 'desc'
    });

    if (!result.data.length) {
      return NextResponse.json({ error: 'No data to export' }, { status: 400 });
    }

    // Prepare data for export
    const exportData = result.data.map((activity) => ({
      id: activity.id,
      timestamp: activity.created_at,
      user_name: activity.profiles?.full_name || 'Unknown',
      user_email: activity.profiles?.email || 'Unknown',
      user_role: activity.profiles?.role || 'Unknown',
      action_type: activity.action_type,
      resource_type: activity.resource_type || '',
      resource_id: activity.resource_id || '',
      resource_name: activity.resource_name || '',
      description: activity.description,
      ip_address: activity.ip_address || '',
      user_agent: activity.user_agent || '',
      request_url: activity.request_url || '',
      request_method: activity.request_method || '',
      status_code: activity.status_code || '',
      session_id: activity.session_id || '',
      institution_name: activity.institutions?.name || '',
      metadata: JSON.stringify(activity.metadata || {})
    }));

    // Filter columns if specified
    const finalData =
      columns.length > 0
        ? exportData.map((row) => {
            const filteredRow: any = {};
            columns.forEach((col: string) => {
              if (row.hasOwnProperty(col)) {
                filteredRow[col] = row[col as keyof typeof row];
              }
            });
            return filteredRow;
          })
        : exportData;

    // Generate export based on format
    switch (format) {
      case 'csv':
        return generateCsvExport(finalData);
      case 'json':
        return generateJsonExport(finalData);
      default:
        return NextResponse.json(
          { error: 'Format not supported yet' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error exporting activity logs:', error);
    return NextResponse.json(
      { error: 'Failed to export activity logs' },
      { status: 500 }
    );
  }
}

function generateCsvExport(data: any[]) {
  if (!data.length) {
    return NextResponse.json({ error: 'No data to export' }, { status: 400 });
  }

  // Generate CSV headers
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  // Generate CSV rows
  const csvRows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (
          typeof value === 'string' &&
          (value.includes(',') || value.includes('"') || value.includes('\n'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',')
  );

  const csvContent = [csvHeaders, ...csvRows].join('\n');

  const filename = `activity-logs-${
    new Date().toISOString().split('T')[0]
  }.csv`;

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}

function generateJsonExport(data: any[]) {
  const jsonContent = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      total_records: data.length,
      data: data
    },
    null,
    2
  );

  const filename = `activity-logs-${
    new Date().toISOString().split('T')[0]
  }.json`;

  return new NextResponse(jsonContent, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
