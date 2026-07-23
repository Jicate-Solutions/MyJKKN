'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import SchoolDefaultsTable from './school-defaults-table';
import SchoolDetailsModal from './school-details-modal';
import CreateDefaultsDialog from './create-defaults-dialog';
import EditDefaultsModal from './edit-defaults-modal';
import BulkRestoreDialog from './bulk-restore-dialog';
import RestoreConfirmationDialog from './restore-confirmation-dialog';
import { SchoolDefaultsFilters } from './school-defaults-filters';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { History, Loader2 } from 'lucide-react';
import { SchoolDefaultsAuditService } from '@/lib/services/school-defaults-audit-service';
import { SchoolDefaultsRestoreService } from '@/lib/services/school-defaults-restore-service';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  entity_type: string;
  degree_id: string | null;
  degree_name: string | null;
  department_id: string | null;
  department_name: string | null;
  learner_count: number;
}

export default function SchoolDefaultsPage() {
  const [schools, setSchools] = useState<SchoolWithDefaults[]>([]);
  const [filteredSchools, setFilteredSchools] = useState<SchoolWithDefaults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolWithDefaults | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolWithDefaults | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deletedDegrees, setDeletedDegrees] = useState<any[]>([]);
  const [resourceType, setResourceType] = useState<'degree' | 'department'>('degree');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogRecords, setConfirmDialogRecords] = useState<any[]>([]);
  const [confirmResourceType, setConfirmResourceType] = useState<'degree' | 'department'>('degree');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'learners'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchSchoolDefaults();
  }, []);

  useEffect(() => {
    fetchDeletedRecords(resourceType);
  }, [resourceType]);

  useEffect(() => {
    let filtered = schools;

    // Filter by search text (school name)
    if (searchText) {
      filtered = filtered.filter(school =>
        school.school_name.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter === 'configured') {
      filtered = filtered.filter(school => !!school.degree_id);
    } else if (statusFilter === 'missing') {
      filtered = filtered.filter(school => !school.degree_id);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let compareValue = 0;
      if (sortBy === 'name') {
        compareValue = a.school_name.localeCompare(b.school_name);
      } else if (sortBy === 'learners') {
        compareValue = a.learner_count - b.learner_count;
      }
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    setFilteredSchools(sorted);
  }, [schools, searchText, statusFilter, sortBy, sortOrder]);

  async function fetchSchoolDefaults() {
    try {
      setLoading(true);
      const supabase = createClientSupabaseClient();

      const { data, error: queryError } = await supabase
        .from('institutions')
        .select(
          `
          id,
          name,
          entity_type,
          degrees (
            id,
            degree_name,
            degree_id,
            departments (
              id,
              department_name
            )
          ),
          learners_profiles (
            id
          )
        `
        )
        .eq('entity_type', 'school')
        .order('name');

      if (queryError) {
        console.error('Supabase query error:', queryError);
        throw new Error(queryError.message || JSON.stringify(queryError));
      }

      const transformed: SchoolWithDefaults[] = (data || []).map((school: any) => {
        const k12Degree = school.degrees?.find((d: any) => d.degree_name === 'K-12 Program');
        const academicDept = k12Degree?.departments?.find((dept: any) => dept.department_name === 'Academic');
        return {
          school_id: school.id,
          school_name: school.name,
          entity_type: school.entity_type,
          degree_id: k12Degree?.id || null,
          degree_name: k12Degree?.degree_name || null,
          department_id: academicDept?.id || null,
          department_name: academicDept?.department_name || null,
          learner_count: school.learners_profiles?.length || 0,
        };
      });

      setSchools(transformed);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(errorMsg || 'Failed to load school defaults');
      console.error('Error fetching school defaults:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDeletedRecords(type: 'degree' | 'department') {
    try {
      const supabase = createClientSupabaseClient();
      const tableName = type === 'degree' ? 'degrees' : 'departments';
      const nameField = type === 'degree' ? 'degree_name' : 'department_name';
      const idField = type === 'degree' ? 'degree_id' : 'department_id';

      const { data, error: queryError } = await supabase
        .from(tableName)
        .select(`
          id,
          school_id:institutions(id, name),
          ${nameField},
          ${idField},
          deleted_at
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (queryError) {
        console.error(`Supabase query error (deleted ${type}s):`, queryError);
        throw new Error(queryError.message || JSON.stringify(queryError));
      }

      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        school_id: item.school_id.id,
        school_name: item.school_id.name,
        name: item[nameField],
        code: item[idField],
      }));

      setDeletedDegrees(transformed);
    } catch (err) {
      console.error(`Error fetching deleted ${type}s:`, err);
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(schools.map(s => s.school_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectSchool = (schoolId: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(schoolId);
    } else {
      newSet.delete(schoolId);
    }
    setSelectedIds(newSet);
  };

  async function handleBulkDelete() {
    const schoolNames = schools
      .filter(s => selectedIds.has(s.school_id))
      .map(s => s.school_name)
      .join(', ');

    if (!window.confirm(
      `Delete K-12 Program defaults for ${selectedIds.size} school(s)?\n\n${schoolNames}`
    )) {
      return;
    }

    try {
      const supabase = createClientSupabaseClient();
      const { data: currentUser } = await supabase.auth.getUser();
      const degreeIds = schools
        .filter(s => selectedIds.has(s.school_id) && s.degree_id)
        .map(s => s.degree_id) as string[];

      if (degreeIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('degrees')
          .delete()
          .in('id', degreeIds);

        if (deleteError) throw deleteError;

        // Audit log for each school
        for (const schoolId of selectedIds) {
          const school = schools.find(s => s.school_id === schoolId);
          if (school && currentUser.user?.id) {
            await SchoolDefaultsAuditService.logAction(
              'delete',
              schoolId,
              school.school_name,
              'degree',
              { degree_id: school.degree_id },
              currentUser.user.id
            );
          }
        }
      }

      setSelectedIds(new Set());
      await fetchSchoolDefaults();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function handleUpdateDegree(schoolId: string, degreeId: string | null, newName: string) {
    if (!degreeId) return;
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('degrees')
      .update({ degree_name: newName })
      .eq('id', degreeId);

    if (error) throw error;

    // Log audit trail
    const { data: user } = await supabase.auth.getUser();
    if (user.user?.id) {
      const school = schools.find(s => s.school_id === schoolId);
      await SchoolDefaultsAuditService.logAction(
        'update',
        schoolId,
        school?.school_name || '',
        'degree',
        { degree_name: newName },
        user.user.id
      );
    }

    await fetchSchoolDefaults();
  }

  async function handleUpdateDepartment(schoolId: string, deptId: string | null, newName: string) {
    if (!deptId) return;
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('departments')
      .update({ department_name: newName })
      .eq('id', deptId);

    if (error) throw error;

    // Similar audit logging
    const { data: user } = await supabase.auth.getUser();
    if (user.user?.id) {
      const school = schools.find(s => s.school_id === schoolId);
      await SchoolDefaultsAuditService.logAction(
        'update',
        schoolId,
        school?.school_name || '',
        'department',
        { department_name: newName },
        user.user.id
      );
    }

    await fetchSchoolDefaults();
  }

  async function handleRestoreDelete(auditLogId: string, degreeId: string, schoolName: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: user } = await supabase.auth.getUser();

      if (user.user?.id) {
        await SchoolDefaultsRestoreService.restoreDeletedDegree(degreeId);
        await SchoolDefaultsRestoreService.logRestore(degreeId, schoolName, user.user.id);
      }

      await fetchSchoolDefaults();
    } catch (err) {
      alert(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6">
      <PageHeader
        title="School Defaults"
        description="Manage virtual K-12 Program and Academic department assignments for school institutions"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/organizations/school-defaults/audit">
              <History className="mr-1.5 h-4 w-4" />
              Audit log
            </Link>
          </Button>
        }
      />

      {error && <AlertBox type="error" message={error} />}

      {schools.length === 0 ? (
        <div className="space-y-4">
          <AlertBox
            type="info"
            message="No school institutions found in the system. Create a school institution first in the Institutions module."
          />
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>To get started:</strong> Go to <a href="/organizations/institutions" className="font-semibold underline hover:text-blue-700">Institutions</a> and create a new institution with <strong>Entity Type: School</strong>.
            </p>
          </div>
        </div>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex gap-2 items-center bg-blue-50 p-3 rounded-lg border border-blue-200">
              <span className="text-sm font-medium">
                {selectedIds.size} school(s) selected
              </span>
              <button
                className="px-3 py-1 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                onClick={handleBulkDelete}
              >
                Delete {selectedIds.size} School(s)
              </button>
              <button
                className="px-3 py-1 text-sm font-medium bg-white border border-gray-300 rounded hover:bg-gray-50"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear Selection
              </button>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setResourceType('degree')}
              className={`px-4 py-2 font-medium rounded-lg transition-colors ${
                resourceType === 'degree'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              K-12 Programs
            </button>
            <button
              onClick={() => setResourceType('department')}
              className={`px-4 py-2 font-medium rounded-lg transition-colors ${
                resourceType === 'department'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Departments
            </button>
          </div>

          {deletedDegrees.length > 0 && (
            <div className="flex gap-2 items-center bg-amber-50 p-3 rounded-lg border border-amber-200">
              <span className="text-sm text-amber-800">
                {deletedDegrees.length} deleted {resourceType === 'degree' ? 'degree' : 'department'}(s) available to restore
              </span>
              <button
                className="px-3 py-1 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
                onClick={() => setRestoreDialogOpen(true)}
              >
                Restore Deleted {resourceType === 'degree' ? 'Degrees' : 'Departments'}
              </button>
            </div>
          )}

          <SchoolDefaultsTable
            data={filteredSchools}
            selectedIds={selectedIds}
            onSelectAll={handleSelectAll}
            onSelectSchool={handleSelectSchool}
            onRefresh={fetchSchoolDefaults}
            onViewSchool={(school) => {
              setSelectedSchool(school);
              setModalOpen(true);
            }}
            onUpdateDegree={handleUpdateDegree}
            onUpdateDepartment={handleUpdateDepartment}
            searchText={searchText}
            statusFilter={statusFilter}
            onSearchChange={setSearchText}
            onStatusChange={setStatusFilter}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={(field, order) => {
              setSortBy(field);
              setSortOrder(order);
            }}
          />

          {selectedSchool && selectedSchool.degree_id ? (
            <SchoolDetailsModal
              school={selectedSchool}
              open={modalOpen}
              onOpenChange={setModalOpen}
              onRefresh={fetchSchoolDefaults}
              onEdit={(school) => {
                setEditingSchool(school);
                setEditModalOpen(true);
              }}
            />
          ) : (
            <CreateDefaultsDialog
              schoolId={selectedSchool?.school_id || ''}
              schoolName={selectedSchool?.school_name || ''}
              open={modalOpen}
              onOpenChange={setModalOpen}
              onSuccess={fetchSchoolDefaults}
            />
          )}

          {editingSchool && (
            <EditDefaultsModal
              school={editingSchool}
              open={editModalOpen}
              onOpenChange={setEditModalOpen}
              onRefresh={fetchSchoolDefaults}
            />
          )}

          <BulkRestoreDialog
            open={restoreDialogOpen}
            onOpenChange={setRestoreDialogOpen}
            onRestoreComplete={() => {
              fetchSchoolDefaults();
              fetchDeletedRecords(resourceType);
            }}
            deletedDegrees={deletedDegrees}
            resourceType={resourceType}
          />

          <RestoreConfirmationDialog
            open={confirmDialogOpen}
            onOpenChange={setConfirmDialogOpen}
            records={confirmDialogRecords}
            resourceType={confirmResourceType}
            onConfirm={async (recordIds) => {
              const { data: user } = await createClientSupabaseClient().auth.getUser();
              if (user.user?.id) {
                await SchoolDefaultsRestoreService.bulkRestoreDeletedRecordsBatched(
                  recordIds,
                  confirmResourceType,
                  100
                );
                await fetchSchoolDefaults();
                await fetchDeletedDegrees();
              }
            }}
          />
        </>
      )}
    </div>
  );
}
