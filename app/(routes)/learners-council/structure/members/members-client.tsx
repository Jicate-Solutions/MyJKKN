'use client';

/**
 * Members Client - Interactive member directory with filtering
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Users, Filter, X, UserPlus, History } from 'lucide-react';
import { AssignMemberDialog, MemberStatusSelect, PositionHistoryDialog } from './member-actions';
import { useLCMembers } from '@/hooks/learners-council/use-lc-structure';
import type { LCPosition } from '@/types/learners-council';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  on_leave: 'bg-yellow-100 text-yellow-800',
  graduated: 'bg-blue-100 text-blue-800',
  removed: 'bg-red-100 text-red-800'
};

const categoryLabels: Record<string, string> = {
  executive: 'Executive',
  institution_president: 'Institution President',
  portfolio_head: 'Portfolio Head',
  at_large: 'At Large'
};

interface MembersClientProps {
  initialMembers: any[];
  terms: any[];
  positions: LCPosition[];
  institutions: { id: string; name: string }[];
  isStaffOrAdmin: boolean;
}

export function MembersClient({
  initialMembers,
  terms,
  positions,
  institutions,
  isStaffOrAdmin
}: MembersClientProps) {
  const [termFilter, setTermFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');

  // Live-fetch members with current filters; falls back to server-provided initial data
  const { data: liveMembers } = useLCMembers({
    term_id: termFilter || undefined,
    status: statusFilter || undefined,
    institution_id: institutionFilter || undefined,
  });

  const filteredMembers = useMemo(() => {
    let result = liveMembers ?? initialMembers;

    if (termFilter) {
      result = result.filter((m) => m.term_id === termFilter);
    }
    if (statusFilter) {
      result = result.filter((m) => m.status === statusFilter);
    }
    if (institutionFilter) {
      result = result.filter((m) => m.institution_id === institutionFilter);
    }

    return result;
  }, [liveMembers, initialMembers, termFilter, statusFilter, institutionFilter]);

  const hasFilters = termFilter || statusFilter || institutionFilter;

  const clearFilters = () => {
    setTermFilter('');
    setStatusFilter('');
    setInstitutionFilter('');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: Filters + Assign */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />

          <Select value={termFilter || 'all'} onValueChange={(v) => setTermFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All Terms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Terms</SelectItem>
              {terms.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
              <SelectItem value="graduated">Graduated</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={institutionFilter || 'all'} onValueChange={(v) => setInstitutionFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="All Institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {isStaffOrAdmin && (
          <AssignMemberDialog
            positions={positions}
            terms={terms}
            institutions={institutions}
          />
        )}
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
      </p>

      {/* Members Table */}
      {filteredMembers.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Appointed</TableHead>
                  {isStaffOrAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                          {member.user?.full_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{member.user?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{member.user?.email || ''}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {member.position?.title || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {categoryLabels[member.position?.category] || member.position?.category || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {member.term?.name || '-'}
                    </TableCell>
                    <TableCell>
                      {isStaffOrAdmin ? (
                        <MemberStatusSelect memberId={member.id} currentStatus={member.status} />
                      ) : (
                        <Badge className={`text-xs ${statusColors[member.status] || ''}`}>
                          {member.status.charAt(0).toUpperCase() + member.status.slice(1).replace('_', ' ')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(member.appointed_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </TableCell>
                    {isStaffOrAdmin && (
                      <TableCell className="text-right">
                        <PositionHistoryDialog
                          positionId={member.position_id}
                          positionTitle={member.position?.title || 'Position'}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-medium text-lg">No members found</h3>
            <p className="text-sm mt-1">
              {hasFilters ? 'Try adjusting your filters.' : 'Assign learners to LC positions to get started.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
