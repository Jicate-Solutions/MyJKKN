# Admissions Analytics Dashboard - Implementation Plan

**Project:** MyJKKN Portal
**Module:** Admissions Management
**Feature:** Advanced Analytics Dashboard with AI-Powered Insights
**Created:** 2025-01-16
**Status:** Ready for Implementation

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Design Decisions](#architecture--design-decisions)
3. [Implementation Phases](#implementation-phases)
   - [Phase 1: Foundation & Setup](#phase-1-foundation--setup)
   - [Phase 2: Type Definitions](#phase-2-type-definitions)
   - [Phase 3: Service Layer](#phase-3-service-layer)
   - [Phase 4: Hooks & Data Fetching](#phase-4-hooks--data-fetching)
   - [Phase 5: API Routes](#phase-5-api-routes)
   - [Phase 6: Dashboard Page](#phase-6-dashboard-page)
   - [Phase 7: Analytics Components](#phase-7-analytics-components)
   - [Phase 8: AI Insights Tab](#phase-8-ai-insights-tab)
   - [Phase 9: Testing & Validation](#phase-9-testing--validation)
   - [Phase 10: Documentation & Deployment](#phase-10-documentation--deployment)
4. [File Structure Overview](#file-structure-overview)
5. [Testing Checklist](#testing-checklist)
6. [Troubleshooting Guide](#troubleshooting-guide)

---

## 📊 Project Overview

### **Feature Description**

An advanced analytics dashboard for the Admissions module that provides:
- **8 Analytics Categories**: Status, Demographics, Academic Performance, Institution Distribution, Geographic, Reference Sources, Time Trends, AI Insights
- **Role-Based Access Control**: Super Admin sees all institutions, regular users see only their institution
- **AI-Powered Insights**: Claude 3.5 Haiku provides actionable recommendations and predictions
- **Interactive Visualizations**: Recharts-based charts with filtering capabilities

### **Key Requirements**

✅ **Analytics Categories:**
1. Status Analytics - Breakdown by application status with conversion metrics
2. Demographics - Gender, religion, community, first graduate analysis
3. Academic Performance - 10th/12th marks, NEET scores distribution
4. Institution & Programs - Applications by institution, degree, department, program
5. Geographic Distribution - State and district-wise analysis
6. Reference Sources - Marketing insights from reference tracking
7. Time Trends - Daily/monthly application patterns
8. AI Insights - Automated recommendations and predictions

✅ **Access Control:**
- Permission: `admissions.dashboard`
- Super Admin: Full access to all institutions
- Regular Users: Filtered to own institution only

✅ **Technology Stack:**
- Frontend: Next.js 14, React, TypeScript, Recharts
- Backend: Supabase PostgreSQL, Next.js API Routes
- AI: Claude 3.5 Haiku via Anthropic SDK
- State Management: React Query (TanStack Query)

---

## 🏗️ Architecture & Design Decisions

### **Architectural Approach**

**Selected:** Server-Side Aggregation with Service Layer (Approach 1)

**Rationale:**
- Consistent with existing Students/Staff dashboard patterns
- Fast client rendering with pre-computed data
- Efficient PostgreSQL aggregations
- Simpler maintenance with centralized analytics logic

### **Data Flow**

```
User → Dashboard Page → useAdmissionAnalytics Hook → AdmissionService.getDashboardAnalytics()
                                                      ↓
                                         Supabase Query (with filters + institution check)
                                                      ↓
                                         Parallel aggregation calculations
                                                      ↓
                                         Return AdmissionDashboardAnalytics
                                                      ↓
User ← Recharts Components ← React Query Cache ← Dashboard Page
```

### **AI Insights Flow**

```
User clicks "Generate Insights" → AI Insights Tab → API Route /api/admissions/ai-insights
                                                            ↓
                                                   AdmissionAIService.generateInsights()
                                                            ↓
                                                   Claude API (Haiku model)
                                                            ↓
                                                   Parse JSON response
                                                            ↓
User ← Display Insights Cards ← React Query Cache ← AdmissionAIInsights
```

---

## 🚀 Implementation Phases

---

## Phase 1: Foundation & Setup

**Priority:** HIGH | **Duration:** 30 minutes

### 1.1 Database Permissions Setup

**File:** Execute in Supabase SQL Editor

```sql
-- Add new permission for analytics dashboard
INSERT INTO permissions (permission_key, permission_name, description, category)
VALUES (
  'admissions.dashboard',
  'View Admissions Dashboard',
  'Access to admissions analytics dashboard with charts and insights',
  'admissions'
)
ON CONFLICT (permission_key) DO NOTHING;

-- Update super_admin role with new permission
UPDATE custom_roles
SET permissions = permissions || '{"admissions.dashboard": true}'::jsonb
WHERE role_key = 'super_admin';

-- Verify permission was added
SELECT * FROM permissions WHERE permission_key = 'admissions.dashboard';

-- Verify super_admin has permission
SELECT role_key, permissions->'admissions.dashboard' as has_dashboard_permission
FROM custom_roles
WHERE role_key = 'super_admin';
```

**Verification:**
- [ ] Permission exists in `permissions` table
- [ ] Super Admin role has `admissions.dashboard: true`
- [ ] No errors in SQL execution

---

### 1.2 Database Indexes for Performance

**File:** Execute in Supabase SQL Editor

```sql
-- Add indexes for performance (if not already exists)
CREATE INDEX IF NOT EXISTS idx_admissions_created_at
  ON admissions(created_at);

CREATE INDEX IF NOT EXISTS idx_admissions_status
  ON admissions(status);

CREATE INDEX IF NOT EXISTS idx_admissions_institution_created
  ON admissions(institution_id, created_at);

CREATE INDEX IF NOT EXISTS idx_admissions_institution_status
  ON admissions(institution_id, status);

-- Verify indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'admissions'
ORDER BY indexname;
```

**Verification:**
- [ ] All indexes created successfully
- [ ] Query planner shows index usage (use EXPLAIN ANALYZE)

---

### 1.3 Environment Variables

**File:** `.env.local`

```bash
# Add Claude API Key
CLAUDE_API_KEY=sk-ant-api03-your-api-key-here
```

**Steps:**
1. Get API key from https://console.anthropic.com/
2. Add to `.env.local` file
3. Restart Next.js dev server: `npm run dev`

**Verification:**
- [ ] Can access `process.env.CLAUDE_API_KEY` in API routes
- [ ] No errors in server console

---

### 1.4 Install Dependencies

**Command:**

```bash
npm install @anthropic-ai/sdk
```

**Verification:**
- [ ] Package added to `package.json`
- [ ] No installation errors
- [ ] Can import `Anthropic` from '@anthropic-ai/sdk'

---

## Phase 2: Type Definitions

**Priority:** HIGH | **Duration:** 20 minutes

### 2.1 Extend Admission Types

**File:** `types/admission.ts`

**Action:** Add to the end of the file (after line 136)

```typescript
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
  recommendations: {
    category: string; // e.g., 'Outreach', 'Process Efficiency'
    priority: 'high' | 'medium' | 'low';
    insight: string; // What the data shows
    action: string; // Specific actionable recommendation
  }[];
  predictions: {
    metric: string; // e.g., 'Application Volume'
    prediction: string; // What is likely to happen
    confidence: string; // High/Medium/Low
  }[];
  trends: {
    trend: string; // Description of trend
    direction: 'up' | 'down' | 'stable';
    impact: string; // Potential impact
  }[];
  generatedAt: string; // ISO timestamp
}
```

**Verification:**
- [ ] No TypeScript errors in `types/admission.ts`
- [ ] Can import types in other files
- [ ] IDE autocomplete works for new types

---

## Phase 3: Service Layer

**Priority:** HIGH | **Duration:** 1.5 hours

### 3.1 Extend Admission Service

**File:** `lib/services/admission/admission-service.ts`

**Action:** Add after `getAdmissionStats()` method (around line 568)

```typescript
/**
 * Get comprehensive dashboard analytics with institution filtering
 */
static async getDashboardAnalytics(
  filters: AdmissionAnalyticsFilters = {}
): Promise<AdmissionDashboardAnalytics> {
  try {
    console.log('[admissions/analytics] Fetching dashboard analytics with filters:', filters);

    // Get current user to enforce institution filtering
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    // Force institution filter for non-super-admin
    const isSuperAdmin = profile?.is_super_admin || profile?.role === 'super_admin';
    const effectiveFilters = { ...filters };
    if (!isSuperAdmin && profile?.institution_id) {
      effectiveFilters.institution_id = profile.institution_id;
      console.log('[admissions/analytics] Non-super-admin user, filtering to institution:', profile.institution_id);
    }

    // Build base query
    let baseQuery = this.supabase.from('admissions').select('*', { count: 'exact' });

    // Apply filters
    if (effectiveFilters.institution_id) {
      baseQuery = baseQuery.eq('institution_id', effectiveFilters.institution_id);
    }
    if (effectiveFilters.degree_id) {
      baseQuery = baseQuery.eq('degree_id', effectiveFilters.degree_id);
    }
    if (effectiveFilters.department_id) {
      baseQuery = baseQuery.eq('department_id', effectiveFilters.department_id);
    }
    if (effectiveFilters.program_id) {
      baseQuery = baseQuery.eq('program_id', effectiveFilters.program_id);
    }
    if (effectiveFilters.status) {
      baseQuery = baseQuery.eq('status', effectiveFilters.status);
    }
    if (effectiveFilters.dateRange?.from) {
      baseQuery = baseQuery.gte('created_at', effectiveFilters.dateRange.from.toISOString());
    }
    if (effectiveFilters.dateRange?.to) {
      const nextDay = new Date(effectiveFilters.dateRange.to);
      nextDay.setDate(nextDay.getDate() + 1);
      baseQuery = baseQuery.lt('created_at', nextDay.toISOString());
    }

    // Execute main query and related data queries in parallel
    const filterMatch = this.buildFilterMatch(effectiveFilters);

    const [
      allData,
      institutionData,
      degreeData,
      departmentData,
      programData
    ] = await Promise.all([
      baseQuery,
      // Get institution distribution with joins
      this.supabase.from('admissions')
        .select('institution_id, institutions!inner(name)')
        .match(filterMatch),
      // Get degree distribution
      this.supabase.from('admissions')
        .select('degree_id, degrees!inner(degree_name)')
        .match(filterMatch),
      // Get department distribution
      this.supabase.from('admissions')
        .select('department_id, departments!inner(department_name)')
        .match(filterMatch),
      // Get program distribution
      this.supabase.from('admissions')
        .select('program_id, programs!inner(program_name)')
        .match(filterMatch)
    ]);

    if (allData.error) throw allData.error;

    const admissions = allData.data || [];
    const total = admissions.length;

    console.log('[admissions/analytics] Processing', total, 'admissions');

    // ===================================================================
    // CALCULATE OVERVIEW STATS
    // ===================================================================
    const statusCounts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlisted: 0,
      enrolled: 0
    };

    let totalProcessingDays = 0;
    let processedCount = 0;

    admissions.forEach((admission) => {
      // Count by status
      const status = admission.status.toLowerCase();
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts]++;
      }

      // Calculate processing time for approved/rejected
      if (status === 'approved' || status === 'rejected') {
        const created = new Date(admission.created_at);
        const updated = new Date(admission.updated_at);
        const days = Math.floor((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        totalProcessingDays += days;
        processedCount++;
      }
    });

    const conversionRate = total > 0
      ? ((statusCounts.approved + statusCounts.enrolled) / total) * 100
      : 0;

    const avgProcessingDays = processedCount > 0
      ? totalProcessingDays / processedCount
      : 0;

    // ===================================================================
    // CALCULATE STATUS BREAKDOWN
    // ===================================================================
    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));

    // ===================================================================
    // CALCULATE DEMOGRAPHICS
    // ===================================================================
    const genderCounts: Record<string, number> = {};
    const religionCounts: Record<string, number> = {};
    const communityCounts: Record<string, number> = {};
    const firstGraduateCounts = { 'First Graduate': 0, 'Regular': 0 };

    admissions.forEach((admission) => {
      genderCounts[admission.gender] = (genderCounts[admission.gender] || 0) + 1;
      religionCounts[admission.religion] = (religionCounts[admission.religion] || 0) + 1;
      communityCounts[admission.community] = (communityCounts[admission.community] || 0) + 1;
      if (admission.first_graduate) {
        firstGraduateCounts['First Graduate']++;
      } else {
        firstGraduateCounts['Regular']++;
      }
    });

    const demographics = {
      gender: Object.entries(genderCounts).map(([label, count]) => ({ label, count })),
      religion: Object.entries(religionCounts).map(([label, count]) => ({ label, count })),
      community: Object.entries(communityCounts).map(([label, count]) => ({ label, count })),
      firstGraduate: Object.entries(firstGraduateCounts).map(([label, count]) => ({ label, count }))
    };

    // ===================================================================
    // CALCULATE ACADEMIC PERFORMANCE
    // ===================================================================
    const tenthMarksRanges = { '0-50': 0, '51-60': 0, '61-70': 0, '71-80': 0, '81-90': 0, '91-100': 0 };
    const twelfthMarksRanges = { '0-50': 0, '51-60': 0, '61-70': 0, '71-80': 0, '81-90': 0, '91-100': 0 };
    const neetScoreRanges = { '0-200': 0, '201-300': 0, '301-400': 0, '401-500': 0, '501-600': 0, '601-720': 0 };

    let totalTenth = 0;
    let totalTwelfth = 0;
    let totalNeet = 0;
    let neetCount = 0;

    admissions.forEach((admission) => {
      // Tenth marks
      const tenthPct = parseFloat(admission.tenth_marks.percentage);
      if (!isNaN(tenthPct)) {
        totalTenth += tenthPct;
        if (tenthPct <= 50) tenthMarksRanges['0-50']++;
        else if (tenthPct <= 60) tenthMarksRanges['51-60']++;
        else if (tenthPct <= 70) tenthMarksRanges['61-70']++;
        else if (tenthPct <= 80) tenthMarksRanges['71-80']++;
        else if (tenthPct <= 90) tenthMarksRanges['81-90']++;
        else tenthMarksRanges['91-100']++;
      }

      // Twelfth marks
      const twelfthPct = parseFloat(admission.twelfth_marks.percentage);
      if (!isNaN(twelfthPct)) {
        totalTwelfth += twelfthPct;
        if (twelfthPct <= 50) twelfthMarksRanges['0-50']++;
        else if (twelfthPct <= 60) twelfthMarksRanges['51-60']++;
        else if (twelfthPct <= 70) twelfthMarksRanges['61-70']++;
        else if (twelfthPct <= 80) twelfthMarksRanges['71-80']++;
        else if (twelfthPct <= 90) twelfthMarksRanges['81-90']++;
        else twelfthMarksRanges['91-100']++;
      }

      // NEET score
      if (admission.neet_score) {
        const neetScore = parseFloat(admission.neet_score);
        if (!isNaN(neetScore)) {
          totalNeet += neetScore;
          neetCount++;
          if (neetScore <= 200) neetScoreRanges['0-200']++;
          else if (neetScore <= 300) neetScoreRanges['201-300']++;
          else if (neetScore <= 400) neetScoreRanges['301-400']++;
          else if (neetScore <= 500) neetScoreRanges['401-500']++;
          else if (neetScore <= 600) neetScoreRanges['501-600']++;
          else neetScoreRanges['601-720']++;
        }
      }
    });

    const academicPerformance = {
      tenthMarksDistribution: Object.entries(tenthMarksRanges).map(([range, count]) => ({ range, count })),
      twelfthMarksDistribution: Object.entries(twelfthMarksRanges).map(([range, count]) => ({ range, count })),
      neetScoreDistribution: Object.entries(neetScoreRanges).map(([range, count]) => ({ range, count })),
      averageMarks: {
        tenth: total > 0 ? Math.round((totalTenth / total) * 100) / 100 : 0,
        twelfth: total > 0 ? Math.round((totalTwelfth / total) * 100) / 100 : 0,
        neet: neetCount > 0 ? Math.round((totalNeet / neetCount) * 100) / 100 : null
      }
    };

    // ===================================================================
    // CALCULATE INSTITUTION DISTRIBUTION
    // ===================================================================
    const institutionCounts: Record<string, number> = {};
    institutionData.data?.forEach((item: any) => {
      const name = item.institutions?.name || 'Unknown';
      institutionCounts[name] = (institutionCounts[name] || 0) + 1;
    });

    const degreeCounts: Record<string, number> = {};
    degreeData.data?.forEach((item: any) => {
      const name = item.degrees?.degree_name || 'Unknown';
      degreeCounts[name] = (degreeCounts[name] || 0) + 1;
    });

    const departmentCounts: Record<string, number> = {};
    departmentData.data?.forEach((item: any) => {
      const name = item.departments?.department_name || 'Unknown';
      departmentCounts[name] = (departmentCounts[name] || 0) + 1;
    });

    const programCounts: Record<string, number> = {};
    programData.data?.forEach((item: any) => {
      const name = item.programs?.program_name || 'Unknown';
      programCounts[name] = (programCounts[name] || 0) + 1;
    });

    const institutionDistribution = {
      institutions: Object.entries(institutionCounts)
        .map(([name, count]) => ({
          name,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count),
      degrees: Object.entries(degreeCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      departments: Object.entries(departmentCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      programs: Object.entries(programCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    };

    // ===================================================================
    // CALCULATE GEOGRAPHIC DISTRIBUTION
    // ===================================================================
    const stateCounts: Record<string, number> = {};
    const districtCounts: Record<string, number> = {};

    admissions.forEach((admission) => {
      const state = admission.permanent_address_state;
      const district = admission.permanent_address_district;

      stateCounts[state] = (stateCounts[state] || 0) + 1;
      districtCounts[district] = (districtCounts[district] || 0) + 1;
    });

    const geographic = {
      states: Object.entries(stateCounts)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20), // Top 20 states
      districts: Object.entries(districtCounts)
        .map(([district, count]) => ({ district, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20), // Top 20 districts
      topLocations: Object.entries(districtCounts)
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) // Top 10
    };

    // ===================================================================
    // CALCULATE REFERENCE SOURCES
    // ===================================================================
    const referenceCounts: Record<string, number> = {};
    admissions.forEach((admission) => {
      const type = admission.reference_type || 'Direct';
      referenceCounts[type] = (referenceCounts[type] || 0) + 1;
    });

    const referenceSources = Object.entries(referenceCounts).map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));

    // ===================================================================
    // CALCULATE TIME TRENDS
    // ===================================================================
    const dailyCounts: Record<string, { count: number; approved: number; rejected: number }> = {};
    const monthlyCounts: Record<string, number> = {};

    admissions.forEach((admission) => {
      const date = new Date(admission.created_at);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM

      if (!dailyCounts[dateKey]) {
        dailyCounts[dateKey] = { count: 0, approved: 0, rejected: 0 };
      }
      dailyCounts[dateKey].count++;
      if (admission.status === 'approved') dailyCounts[dateKey].approved++;
      if (admission.status === 'rejected') dailyCounts[dateKey].rejected++;

      monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
    });

    const timeTrends = {
      daily: Object.entries(dailyCounts)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      monthly: Object.entries(monthlyCounts)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      peakPeriods: Object.entries(monthlyCounts)
        .map(([period, count]) => ({ period, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5) // Top 5 peak periods
    };

    // ===================================================================
    // RETURN COMPLETE ANALYTICS
    // ===================================================================
    return {
      overview: {
        total,
        ...statusCounts,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgProcessingDays: Math.round(avgProcessingDays * 100) / 100
      },
      statusBreakdown,
      demographics,
      academicPerformance,
      institutionDistribution,
      geographic,
      referenceSources,
      timeTrends,
      metadata: {
        totalRecords: total,
        dateRange: {
          from: effectiveFilters.dateRange?.from?.toISOString() || '',
          to: effectiveFilters.dateRange?.to?.toISOString() || ''
        },
        lastUpdated: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[admissions/analytics] Error fetching dashboard analytics:', error);
    throw error;
  }
}

/**
 * Helper to build filter match object for Supabase queries
 */
private static buildFilterMatch(filters: AdmissionAnalyticsFilters): Record<string, any> {
  const match: Record<string, any> = {};
  if (filters.institution_id) match.institution_id = filters.institution_id;
  if (filters.degree_id) match.degree_id = filters.degree_id;
  if (filters.department_id) match.department_id = filters.department_id;
  if (filters.program_id) match.program_id = filters.program_id;
  if (filters.status) match.status = filters.status;
  return match;
}
```

**Verification:**
- [ ] No TypeScript errors
- [ ] Test with console.log in Next.js dev server
- [ ] Test institution filtering (super admin vs regular user)

---

### 3.2 Create AI Service

**File:** `lib/services/admission/admission-ai-service.ts` (NEW FILE)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import {
  AdmissionDashboardAnalytics,
  AdmissionAnalyticsFilters,
  AdmissionAIInsights
} from '@/types/admission';

export class AdmissionAIService {
  private static client = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || ''
  });

  private static MODEL = 'claude-3-5-haiku-20241022';

  /**
   * Generate AI insights from analytics data
   */
  static async generateInsights(
    analyticsData: AdmissionDashboardAnalytics,
    filters: AdmissionAnalyticsFilters
  ): Promise<AdmissionAIInsights> {
    try {
      if (!process.env.CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY not configured');
      }

      console.log('[admissions/ai] Generating insights for analytics data');

      // Prepare analytics summary for Claude
      const analyticsSummary = this.prepareAnalyticsSummary(analyticsData, filters);

      // Build prompt
      const prompt = this.buildPrompt(analyticsSummary);

      // Call Claude API
      const message = await this.client.messages.create({
        model: this.MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      console.log('[admissions/ai] Received response from Claude API');

      // Parse response
      const responseText =
        message.content[0].type === 'text' ? message.content[0].text : '';

      // Extract JSON from response (Claude might wrap it in markdown code blocks)
      const jsonMatch =
        responseText.match(/```json\n([\s\S]*?)\n```/) ||
        responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.error('[admissions/ai] Failed to parse response:', responseText);
        throw new Error('Failed to parse AI response');
      }

      const insights = JSON.parse(jsonMatch[1] || jsonMatch[0]);

      return {
        ...insights,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[admissions/ai] Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Prepare analytics summary for AI prompt
   */
  private static prepareAnalyticsSummary(
    data: AdmissionDashboardAnalytics,
    filters: AdmissionAnalyticsFilters
  ): string {
    const { overview, demographics, geographic, referenceSources, institutionDistribution } =
      data;

    const topStates = geographic.states
      .slice(0, 5)
      .map((s) => `${s.state} (${s.count})`)
      .join(', ');

    const topInstitutions = institutionDistribution.institutions
      .slice(0, 3)
      .map((i) => `${i.name} (${i.count})`)
      .join(', ');

    const topReferences = referenceSources
      .slice(0, 3)
      .map((r) => `${r.type} (${r.percentage.toFixed(1)}%)`)
      .join(', ');

    const genderBreakdown = demographics.gender
      .map((g) => `${g.label}: ${g.count}`)
      .join(', ');

    return `
ANALYTICS SUMMARY:
- Total Applications: ${overview.total}
- Status Distribution:
  * Pending: ${overview.pending}
  * Approved: ${overview.approved}
  * Rejected: ${overview.rejected}
  * Waitlisted: ${overview.waitlisted}
  * Enrolled: ${overview.enrolled}
- Conversion Rate: ${overview.conversionRate}%
- Average Processing Time: ${overview.avgProcessingDays} days
- Gender Distribution: ${genderBreakdown}
- Top States: ${topStates || 'N/A'}
- Top Institutions: ${topInstitutions || 'N/A'}
- Reference Sources: ${topReferences || 'N/A'}
- Date Range: ${
      filters.dateRange
        ? `${filters.dateRange.from.toLocaleDateString()} to ${filters.dateRange.to.toLocaleDateString()}`
        : 'All time'
    }
    `.trim();
  }

  /**
   * Build AI prompt for insights generation
   */
  private static buildPrompt(analyticsSummary: string): string {
    return `You are an admissions analytics expert analyzing admission data for an educational institution.

${analyticsSummary}

TASK:
Analyze this data and provide actionable insights in JSON format with the following structure:

{
  "summary": "2-3 sentence executive summary of key findings",
  "recommendations": [
    {
      "category": "Category name (e.g., 'Outreach', 'Process Efficiency', 'Geographic Expansion')",
      "priority": "high|medium|low",
      "insight": "What the data shows",
      "action": "Specific actionable recommendation"
    }
    // Provide 5-7 recommendations
  ],
  "predictions": [
    {
      "metric": "Metric name (e.g., 'Application Volume', 'Conversion Rate')",
      "prediction": "What is likely to happen",
      "confidence": "High|Medium|Low"
    }
    // Provide 3-5 predictions
  ],
  "trends": [
    {
      "trend": "Description of trend",
      "direction": "up|down|stable",
      "impact": "Potential impact on admissions"
    }
    // Provide 3-5 trends
  ]
}

Focus on:
1. Conversion rate optimization
2. Geographic expansion opportunities
3. Process efficiency improvements
4. Reference source effectiveness
5. Demographic insights for targeted outreach

Respond ONLY with valid JSON. Do not include any explanatory text outside the JSON structure.`;
  }
}
```

**Verification:**
- [ ] No TypeScript errors
- [ ] Can import in API routes
- [ ] Test prompt generation with sample data

---

## Phase 4: Hooks & Data Fetching

**Priority:** HIGH | **Duration:** 15 minutes

### 4.1 Create Analytics Hook

**File:** `hooks/admission/use-admission-analytics.ts` (NEW FILE)

```typescript
import { useQuery } from '@tanstack/react-query';
import {
  AdmissionDashboardAnalytics,
  AdmissionAnalyticsFilters
} from '@/types/admission';
import { AdmissionService } from '@/lib/services/admission/admission-service';

export const admissionAnalyticsKeys = {
  all: ['admissions', 'analytics'] as const,
  dashboard: (filters: AdmissionAnalyticsFilters) =>
    [...admissionAnalyticsKeys.all, 'dashboard', filters] as const
};

/**
 * Hook to fetch admission dashboard analytics
 */
export const useAdmissionAnalytics = (
  filters: AdmissionAnalyticsFilters = {}
) => {
  return useQuery({
    queryKey: admissionAnalyticsKeys.dashboard(filters),
    queryFn: () => AdmissionService.getDashboardAnalytics(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });
};
```

**Verification:**
- [ ] No TypeScript errors
- [ ] Can import in components
- [ ] React Query devtools shows queries

---

## Phase 5: API Routes

**Priority:** MEDIUM | **Duration:** 30 minutes

### 5.1 Create AI Insights API Route

**File:** `app/api/admissions/ai-insights/route.ts` (NEW FILE)

**Create directory structure first:**
```bash
mkdir -p app/api/admissions/ai-insights
```

**Code:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { AdmissionAIService } from '@/lib/services/admission/admission-ai-service';
import { AdmissionDashboardAnalytics, AdmissionAnalyticsFilters } from '@/types/admission';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// In-memory cache for AI insights (5 minutes TTL)
const insightsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerComponentClient({ cookies });
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', session.user.id)
      .single();

    // Get user's role
    const { data: role } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', profile?.role)
      .single();

    const canAccess =
      profile?.is_super_admin ||
      profile?.role === 'super_admin' ||
      role?.permissions?.['admissions.dashboard'];

    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { analyticsData, filters } = body as {
      analyticsData: AdmissionDashboardAnalytics;
      filters: AdmissionAnalyticsFilters;
    };

    if (!analyticsData) {
      return NextResponse.json(
        { error: 'Analytics data is required' },
        { status: 400 }
      );
    }

    // Generate cache key
    const cacheKey = JSON.stringify({ filters, totalRecords: analyticsData.metadata.totalRecords });

    // Check cache
    const cached = insightsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[api/ai-insights] Returning cached insights');
      return NextResponse.json(cached.data);
    }

    // Generate insights
    console.log('[api/ai-insights] Generating new insights');
    const insights = await AdmissionAIService.generateInsights(
      analyticsData,
      filters
    );

    // Cache the result
    insightsCache.set(cacheKey, { data: insights, timestamp: Date.now() });

    // Clean up old cache entries (simple cleanup)
    if (insightsCache.size > 100) {
      const oldestKey = insightsCache.keys().next().value;
      insightsCache.delete(oldestKey);
    }

    return NextResponse.json(insights);
  } catch (error: any) {
    console.error('[api/ai-insights] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate insights',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
```

**Verification:**
- [ ] Can call API from frontend
- [ ] Authentication works
- [ ] Permission check works
- [ ] Caching works (check console logs)
- [ ] Error handling works

---

## Phase 6: Dashboard Page

**Priority:** HIGH | **Duration:** 45 minutes

### 6.1 Create Dashboard Page

**File:** `app/(routes)/admissions/analytics/page.tsx` (NEW FILE)

**Create directory first:**
```bash
mkdir -p "app/(routes)/admissions/analytics"
```

**Code:**

```typescript
'use client';

import { useState } from 'react';
import { subDays } from 'date-fns';
import { usePermissions } from '@/hooks/use-permissions';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BeatLoader } from 'react-spinners';
import { RefreshCw, Download, TrendingUp } from 'lucide-react';
import { AdmissionAnalyticsFilters } from '@/types/admission';
import { useAdmissionAnalytics } from '@/hooks/admission/use-admission-analytics';
import Link from 'next/link';

// Import dashboard components (will create these next)
import { AnalyticsFilters } from './_components/analytics-filters';
import { OverviewStats } from './_components/overview-stats';
import { StatusAnalytics } from './_components/status-analytics';
import { DemographicAnalytics } from './_components/demographic-analytics';
import { AcademicAnalytics } from './_components/academic-analytics';
import { InstitutionAnalytics } from './_components/institution-analytics';
import { GeographicAnalytics } from './_components/geographic-analytics';
import { ReferenceAnalytics } from './_components/reference-analytics';
import { TimeTrends } from './_components/time-trends';
import { AIInsights } from './_components/ai-insights';

export default function AdmissionsAnalyticsPage() {
  const [filters, setFilters] = useState<AdmissionAnalyticsFilters>({
    dateRange: {
      from: subDays(new Date(), 30),
      to: new Date()
    }
  });

  // Check permissions
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  const canViewDashboard = isSuperAdmin || canAccess('admissions', 'dashboard');

  // Fetch analytics data
  const {
    data: analyticsData,
    isLoading: dataLoading,
    error,
    refetch
  } = useAdmissionAnalytics(filters);

  const handleFilterChange = (newFilters: AdmissionAnalyticsFilters) => {
    setFilters(newFilters);
  };

  const handleRefresh = () => {
    refetch();
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title="Admissions Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  // Check if user has permission
  if (!canViewDashboard) {
    return (
      <ContentLayout title="Admissions Analytics">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view the admissions analytics dashboard
          </p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/admissions">Go to Admissions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Admissions Analytics">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admissions', href: '/admissions' },
            { label: 'Analytics Dashboard' }
          ]}
        />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Admissions Analytics Dashboard
            </h1>
            <p className="text-muted-foreground">
              Comprehensive insights and trends for admission applications
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" disabled>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <AnalyticsFilters
          filters={filters}
          onFilterChange={handleFilterChange}
        />

        {/* Overview Stats */}
        {dataLoading ? (
          <div className="flex items-center justify-center py-8">
            <BeatLoader color="#00e902" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-destructive">
                Error loading analytics: {error.message}
              </p>
            </CardContent>
          </Card>
        ) : analyticsData ? (
          <>
            <OverviewStats data={analyticsData.overview} />

            {/* Analytics Tabs */}
            <Tabs defaultValue="status" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                <TabsTrigger value="status">Status</TabsTrigger>
                <TabsTrigger value="demographics">Demographics</TabsTrigger>
                <TabsTrigger value="academic">Academic</TabsTrigger>
                <TabsTrigger value="institution">Institution</TabsTrigger>
                <TabsTrigger value="geographic">Geographic</TabsTrigger>
                <TabsTrigger value="references">References</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="ai">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  AI Insights
                </TabsTrigger>
              </TabsList>

              <TabsContent value="status">
                <StatusAnalytics data={analyticsData} />
              </TabsContent>

              <TabsContent value="demographics">
                <DemographicAnalytics data={analyticsData} />
              </TabsContent>

              <TabsContent value="academic">
                <AcademicAnalytics data={analyticsData} />
              </TabsContent>

              <TabsContent value="institution">
                <InstitutionAnalytics data={analyticsData} />
              </TabsContent>

              <TabsContent value="geographic">
                <GeographicAnalytics data={analyticsData} />
              </TabsContent>

              <TabsContent value="references">
                <ReferenceAnalytics data={analyticsData} />
              </TabsContent>

              <TabsContent value="trends">
                <TimeTrends data={analyticsData} />
              </TabsContent>

              <TabsContent value="ai">
                <AIInsights
                  analyticsData={analyticsData}
                  filters={filters}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No data available
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
```

**Verification:**
- [ ] Page loads without errors
- [ ] Permission check works
- [ ] Filters component renders
- [ ] Tabs switch correctly
- [ ] Loading states display properly

---

## Phase 7: Analytics Components

**Priority:** HIGH | **Duration:** 3-4 hours

**Note:** All components go in `app/(routes)/admissions/analytics/_components/`

---

### 7.1 Analytics Filters Component

**File:** `_components/analytics-filters.tsx` (NEW)

```typescript
'use client';

import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarIcon, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { AdmissionAnalyticsFilters } from '@/types/admission';
import { cn } from '@/lib/utils';

interface AnalyticsFiltersProps {
  filters: AdmissionAnalyticsFilters;
  onFilterChange: (filters: AdmissionAnalyticsFilters) => void;
}

export function AnalyticsFilters({ filters, onFilterChange }: AnalyticsFiltersProps) {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>(
    filters.dateRange
  );

  const handleDateRangeChange = (range: { from: Date; to: Date } | undefined) => {
    setDateRange(range);
    onFilterChange({ ...filters, dateRange: range });
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start text-left font-normal',
                  !dateRange && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'LLL dd, y')} -{' '}
                      {format(dateRange.to, 'LLL dd, y')}
                    </>
                  ) : (
                    format(dateRange.from, 'LLL dd, y')
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={{ from: dateRange?.from, to: dateRange?.to }}
                onSelect={(range: any) => handleDateRangeChange(range)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Add more filters here as needed */}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### 7.2 Overview Stats Component

**File:** `_components/overview-stats.tsx` (NEW)

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, UserX, Clock, TrendingUp, FileText } from 'lucide-react';
import { AdmissionDashboardAnalytics } from '@/types/admission';

interface OverviewStatsProps {
  data: AdmissionDashboardAnalytics['overview'];
}

export function OverviewStats({ data }: OverviewStatsProps) {
  const stats = [
    {
      title: 'Total Applications',
      value: data.total,
      icon: FileText,
      color: 'text-blue-600'
    },
    {
      title: 'Pending',
      value: data.pending,
      icon: Clock,
      color: 'text-yellow-600'
    },
    {
      title: 'Approved',
      value: data.approved,
      icon: UserCheck,
      color: 'text-green-600'
    },
    {
      title: 'Rejected',
      value: data.rejected,
      icon: UserX,
      color: 'text-red-600'
    },
    {
      title: 'Conversion Rate',
      value: `${data.conversionRate}%`,
      icon: TrendingUp,
      color: 'text-purple-600'
    },
    {
      title: 'Avg Processing Days',
      value: data.avgProcessingDays.toFixed(1),
      icon: Clock,
      color: 'text-orange-600'
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className={cn('h-4 w-4', stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}
```

---

### 7.3 Status Analytics Component

**File:** `_components/status-analytics.tsx` (NEW)

```typescript
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

interface StatusAnalyticsProps {
  data: AdmissionDashboardAnalytics;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#facc15',
  approved: '#22c55e',
  rejected: '#ef4444',
  waitlisted: '#f97316',
  enrolled: '#3b82f6'
};

export function StatusAnalytics({ data }: StatusAnalyticsProps) {
  const pieData = data.statusBreakdown.map((item) => ({
    name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    value: item.count,
    percentage: item.percentage.toFixed(1)
  }));

  const barData = data.statusBreakdown.map((item) => ({
    status: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    count: item.count
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
          <CardDescription>Breakdown of application statuses</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name}: ${percentage}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.name.toLowerCase()] || '#94a3b8'}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Status Counts</CardTitle>
          <CardDescription>Number of applications by status</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### 7.4-7.7 Additional Analytics Components

**Create these files similarly:**

- `_components/demographic-analytics.tsx` - Gender, religion, community charts
- `_components/academic-analytics.tsx` - Marks distribution histograms
- `_components/institution-analytics.tsx` - Institution/program distribution
- `_components/geographic-analytics.tsx` - State/district bar charts
- `_components/reference-analytics.tsx` - Reference sources pie chart
- `_components/time-trends.tsx` - Daily/monthly line charts

**Template for each:**

```typescript
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface [Component]AnalyticsProps {
  data: AdmissionDashboardAnalytics;
}

export function [Component]Analytics({ data }: [Component]AnalyticsProps) {
  // Prepare chart data from data.[category]

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>[Chart Title]</CardTitle>
          <CardDescription>[Description]</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            {/* Add appropriate chart */}
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Verification for each:**
- [ ] Component renders without errors
- [ ] Chart displays correct data
- [ ] Responsive layout works
- [ ] Tooltips show correct information

---

## Phase 8: AI Insights Tab

**Priority:** MEDIUM | **Duration:** 1 hour

### 8.1 AI Insights Component

**File:** `_components/ai-insights.tsx` (NEW)

```typescript
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import {
  AdmissionDashboardAnalytics,
  AdmissionAnalyticsFilters,
  AdmissionAIInsights
} from '@/types/admission';

interface AIInsightsProps {
  analyticsData: AdmissionDashboardAnalytics;
  filters: AdmissionAnalyticsFilters;
}

export function AIInsights({ analyticsData, filters }: AIInsightsProps) {
  const [insights, setInsights] = useState<AdmissionAIInsights | null>(null);

  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admissions/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyticsData, filters })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate insights');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setInsights(data);
    }
  });

  const handleGenerateInsights = () => {
    generateInsightsMutation.mutate();
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
    }
  };

  const getDirectionIcon = (direction: 'up' | 'down' | 'stable') => {
    switch (direction) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Generate Button */}
      {!insights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI-Powered Insights
            </CardTitle>
            <CardDescription>
              Generate actionable recommendations and predictions based on your admission data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleGenerateInsights}
              disabled={generateInsightsMutation.isPending}
              className="w-full"
            >
              {generateInsightsMutation.isPending ? (
                <>
                  <BeatLoader size={8} color="#ffffff" className="mr-2" />
                  Generating Insights...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate AI Insights
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {generateInsightsMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {generateInsightsMutation.error?.message || 'Failed to generate insights'}
          </AlertDescription>
        </Alert>
      )}

      {/* Insights Display */}
      {insights && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
              <CardDescription>
                Generated at {new Date(insights.generatedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-lg">{insights.summary}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateInsights}
                className="mt-4"
              >
                Regenerate Insights
              </Button>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Actionable Recommendations</CardTitle>
              <CardDescription>Prioritized suggestions for improvement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights.recommendations.map((rec, index) => (
                  <div key={index} className="border-l-4 border-primary pl-4 py-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={getPriorityColor(rec.priority)}>
                        {rec.priority.toUpperCase()}
                      </Badge>
                      <span className="font-semibold">{rec.category}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{rec.insight}</p>
                    <p className="text-sm font-medium">{rec.action}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Predictions */}
          <Card>
            <CardHeader>
              <CardTitle>Predictions</CardTitle>
              <CardDescription>Data-driven forecasts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.predictions.map((pred, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{pred.metric}</span>
                      <Badge variant="outline">{pred.confidence} Confidence</Badge>
                    </div>
                    <p className="text-sm">{pred.prediction}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Key Trends</CardTitle>
              <CardDescription>Identified patterns and their impact</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.trends.map((trend, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    {getDirectionIcon(trend.direction)}
                    <div className="flex-1">
                      <p className="font-semibold mb-1">{trend.trend}</p>
                      <p className="text-sm text-muted-foreground">{trend.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

**Verification:**
- [ ] Generate button works
- [ ] Loading state displays
- [ ] Insights display correctly
- [ ] Regenerate works
- [ ] Error handling works

---

## Phase 9: Testing & Validation

**Priority:** HIGH | **Duration:** 2 hours

### 9.1 Manual Testing Checklist

**Permission Tests:**
- [ ] Super admin can access dashboard
- [ ] Super admin sees all institutions
- [ ] Regular user with `admissions.dashboard` permission can access
- [ ] Regular user sees only their institution data
- [ ] User without permission gets "Forbidden" message

**Filter Tests:**
- [ ] Date range filter works
- [ ] Analytics update when filters change
- [ ] Clear filters resets to default

**Analytics Tests:**
- [ ] All 8 tabs load without errors
- [ ] Charts display correct data
- [ ] Empty state handled gracefully
- [ ] Large datasets (1000+ records) load performantly

**AI Insights Tests:**
- [ ] Generate insights button works
- [ ] Insights display correctly
- [ ] Regenerate creates new insights
- [ ] Error handling for missing API key
- [ ] Caching works (check console logs)

**Performance Tests:**
- [ ] Initial load < 3 seconds
- [ ] Filter changes < 1 second
- [ ] AI insights generation < 10 seconds
- [ ] No memory leaks (check Chrome DevTools)

---

### 9.2 Component Testing

**Test file template:** `_components/__tests__/[component].test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { OverviewStats } from '../overview-stats';

describe('OverviewStats', () => {
  it('renders all stat cards', () => {
    const mockData = {
      total: 100,
      pending: 20,
      approved: 50,
      rejected: 20,
      waitlisted: 5,
      enrolled: 5,
      conversionRate: 55,
      avgProcessingDays: 7.5
    };

    render(<OverviewStats data={mockData} />);

    expect(screen.getByText('Total Applications')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
```

---

## Phase 10: Documentation & Deployment

**Priority:** MEDIUM | **Duration:** 30 minutes

### 10.1 Update Role Permissions

**Manual Steps:**
1. Go to Role Management in admin panel
2. For each custom role that should access analytics:
   - Edit role
   - Enable `admissions.dashboard` permission
   - Save

### 10.2 Documentation

**File:** `docs/modules/admissions/analytics-dashboard.md` (NEW)

```markdown
# Admissions Analytics Dashboard

## Overview
Advanced analytics dashboard for admissions management with AI-powered insights.

## Features
- 8 analytics categories
- Role-based access control
- AI insights using Claude Haiku
- Interactive Recharts visualizations

## Access
**Permission Required:** `admissions.dashboard`
**URL:** `/admissions/analytics`

## Usage
1. Navigate to Admissions > Analytics
2. Apply filters (date range, institution, etc.)
3. Explore analytics tabs
4. Generate AI insights for recommendations

## AI Insights
Powered by Claude 3.5 Haiku API
- Actionable recommendations
- Data-driven predictions
- Trend analysis

## Configuration
Set `CLAUDE_API_KEY` in `.env.local`

## Troubleshooting
See TROUBLESHOOTING section in implementation plan
```

---

## File Structure Overview

```
MyJKKN/
├── app/
│   ├── (routes)/
│   │   └── admissions/
│   │       ├── analytics/
│   │       │   ├── page.tsx                           ✅ NEW
│   │       │   └── _components/
│   │       │       ├── analytics-filters.tsx          ✅ NEW
│   │       │       ├── overview-stats.tsx             ✅ NEW
│   │       │       ├── status-analytics.tsx           ✅ NEW
│   │       │       ├── demographic-analytics.tsx      ✅ NEW
│   │       │       ├── academic-analytics.tsx         ✅ NEW
│   │       │       ├── institution-analytics.tsx      ✅ NEW
│   │       │       ├── geographic-analytics.tsx       ✅ NEW
│   │       │       ├── reference-analytics.tsx        ✅ NEW
│   │       │       ├── time-trends.tsx                ✅ NEW
│   │       │       └── ai-insights.tsx                ✅ NEW
│   │       └── page.tsx                               (existing)
│   └── api/
│       └── admissions/
│           └── ai-insights/
│               └── route.ts                           ✅ NEW
│
├── lib/
│   └── services/
│       └── admission/
│           ├── admission-service.ts                   ✅ MODIFIED
│           └── admission-ai-service.ts                ✅ NEW
│
├── hooks/
│   └── admission/
│       ├── use-admissions.ts                          (existing)
│       └── use-admission-analytics.ts                 ✅ NEW
│
├── types/
│   └── admission.ts                                   ✅ MODIFIED
│
├── .env.local                                         ✅ MODIFIED
├── package.json                                       ✅ MODIFIED
└── ADMISSIONS_ANALYTICS_IMPLEMENTATION_PLAN.md        ✅ THIS FILE
```

---

## Testing Checklist

### Unit Tests
- [ ] AdmissionService.getDashboardAnalytics() with various filters
- [ ] AdmissionAIService.generateInsights() prompt generation
- [ ] Institution filtering logic (super admin vs regular user)
- [ ] Date range filtering
- [ ] Empty dataset handling

### Integration Tests
- [ ] Full analytics flow from page to service
- [ ] AI insights API route
- [ ] Permission checks at all levels
- [ ] Filter changes trigger correct queries

### E2E Tests
- [ ] User journey: Login → Navigate → View Analytics
- [ ] Generate AI insights flow
- [ ] Export functionality (when implemented)

### Performance Tests
- [ ] Analytics load time with 10K admissions
- [ ] Chart rendering performance
- [ ] React Query caching effectiveness
- [ ] AI insights caching

---

## Troubleshooting Guide

### Issue: "Permission Denied" for analytics page

**Solution:**
1. Check user has `admissions.dashboard` permission
2. Verify super_admin role has permission in database
3. Clear browser cache and re-login

### Issue: Charts not rendering

**Solution:**
1. Check browser console for errors
2. Verify data structure matches types
3. Check Recharts version compatibility
4. Ensure ResponsiveContainer has valid height

### Issue: AI insights fail to generate

**Solution:**
1. Verify `CLAUDE_API_KEY` is set in `.env.local`
2. Restart Next.js dev server
3. Check API key is valid at https://console.anthropic.com/
4. Check API route logs for errors
5. Verify internet connection for API calls

### Issue: Analytics data shows zero records

**Solution:**
1. Check filters - may be too restrictive
2. Verify user has admissions in their institution
3. Check date range includes admission dates
4. Verify database queries in service logs

### Issue: Slow dashboard performance

**Solution:**
1. Add database indexes (see Phase 1.2)
2. Reduce date range to smaller window
3. Enable React Query caching
4. Consider pagination for large datasets

### Issue: Institution filtering not working

**Solution:**
1. Verify profile.institution_id is set correctly
2. Check service layer logs for effective filters
3. Ensure RLS policies allow institution filtering
4. Test with super admin (should see all)

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] No console errors in development
- [ ] TypeScript compiles without errors
- [ ] Environment variables documented
- [ ] Database indexes created

### Production Setup
- [ ] Add `CLAUDE_API_KEY` to production environment
- [ ] Run database migrations (permissions, indexes)
- [ ] Test with production data subset
- [ ] Verify super_admin role has permission
- [ ] Configure rate limiting for AI API (if needed)

### Post-Deployment
- [ ] Verify dashboard loads in production
- [ ] Test permission system
- [ ] Generate test AI insights
- [ ] Monitor performance metrics
- [ ] Collect user feedback

---

## Future Enhancements

### Phase 11: Advanced Features (Optional)

1. **Export Functionality**
   - Export analytics as PDF
   - Export charts as images
   - Export data as CSV/Excel

2. **Real-time Updates**
   - WebSocket integration for live data
   - Auto-refresh on new admissions
   - Real-time notification badges

3. **Advanced Filters**
   - Save filter presets
   - Share filter configurations
   - Advanced query builder

4. **Custom Dashboards**
   - User-defined layouts
   - Drag-and-drop widgets
   - Personalized KPIs

5. **Scheduled Reports**
   - Email daily/weekly summaries
   - Automated AI insights
   - Trend alerts

6. **Comparative Analytics**
   - Year-over-year comparison
   - Institution benchmarking
   - Department performance comparison

---

## Conclusion

This implementation plan provides a complete roadmap for building the Admissions Analytics Dashboard. Follow each phase sequentially, verify completion with the checklists, and refer to the troubleshooting guide for common issues.

**Estimated Total Implementation Time:** 12-15 hours

**Key Success Metrics:**
- ✅ All 8 analytics tabs functional
- ✅ AI insights generating successfully
- ✅ Permission system working correctly
- ✅ Dashboard loads in < 3 seconds
- ✅ No critical bugs in production

For questions or issues, refer to the troubleshooting guide or consult the MyJKKN development team.

**Good luck with the implementation! 🚀**
