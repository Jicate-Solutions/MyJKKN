// ============================================
// LEARNER ANALYTICS TYPES
// ============================================
// Created: 2025-01-31
// Purpose: Advanced analytics types for learner module
// Categories: Intake & Capacity, Geography, Trends, School Feeders
// ============================================

// ============================================
// FILTER TYPES
// ============================================

export interface LearnerDashboardFilters {
  institutionId?: string;
  degreeId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  academicYearId?: string;
  lifecycleStatus?: string[];
  gender?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================
// INTAKE & CAPACITY ANALYTICS
// ============================================

export interface IntakeCapacityMetrics {
  programName: string;
  programId: string;
  sanctionedIntake: number;
  actualIntake: number;
  seatUtilization: number; // percentage (0-100)
  unfilledSeats: number;
  unfilledPercentage: number; // percentage (0-100)
  overIntakeFlag: boolean;
  overIntakeCount: number;
  waitlistCount: number;
  waitlistConversion: number; // percentage (0-100)
  stabilityIndex: number; // 3-year average stability (0-100)
}

// ============================================
// GEOGRAPHY ANALYTICS
// ============================================

export interface GeographyMetrics {
  districtContributions: DistrictContribution[];
  talukContributions: TalukContribution[];
  hostelStudentRatio: number; // percentage
  dayScholarRatio: number; // percentage
}

export interface DistrictContribution {
  district: string;
  count: number;
  percentage: number;
}

export interface TalukContribution {
  taluk: string;
  district: string;
  count: number;
  percentage: number;
}

// ============================================
// TREND ANALYTICS
// ============================================

export interface TrendMetrics {
  genderRatio: GenderRatio;
  categoryMix: CategoryMix[];
  communityMix: CommunityMix[];
  firstGenerationPercentage: number;
  incomeDistribution: IncomeDistribution[];
  mediumOfInstructionImpact?: MediumImpact[];
  ruralVsUrbanSuccess?: LocationSuccessRate;
}

export interface GenderRatio {
  male: number;
  female: number;
  other?: number;
  malePercentage: number;
  femalePercentage: number;
}

export interface CategoryMix {
  category: string; // SC/ST/OBC/General
  count: number;
  percentage: number;
}

export interface CommunityMix {
  community: string;
  count: number;
  percentage: number;
}

export interface IncomeDistribution {
  incomeBand: string; // "0-2L", "2-5L", "5-10L", ">10L"
  count: number;
  percentage: number;
}

export interface MediumImpact {
  medium: 'english' | 'tamil' | 'both';
  count: number;
  averagePerformance?: number; // Requires academic data
}

export interface LocationSuccessRate {
  urban: {
    count: number;
    averagePerformance?: number;
  };
  semi_urban: {
    count: number;
    averagePerformance?: number;
  };
  rural: {
    count: number;
    averagePerformance?: number;
  };
}

// ============================================
// SCHOOL FEEDER ANALYTICS
// ============================================

export interface SchoolFeederMetrics {
  schools: SchoolFeederData[];
  totalSchools: number;
  topSchools: SchoolFeederData[]; // Top 10 by count
}

export interface SchoolFeederData {
  schoolName: string;
  schoolType: 'government' | 'aided' | 'private' | 'cbse' | 'icse' | 'state_board';
  schoolDistrict?: string;
  schoolTaluk?: string;
  totalStudentsAdmitted: number;
  contributionPercentage: number;
  programDistribution: ProgramDistribution[];
  conversionStability?: number; // 3-year average (requires historical data)
  academicPerformanceIndex?: number; // average CGPA (requires academic data)
}

export interface ProgramDistribution {
  programName: string;
  count: number;
}

// ============================================
// MAIN ADVANCED ANALYTICS RESPONSE
// ============================================

export interface AdvancedLearnerAnalytics {
  intakeCapacity: IntakeCapacityMetrics[];
  geography: GeographyMetrics;
  trends: TrendMetrics;
  schoolFeeders: SchoolFeederMetrics;
  filters: LearnerDashboardFilters;
  generatedAt: string;
}
