'use client';

import { useCallback } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { MeritListCandidate } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { MeritListService } from '@/lib/services/admission/merit-list-service';
import type { MeritListRow, MeritListEntry } from '@/lib/services/admission/merit-list-service';

function mapToCandidate(
  entry: MeritListEntry,
  list: MeritListRow,
  index: number
): MeritListCandidate {
  return {
    id: entry.application_number || entry.application_id?.slice(0, 12) || `ENTRY-${index + 1}`,
    name: entry.candidate_name || 'Unknown',
    program: list.list_name || '',
    category: entry.category || list.category || 'General',
    academicScore: entry.academic_score ?? 0,
    entranceScore: entry.entrance_score ?? 0,
    interviewScore: entry.interview_score ?? 0,
    gdScore: entry.gd_score ?? 0,
    extracurricularScore: entry.extracurricular_score ?? 0,
    totalScore: entry.total_score ?? 0,
    rank: entry.rank ?? index + 1,
    status: entry.status || 'pending',
    email: entry.email || '',
    phone: entry.phone || '',
    listId: list.id,
  };
}

export function MeritListDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const lists = await MeritListService.getMeritLists(institutionId);

      // Flatten all entries from all merit lists into MeritListCandidate[]
      const allCandidates: MeritListCandidate[] = [];
      let globalIndex = 0;
      for (const list of lists) {
        const entries = (list.entries || []) as MeritListEntry[];
        for (const entry of entries) {
          allCandidates.push(mapToCandidate(entry, list, globalIndex));
          globalIndex++;
        }
      }

      const filtered = params.search
        ? allCandidates.filter((c) =>
            JSON.stringify(c).toLowerCase().includes(params.search.toLowerCase())
          )
        : allCandidates;

      const start = (params.page - 1) * params.limit;
      return {
        success: true,
        data: filtered.slice(start, start + params.limit),
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.ceil(filtered.length / params.limit) || 1,
          total_items: filtered.length,
        },
      };
    },
    [institutionId]
  );

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns}
      exportConfig={{
        entityName: 'merit-list',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{
        enableUrlState: false,
        enableDateFilter: false,
        enableExport: false,
      }}
    />
  );
}
