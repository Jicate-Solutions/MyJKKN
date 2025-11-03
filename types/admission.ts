export interface Admission {
  id: string;
  application_id?: string; // Auto-generated unique ID like JKKN-2024-0001
  first_name: string;
  last_name?: string;
  father_name: string;
  father_occupation: string;
  father_mobile: string;
  mother_name: string;
  mother_occupation: string;
  mother_mobile: string;
  date_of_birth: string;
  gender: string;
  religion: string;
  community: string;
  caste: string;
  annual_income: string;
  aadhar_number?: string;
  last_school: string;
  board_of_study: string;
  tenth_marks: {
    max_marks: string;
    obtained_marks: string;
    percentage: string;
  };
  twelfth_marks: {
    group: string;
    max_marks: string;
    obtained_marks: string;
    percentage: string;
    subjects: Record<string, string>;
  };
  medical_cutoff_marks?: string;
  engineering_cutoff_marks?: string;
  neet_roll_number?: string;
  neet_score?: string;
  counseling_applied: boolean;
  counseling_number?: string;
  first_graduate: boolean;
  quota?: string;
  category?: string;
  institution_id?: string; // reference to institution ID
  degree_id?: string; // reference to degree
  department_id?: string; // reference to department
  program_id?: string; // reference to program
  entry_type: string; // FIRST YEAR, LATERAL ENTRY, etc.
  permanent_address_street: string;
  permanent_address_taluk?: string;
  permanent_address_district: string;
  permanent_address_pin_code: string;
  permanent_address_state: string;
  student_mobile: string;
  student_email: string;
  accommodation_type: string;
  hostel_type?: string;
  food_type?: string;
  bus_required?: boolean;
  bus_route?: string;
  bus_pickup_location?: string;
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;
  status: string; // pending, approved, rejected, waitlisted, enrolled
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Related data from joins
  institution?: {
    id: string;
    name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  course?: {
    id: string;
    course_name: string;
  };
  student?: {
    id: string;
  } | null;
}

export interface CreateAdmissionDto
  extends Omit<
    Admission,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
  > {
  // Additional properties specific to creation if needed
}

export interface UpdateAdmissionDto
  extends Partial<
    Omit<
      Admission,
      'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
    >
  > {
  // Additional properties specific to update if needed
}

export interface AdmissionFilters {
  search?: string;
  name?: string;
  status?: string;
  institution?: string; // field_of_study
  department?: string; // department filter
  entry_type?: string; // entry type filter (FIRST YEAR, LATERAL ENTRY, etc.)
  course?: string; // year_and_branch
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface AdmissionListResponse {
  data: Admission[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================================================
// ANALYTICS DASHBOARD TYPES
// ============================================================================

/**
 * Filters for analytics dashboard
 */
export interface AdmissionAnalyticsFilters {
  dateRange?: {
    from: Date;
    to: Date;
  };
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  status?: string;
  state?: string;
  district?: string;
}

/**
 * Complete analytics data structure for dashboard
 */
export interface AdmissionDashboardAnalytics {
  // Overview KPI metrics
  overview: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    waitlisted: number;
    enrolled: number;
    conversionRate: number; // Percentage (approved + enrolled) / total
    avgProcessingDays: number; // Average days from created to approved/rejected
  };

  // Status breakdown with percentages
  statusBreakdown: {
    status: string;
    count: number;
    percentage: number;
  }[];

  // Demographic analytics
  demographics: {
    gender: { label: string; count: number }[];
    religion: { label: string; count: number }[];
    community: { label: string; count: number }[];
    firstGraduate: { label: string; count: number }[];
  };

  // Academic performance metrics
  academicPerformance: {
    tenthMarksDistribution: { range: string; count: number }[];
    twelfthMarksDistribution: { range: string; count: number }[];
    neetScoreDistribution: { range: string; count: number }[];
    averageMarks: {
      tenth: number;
      twelfth: number;
      neet: number | null;
    };
  };

  // Institution and program distribution
  institutionDistribution: {
    institutions: { name: string; count: number; percentage: number }[];
    degrees: { name: string; count: number }[];
    departments: { name: string; count: number }[];
    programs: { name: string; count: number }[];
  };

  // Geographic distribution
  geographic: {
    states: { state: string; count: number }[];
    districts: { district: string; count: number }[];
    topLocations: { location: string; count: number }[];
  };

  // Reference source tracking
  referenceSources: {
    type: string;
    count: number;
    percentage: number;
  }[];

  // Time-based trends
  timeTrends: {
    daily: { date: string; count: number; approved: number; rejected: number }[];
    monthly: { month: string; count: number }[];
    peakPeriods: { period: string; count: number }[];
  };

  // Metadata about the analytics
  metadata: {
    totalRecords: number;
    dateRange: { from: string; to: string };
    lastUpdated: string;
  };
}

/**
 * AI-generated insights response
 */
export interface AdmissionAIInsights {
  summary: string; // Executive summary of key findings
  keyFindings: {
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info' | 'success';
  }[];
  recommendations: {
    category: string; // e.g., 'Outreach', 'Process Efficiency'
    priority: 'high' | 'medium' | 'low';
    insight: string; // What the data shows
    action: string; // Specific actionable recommendation
    expectedImpact: string; // Expected outcome
    implementationSteps: string[]; // Step-by-step guide
  }[];
  predictions: {
    metric: string; // e.g., 'Application Volume'
    prediction: string; // What is likely to happen
    confidence: 'high' | 'medium' | 'low';
    timeline: string; // When this is expected
    reasoning: string; // Why this is predicted
  }[];
  trends: {
    trend: string; // Description of trend
    direction: 'up' | 'down' | 'stable';
    impact: string; // Potential impact
    significance: 'high' | 'medium' | 'low';
  }[];
  riskAssessment: {
    risk: string;
    severity: 'high' | 'medium' | 'low';
    likelihood: 'high' | 'medium' | 'low';
    mitigation: string;
  }[];
  opportunities: {
    opportunity: string;
    potential: 'high' | 'medium' | 'low';
    actionPlan: string;
  }[];
  competitiveInsights: {
    insight: string;
    comparison: string;
    recommendation: string;
  }[];
  generatedAt: string; // ISO timestamp
}
