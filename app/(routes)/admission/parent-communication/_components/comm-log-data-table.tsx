'use client';

import { DataTable } from '@/components/data-table/data-table';
import { ParentCommunicationService } from '@/lib/services/admission/parent-communication-service';
import { columns, type CommLogRow } from './columns';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommLogDataTableProps {
  institutionId: string;
}

// ── Data Fetch ─────────────────────────────────────────────────────────────────

function buildFetchFn(institutionId: string) {
  return async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }): Promise<{
    success: boolean;
    data: CommLogRow[];
    pagination: {
      page: number;
      limit: number;
      total_pages: number;
      total_items: number;
    };
  }> => {
    const offset = (params.page - 1) * params.limit;

    // Use the service layer instead of calling Supabase directly
    const logs = await ParentCommunicationService.getCommunicationLogs(
      institutionId,
      { limit: 500 } // Fetch enough for client-side pagination
    );

    // Map service data to CommLogRow format
    const allRows: CommLogRow[] = logs.map((log) => ({
      id: log.id,
      lead_id: log.lead_id || '',
      parent_name: log.recipient_phone || '',
      student_name: '',
      channel: log.channel,
      direction: 'outbound' as const,
      status:
        log.status === 'delivered' || log.status === 'sent'
          ? 'completed'
          : 'pending',
      summary: log.message_content || '',
      counselor_name: '',
      timestamp: log.sent_at || log.created_at || '',
    }));

    // Apply client-side filters (search, date range)
    let filtered = allRows;
    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(
        (row) => row.summary.toLowerCase().includes(s)
      );
    }
    if (params.from_date) {
      filtered = filtered.filter(
        (row) => row.timestamp >= params.from_date
      );
    }
    if (params.to_date) {
      filtered = filtered.filter(
        (row) => row.timestamp <= params.to_date
      );
    }

    // Sort by timestamp desc
    filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const total_items = filtered.length;
    const paginated = filtered.slice(offset, offset + params.limit);

    return {
      success: true,
      data: paginated,
      pagination: {
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil(total_items / params.limit),
        total_items,
      },
    };
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommLogDataTable({ institutionId }: CommLogDataTableProps) {
  const fetchData = buildFetchFn(institutionId);

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'parent-comm-log',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{
        enableUrlState: false,
        enableDateFilter: true,
        enableExport: false,
        enableRowSelection: false,
      }}
    />
  );
}
