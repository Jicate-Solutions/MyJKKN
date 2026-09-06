export interface HostelYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_current: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelYearDto {
  name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  is_current?: boolean;
  description?: string | null;
}

export interface UpdateHostelYearDto {
  name?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  is_current?: boolean;
  description?: string | null;
}

export interface HostelYearFilters {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface HostelYearListResponse {
  data: HostelYear[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
