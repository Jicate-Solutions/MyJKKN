'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import SchoolDefaultsTable from './school-defaults-table';
import SchoolDetailsModal from './school-details-modal';
import CreateDefaultsDialog from './create-defaults-dialog';
import EditDefaultsModal from './edit-defaults-modal';
import BulkRestoreDialog from './bulk-restore-dialog';
import { PageHeader } from '@/components/page-header';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';
import { SchoolDefaultsAuditService } from '@/lib/services/school-defaults-audit-service';
import { SchoolDefaultsRestoreService } from '@/lib/services/school-defaults-restore-service';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  entity_type: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

export default function SchoolDefaultsPage() {
  const [schools, setSchools] = useState<SchoolWithDefaults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolWithDefaults | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolWithDefaults | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deletedDegrees, setDeletedDegrees] = useState<any[]>([]);

  useEffect(() => {
    fetchSchoolDefaults();
    fetchDeletedDegrees();
  }, []);

  async function fetchSchoolDefaults() {
    try {
      setLoading(true);
      const supabase = createClientSupabaseClient();

      const { data, error: queryError } = await supabase
        .from('institutions')
        .select(
          `
          id,
          name as institution_name,
          entity_type,
          degrees!left (
            id,
            degree_name,
            degree_id
          ),
          learners_profiles!left (
            id
          )
        `
        )
        .eq('entity_type', 'school')
        .order('name');

      if (queryError) throw queryError;

      const transformed: SchoolWithDefaults[] = (data || []).map((school: any) => {
        const k12Degree = school.degrees?.find((d: any) => d.degree_name === 'K-12 Program');
        return {
          school_id: school.id,
          school_name: school.institution_name,
          entity_type: school.entity_type,
          degree_id: k12Degree?.id || null,
          degree_name: k12Degree?.degree_name || null,
          degree_code: k12Degree?.degree_id || null,
          department_id: null,
          department_name: null,
          department_code: null,
          learner_count: school.learners_profiles?.length || 0,
        };
      });

      setSchools(transformed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load school defaults');
      console.error('Error fetching school defaults:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDeletedDegrees() {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: queryError } = await supabase
        .from('degrees')
        .select(`
          id,
          school_id:institutions!inner(id, name),
          degree_name,
          degree_id,
          deleted_at
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (queryError) throw queryError;

      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        school_id: item.school_id.id,
        school_name: item.school_id.name,
        degree_name: item.degree_name,
        degree_code: item.degree_id,
      }));

      setDeletedDegrees(transformed);
    } catch (err) {
      console.error('Error fetching deleted degrees:', err);
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
    <div className="space-y-6">
      <PageHeader
        title="School Defaults"
        description="Manage virtual K-12 Program and Academic department assignments for school institutions"
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

          {deletedDegrees.length > 0 && (
            <div className="flex gap-2 items-center bg-amber-50 p-3 rounded-lg border border-amber-200">
              <span className="text-sm text-amber-800">
                {deletedDegrees.length} deleted degree(s) available to restore
              </span>
              <button
                className="px-3 py-1 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
                onClick={() => setRestoreDialogOpen(true)}
              >
                Restore Deleted Degrees
              </button>
            </div>
          )}

          <SchoolDefaultsTable
            data={schools}
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
              fetchDeletedDegrees();
            }}
            deletedDegrees={deletedDegrees}
          />
        </>
      )}
    </div>
  );
}
