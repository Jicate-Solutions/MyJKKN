import { createClient } from '@/lib/supabase/server';
import type {
  AdvancedLearnerAnalytics,
  IntakeCapacityMetrics,
  GeographyMetrics,
  TrendMetrics,
  SchoolFeederMetrics,
  LearnerDashboardFilters,
  DistrictContribution,
  TalukContribution,
  CategoryMix,
  CommunityMix,
  IncomeDistribution,
  SchoolFeederData,
  ProgramDistribution,
} from '@/types/learner-analytics';

export class LearnerAdvancedAnalyticsService {
  /**
   * Get all advanced analytics
   */
  static async getAdvancedAnalytics(
    filters: LearnerDashboardFilters
  ): Promise<AdvancedLearnerAnalytics> {
    const [intakeCapacity, geography, trends, schoolFeeders] = await Promise.all([
      this.getIntakeCapacityMetrics(filters),
      this.getGeographyMetrics(filters),
      this.getTrendMetrics(filters),
      this.getSchoolFeederMetrics(filters),
    ]);

    return {
      intakeCapacity,
      geography,
      trends,
      schoolFeeders,
      filters,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Intake & Capacity Analytics
   * Calculates seat utilization, over-intake, waitlist conversion, and 3-year stability
   */
  static async getIntakeCapacityMetrics(
    filters: LearnerDashboardFilters
  ): Promise<IntakeCapacityMetrics[]> {
    const supabase = createClient();

    // Get programs with sanctioned intake
    let programsQuery = supabase
      .from('programs')
      .select('id, program_name, sanctioned_intake, academic_year_id')
      .eq('is_active', true);

    if (filters.institutionId) {
      programsQuery = programsQuery.eq('institution_id', filters.institutionId);
    }
    if (filters.programId) {
      programsQuery = programsQuery.eq('id', filters.programId);
    }

    const { data: programs, error: programsError } = await programsQuery;

    if (programsError || !programs) {
      console.error('[learner-analytics] getIntakeCapacityMetrics error:', programsError);
      return [];
    }

    const metrics: IntakeCapacityMetrics[] = [];

    for (const program of programs) {
      // Count actual intake (active + graduated students)
      let learnersQuery = supabase
        .from('learners_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', program.id)
        .in('lifecycle_status', ['active', 'graduated', 'alumni']);

      if (filters.academicYearId) {
        learnersQuery = learnersQuery.eq('academic_year_id', filters.academicYearId);
      }

      const { count: actualIntake } = await learnersQuery;

      // Count waitlist
      let waitlistQuery = supabase
        .from('learners_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', program.id)
        .eq('lifecycle_status', 'waitlisted');

      if (filters.academicYearId) {
        waitlistQuery = waitlistQuery.eq('academic_year_id', filters.academicYearId);
      }

      const { count: waitlistCount } = await waitlistQuery;

      // Calculate metrics
      const sanctionedIntake = program.sanctioned_intake || 0;
      const actual = actualIntake || 0;
      const waitlist = waitlistCount || 0;

      const seatUtilization = sanctionedIntake > 0
        ? (actual / sanctionedIntake) * 100
        : 0;

      const unfilledSeats = Math.max(0, sanctionedIntake - actual);
      const unfilledPercentage = sanctionedIntake > 0
        ? (unfilledSeats / sanctionedIntake) * 100
        : 0;

      const overIntakeFlag = actual > sanctionedIntake;
      const overIntakeCount = overIntakeFlag ? actual - sanctionedIntake : 0;

      // Waitlist conversion (students moved from waitlist to active)
      const waitlistConversion = waitlist > 0
        ? ((actual - sanctionedIntake) / waitlist) * 100
        : 0;

      // Get 3-year stability index from intake_history
      const stabilityIndex = await this.calculateStabilityIndex(program.id);

      metrics.push({
        programName: program.program_name,
        programId: program.id,
        sanctionedIntake,
        actualIntake: actual,
        seatUtilization: Math.round(seatUtilization * 10) / 10,
        unfilledSeats,
        unfilledPercentage: Math.round(unfilledPercentage * 10) / 10,
        overIntakeFlag,
        overIntakeCount,
        waitlistCount: waitlist,
        waitlistConversion: Math.max(0, Math.round(waitlistConversion * 10) / 10),
        stabilityIndex: Math.round(stabilityIndex * 10) / 10,
      });
    }

    return metrics;
  }

  /**
   * Calculate 3-year stability index for a program
   * Returns average seat utilization over last 3 years
   */
  private static async calculateStabilityIndex(programId: string): Promise<number> {
    const supabase = createClient();

    const { data: history } = await supabase
      .from('intake_history')
      .select('sanctioned_intake, actual_intake')
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (!history || history.length === 0) {
      return 0;
    }

    const utilizationRates = history.map(record => {
      const sanctioned = record.sanctioned_intake || 0;
      const actual = record.actual_intake || 0;
      return sanctioned > 0 ? (actual / sanctioned) * 100 : 0;
    });

    const avgUtilization = utilizationRates.reduce((sum, rate) => sum + rate, 0) / utilizationRates.length;
    return avgUtilization;
  }

  /**
   * Geography Analytics
   * District/Taluk contributions, hostel ratios, transport usage
   */
  static async getGeographyMetrics(
    filters: LearnerDashboardFilters
  ): Promise<GeographyMetrics> {
    const supabase = createClient();

    let query = supabase
      .from('learners_profiles')
      .select('permanent_address_district, permanent_address_taluk, accommodation_type, bus_required');

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.programId) {
      query = query.eq('program_id', filters.programId);
    }
    if (filters.lifecycleStatus && filters.lifecycleStatus.length > 0) {
      query = query.in('lifecycle_status', filters.lifecycleStatus);
    } else {
      query = query.in('lifecycle_status', ['active', 'graduated', 'alumni']);
    }

    const { data: learners, error } = await query;

    if (error || !learners) {
      console.error('[learner-analytics] getGeographyMetrics error:', error);
      return {
        districtContributions: [],
        talukContributions: [],
        hostelStudentRatio: 0,
        dayScholarRatio: 0,
        transportUsage: 0,
      };
    }

    const totalLearners = learners.length;

    // District contributions
    const districtCounts = new Map<string, number>();
    learners.forEach(learner => {
      const district = learner.permanent_address_district || 'Unknown';
      districtCounts.set(district, (districtCounts.get(district) || 0) + 1);
    });

    const districtContributions: DistrictContribution[] = Array.from(districtCounts.entries())
      .map(([district, count]) => ({
        district,
        count,
        percentage: totalLearners > 0 ? (count / totalLearners) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Taluk contributions
    const talukCounts = new Map<string, { count: number; district: string }>();
    learners.forEach(learner => {
      const taluk = learner.permanent_address_taluk || 'Unknown';
      const district = learner.permanent_address_district || 'Unknown';
      const existing = talukCounts.get(taluk);
      if (existing) {
        existing.count++;
      } else {
        talukCounts.set(taluk, { count: 1, district });
      }
    });

    const talukContributions: TalukContribution[] = Array.from(talukCounts.entries())
      .map(([taluk, data]) => ({
        taluk,
        district: data.district,
        count: data.count,
        percentage: totalLearners > 0 ? (data.count / totalLearners) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Hostel vs Day Scholar ratios
    const hostelCount = learners.filter(l => l.accommodation_type?.toLowerCase() === 'hostel').length;
    const dayScholarCount = totalLearners - hostelCount;

    const hostelStudentRatio = totalLearners > 0 ? (hostelCount / totalLearners) * 100 : 0;
    const dayScholarRatio = totalLearners > 0 ? (dayScholarCount / totalLearners) * 100 : 0;

    // Transport usage
    const transportCount = learners.filter(l => l.bus_required === true).length;
    const transportUsage = totalLearners > 0 ? (transportCount / totalLearners) * 100 : 0;

    return {
      districtContributions,
      talukContributions,
      hostelStudentRatio: Math.round(hostelStudentRatio * 10) / 10,
      dayScholarRatio: Math.round(dayScholarRatio * 10) / 10,
      transportUsage: Math.round(transportUsage * 10) / 10,
    };
  }

  /**
   * Trend Analytics
   * Gender ratio, category/community mix, first-generation, income distribution
   */
  static async getTrendMetrics(
    filters: LearnerDashboardFilters
  ): Promise<TrendMetrics> {
    const supabase = createClient();

    let query = supabase
      .from('learners_profiles')
      .select('gender, category, community, first_graduate, annual_income');

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.programId) {
      query = query.eq('program_id', filters.programId);
    }
    if (filters.lifecycleStatus && filters.lifecycleStatus.length > 0) {
      query = query.in('lifecycle_status', filters.lifecycleStatus);
    } else {
      query = query.in('lifecycle_status', ['active', 'graduated', 'alumni']);
    }

    const { data: learners, error } = await query;

    if (error || !learners) {
      console.error('[learner-analytics] getTrendMetrics error:', error);
      return {
        genderRatio: { male: 0, female: 0, malePercentage: 0, femalePercentage: 0 },
        categoryMix: [],
        communityMix: [],
        firstGenerationPercentage: 0,
        incomeDistribution: [],
      };
    }

    const totalLearners = learners.length;

    // Gender Ratio
    const maleCount = learners.filter(l => l.gender?.toLowerCase() === 'male').length;
    const femaleCount = learners.filter(l => l.gender?.toLowerCase() === 'female').length;

    const genderRatio = {
      male: maleCount,
      female: femaleCount,
      malePercentage: totalLearners > 0 ? (maleCount / totalLearners) * 100 : 0,
      femalePercentage: totalLearners > 0 ? (femaleCount / totalLearners) * 100 : 0,
    };

    // Category Mix
    const categoryCounts = new Map<string, number>();
    learners.forEach(learner => {
      const category = learner.category || 'Unknown';
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });

    const categoryMix: CategoryMix[] = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalLearners > 0 ? (count / totalLearners) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Community Mix
    const communityCounts = new Map<string, number>();
    learners.forEach(learner => {
      const community = learner.community || 'Unknown';
      communityCounts.set(community, (communityCounts.get(community) || 0) + 1);
    });

    const communityMix: CommunityMix[] = Array.from(communityCounts.entries())
      .map(([community, count]) => ({
        community,
        count,
        percentage: totalLearners > 0 ? (count / totalLearners) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // First-Generation Learners
    const firstGenCount = learners.filter(l => l.first_graduate === true).length;
    const firstGenerationPercentage = totalLearners > 0 ? (firstGenCount / totalLearners) * 100 : 0;

    // Income Distribution
    const incomeBands = {
      '0-2L': 0,
      '2-5L': 0,
      '5-10L': 0,
      '>10L': 0,
      'Unknown': 0,
    };

    learners.forEach(learner => {
      const income = learner.annual_income;
      if (!income) {
        incomeBands['Unknown']++;
        return;
      }

      // Parse income string (assumes format like "200000", "500000", etc.)
      const incomeNum = parseInt(income.replace(/[^\d]/g, ''));
      if (isNaN(incomeNum)) {
        incomeBands['Unknown']++;
      } else if (incomeNum <= 200000) {
        incomeBands['0-2L']++;
      } else if (incomeNum <= 500000) {
        incomeBands['2-5L']++;
      } else if (incomeNum <= 1000000) {
        incomeBands['5-10L']++;
      } else {
        incomeBands['>10L']++;
      }
    });

    const incomeDistribution: IncomeDistribution[] = Object.entries(incomeBands)
      .map(([incomeBand, count]) => ({
        incomeBand,
        count,
        percentage: totalLearners > 0 ? (count / totalLearners) * 100 : 0,
      }))
      .filter(item => item.count > 0);

    return {
      genderRatio,
      categoryMix,
      communityMix,
      firstGenerationPercentage: Math.round(firstGenerationPercentage * 10) / 10,
      incomeDistribution,
    };
  }

  /**
   * School-Wise Feeder Analytics
   * Tracks which schools send students and program distribution
   */
  static async getSchoolFeederMetrics(
    filters: LearnerDashboardFilters
  ): Promise<SchoolFeederMetrics> {
    const supabase = createClient();

    let query = supabase
      .from('learners_profiles')
      .select(`
        last_school,
        school_type,
        school_district,
        school_taluk,
        program_id,
        programs!inner(program_name)
      `);

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.programId) {
      query = query.eq('program_id', filters.programId);
    }
    if (filters.lifecycleStatus && filters.lifecycleStatus.length > 0) {
      query = query.in('lifecycle_status', filters.lifecycleStatus);
    } else {
      query = query.in('lifecycle_status', ['active', 'graduated', 'alumni']);
    }

    const { data: learners, error } = await query;

    if (error || !learners) {
      console.error('[learner-analytics] getSchoolFeederMetrics error:', error);
      return {
        schools: [],
        totalSchools: 0,
        topSchools: [],
      };
    }

    const totalLearners = learners.length;

    // Group by school
    const schoolMap = new Map<string, {
      schoolType: string;
      schoolDistrict?: string;
      schoolTaluk?: string;
      count: number;
      programs: Map<string, number>;
    }>();

    learners.forEach(learner => {
      const schoolName = learner.last_school || 'Unknown School';

      if (!schoolMap.has(schoolName)) {
        schoolMap.set(schoolName, {
          schoolType: learner.school_type || 'unknown',
          schoolDistrict: learner.school_district,
          schoolTaluk: learner.school_taluk,
          count: 0,
          programs: new Map(),
        });
      }

      const school = schoolMap.get(schoolName)!;
      school.count++;

      // Track program distribution
      const programName = (learner.programs as any)?.program_name || 'Unknown';
      school.programs.set(programName, (school.programs.get(programName) || 0) + 1);
    });

    // Convert to array
    const schools: SchoolFeederData[] = Array.from(schoolMap.entries())
      .map(([schoolName, data]) => ({
        schoolName,
        schoolType: data.schoolType as any,
        schoolDistrict: data.schoolDistrict,
        schoolTaluk: data.schoolTaluk,
        totalStudentsAdmitted: data.count,
        contributionPercentage: totalLearners > 0 ? (data.count / totalLearners) * 100 : 0,
        programDistribution: Array.from(data.programs.entries()).map(([programName, count]) => ({
          programName,
          count,
        })),
      }))
      .sort((a, b) => b.totalStudentsAdmitted - a.totalStudentsAdmitted);

    const topSchools = schools.slice(0, 10);

    return {
      schools,
      totalSchools: schools.length,
      topSchools,
    };
  }
}
