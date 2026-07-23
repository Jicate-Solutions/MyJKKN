// types/cdc/clubs.ts
// CDC Clubs + Memberships — type definitions derived from live DB schema

export type CdcClubStatus = 'active' | 'inactive' | 'upcoming';

export interface CdcClub {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  club_type: string | null;
  coordinator_staff_id: string | null;
  student_president_id: string | null;
  institution_id: string | null;
  is_active: boolean;
  status: CdcClubStatus;
  formed_on: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CdcClubWithMemberCount extends CdcClub {
  member_count: number;
  coordinator?: {
    id: string;
    name: string;
  } | null;
}

export interface CdcClubMembership {
  id: string;
  club_id: string;
  learner_id: string;
  role: 'member' | 'lead';
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CdcClubMembershipWithLearner extends CdcClubMembership {
  learner: {
    id: string;
    name: string;
    roll_number: string | null;
    institution_id: string | null;
  } | null;
}

export interface CreateClubDto {
  name: string;
  description?: string;
  club_type?: string;
  coordinator_staff_id?: string;
  student_president_id?: string;
  institution_id?: string;
  formed_on?: string;
  status?: CdcClubStatus;
}

export interface UpdateClubDto extends Partial<CreateClubDto> {
  is_active?: boolean;
  updated_by?: string;
}

export interface AddMemberDto {
  learner_id: string;
  role?: 'member' | 'lead';
  notes?: string;
}

export interface ClubFilters {
  institution_id?: string;
  is_active?: boolean;
  status?: CdcClubStatus;
  club_type?: string;
  page?: number;
  limit?: number;
}

export interface ClubListResponse {
  data: CdcClubWithMemberCount[];
  total: number;
  page: number;
  limit: number;
}
