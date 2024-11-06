// hooks/use-applications.ts
import { useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import {
  Application,
  ApplicationStats,
  DEFAULT_STATS,
  Database,
  ApplicationFilter,
  ApplicationSort,
  DEFAULT_SORT
} from '@/types/applications';

const initialStats: ApplicationStats = {
  total: 0,
  active: 0,
  internal: 0,
  external: 0
};

export function useApplications(
  initialFilter: ApplicationFilter = {},
  initialSort: ApplicationSort = DEFAULT_SORT
) {
  const supabase = createClientComponentClient<Database>();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<ApplicationStats>(DEFAULT_STATS);
  const [filter, setFilter] = useState<ApplicationFilter>(initialFilter);
  const [sort, setSort] = useState<ApplicationSort>(initialSort);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsError(false);

      const { data: applicationsData, error } = await supabase
        .from('applications')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (!applicationsData) {
        throw new Error('No data received');
      }

      // Process applications
      setApplications(applicationsData);

      // Calculate stats
      const statsData = applicationsData.reduce(
        (acc, app) => {
          acc.total += 1;
          if (app.is_active) acc.active += 1;
          if (app.application_type === 'Internal') acc.internal += 1;
          if (app.application_type === 'External') acc.external += 1;
          return acc;
        },
        { ...initialStats }
      );

      setStats(statsData);
    } catch (error) {
      console.error('Error fetching applications:', error);
      setIsError(true);
      toast.error('Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const deleteApplication = async (id: string) => {
    try {
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Application deleted successfully');
      await fetchApplications();
    } catch (error) {
      console.error('Error deleting application:', error);
      toast.error('Failed to delete application');
    }
  };

  return {
    applications,
    stats,
    isLoading,
    isError,
    fetchApplications,
    deleteApplication
  };
}
