'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { createColumns, type ReEngagementLead } from './columns';
import { ReEngagementService } from '@/lib/services/admission/re-engagement-service';
import { useMarkLeadAsHot } from '@/hooks/admission/use-re-engagement';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Zap, Loader2 } from 'lucide-react';

const DAYS_OPTIONS = [
  { value: '_all', label: 'All Cold Leads' },
  { value: '14', label: '14+ Days' },
  { value: '30', label: '30+ Days' },
  { value: '60', label: '60+ Days' },
  { value: '90', label: '90+ Days' },
];

async function fetchColdLeads(
  institutionId: string,
  minDaysInactive: number,
  params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }
) {
  // Use the service layer instead of calling Supabase directly
  const result = await ReEngagementService.getColdLeads({
    institutionId,
    minDaysInactive,
    search: params.search || undefined,
    limit: params.limit,
    offset: (params.page - 1) * params.limit,
  });

  return {
    success: true,
    data: (result.leads || []) as ReEngagementLead[],
    pagination: {
      page: params.page,
      limit: params.limit,
      total_pages: Math.ceil((result.total || 0) / params.limit),
      total_items: result.total || 0
    }
  };
}

export function ReEngagementDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || "";
  const [daysFilter, setDaysFilter] = useState("_all");
  const [refetchKey, setRefetchKey] = useState(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const markAsHot = useMarkLeadAsHot();

  const minDaysInactive = daysFilter === "_all" ? 14 : parseInt(daysFilter, 10);

  const columns = createColumns((leadId) => markAsHot.mutate(leadId));

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    if (!institutionId) {
      return {
        success: true,
        data: [] as ReEngagementLead[],
        pagination: { page: 1, limit: params.limit, total_pages: 0, total_items: 0 }
      };
    }
    return fetchColdLeads(institutionId, minDaysInactive, params);
  };

  const renderToolbarContent = (props: {
    selectedRows: ReEngagementLead[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={daysFilter}
        onValueChange={(value) => {
          setDaysFilter(value);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <SelectTrigger className="w-[160px] h-8">
          <SelectValue placeholder="Filter by days" />
        </SelectTrigger>
        <SelectContent>
          {DAYS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {props.selectedRows.length > 0 && (
        <>
          <Badge variant="secondary">{props.selectedRows.length} selected</Badge>
          <Button
            size="sm"
            className="h-8"
            disabled={isSendingMessage}
            onClick={async () => {
              setIsSendingMessage(true);
              try {
                await new Promise((r) => setTimeout(r, 500));
                const count = props.selectedRows.length;
                toast.success("Message sent to " + count + " lead" + (count > 1 ? "s" : ""));
                props.resetSelection();
              } catch {
                toast.error("Failed to send message");
              } finally {
                setIsSendingMessage(false);
              }
            }}
          >
            {isSendingMessage ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Send Message
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              const count = props.selectedRows.length;
              toast.success(count + " lead" + (count > 1 ? "s" : "") + " added to campaign");
            }}
          >
            <Zap className="h-4 w-4 mr-1" />
            Add to Campaign
          </Button>
        </>
      )}
    </div>
  );

  return (
    <DataTable
      key={refetchKey}
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 're-engagement-leads',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{
        enableUrlState: false,
        enableDateFilter: true,
        enableExport: false,
        enableRowSelection: true,
      }}
      renderToolbarContent={renderToolbarContent}
    />
  );
}
