'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import SchoolDefaultsTable from './school-defaults-table';
import SchoolDetailsModal from './school-details-modal';
import CreateDefaultsDialog from './create-defaults-dialog';
import EditDefaultsModal from './edit-defaults-modal';
import { PageHeader } from '@/components/page-header';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    fetchSchoolDefaults();
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
          institution_name,
          entity_type,
          degrees!left (
            id,
            degree_name,
            degree_code
          ),
          learners_profiles!left (
            id
          )
        `
        )
        .eq('entity_type', 'school')
        .order('institution_name');

      if (queryError) throw queryError;

      const transformed: SchoolWithDefaults[] = (data || []).map((school: any) => {
        const k12Degree = school.degrees?.find((d: any) => d.degree_code === 'K12');
        return {
          school_id: school.id,
          school_name: school.institution_name,
          entity_type: school.entity_type,
          degree_id: k12Degree?.id || null,
          degree_name: k12Degree?.degree_name || null,
          degree_code: k12Degree?.degree_code || null,
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
        <AlertBox type="info" message="No school institutions found in the system" />
      ) : (
        <>
          <SchoolDefaultsTable
            data={schools}
            onRefresh={fetchSchoolDefaults}
            onViewSchool={(school) => {
              setSelectedSchool(school);
              setModalOpen(true);
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
        </>
      )}
    </div>
  );
}
