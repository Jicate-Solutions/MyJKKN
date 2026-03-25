'use client';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { columns, type CommLogRow } from './columns';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommLogDataTableProps {
  institutionId: string;
}

// ── Data Fetch ─────────────────────────────────────────────────────────────────

function buildFetchFn(institutionId: string) {
  return async (params: DataFetchParams) => {
    const supabase = createClientSupabaseClient();
    const offset = (params.page - 1) * params.limit;

    // Fetch SMS logs
    let smsQuery = (supabase as any)
      .from('admission_sms_logs')
      .select(
        'id, lead_id, phone_number, message_content, status, sent_at, created_at',
        { count: 'exact' }
      )
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (params.search) {
      smsQuery = smsQuery.ilike('message_content', `%${params.search}%`);
    }
    if (params.from_date) {
      smsQuery = smsQuery.gte('created_at', params.from_date);
    }
    if (params.to_date) {
      smsQuery = smsQuery.lte('created_at', params.to_date);
    }

    // Fetch WhatsApp logs
    let waQuery = (supabase as any)
      .from('admission_whatsapp_logs')
      .select(
        'id, lead_id, recipient_phone, message_content, delivery_status, sent_at, created_at',
        { count: 'exact' }
      )
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (params.search) {
      waQuery = waQuery.ilike('message_content', `%${params.search}%`);
    }
    if (params.from_date) {
      waQuery = waQuery.gte('created_at', params.from_date);
    }
    if (params.to_date) {
      waQuery = waQuery.lte('created_at', params.to_date);
    }

    const [smsResult, waResult] = await Promise.all([smsQuery, waQuery]);

    if (smsResult.error) throw smsResult.error;
    if (waResult.error) throw waResult.error;

    const smsRows: CommLogRow[] = (smsResult.data || []).map((log: any) => ({
      id: log.id,
      lead_id: log.lead_id || '',
      parent_name: log.phone_number || '',
      student_name: '',
      channel: 'sms' as const,
      direction: 'outbound' as const,
      status:
        log.status === 'delivered' || log.status === 'sent'
          ? 'completed'
          : 'pending',
      summary: log.message_content || '',
      counselor_name: '',
      timestamp: log.sent_at || log.created_at || '',
    }));

    const waRows: CommLogRow[] = (waResult.data || []).map((log: any) => ({
      id: log.id,
      lead_id: log.lead_id || '',
      parent_name: log.recipient_phone || '',
      student_name: '',
      channel: 'whatsapp' as const,
      direction: 'outbound' as const,
      status:
        log.delivery_status === 'delivered' || log.delivery_status === 'sent'
          ? 'completed'
          : 'pending',
      summary: log.message_content || '',
      counselor_name: '',
      timestamp: log.sent_at || log.created_at || '',
    }));

    // Merge and sort by timestamp desc, then paginate
    const allRows = [...smsRows, ...waRows].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const total_items = allRows.length;
    const paginated = allRows.slice(offset, offset + params.limit);

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
      fetchDataFn={fetchData as any}
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
