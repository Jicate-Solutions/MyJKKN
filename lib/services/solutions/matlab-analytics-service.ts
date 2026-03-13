import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { MatlabAdoptionSnapshot, MatlabRegisteredUser } from '@/types/matlab';

export class MatlabAnalyticsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ── Adoption Snapshots ───────────────────────────────────────────────

  static async getLatestSnapshot(): Promise<MatlabAdoptionSnapshot | null> {
    const { data, error } = await this.supabase
      .from('matlab_adoption_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (error) return null;
    return data as MatlabAdoptionSnapshot;
  }

  static async getSnapshots(limit = 12): Promise<MatlabAdoptionSnapshot[]> {
    const { data, error } = await this.supabase
      .from('matlab_adoption_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(limit);

    if (error) throw new Error('Failed to fetch snapshots: ' + error.message);
    return (data ?? []) as MatlabAdoptionSnapshot[];
  }

  static async getSnapshotUsers(snapshotId: string): Promise<MatlabRegisteredUser[]> {
    const { data, error } = await this.supabase
      .from('matlab_registered_users')
      .select('*')
      .eq('snapshot_id', snapshotId)
      .order('registration_date', { ascending: false });

    if (error) throw new Error('Failed to fetch snapshot users: ' + error.message);
    return (data ?? []) as MatlabRegisteredUser[];
  }

  static async importSnapshot(input: {
    snapshot_date: string;
    total_registered_users: number;
    total_active_users?: number;
    courses_started?: number;
    courses_completed?: number;
    imported_by?: string;
    users?: Array<{
      email: string;
      name?: string;
      user_type?: string;
      institution?: string;
      department?: string;
      registration_date?: string;
      courses_completed?: number;
      last_active?: string;
    }>;
  }): Promise<MatlabAdoptionSnapshot> {
    const { users, ...snapshotData } = input;

    const { data: snapshot, error: snapshotError } = await this.supabase
      .from('matlab_adoption_snapshots')
      .insert({
        ...snapshotData,
        raw_data: users ? { users } : null,
      })
      .select()
      .single();

    if (snapshotError) throw new Error('Failed to import snapshot: ' + snapshotError.message);

    if (users && users.length > 0) {
      const userRows = users.map((u) => ({
        snapshot_id: snapshot.id,
        email: u.email,
        name: u.name || null,
        user_type: u.user_type || null,
        institution: u.institution || null,
        department: u.department || null,
        registration_date: u.registration_date || null,
        courses_completed: u.courses_completed || 0,
        last_active: u.last_active || null,
      }));

      const { error: usersError } = await this.supabase
        .from('matlab_registered_users')
        .insert(userRows);

      if (usersError) {
        console.error('Failed to import user records:', usersError.message);
      }
    }

    return snapshot as MatlabAdoptionSnapshot;
  }

  // ── Cross-system Queries ─────────────────────────────────────────────

  static async getMatlabBuilds() {
    const { data, error } = await this.supabase
      .from('ss_builds')
      .select('*, cycle:ss_cycles(id, name, user_id, created_at)')
      .eq('build_tool', 'matlab')
      .order('created_at', { ascending: false });

    if (error) throw new Error('Failed to fetch MATLAB builds: ' + error.message);
    return data ?? [];
  }

  static async getMatlabProducts() {
    const { data, error } = await this.supabase
      .from('sh_products')
      .select('id, product_code, title, current_trl, status, technology_stack, created_at')
      .contains('technology_stack', ['MATLAB'])
      .order('created_at', { ascending: false });

    if (error) throw new Error('Failed to fetch MATLAB products: ' + error.message);
    return data ?? [];
  }

  // ── Aggregated Stats ─────────────────────────────────────────────────

  static async getAdoptionKPIs() {
    const [latestSnapshot, matlabBuilds, matlabProducts] = await Promise.all([
      this.getLatestSnapshot(),
      this.getMatlabBuilds().catch(() => []),
      this.getMatlabProducts().catch(() => []),
    ]);

    return {
      registered_users: latestSnapshot?.total_registered_users ?? 0,
      active_users: latestSnapshot?.total_active_users ?? 0,
      courses_completed: latestSnapshot?.courses_completed ?? 0,
      ss_projects: matlabBuilds.length,
      sh_products: matlabProducts.length,
      last_snapshot_date: latestSnapshot?.snapshot_date ?? null,
    };
  }
}
