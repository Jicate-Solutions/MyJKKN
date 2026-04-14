// MATLAB Adoption Tracking Types

export interface MatlabAdoptionSnapshot {
  id: string;
  snapshot_date: string;
  total_registered_users: number;
  total_active_users: number | null;
  courses_started: number | null;
  courses_completed: number | null;
  raw_data: Record<string, unknown> | null;
  imported_by: string | null;
  imported_at: string;
  created_at: string;
}

export interface MatlabRegisteredUser {
  id: string;
  snapshot_id: string;
  email: string;
  name: string | null;
  user_type: 'learner' | 'staff' | 'admin' | null;
  institution: string | null;
  department: string | null;
  registration_date: string | null;
  courses_completed: number;
  last_active: string | null;
  myjkkn_user_id: string | null;
  created_at: string;
}
