# MyJKKN TQM Excellence Implementation - Technical Specifications

> **Purpose:** Complete technical specifications for Claude Code to autonomously implement TQM Excellence features in MyJKKN.
>
> **Source:** Young Edupreneurs Meet Goa 2026 - TQM International Session (Audio + 19 Slides)
>
> **Target:** Production-ready implementation following existing MyJKKN patterns

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Existing Patterns to Follow](#2-existing-patterns-to-follow)
3. [New Module: stakeholder-nps](#3-new-module-stakeholder-nps)
4. [New Module: process-excellence](#4-new-module-process-excellence)
5. [New Module: parent-portal](#5-new-module-parent-portal)
6. [New Module: grievance](#6-new-module-grievance)
7. [New Module: maturity-assessment](#7-new-module-maturity-assessment)
8. [Extension: OKR A/B/C/D Matrix](#8-extension-okr-abcd-matrix)
9. [Extension: Billing COPQ](#9-extension-billing-copq)
10. [Database Migrations](#10-database-migrations)
11. [API Contracts](#11-api-contracts)
12. [Testing Requirements](#12-testing-requirements)
13. [Performance Considerations](#13-performance-considerations)
14. [Security Requirements](#14-security-requirements)

---

## 1. Architecture Overview

### Tech Stack (Match Exactly)

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.1.1 |
| Language | TypeScript | 5.x |
| Database | Supabase (PostgreSQL + RLS) | Latest |
| State | React Query + Zustand | 5.72.1 |
| UI | Radix UI (shadcn/ui) | Latest |
| Styling | Tailwind CSS | 3.4.1 |
| Forms | React Hook Form + Zod | Latest |
| Tables | TanStack Table | 8.20.5 |

### 5-Layer Architecture

```
Page Layer       → app/(routes)/[module]/page.tsx
                    ↓
Component Layer  → components/[module]/ + _components/
                    ↓
Hook Layer       → hooks/[module]/ (React Query)
                    ↓
Service Layer    → lib/services/[module]/ (Business Logic)
                    ↓
Database Layer   → Supabase (PostgreSQL + RLS)
```

### File Structure for New Modules

```
app/
├── (routes)/
│   ├── stakeholder-nps/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── surveys/
│   │   │   └── page.tsx
│   │   ├── responses/
│   │   │   └── page.tsx
│   │   ├── analytics/
│   │   │   └── page.tsx
│   │   └── _components/
│   ├── process-excellence/
│   │   ├── page.tsx
│   │   ├── audits/
│   │   ├── metrics/
│   │   └── _components/
│   ├── parent-portal/
│   │   ├── page.tsx
│   │   ├── dashboard/
│   │   ├── learner/
│   │   ├── communication/
│   │   └── _components/
│   ├── grievance/
│   │   ├── page.tsx
│   │   ├── tickets/
│   │   ├── sla/
│   │   └── _components/
│   └── maturity-assessment/
│       ├── page.tsx
│       ├── assessment/
│       ├── progress/
│       └── _components/
├── api/
│   ├── stakeholder-nps/
│   ├── process-excellence/
│   ├── parent-portal/
│   ├── grievance/
│   └── maturity-assessment/

components/
├── stakeholder-nps/
├── process-excellence/
├── parent-portal/
├── grievance/
└── maturity-assessment/

hooks/
├── stakeholder-nps/
├── process-excellence/
├── parent-portal/
├── grievance/
└── maturity-assessment/

lib/services/
├── stakeholder-nps/
├── process-excellence/
├── parent-portal/
├── grievance/
└── maturity-assessment/

types/
├── stakeholder-nps.ts
├── process-excellence.ts
├── parent-portal.ts
├── grievance.ts
└── maturity-assessment.ts
```

---

## 2. Existing Patterns to Follow

### Service Class Pattern

```typescript
// lib/services/[module]/[module]-service.ts
import { createClient } from '@/lib/supabase/client';

export class ModuleService {
  // All methods are static
  static async getAll(institutionId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async getById(id: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async create(data: CreateInput) {
    const supabase = createClient();
    const { data: result, error } = await supabase
      .from('table_name')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  static async update(id: string, data: UpdateInput) {
    const supabase = createClient();
    const { data: result, error } = await supabase
      .from('table_name')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  static async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('table_name')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
```

### React Query Hook Pattern

```typescript
// hooks/[module]/use-[resource].ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ModuleService } from '@/lib/services/[module]/[module]-service';

// Query key factory
export const moduleKeys = {
  all: ['module'] as const,
  lists: () => [...moduleKeys.all, 'list'] as const,
  list: (filters: Filters) => [...moduleKeys.lists(), filters] as const,
  details: () => [...moduleKeys.all, 'detail'] as const,
  detail: (id: string) => [...moduleKeys.details(), id] as const,
};

// List hook
export function useModuleList(institutionId: string) {
  return useQuery({
    queryKey: moduleKeys.list({ institutionId }),
    queryFn: () => ModuleService.getAll(institutionId),
    enabled: !!institutionId,
  });
}

// Detail hook
export function useModuleDetail(id: string) {
  return useQuery({
    queryKey: moduleKeys.detail(id),
    queryFn: () => ModuleService.getById(id),
    enabled: !!id,
  });
}

// Create mutation
export function useCreateModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ModuleService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() });
    },
  });
}

// Update mutation
export function useUpdateModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInput }) =>
      ModuleService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() });
    },
  });
}

// Delete mutation
export function useDeleteModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ModuleService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() });
    },
  });
}
```

### Zod Validation Pattern

```typescript
// lib/validations/[module].ts
import { z } from 'zod';

export const createModuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  institution_id: z.string().uuid(),
  // ... other fields
});

export const updateModuleSchema = createModuleSchema.partial();

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
```

### API Route Pattern

```typescript
// app/api/[module]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createModuleSchema } from '@/lib/validations/[module]';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('institution_id', institutionId);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const validated = createModuleSchema.parse(body);

    const { data, error } = await supabase
      .from('table_name')
      .insert(validated)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create' },
      { status: 500 }
    );
  }
}
```

### Page Component Pattern

```typescript
// app/(routes)/[module]/page.tsx
import { Metadata } from 'next';
import { ModulePageClient } from './_components/module-page-client';

export const metadata: Metadata = {
  title: 'Module Name | MyJKKN',
  description: 'Module description',
};

export default function ModulePage() {
  return <ModulePageClient />;
}
```

```typescript
// app/(routes)/[module]/_components/module-page-client.tsx
'use client';

import { useModuleList } from '@/hooks/[module]/use-module';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';

export function ModulePageClient() {
  const { data, isLoading, error } = useModuleList(institutionId);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Module Name" />
      <DataTable columns={columns} data={data ?? []} />
    </div>
  );
}
```

---

## 3. New Module: stakeholder-nps

### Purpose

Implement Net Promoter Score (NPS) tracking for all 5 stakeholder types with department-level breakdown.

### Stakeholder Types

| Stakeholder | Survey Trigger | Frequency |
|-------------|----------------|-----------|
| Parents | After each semester | Semester-end |
| Learners | After each semester | Semester-end |
| Alumni | Annual campaign | Annual |
| Industry Partners | After placement cycle | Post-placement |
| Staff | Annual review | Annual |

### Database Schema

```sql
-- Table: nps_surveys
CREATE TABLE nps_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  stakeholder_type VARCHAR(50) NOT NULL CHECK (stakeholder_type IN ('parent', 'learner', 'alumni', 'industry', 'staff')),
  department_id UUID REFERENCES departments(id),
  program_id UUID REFERENCES programs(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  questions JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: nps_responses
CREATE TABLE nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES nps_surveys(id) ON DELETE CASCADE,
  respondent_id UUID, -- Can be null for anonymous
  respondent_type VARCHAR(50) NOT NULL,
  respondent_email VARCHAR(255),
  nps_score INTEGER NOT NULL CHECK (nps_score >= 0 AND nps_score <= 10),
  nps_category VARCHAR(20) GENERATED ALWAYS AS (
    CASE
      WHEN nps_score >= 9 THEN 'promoter'
      WHEN nps_score >= 7 THEN 'passive'
      ELSE 'detractor'
    END
  ) STORED,
  additional_feedback TEXT,
  question_responses JSONB DEFAULT '{}',
  department_id UUID REFERENCES departments(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Table: nps_analytics (materialized for performance)
CREATE TABLE nps_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  survey_id UUID REFERENCES nps_surveys(id),
  stakeholder_type VARCHAR(50) NOT NULL,
  department_id UUID REFERENCES departments(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_responses INTEGER DEFAULT 0,
  promoters INTEGER DEFAULT 0,
  passives INTEGER DEFAULT 0,
  detractors INTEGER DEFAULT 0,
  nps_score DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_responses > 0
      THEN ((promoters::DECIMAL - detractors::DECIMAL) / total_responses::DECIMAL) * 100
      ELSE 0
    END
  ) STORED,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_nps_surveys_institution ON nps_surveys(institution_id);
CREATE INDEX idx_nps_surveys_stakeholder ON nps_surveys(stakeholder_type);
CREATE INDEX idx_nps_responses_survey ON nps_responses(survey_id);
CREATE INDEX idx_nps_responses_category ON nps_responses(nps_category);
CREATE INDEX idx_nps_analytics_lookup ON nps_analytics(institution_id, stakeholder_type, period_start);

-- RLS Policies
ALTER TABLE nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view surveys for their institution"
  ON nps_surveys FOR SELECT
  USING (institution_id IN (
    SELECT institution_id FROM users_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create surveys for their institution"
  ON nps_surveys FOR INSERT
  WITH CHECK (institution_id IN (
    SELECT institution_id FROM users_profiles WHERE id = auth.uid()
  ));
```

### TypeScript Types

```typescript
// types/stakeholder-nps.ts
export type StakeholderType = 'parent' | 'learner' | 'alumni' | 'industry' | 'staff';
export type NPSCategory = 'promoter' | 'passive' | 'detractor';
export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived';

export interface NPSSurvey {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  stakeholder_type: StakeholderType;
  department_id: string | null;
  program_id: string | null;
  start_date: string;
  end_date: string;
  status: SurveyStatus;
  questions: NPSQuestion[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NPSQuestion {
  id: string;
  type: 'nps' | 'text' | 'rating' | 'multiple_choice';
  question: string;
  required: boolean;
  options?: string[];
}

export interface NPSResponse {
  id: string;
  survey_id: string;
  respondent_id: string | null;
  respondent_type: StakeholderType;
  respondent_email: string | null;
  nps_score: number;
  nps_category: NPSCategory;
  additional_feedback: string | null;
  question_responses: Record<string, any>;
  department_id: string | null;
  submitted_at: string;
}

export interface NPSAnalytics {
  id: string;
  institution_id: string;
  survey_id: string | null;
  stakeholder_type: StakeholderType;
  department_id: string | null;
  period_start: string;
  period_end: string;
  total_responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps_score: number;
  calculated_at: string;
}

export interface NPSDashboardData {
  overall_nps: number;
  by_stakeholder: Record<StakeholderType, number>;
  by_department: Record<string, number>;
  trend: { period: string; score: number }[];
  response_rate: number;
}
```

### Service Implementation

```typescript
// lib/services/stakeholder-nps/nps-service.ts
import { createClient } from '@/lib/supabase/client';
import type { NPSSurvey, NPSResponse, NPSAnalytics, StakeholderType } from '@/types/stakeholder-nps';

export class NPSService {
  // Survey CRUD
  static async getSurveys(institutionId: string, filters?: {
    stakeholder_type?: StakeholderType;
    status?: string;
  }) {
    const supabase = createClient();
    let query = supabase
      .from('nps_surveys')
      .select('*, department:departments(name), program:programs(name)')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (filters?.stakeholder_type) {
      query = query.eq('stakeholder_type', filters.stakeholder_type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  static async createSurvey(survey: Omit<NPSSurvey, 'id' | 'created_at' | 'updated_at'>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('nps_surveys')
      .insert(survey)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async updateSurvey(id: string, updates: Partial<NPSSurvey>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('nps_surveys')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async activateSurvey(id: string) {
    return this.updateSurvey(id, { status: 'active' });
  }

  static async closeSurvey(id: string) {
    return this.updateSurvey(id, { status: 'closed' });
  }

  // Response handling
  static async submitResponse(response: Omit<NPSResponse, 'id' | 'nps_category' | 'submitted_at'>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('nps_responses')
      .insert(response)
      .select()
      .single();
    if (error) throw error;

    // Trigger analytics recalculation
    await this.recalculateAnalytics(response.survey_id);

    return data;
  }

  static async getResponses(surveyId: string, pagination?: {
    page: number;
    pageSize: number;
  }) {
    const supabase = createClient();
    let query = supabase
      .from('nps_responses')
      .select('*, department:departments(name)', { count: 'exact' })
      .eq('survey_id', surveyId)
      .order('submitted_at', { ascending: false });

    if (pagination) {
      const { page, pageSize } = pagination;
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, total: count };
  }

  // Analytics
  static async getAnalytics(institutionId: string, filters?: {
    stakeholder_type?: StakeholderType;
    department_id?: string;
    period_start?: string;
    period_end?: string;
  }) {
    const supabase = createClient();
    let query = supabase
      .from('nps_analytics')
      .select('*')
      .eq('institution_id', institutionId)
      .order('period_start', { ascending: false });

    if (filters?.stakeholder_type) {
      query = query.eq('stakeholder_type', filters.stakeholder_type);
    }
    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters?.period_start) {
      query = query.gte('period_start', filters.period_start);
    }
    if (filters?.period_end) {
      query = query.lte('period_end', filters.period_end);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  static async getDashboardData(institutionId: string): Promise<NPSDashboardData> {
    const supabase = createClient();

    // Get latest analytics for each stakeholder type
    const { data: analytics } = await supabase
      .from('nps_analytics')
      .select('*')
      .eq('institution_id', institutionId)
      .order('calculated_at', { ascending: false });

    // Calculate aggregates
    const byStakeholder: Record<StakeholderType, number> = {
      parent: 0, learner: 0, alumni: 0, industry: 0, staff: 0
    };
    const byDepartment: Record<string, number> = {};

    let totalScore = 0;
    let count = 0;

    analytics?.forEach(a => {
      if (a.stakeholder_type && !byStakeholder[a.stakeholder_type as StakeholderType]) {
        byStakeholder[a.stakeholder_type as StakeholderType] = a.nps_score;
        totalScore += a.nps_score;
        count++;
      }
      if (a.department_id) {
        byDepartment[a.department_id] = a.nps_score;
      }
    });

    return {
      overall_nps: count > 0 ? totalScore / count : 0,
      by_stakeholder: byStakeholder,
      by_department: byDepartment,
      trend: analytics?.slice(0, 12).map(a => ({
        period: a.period_start,
        score: a.nps_score
      })) ?? [],
      response_rate: 0 // Calculate from survey completions
    };
  }

  static async recalculateAnalytics(surveyId: string) {
    const supabase = createClient();

    // Get survey details
    const { data: survey } = await supabase
      .from('nps_surveys')
      .select('*')
      .eq('id', surveyId)
      .single();

    if (!survey) return;

    // Get response aggregates
    const { data: responses } = await supabase
      .from('nps_responses')
      .select('nps_category')
      .eq('survey_id', surveyId);

    const totals = {
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: responses?.length ?? 0
    };

    responses?.forEach(r => {
      if (r.nps_category === 'promoter') totals.promoters++;
      else if (r.nps_category === 'passive') totals.passives++;
      else totals.detractors++;
    });

    // Upsert analytics record
    await supabase
      .from('nps_analytics')
      .upsert({
        institution_id: survey.institution_id,
        survey_id: surveyId,
        stakeholder_type: survey.stakeholder_type,
        department_id: survey.department_id,
        period_start: survey.start_date,
        period_end: survey.end_date,
        total_responses: totals.total,
        promoters: totals.promoters,
        passives: totals.passives,
        detractors: totals.detractors,
        calculated_at: new Date().toISOString()
      }, {
        onConflict: 'survey_id'
      });
  }
}
```

### UI Components Required

1. **Survey Builder** - Create/edit NPS surveys with custom questions
2. **Survey List** - View all surveys with status filters
3. **Response Collection Widget** - In-app modal for collecting NPS
4. **NPS Dashboard** - Overall NPS, by stakeholder, by department
5. **Trend Charts** - NPS over time with Recharts
6. **Response Detail View** - Individual response with feedback

### In-App Survey Modal

```typescript
// components/stakeholder-nps/nps-survey-modal.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSubmitNPSResponse } from '@/hooks/stakeholder-nps/use-nps';

interface NPSSurveyModalProps {
  survey: NPSSurvey;
  respondentType: StakeholderType;
  respondentId?: string;
  onComplete: () => void;
}

export function NPSSurveyModal({ survey, respondentType, respondentId, onComplete }: NPSSurveyModalProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const { mutate: submit, isPending } = useSubmitNPSResponse();

  const handleSubmit = () => {
    if (score === null) return;

    submit({
      survey_id: survey.id,
      respondent_id: respondentId,
      respondent_type: respondentType,
      nps_score: score,
      additional_feedback: feedback || null,
      question_responses: {}
    }, {
      onSuccess: onComplete
    });
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{survey.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{survey.description}</p>

          <div>
            <p className="font-medium mb-3">
              How likely are you to recommend JKKN to others?
            </p>
            <div className="flex gap-1">
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setScore(n)}
                  className={`w-9 h-9 rounded text-sm font-medium transition-colors
                    ${score === n
                      ? n >= 9 ? 'bg-green-500 text-white'
                        : n >= 7 ? 'bg-yellow-500 text-white'
                        : 'bg-red-500 text-white'
                      : 'bg-muted hover:bg-muted/80'
                    }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Not likely</span>
              <span>Very likely</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">
              What is the primary reason for your score? (Optional)
            </label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us more..."
              className="mt-2"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={score === null || isPending}
            className="w-full"
          >
            {isPending ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 4. New Module: process-excellence

### Purpose

Track process efficiency using TIMWOOD waste categories, value-add ratios, and A/B/C/D strategy evaluation for all core workflows.

### Auditable Processes

| Process | Typical Cycle Time | Value-Add Target |
|---------|-------------------|------------------|
| Admission (enquiry → enrolled) | 30 days | >10% |
| Billing (invoice → payment) | 15 days | >15% |
| Grievance (raised → resolved) | 2 days (48hr SLA) | >20% |
| Staff onboarding (offer → active) | 14 days | >10% |
| Academic scheduling | 7 days | >25% |

### TIMWOOD Categories (Education-Specific)

| Code | Waste Type | Examples |
|------|------------|----------|
| T | Transportation | Files movement, exam paper distribution |
| I | Inventory | Unused lab consumables, excess stationery |
| M | Motion | Excessive searching, back-and-forth |
| W | Waiting | Approval delays, decision queues |
| O1 | Over-production | Extra brochures, exam papers |
| O2 | Over-processing | Multiple signatures, redundant checks |
| D | Defects | Form errors, rework, reprocessing |
| TU | Talent Under-utilization | Faculty doing admin, senior staff routine work |

### Database Schema

```sql
-- Table: process_definitions
CREATE TABLE process_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- admission, billing, academic, staff, grievance
  stages JSONB NOT NULL DEFAULT '[]', -- [{name, expected_duration_hours, is_value_add}]
  target_cycle_time_hours INTEGER,
  target_value_add_ratio DECIMAL(5,2),
  sla_hours INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: process_instances
CREATE TABLE process_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES process_definitions(id),
  reference_type VARCHAR(50) NOT NULL, -- admission, billing_invoice, grievance_ticket, etc.
  reference_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  current_stage VARCHAR(100),
  stage_history JSONB DEFAULT '[]', -- [{stage, started_at, completed_at, duration_hours}]
  total_cycle_hours DECIMAL(10,2),
  value_add_hours DECIMAL(10,2),
  value_add_ratio DECIMAL(5,2),
  sla_status VARCHAR(20) DEFAULT 'on_track', -- on_track, at_risk, breached
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: waste_incidents
CREATE TABLE waste_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  process_instance_id UUID REFERENCES process_instances(id),
  process_id UUID REFERENCES process_definitions(id),
  waste_category VARCHAR(5) NOT NULL CHECK (waste_category IN ('T', 'I', 'M', 'W', 'O1', 'O2', 'D', 'TU')),
  description TEXT NOT NULL,
  estimated_time_lost_hours DECIMAL(10,2),
  estimated_cost_impact DECIMAL(12,2),
  root_cause TEXT,
  corrective_action TEXT,
  reported_by UUID REFERENCES users_profiles(id),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'open' -- open, investigating, resolved, dismissed
);

-- Table: process_audits
CREATE TABLE process_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  process_id UUID NOT NULL REFERENCES process_definitions(id),
  audit_period_start DATE NOT NULL,
  audit_period_end DATE NOT NULL,
  auditor_id UUID REFERENCES users_profiles(id),
  total_instances INTEGER DEFAULT 0,
  avg_cycle_hours DECIMAL(10,2),
  avg_value_add_ratio DECIMAL(5,2),
  sla_compliance_rate DECIMAL(5,2),
  waste_breakdown JSONB DEFAULT '{}', -- {T: 5, I: 2, M: 10, ...}
  findings TEXT,
  recommendations TEXT,
  abcd_rating VARCHAR(1) CHECK (abcd_rating IN ('A', 'B', 'C', 'D')),
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_process_instances_process ON process_instances(process_id);
CREATE INDEX idx_process_instances_ref ON process_instances(reference_type, reference_id);
CREATE INDEX idx_waste_incidents_process ON waste_incidents(process_id);
CREATE INDEX idx_waste_incidents_category ON waste_incidents(waste_category);

-- RLS
ALTER TABLE process_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_audits ENABLE ROW LEVEL SECURITY;
```

### TypeScript Types

```typescript
// types/process-excellence.ts
export type WasteCategory = 'T' | 'I' | 'M' | 'W' | 'O1' | 'O2' | 'D' | 'TU';
export type ProcessCategory = 'admission' | 'billing' | 'academic' | 'staff' | 'grievance';
export type SLAStatus = 'on_track' | 'at_risk' | 'breached';
export type ABCDRating = 'A' | 'B' | 'C' | 'D';

export const WASTE_LABELS: Record<WasteCategory, string> = {
  T: 'Transportation',
  I: 'Inventory',
  M: 'Motion',
  W: 'Waiting',
  O1: 'Over-production',
  O2: 'Over-processing',
  D: 'Defects',
  TU: 'Talent Under-utilization'
};

export interface ProcessStage {
  name: string;
  expected_duration_hours: number;
  is_value_add: boolean;
}

export interface ProcessDefinition {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  category: ProcessCategory;
  stages: ProcessStage[];
  target_cycle_time_hours: number | null;
  target_value_add_ratio: number | null;
  sla_hours: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProcessInstance {
  id: string;
  process_id: string;
  reference_type: string;
  reference_id: string;
  started_at: string;
  completed_at: string | null;
  current_stage: string | null;
  stage_history: StageHistory[];
  total_cycle_hours: number | null;
  value_add_hours: number | null;
  value_add_ratio: number | null;
  sla_status: SLAStatus;
  created_at: string;
}

export interface StageHistory {
  stage: string;
  started_at: string;
  completed_at: string | null;
  duration_hours: number | null;
}

export interface WasteIncident {
  id: string;
  institution_id: string;
  process_instance_id: string | null;
  process_id: string | null;
  waste_category: WasteCategory;
  description: string;
  estimated_time_lost_hours: number | null;
  estimated_cost_impact: number | null;
  root_cause: string | null;
  corrective_action: string | null;
  reported_by: string | null;
  reported_at: string;
  status: string;
}

export interface ProcessAudit {
  id: string;
  institution_id: string;
  process_id: string;
  audit_period_start: string;
  audit_period_end: string;
  auditor_id: string | null;
  total_instances: number;
  avg_cycle_hours: number | null;
  avg_value_add_ratio: number | null;
  sla_compliance_rate: number | null;
  waste_breakdown: Record<WasteCategory, number>;
  findings: string | null;
  recommendations: string | null;
  abcd_rating: ABCDRating | null;
  status: string;
  created_at: string;
}

export interface ProcessMetrics {
  process_id: string;
  process_name: string;
  total_instances: number;
  avg_cycle_time: number;
  value_add_ratio: number;
  sla_compliance: number;
  waste_count: number;
  abcd_distribution: Record<ABCDRating, number>;
}
```

### Service Implementation

```typescript
// lib/services/process-excellence/process-excellence-service.ts
import { createClient } from '@/lib/supabase/client';
import type { ProcessDefinition, ProcessInstance, WasteIncident, ProcessAudit, ProcessMetrics, WasteCategory } from '@/types/process-excellence';

export class ProcessExcellenceService {
  // Process Definitions
  static async getProcessDefinitions(institutionId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('process_definitions')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data;
  }

  static async createProcessDefinition(definition: Omit<ProcessDefinition, 'id' | 'created_at' | 'updated_at'>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('process_definitions')
      .insert(definition)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Process Instances - Auto-created when processes start
  static async startProcessInstance(params: {
    process_id: string;
    reference_type: string;
    reference_id: string;
  }) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('process_instances')
      .insert({
        ...params,
        started_at: new Date().toISOString(),
        current_stage: 'initiated',
        stage_history: [{
          stage: 'initiated',
          started_at: new Date().toISOString(),
          completed_at: null,
          duration_hours: null
        }]
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async advanceStage(instanceId: string, newStage: string, isValueAdd: boolean) {
    const supabase = createClient();

    // Get current instance
    const { data: instance } = await supabase
      .from('process_instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (!instance) throw new Error('Instance not found');

    const now = new Date().toISOString();
    const history = instance.stage_history as StageHistory[];

    // Close current stage
    const lastStage = history[history.length - 1];
    if (lastStage && !lastStage.completed_at) {
      lastStage.completed_at = now;
      lastStage.duration_hours =
        (new Date(now).getTime() - new Date(lastStage.started_at).getTime()) / (1000 * 60 * 60);
    }

    // Add new stage
    history.push({
      stage: newStage,
      started_at: now,
      completed_at: null,
      duration_hours: null
    });

    const { data, error } = await supabase
      .from('process_instances')
      .update({
        current_stage: newStage,
        stage_history: history
      })
      .eq('id', instanceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async completeProcess(instanceId: string) {
    const supabase = createClient();

    const { data: instance } = await supabase
      .from('process_instances')
      .select('*, process:process_definitions(*)')
      .eq('id', instanceId)
      .single();

    if (!instance) throw new Error('Instance not found');

    const now = new Date().toISOString();
    const history = instance.stage_history as StageHistory[];

    // Close final stage
    const lastStage = history[history.length - 1];
    if (lastStage && !lastStage.completed_at) {
      lastStage.completed_at = now;
      lastStage.duration_hours =
        (new Date(now).getTime() - new Date(lastStage.started_at).getTime()) / (1000 * 60 * 60);
    }

    // Calculate metrics
    const totalHours = history.reduce((sum, s) => sum + (s.duration_hours || 0), 0);
    const process = instance.process as ProcessDefinition;
    const valueAddStages = process.stages.filter(s => s.is_value_add).map(s => s.name);
    const valueAddHours = history
      .filter(s => valueAddStages.includes(s.stage))
      .reduce((sum, s) => sum + (s.duration_hours || 0), 0);
    const valueAddRatio = totalHours > 0 ? (valueAddHours / totalHours) * 100 : 0;

    // Check SLA
    let slaStatus: SLAStatus = 'on_track';
    if (process.sla_hours) {
      if (totalHours > process.sla_hours) {
        slaStatus = 'breached';
      } else if (totalHours > process.sla_hours * 0.8) {
        slaStatus = 'at_risk';
      }
    }

    const { data, error } = await supabase
      .from('process_instances')
      .update({
        completed_at: now,
        current_stage: 'completed',
        stage_history: history,
        total_cycle_hours: totalHours,
        value_add_hours: valueAddHours,
        value_add_ratio: valueAddRatio,
        sla_status: slaStatus
      })
      .eq('id', instanceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Waste Incidents
  static async reportWaste(incident: Omit<WasteIncident, 'id' | 'reported_at' | 'status'>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('waste_incidents')
      .insert({ ...incident, status: 'open' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async getWasteIncidents(institutionId: string, filters?: {
    process_id?: string;
    waste_category?: WasteCategory;
    status?: string;
  }) {
    const supabase = createClient();
    let query = supabase
      .from('waste_incidents')
      .select('*, process:process_definitions(name)')
      .eq('institution_id', institutionId)
      .order('reported_at', { ascending: false });

    if (filters?.process_id) query = query.eq('process_id', filters.process_id);
    if (filters?.waste_category) query = query.eq('waste_category', filters.waste_category);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  // Process Metrics
  static async getProcessMetrics(institutionId: string, processId?: string): Promise<ProcessMetrics[]> {
    const supabase = createClient();

    // This would typically be a database function for performance
    // Simplified implementation here

    let query = supabase
      .from('process_instances')
      .select(`
        *,
        process:process_definitions(id, name, institution_id)
      `)
      .not('completed_at', 'is', null);

    const { data: instances } = await query;

    // Group by process
    const metricsMap = new Map<string, ProcessMetrics>();

    instances?.forEach(inst => {
      const process = inst.process as any;
      if (process.institution_id !== institutionId) return;
      if (processId && process.id !== processId) return;

      if (!metricsMap.has(process.id)) {
        metricsMap.set(process.id, {
          process_id: process.id,
          process_name: process.name,
          total_instances: 0,
          avg_cycle_time: 0,
          value_add_ratio: 0,
          sla_compliance: 0,
          waste_count: 0,
          abcd_distribution: { A: 0, B: 0, C: 0, D: 0 }
        });
      }

      const metrics = metricsMap.get(process.id)!;
      metrics.total_instances++;
      metrics.avg_cycle_time += inst.total_cycle_hours || 0;
      metrics.value_add_ratio += inst.value_add_ratio || 0;
      if (inst.sla_status !== 'breached') metrics.sla_compliance++;
    });

    // Calculate averages
    metricsMap.forEach(metrics => {
      if (metrics.total_instances > 0) {
        metrics.avg_cycle_time /= metrics.total_instances;
        metrics.value_add_ratio /= metrics.total_instances;
        metrics.sla_compliance = (metrics.sla_compliance / metrics.total_instances) * 100;
      }
    });

    return Array.from(metricsMap.values());
  }
}
```

### UI Components Required

1. **Process Definition Manager** - Define stages, SLAs, value-add flags
2. **Process Dashboard** - Metrics overview, SLA compliance, value-add ratios
3. **TIMWOOD Waste Tracker** - Report and categorize waste incidents
4. **Waste Breakdown Chart** - Pie/bar chart by category
5. **Process Instance Timeline** - Visual stage progression
6. **Audit Report Generator** - Generate periodic audit reports

---

## 5. New Module: parent-portal

### Purpose

Provide parents with authenticated access to view learner progress, communicate with institution, and participate in NPS surveys.

### Features

1. **Authentication** - Linked to learner via phone/email
2. **Learner Dashboard** - Attendance, grades, upcoming events
3. **Communication** - View announcements, message teachers
4. **Fee Status** - View billing, payment history
5. **NPS Surveys** - Participate in feedback surveys

### Database Schema

```sql
-- Table: parent_profiles
CREATE TABLE parent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  relationship VARCHAR(50), -- father, mother, guardian
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: parent_learner_links
CREATE TABLE parent_learner_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  relationship VARCHAR(50) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, learner_id)
);

-- Table: parent_communications
CREATE TABLE parent_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  parent_id UUID REFERENCES parent_profiles(id),
  learner_id UUID REFERENCES learners_profiles(id),
  type VARCHAR(50) NOT NULL, -- announcement, message, alert
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  read_at TIMESTAMPTZ,
  sender_id UUID REFERENCES users_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: parent_activity_log
CREATE TABLE parent_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id),
  activity_type VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_parent_learner_links_parent ON parent_learner_links(parent_id);
CREATE INDEX idx_parent_learner_links_learner ON parent_learner_links(learner_id);
CREATE INDEX idx_parent_communications_parent ON parent_communications(parent_id);

-- RLS
ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_learner_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view own profile"
  ON parent_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Parents can view linked learners"
  ON parent_learner_links FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));
```

### TypeScript Types

```typescript
// types/parent-portal.ts
export interface ParentProfile {
  id: string;
  user_id: string;
  institution_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentLearnerLink {
  id: string;
  parent_id: string;
  learner_id: string;
  relationship: string;
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
  learner?: LearnerProfile; // Joined
}

export interface ParentCommunication {
  id: string;
  institution_id: string;
  parent_id: string | null;
  learner_id: string | null;
  type: 'announcement' | 'message' | 'alert';
  subject: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read_at: string | null;
  sender_id: string | null;
  created_at: string;
}

export interface ParentDashboardData {
  parent: ParentProfile;
  learners: (ParentLearnerLink & {
    learner: LearnerProfile;
    attendance_percentage: number;
    upcoming_dues: number;
    recent_grades: any[];
  })[];
  unread_messages: number;
  pending_surveys: NPSSurvey[];
}
```

### Service Implementation

```typescript
// lib/services/parent-portal/parent-portal-service.ts
import { createClient } from '@/lib/supabase/client';
import type { ParentProfile, ParentLearnerLink, ParentDashboardData } from '@/types/parent-portal';

export class ParentPortalService {
  static async getParentProfile(userId: string): Promise<ParentProfile | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async getLinkedLearners(parentId: string): Promise<ParentLearnerLink[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('parent_learner_links')
      .select(`
        *,
        learner:learners_profiles(
          id, name, enrollment_number, program_id,
          program:programs(name),
          section:sections(name)
        )
      `)
      .eq('parent_id', parentId);

    if (error) throw error;
    return data || [];
  }

  static async getDashboard(parentId: string): Promise<ParentDashboardData> {
    const supabase = createClient();

    // Get parent profile
    const { data: parent } = await supabase
      .from('parent_profiles')
      .select('*')
      .eq('id', parentId)
      .single();

    if (!parent) throw new Error('Parent not found');

    // Get linked learners with details
    const { data: links } = await supabase
      .from('parent_learner_links')
      .select(`
        *,
        learner:learners_profiles(*)
      `)
      .eq('parent_id', parentId);

    // Get attendance for each learner
    const learnersWithData = await Promise.all(
      (links || []).map(async (link) => {
        const { data: attendance } = await supabase
          .from('attendance_records')
          .select('status')
          .eq('learner_id', link.learner_id)
          .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        const presentCount = attendance?.filter(a => a.status === 'present').length || 0;
        const totalCount = attendance?.length || 1;

        const { data: dues } = await supabase
          .from('billing_bills')
          .select('total_amount')
          .eq('learner_id', link.learner_id)
          .eq('status', 'pending');

        const upcomingDues = dues?.reduce((sum, d) => sum + (d.total_amount || 0), 0) || 0;

        return {
          ...link,
          attendance_percentage: (presentCount / totalCount) * 100,
          upcoming_dues: upcomingDues,
          recent_grades: [] // Would fetch from academic module
        };
      })
    );

    // Get unread messages
    const { count: unreadCount } = await supabase
      .from('parent_communications')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', parentId)
      .is('read_at', null);

    // Get pending surveys
    const { data: surveys } = await supabase
      .from('nps_surveys')
      .select('*')
      .eq('institution_id', parent.institution_id)
      .eq('stakeholder_type', 'parent')
      .eq('status', 'active');

    return {
      parent,
      learners: learnersWithData,
      unread_messages: unreadCount || 0,
      pending_surveys: surveys || []
    };
  }

  static async getCommunications(parentId: string, limit = 20) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('parent_communications')
      .select(`
        *,
        sender:users_profiles(name)
      `)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  static async markCommunicationRead(communicationId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('parent_communications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', communicationId);

    if (error) throw error;
  }

  static async logActivity(parentId: string, activityType: string, description: string, metadata?: any) {
    const supabase = createClient();
    await supabase
      .from('parent_activity_log')
      .insert({
        parent_id: parentId,
        activity_type: activityType,
        description,
        metadata: metadata || {}
      });
  }
}
```

### UI Components Required

1. **Parent Login** - Phone/email based authentication
2. **Parent Dashboard** - Overview of all linked learners
3. **Learner Detail Card** - Attendance, grades, upcoming events
4. **Fee Status View** - Billing summary, payment history
5. **Communication Center** - Announcements, messages
6. **NPS Survey Trigger** - Prompt for pending surveys

---

## 6. New Module: grievance

### Purpose

Full ticketing system for complaints with 48-hour SLA tracking (GIIS benchmark).

### Ticket Categories

| Category | Sub-categories | Default SLA |
|----------|---------------|-------------|
| Academic | Exam, Grades, Attendance, Faculty | 48 hours |
| Administrative | Documents, Certificates, ID Cards | 72 hours |
| Facility | Hostel, Canteen, Transport, Labs | 24 hours |
| Fee & Billing | Refund, Discount, Payment Issue | 48 hours |
| Other | General Feedback, Suggestion | 96 hours |

### Database Schema

```sql
-- Table: grievance_categories
CREATE TABLE grievance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES grievance_categories(id),
  default_sla_hours INTEGER DEFAULT 48,
  default_assignee_role VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: grievance_tickets
CREATE TABLE grievance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES grievance_categories(id),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending_info', 'resolved', 'closed', 'reopened')),

  -- Stakeholder info
  raised_by_type VARCHAR(50) NOT NULL, -- learner, parent, staff, alumni
  raised_by_id UUID,
  raised_by_name VARCHAR(255) NOT NULL,
  raised_by_email VARCHAR(255),
  raised_by_phone VARCHAR(20),

  -- Assignment
  assigned_to UUID REFERENCES users_profiles(id),
  assigned_at TIMESTAMPTZ,
  department_id UUID REFERENCES departments(id),

  -- SLA tracking
  sla_hours INTEGER NOT NULL,
  sla_deadline TIMESTAMPTZ NOT NULL,
  sla_status VARCHAR(20) DEFAULT 'on_track' CHECK (sla_status IN ('on_track', 'at_risk', 'breached')),

  -- Resolution
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users_profiles(id),
  satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
  satisfaction_feedback TEXT,

  -- Metadata
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: grievance_comments
CREATE TABLE grievance_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES grievance_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users_profiles(id),
  author_name VARCHAR(255) NOT NULL,
  author_type VARCHAR(50) NOT NULL, -- staff, learner, parent, system
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false, -- Internal notes not visible to raiser
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: grievance_history
CREATE TABLE grievance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES grievance_tickets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- created, assigned, status_changed, commented, resolved, etc.
  old_value TEXT,
  new_value TEXT,
  performed_by UUID REFERENCES users_profiles(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'GRV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(NEXTVAL('grievance_ticket_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE grievance_ticket_seq START 1;

CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION generate_ticket_number();

-- Function to update SLA status
CREATE OR REPLACE FUNCTION update_grievance_sla_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    IF NOW() > NEW.sla_deadline THEN
      NEW.sla_status := 'breached';
    ELSIF NOW() > NEW.sla_deadline - INTERVAL '4 hours' THEN
      NEW.sla_status := 'at_risk';
    ELSE
      NEW.sla_status := 'on_track';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_sla_status
  BEFORE UPDATE ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_sla_status();

-- Indexes
CREATE INDEX idx_grievance_tickets_institution ON grievance_tickets(institution_id);
CREATE INDEX idx_grievance_tickets_status ON grievance_tickets(status);
CREATE INDEX idx_grievance_tickets_sla ON grievance_tickets(sla_status, sla_deadline);
CREATE INDEX idx_grievance_tickets_assigned ON grievance_tickets(assigned_to);
CREATE INDEX idx_grievance_comments_ticket ON grievance_comments(ticket_id);

-- RLS
ALTER TABLE grievance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_history ENABLE ROW LEVEL SECURITY;
```

### TypeScript Types

```typescript
// types/grievance.ts
export type GrievancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type GrievanceStatus = 'open' | 'in_progress' | 'pending_info' | 'resolved' | 'closed' | 'reopened';
export type GrievanceSLAStatus = 'on_track' | 'at_risk' | 'breached';
export type RaiserType = 'learner' | 'parent' | 'staff' | 'alumni';

export interface GrievanceCategory {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  default_sla_hours: number;
  default_assignee_role: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  children?: GrievanceCategory[];
}

export interface GrievanceTicket {
  id: string;
  institution_id: string;
  ticket_number: string;
  category_id: string;
  subject: string;
  description: string;
  priority: GrievancePriority;
  status: GrievanceStatus;

  raised_by_type: RaiserType;
  raised_by_id: string | null;
  raised_by_name: string;
  raised_by_email: string | null;
  raised_by_phone: string | null;

  assigned_to: string | null;
  assigned_at: string | null;
  department_id: string | null;

  sla_hours: number;
  sla_deadline: string;
  sla_status: GrievanceSLAStatus;

  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  satisfaction_rating: number | null;
  satisfaction_feedback: string | null;

  attachments: Attachment[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Joined fields
  category?: GrievanceCategory;
  assignee?: { id: string; name: string };
  department?: { id: string; name: string };
  comments_count?: number;
}

export interface GrievanceComment {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_name: string;
  author_type: string;
  content: string;
  is_internal: boolean;
  attachments: Attachment[];
  created_at: string;
}

export interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface GrievanceSLAReport {
  total_tickets: number;
  resolved_within_sla: number;
  breached: number;
  avg_resolution_hours: number;
  by_category: Record<string, {
    total: number;
    within_sla: number;
    avg_hours: number;
  }>;
}
```

### Service Implementation

```typescript
// lib/services/grievance/grievance-service.ts
import { createClient } from '@/lib/supabase/client';
import type { GrievanceTicket, GrievanceComment, GrievanceCategory, GrievanceSLAReport } from '@/types/grievance';

export class GrievanceService {
  // Categories
  static async getCategories(institutionId: string): Promise<GrievanceCategory[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_categories')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;

    // Build tree structure
    const categories = data || [];
    const rootCategories = categories.filter(c => !c.parent_id);
    rootCategories.forEach(root => {
      root.children = categories.filter(c => c.parent_id === root.id);
    });
    return rootCategories;
  }

  // Tickets
  static async getTickets(institutionId: string, filters?: {
    status?: GrievanceStatus;
    sla_status?: GrievanceSLAStatus;
    assigned_to?: string;
    category_id?: string;
    raised_by_type?: RaiserType;
    search?: string;
  }, pagination?: { page: number; pageSize: number }) {
    const supabase = createClient();
    let query = supabase
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories(name),
        assignee:users_profiles!assigned_to(id, name),
        department:departments(name)
      `, { count: 'exact' })
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.sla_status) query = query.eq('sla_status', filters.sla_status);
    if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
    if (filters?.category_id) query = query.eq('category_id', filters.category_id);
    if (filters?.raised_by_type) query = query.eq('raised_by_type', filters.raised_by_type);
    if (filters?.search) {
      query = query.or(`subject.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%`);
    }

    if (pagination) {
      const { page, pageSize } = pagination;
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, total: count };
  }

  static async getTicketById(id: string): Promise<GrievanceTicket> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_tickets')
      .select(`
        *,
        category:grievance_categories(name, default_sla_hours),
        assignee:users_profiles!assigned_to(id, name, email),
        department:departments(name),
        resolver:users_profiles!resolved_by(id, name)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  static async createTicket(ticket: {
    institution_id: string;
    category_id: string;
    subject: string;
    description: string;
    priority?: GrievancePriority;
    raised_by_type: RaiserType;
    raised_by_id?: string;
    raised_by_name: string;
    raised_by_email?: string;
    raised_by_phone?: string;
    attachments?: Attachment[];
  }): Promise<GrievanceTicket> {
    const supabase = createClient();

    // Get category to determine SLA
    const { data: category } = await supabase
      .from('grievance_categories')
      .select('default_sla_hours')
      .eq('id', ticket.category_id)
      .single();

    const slaHours = category?.default_sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('grievance_tickets')
      .insert({
        ...ticket,
        sla_hours: slaHours,
        sla_deadline: slaDeadline.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Log history
    await this.logHistory(data.id, 'created', null, data.status);

    return data;
  }

  static async assignTicket(ticketId: string, assigneeId: string, departmentId?: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_tickets')
      .update({
        assigned_to: assigneeId,
        assigned_at: new Date().toISOString(),
        department_id: departmentId,
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;

    await this.logHistory(ticketId, 'assigned', null, assigneeId);
    await this.logHistory(ticketId, 'status_changed', 'open', 'in_progress');

    return data;
  }

  static async resolveTicket(ticketId: string, resolution: string, resolvedBy: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_tickets')
      .update({
        status: 'resolved',
        resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;

    await this.logHistory(ticketId, 'resolved', null, resolution);

    return data;
  }

  static async updateStatus(ticketId: string, status: GrievanceStatus, note?: string) {
    const supabase = createClient();

    const { data: current } = await supabase
      .from('grievance_tickets')
      .select('status')
      .eq('id', ticketId)
      .single();

    const { data, error } = await supabase
      .from('grievance_tickets')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;

    await this.logHistory(ticketId, 'status_changed', current?.status, status);

    if (note) {
      await this.addComment(ticketId, {
        author_name: 'System',
        author_type: 'system',
        content: note,
        is_internal: true
      });
    }

    return data;
  }

  static async rateSatisfaction(ticketId: string, rating: number, feedback?: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_tickets')
      .update({
        satisfaction_rating: rating,
        satisfaction_feedback: feedback,
        status: 'closed',
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Comments
  static async getComments(ticketId: string, includeInternal = false): Promise<GrievanceComment[]> {
    const supabase = createClient();
    let query = supabase
      .from('grievance_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (!includeInternal) {
      query = query.eq('is_internal', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async addComment(ticketId: string, comment: {
    author_id?: string;
    author_name: string;
    author_type: string;
    content: string;
    is_internal?: boolean;
    attachments?: Attachment[];
  }): Promise<GrievanceComment> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_comments')
      .insert({
        ticket_id: ticketId,
        ...comment
      })
      .select()
      .single();

    if (error) throw error;

    // Update ticket timestamp
    await supabase
      .from('grievance_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    return data;
  }

  // History
  static async logHistory(ticketId: string, action: string, oldValue: any, newValue: any, performedBy?: string) {
    const supabase = createClient();
    await supabase
      .from('grievance_history')
      .insert({
        ticket_id: ticketId,
        action,
        old_value: oldValue?.toString(),
        new_value: newValue?.toString(),
        performed_by: performedBy
      });
  }

  static async getHistory(ticketId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('grievance_history')
      .select(`
        *,
        performer:users_profiles!performed_by(name)
      `)
      .eq('ticket_id', ticketId)
      .order('performed_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  // SLA Report
  static async getSLAReport(institutionId: string, periodStart: string, periodEnd: string): Promise<GrievanceSLAReport> {
    const supabase = createClient();

    const { data: tickets } = await supabase
      .from('grievance_tickets')
      .select('*, category:grievance_categories(name)')
      .eq('institution_id', institutionId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const resolved = tickets?.filter(t => t.resolved_at) || [];
    const withinSLA = resolved.filter(t => {
      const resolvedAt = new Date(t.resolved_at);
      const createdAt = new Date(t.created_at);
      const hours = (resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      return hours <= t.sla_hours;
    });

    const avgHours = resolved.length > 0
      ? resolved.reduce((sum, t) => {
          const resolvedAt = new Date(t.resolved_at);
          const createdAt = new Date(t.created_at);
          return sum + (resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        }, 0) / resolved.length
      : 0;

    // Group by category
    const byCategory: Record<string, { total: number; within_sla: number; avg_hours: number }> = {};
    tickets?.forEach(t => {
      const catName = (t.category as any)?.name || 'Unknown';
      if (!byCategory[catName]) {
        byCategory[catName] = { total: 0, within_sla: 0, avg_hours: 0 };
      }
      byCategory[catName].total++;

      if (t.resolved_at) {
        const resolvedAt = new Date(t.resolved_at);
        const createdAt = new Date(t.created_at);
        const hours = (resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hours <= t.sla_hours) byCategory[catName].within_sla++;
        byCategory[catName].avg_hours += hours;
      }
    });

    Object.values(byCategory).forEach(cat => {
      if (cat.total > 0) cat.avg_hours /= cat.total;
    });

    return {
      total_tickets: tickets?.length || 0,
      resolved_within_sla: withinSLA.length,
      breached: resolved.length - withinSLA.length,
      avg_resolution_hours: avgHours,
      by_category: byCategory
    };
  }
}
```

### UI Components Required

1. **Ticket Submission Form** - Public-facing, category selection
2. **Ticket List** - Filterable by status, SLA, category
3. **Ticket Detail** - Full view with comments, history
4. **SLA Dashboard** - Compliance rates, at-risk tickets
5. **Assignment Panel** - Assign to staff, department
6. **Satisfaction Survey** - Post-resolution rating

---

## 7. New Module: maturity-assessment

### Purpose

Enable departments to self-assess their position on the 4-stage Excellence Journey maturity model.

### Maturity Stages

| Stage | Name | Description | Criteria |
|-------|------|-------------|----------|
| 1 | Reacting to Problems | Ad-hoc responses, firefighting | No documented processes |
| 2 | Early Systematic | Some processes defined | Basic documentation exists |
| 3 | Aligned Approaches | Processes linked to goals | OKRs defined, metrics tracked |
| 4 | Integrated Approaches | Full data-driven operation | Automated, continuous improvement |

### Assessment Dimensions

| Dimension | Stage 1 | Stage 2 | Stage 3 | Stage 4 |
|-----------|---------|---------|---------|---------|
| Leadership | Reactive | Sponsor some initiatives | Active involvement | Drive transformation |
| Strategy | No clear goals | Goals defined | Goals linked to metrics | Fully integrated |
| Process | No standards | Some documented | All documented | Automated, optimized |
| Data | No tracking | Basic metrics | KPIs tracked | Predictive analytics |
| People | No training | Ad-hoc training | Structured development | Continuous learning |
| Stakeholders | Complaints handled | Feedback collected | NPS tracked | Proactive engagement |

### Database Schema

```sql
-- Table: maturity_frameworks
CREATE TABLE maturity_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  name VARCHAR(255) NOT NULL DEFAULT 'Excellence Journey',
  description TEXT,
  dimensions JSONB NOT NULL, -- [{name, stage_1_criteria, stage_2_criteria, ...}]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: maturity_assessments
CREATE TABLE maturity_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  framework_id UUID NOT NULL REFERENCES maturity_frameworks(id),
  department_id UUID REFERENCES departments(id),
  assessment_date DATE NOT NULL,
  assessor_id UUID REFERENCES users_profiles(id),
  dimension_scores JSONB NOT NULL, -- {leadership: 2, strategy: 1, ...}
  overall_stage INTEGER NOT NULL CHECK (overall_stage >= 1 AND overall_stage <= 4),
  evidence TEXT,
  improvement_plan TEXT,
  target_stage INTEGER CHECK (target_stage >= 1 AND target_stage <= 4),
  target_date DATE,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'archived')),
  reviewed_by UUID REFERENCES users_profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: maturity_progress
CREATE TABLE maturity_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES maturity_assessments(id),
  action_item VARCHAR(255) NOT NULL,
  dimension VARCHAR(50) NOT NULL,
  target_stage INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_maturity_assessments_dept ON maturity_assessments(department_id);
CREATE INDEX idx_maturity_assessments_date ON maturity_assessments(assessment_date);

-- RLS
ALTER TABLE maturity_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maturity_progress ENABLE ROW LEVEL SECURITY;
```

### TypeScript Types

```typescript
// types/maturity-assessment.ts
export type MaturityStage = 1 | 2 | 3 | 4;
export type AssessmentStatus = 'draft' | 'submitted' | 'approved' | 'archived';
export type ProgressStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface MaturityDimension {
  name: string;
  description: string;
  stage_1_criteria: string;
  stage_2_criteria: string;
  stage_3_criteria: string;
  stage_4_criteria: string;
}

export interface MaturityFramework {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  dimensions: MaturityDimension[];
  is_active: boolean;
  created_at: string;
}

export interface MaturityAssessment {
  id: string;
  institution_id: string;
  framework_id: string;
  department_id: string | null;
  assessment_date: string;
  assessor_id: string | null;
  dimension_scores: Record<string, MaturityStage>;
  overall_stage: MaturityStage;
  evidence: string | null;
  improvement_plan: string | null;
  target_stage: MaturityStage | null;
  target_date: string | null;
  status: AssessmentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;

  // Joined
  department?: { id: string; name: string };
  assessor?: { id: string; name: string };
  framework?: MaturityFramework;
}

export interface MaturityProgressItem {
  id: string;
  assessment_id: string;
  action_item: string;
  dimension: string;
  target_stage: MaturityStage;
  status: ProgressStatus;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface MaturityDashboardData {
  institution_overall: MaturityStage;
  by_department: Record<string, MaturityStage>;
  by_dimension: Record<string, number>; // Average across assessments
  trend: { date: string; stage: number }[];
  improvement_items: {
    total: number;
    completed: number;
    overdue: number;
  };
}
```

### Service Implementation

```typescript
// lib/services/maturity-assessment/maturity-assessment-service.ts
import { createClient } from '@/lib/supabase/client';
import type { MaturityFramework, MaturityAssessment, MaturityProgressItem, MaturityDashboardData, MaturityStage } from '@/types/maturity-assessment';

export class MaturityAssessmentService {
  // Default framework
  static getDefaultDimensions(): MaturityDimension[] {
    return [
      {
        name: 'Leadership',
        description: 'Leadership commitment to excellence',
        stage_1_criteria: 'Reactive response to issues only',
        stage_2_criteria: 'Sponsors some improvement initiatives',
        stage_3_criteria: 'Actively involved in quality reviews',
        stage_4_criteria: 'Drives transformation, visible commitment'
      },
      {
        name: 'Strategy',
        description: 'Strategic alignment of improvement efforts',
        stage_1_criteria: 'No clear goals or metrics',
        stage_2_criteria: 'Goals defined but not tracked',
        stage_3_criteria: 'Goals linked to KPIs, regular review',
        stage_4_criteria: 'Fully integrated strategic planning'
      },
      {
        name: 'Process',
        description: 'Process documentation and optimization',
        stage_1_criteria: 'No documented processes',
        stage_2_criteria: 'Some processes documented',
        stage_3_criteria: 'All processes documented with SLAs',
        stage_4_criteria: 'Automated, optimized, continuously improved'
      },
      {
        name: 'Data',
        description: 'Data-driven decision making',
        stage_1_criteria: 'No systematic data collection',
        stage_2_criteria: 'Basic metrics tracked',
        stage_3_criteria: 'Comprehensive KPIs with dashboards',
        stage_4_criteria: 'Predictive analytics, real-time insights'
      },
      {
        name: 'People',
        description: 'Staff capability development',
        stage_1_criteria: 'No formal training',
        stage_2_criteria: 'Ad-hoc training programs',
        stage_3_criteria: 'Structured development plans',
        stage_4_criteria: 'Continuous learning culture'
      },
      {
        name: 'Stakeholders',
        description: 'Stakeholder engagement and satisfaction',
        stage_1_criteria: 'Complaints handled reactively',
        stage_2_criteria: 'Feedback collected occasionally',
        stage_3_criteria: 'NPS tracked, action plans created',
        stage_4_criteria: 'Proactive engagement, high satisfaction'
      }
    ];
  }

  // Frameworks
  static async getFramework(institutionId: string): Promise<MaturityFramework | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_frameworks')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async createFramework(institutionId: string): Promise<MaturityFramework> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_frameworks')
      .insert({
        institution_id: institutionId,
        name: 'Excellence Journey',
        description: 'Based on TQM International Education Excellence Model',
        dimensions: this.getDefaultDimensions()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Assessments
  static async getAssessments(institutionId: string, filters?: {
    department_id?: string;
    status?: AssessmentStatus;
  }) {
    const supabase = createClient();
    let query = supabase
      .from('maturity_assessments')
      .select(`
        *,
        department:departments(id, name),
        assessor:users_profiles!assessor_id(id, name),
        framework:maturity_frameworks(name)
      `)
      .eq('institution_id', institutionId)
      .order('assessment_date', { ascending: false });

    if (filters?.department_id) query = query.eq('department_id', filters.department_id);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  static async getAssessmentById(id: string): Promise<MaturityAssessment> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_assessments')
      .select(`
        *,
        department:departments(id, name),
        assessor:users_profiles!assessor_id(id, name),
        reviewer:users_profiles!reviewed_by(id, name),
        framework:maturity_frameworks(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async createAssessment(assessment: {
    institution_id: string;
    framework_id: string;
    department_id?: string;
    assessment_date: string;
    assessor_id?: string;
    dimension_scores: Record<string, MaturityStage>;
    evidence?: string;
    improvement_plan?: string;
    target_stage?: MaturityStage;
    target_date?: string;
  }): Promise<MaturityAssessment> {
    const supabase = createClient();

    // Calculate overall stage (average, rounded down)
    const scores = Object.values(assessment.dimension_scores);
    const overall = Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length) as MaturityStage;

    const { data, error } = await supabase
      .from('maturity_assessments')
      .insert({
        ...assessment,
        overall_stage: overall
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async submitAssessment(id: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_assessments')
      .update({ status: 'submitted' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async approveAssessment(id: string, reviewerId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_assessments')
      .update({
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Progress items
  static async getProgressItems(assessmentId: string): Promise<MaturityProgressItem[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_progress')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('due_date');

    if (error) throw error;
    return data || [];
  }

  static async addProgressItem(item: Omit<MaturityProgressItem, 'id' | 'created_at'>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_progress')
      .insert(item)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateProgressItem(id: string, updates: Partial<MaturityProgressItem>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('maturity_progress')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Dashboard
  static async getDashboard(institutionId: string): Promise<MaturityDashboardData> {
    const supabase = createClient();

    // Get latest assessments by department
    const { data: assessments } = await supabase
      .from('maturity_assessments')
      .select('*, department:departments(id, name)')
      .eq('institution_id', institutionId)
      .eq('status', 'approved')
      .order('assessment_date', { ascending: false });

    // Calculate by department (latest only)
    const byDepartment: Record<string, MaturityStage> = {};
    const seenDepts = new Set<string>();
    assessments?.forEach(a => {
      const deptId = a.department_id || 'institution';
      if (!seenDepts.has(deptId)) {
        seenDepts.add(deptId);
        byDepartment[(a.department as any)?.name || 'Institution'] = a.overall_stage;
      }
    });

    // Calculate by dimension (average of latest assessments)
    const byDimension: Record<string, number> = {};
    const dimensionCounts: Record<string, number> = {};

    assessments?.slice(0, 10).forEach(a => {
      Object.entries(a.dimension_scores as Record<string, number>).forEach(([dim, score]) => {
        if (!byDimension[dim]) {
          byDimension[dim] = 0;
          dimensionCounts[dim] = 0;
        }
        byDimension[dim] += score;
        dimensionCounts[dim]++;
      });
    });

    Object.keys(byDimension).forEach(dim => {
      byDimension[dim] /= dimensionCounts[dim] || 1;
    });

    // Calculate overall
    const overallScores = assessments?.map(a => a.overall_stage) || [1];
    const institutionOverall = Math.round(overallScores.reduce((a, b) => a + b, 0) / overallScores.length) as MaturityStage;

    // Trend
    const trend = assessments?.slice(0, 12).map(a => ({
      date: a.assessment_date,
      stage: a.overall_stage
    })).reverse() || [];

    // Progress items
    const { data: progressItems } = await supabase
      .from('maturity_progress')
      .select('status, due_date')
      .in('assessment_id', assessments?.map(a => a.id) || []);

    const now = new Date();
    const progressSummary = {
      total: progressItems?.length || 0,
      completed: progressItems?.filter(p => p.status === 'completed').length || 0,
      overdue: progressItems?.filter(p =>
        p.status !== 'completed' && p.due_date && new Date(p.due_date) < now
      ).length || 0
    };

    return {
      institution_overall: institutionOverall,
      by_department: byDepartment,
      by_dimension: byDimension,
      trend,
      improvement_items: progressSummary
    };
  }
}
```

### UI Components Required

1. **Self-Assessment Form** - Rate each dimension with criteria guidance
2. **Maturity Radar Chart** - Visualize dimension scores
3. **Progress Dashboard** - Institution and department view
4. **Improvement Action Tracker** - Manage action items
5. **Trend Analysis** - Show maturity over time
6. **Comparison View** - Compare departments

---

## 8. Extension: OKR A/B/C/D Matrix

### Purpose

Add process evaluation to existing OKR module to enable A/B/C/D strategy assessment.

### Changes to Existing Schema

```sql
-- Add columns to okr_key_results
ALTER TABLE okr_key_results
ADD COLUMN process_rating INTEGER CHECK (process_rating >= 1 AND process_rating <= 5),
ADD COLUMN process_notes TEXT,
ADD COLUMN abcd_category VARCHAR(1) GENERATED ALWAYS AS (
  CASE
    WHEN progress >= 70 AND process_rating >= 4 THEN 'A'
    WHEN progress < 70 AND process_rating < 4 THEN 'B'
    WHEN progress < 70 AND process_rating >= 4 THEN 'C'
    WHEN progress >= 70 AND process_rating < 4 THEN 'D'
    ELSE NULL
  END
) STORED;

-- Add view for ABCD analysis
CREATE VIEW okr_abcd_analysis AS
SELECT
  o.id as objective_id,
  o.title as objective_title,
  o.owner_type,
  o.owner_id,
  kr.id as key_result_id,
  kr.title as key_result_title,
  kr.progress,
  kr.process_rating,
  kr.abcd_category,
  CASE
    WHEN kr.abcd_category = 'A' THEN 'Good Process + Good Result - Replicate'
    WHEN kr.abcd_category = 'B' THEN 'Bad Process + Bad Result - Improve'
    WHEN kr.abcd_category = 'C' THEN 'Good Process + Bad Result - Investigate'
    WHEN kr.abcd_category = 'D' THEN 'Bad Process + Good Result - WARNING: False Security'
    ELSE 'Not Evaluated'
  END as analysis
FROM okr_objectives o
JOIN okr_key_results kr ON kr.objective_id = o.id;
```

### Type Updates

```typescript
// types/okr.ts - Add to existing
export type ABCDCategory = 'A' | 'B' | 'C' | 'D' | null;

export interface OKRKeyResultExtended extends OKRKeyResult {
  process_rating: number | null;
  process_notes: string | null;
  abcd_category: ABCDCategory;
}

export interface ABCDAnalysis {
  objective_id: string;
  objective_title: string;
  owner_type: string;
  owner_id: string;
  key_result_id: string;
  key_result_title: string;
  progress: number;
  process_rating: number | null;
  abcd_category: ABCDCategory;
  analysis: string;
}
```

### Service Updates

```typescript
// Add to lib/services/okr/okr-service.ts

export class OKRService {
  // Existing methods...

  static async updateProcessRating(keyResultId: string, rating: number, notes?: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('okr_key_results')
      .update({
        process_rating: rating,
        process_notes: notes
      })
      .eq('id', keyResultId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getABCDAnalysis(institutionId: string, filters?: {
    owner_type?: string;
    owner_id?: string;
    period_id?: string;
  }): Promise<ABCDAnalysis[]> {
    const supabase = createClient();
    let query = supabase
      .from('okr_abcd_analysis')
      .select('*');

    // Add filters...

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async getABCDDistribution(institutionId: string): Promise<Record<ABCDCategory, number>> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('okr_key_results')
      .select('abcd_category')
      .not('abcd_category', 'is', null);

    if (error) throw error;

    const distribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    data?.forEach(kr => {
      if (kr.abcd_category) {
        distribution[kr.abcd_category]++;
      }
    });

    return distribution as Record<ABCDCategory, number>;
  }
}
```

### UI Components Required

1. **Process Rating Input** - 1-5 scale on KR review
2. **A/B/C/D Matrix Visualization** - 2x2 grid with KRs plotted
3. **Category Distribution Chart** - Pie chart of A/B/C/D
4. **D-Category Alert Panel** - Highlight risky "false security" items

---

## 9. Extension: Billing COPQ

### Purpose

Track Cost of Poor Quality (hidden costs) in the billing module.

### Changes to Existing Schema

```sql
-- Table: billing_copq_incidents
CREATE TABLE billing_copq_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  bill_id UUID REFERENCES billing_bills(id),
  learner_id UUID REFERENCES learners_profiles(id),
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'refund_processing',
    'late_payment_followup',
    'invoice_error',
    'payment_reconciliation',
    'discount_dispute',
    'collection_cost',
    'bad_debt',
    'reputation_impact',
    'process_rework',
    'other'
  )),
  description TEXT NOT NULL,
  visible_cost DECIMAL(12,2) DEFAULT 0, -- Direct financial impact
  hidden_cost_estimate DECIMAL(12,2) DEFAULT 0, -- Estimated hidden cost
  time_spent_hours DECIMAL(5,2),
  affected_stakeholders INTEGER DEFAULT 1,
  root_cause TEXT,
  preventive_action TEXT,
  reported_by UUID REFERENCES users_profiles(id),
  status VARCHAR(20) DEFAULT 'logged' CHECK (status IN ('logged', 'investigating', 'resolved', 'written_off')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- View for COPQ analytics
CREATE VIEW billing_copq_summary AS
SELECT
  institution_id,
  DATE_TRUNC('month', incident_date) as month,
  category,
  COUNT(*) as incident_count,
  SUM(visible_cost) as total_visible_cost,
  SUM(hidden_cost_estimate) as total_hidden_cost,
  SUM(visible_cost + hidden_cost_estimate) as total_copq,
  AVG(time_spent_hours) as avg_time_spent
FROM billing_copq_incidents
GROUP BY institution_id, DATE_TRUNC('month', incident_date), category;

-- Indexes
CREATE INDEX idx_billing_copq_institution ON billing_copq_incidents(institution_id);
CREATE INDEX idx_billing_copq_category ON billing_copq_incidents(category);
CREATE INDEX idx_billing_copq_date ON billing_copq_incidents(incident_date);

-- RLS
ALTER TABLE billing_copq_incidents ENABLE ROW LEVEL SECURITY;
```

### Type Updates

```typescript
// types/billing-copq.ts
export type COPQCategory =
  | 'refund_processing'
  | 'late_payment_followup'
  | 'invoice_error'
  | 'payment_reconciliation'
  | 'discount_dispute'
  | 'collection_cost'
  | 'bad_debt'
  | 'reputation_impact'
  | 'process_rework'
  | 'other';

export const COPQ_CATEGORY_LABELS: Record<COPQCategory, string> = {
  refund_processing: 'Refund Processing',
  late_payment_followup: 'Late Payment Follow-up',
  invoice_error: 'Invoice Errors',
  payment_reconciliation: 'Payment Reconciliation',
  discount_dispute: 'Discount Disputes',
  collection_cost: 'Collection Costs',
  bad_debt: 'Bad Debt',
  reputation_impact: 'Reputation Impact',
  process_rework: 'Process Rework',
  other: 'Other'
};

export interface BillingCOPQIncident {
  id: string;
  institution_id: string;
  bill_id: string | null;
  learner_id: string | null;
  incident_date: string;
  category: COPQCategory;
  description: string;
  visible_cost: number;
  hidden_cost_estimate: number;
  time_spent_hours: number | null;
  affected_stakeholders: number;
  root_cause: string | null;
  preventive_action: string | null;
  reported_by: string | null;
  status: string;
  resolved_at: string | null;
  created_at: string;
}

export interface COPQSummary {
  month: string;
  category: COPQCategory;
  incident_count: number;
  total_visible_cost: number;
  total_hidden_cost: number;
  total_copq: number;
  avg_time_spent: number;
}

export interface COPQDashboard {
  total_copq_ytd: number;
  visible_vs_hidden: { visible: number; hidden: number };
  by_category: Record<COPQCategory, number>;
  trend: { month: string; copq: number }[];
  top_incidents: BillingCOPQIncident[];
}
```

### Service Updates

```typescript
// lib/services/billing/billing-copq-service.ts
import { createClient } from '@/lib/supabase/client';
import type { BillingCOPQIncident, COPQSummary, COPQDashboard, COPQCategory } from '@/types/billing-copq';

export class BillingCOPQService {
  static async logIncident(incident: Omit<BillingCOPQIncident, 'id' | 'created_at' | 'status' | 'resolved_at'>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('billing_copq_incidents')
      .insert(incident)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getIncidents(institutionId: string, filters?: {
    category?: COPQCategory;
    status?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const supabase = createClient();
    let query = supabase
      .from('billing_copq_incidents')
      .select(`
        *,
        bill:billing_bills(bill_number),
        learner:learners_profiles(name),
        reporter:users_profiles!reported_by(name)
      `)
      .eq('institution_id', institutionId)
      .order('incident_date', { ascending: false });

    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.date_from) query = query.gte('incident_date', filters.date_from);
    if (filters?.date_to) query = query.lte('incident_date', filters.date_to);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  static async getSummary(institutionId: string, year?: number): Promise<COPQSummary[]> {
    const supabase = createClient();
    const targetYear = year || new Date().getFullYear();

    const { data, error } = await supabase
      .from('billing_copq_summary')
      .select('*')
      .eq('institution_id', institutionId)
      .gte('month', `${targetYear}-01-01`)
      .lte('month', `${targetYear}-12-31`)
      .order('month');

    if (error) throw error;
    return data || [];
  }

  static async getDashboard(institutionId: string): Promise<COPQDashboard> {
    const supabase = createClient();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const { data: incidents } = await supabase
      .from('billing_copq_incidents')
      .select('*')
      .eq('institution_id', institutionId)
      .gte('incident_date', yearStart);

    let totalVisible = 0;
    let totalHidden = 0;
    const byCategory: Record<COPQCategory, number> = {} as any;

    incidents?.forEach(i => {
      totalVisible += i.visible_cost || 0;
      totalHidden += i.hidden_cost_estimate || 0;
      byCategory[i.category as COPQCategory] = (byCategory[i.category as COPQCategory] || 0) +
        (i.visible_cost || 0) + (i.hidden_cost_estimate || 0);
    });

    // Get monthly trend
    const summary = await this.getSummary(institutionId);
    const trend = summary.reduce((acc: any[], s) => {
      const existing = acc.find(a => a.month === s.month);
      if (existing) {
        existing.copq += s.total_copq;
      } else {
        acc.push({ month: s.month, copq: s.total_copq });
      }
      return acc;
    }, []);

    // Get top incidents
    const { data: topIncidents } = await supabase
      .from('billing_copq_incidents')
      .select('*')
      .eq('institution_id', institutionId)
      .order('visible_cost', { ascending: false })
      .limit(5);

    return {
      total_copq_ytd: totalVisible + totalHidden,
      visible_vs_hidden: { visible: totalVisible, hidden: totalHidden },
      by_category: byCategory,
      trend,
      top_incidents: topIncidents || []
    };
  }

  static async resolveIncident(id: string, preventiveAction?: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('billing_copq_incidents')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        preventive_action: preventiveAction
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
```

### UI Components Required

1. **COPQ Logging Form** - Quick incident capture
2. **Iceberg Chart** - Visible vs hidden costs visualization
3. **Category Breakdown** - Bar chart by incident type
4. **Monthly Trend** - Line chart over time
5. **Top Incidents Table** - Highest cost items

---

## 10. Database Migrations

### Migration File Structure

```
supabase/migrations/
├── 20260201000001_create_nps_tables.sql
├── 20260201000002_create_process_excellence_tables.sql
├── 20260201000003_create_parent_portal_tables.sql
├── 20260201000004_create_grievance_tables.sql
├── 20260201000005_create_maturity_assessment_tables.sql
├── 20260201000006_extend_okr_abcd.sql
└── 20260201000007_create_billing_copq.sql
```

### Migration Execution Order

1. NPS tables (no dependencies)
2. Process Excellence tables (no dependencies)
3. Parent Portal tables (depends on learners_profiles)
4. Grievance tables (depends on users_profiles, departments)
5. Maturity Assessment tables (depends on departments)
6. OKR extension (depends on okr_key_results)
7. Billing COPQ (depends on billing_bills)

---

## 11. API Contracts

### NPS API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stakeholder-nps/surveys` | GET | List surveys |
| `/api/stakeholder-nps/surveys` | POST | Create survey |
| `/api/stakeholder-nps/surveys/[id]` | GET | Get survey |
| `/api/stakeholder-nps/surveys/[id]` | PATCH | Update survey |
| `/api/stakeholder-nps/surveys/[id]/activate` | POST | Activate survey |
| `/api/stakeholder-nps/surveys/[id]/close` | POST | Close survey |
| `/api/stakeholder-nps/responses` | POST | Submit response |
| `/api/stakeholder-nps/responses` | GET | List responses |
| `/api/stakeholder-nps/analytics` | GET | Get analytics |
| `/api/stakeholder-nps/dashboard` | GET | Get dashboard data |

### Process Excellence API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/process-excellence/definitions` | GET | List process definitions |
| `/api/process-excellence/definitions` | POST | Create definition |
| `/api/process-excellence/instances` | POST | Start instance |
| `/api/process-excellence/instances/[id]/advance` | POST | Advance stage |
| `/api/process-excellence/instances/[id]/complete` | POST | Complete process |
| `/api/process-excellence/waste` | GET | List waste incidents |
| `/api/process-excellence/waste` | POST | Report waste |
| `/api/process-excellence/metrics` | GET | Get metrics |
| `/api/process-excellence/audits` | GET | List audits |
| `/api/process-excellence/audits` | POST | Create audit |

### Grievance API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/grievance/categories` | GET | List categories |
| `/api/grievance/tickets` | GET | List tickets |
| `/api/grievance/tickets` | POST | Create ticket |
| `/api/grievance/tickets/[id]` | GET | Get ticket |
| `/api/grievance/tickets/[id]/assign` | POST | Assign ticket |
| `/api/grievance/tickets/[id]/resolve` | POST | Resolve ticket |
| `/api/grievance/tickets/[id]/status` | PATCH | Update status |
| `/api/grievance/tickets/[id]/comments` | GET | Get comments |
| `/api/grievance/tickets/[id]/comments` | POST | Add comment |
| `/api/grievance/tickets/[id]/rate` | POST | Rate satisfaction |
| `/api/grievance/sla-report` | GET | Get SLA report |

---

## 12. Testing Requirements

### Unit Tests (per module)

- Service class methods
- Validation schemas
- Utility functions

### Integration Tests

- API endpoint responses
- Database operations with RLS
- Cross-module integrations

### E2E Tests

- NPS survey flow (create → collect → analyze)
- Grievance ticket lifecycle
- Parent login and dashboard access
- Process tracking end-to-end

### Performance Tests

- NPS analytics with 10,000+ responses
- Grievance list with 5,000+ tickets
- Process metrics with 50,000+ instances

---

## 13. Performance Considerations

### Indexing Strategy

All foreign keys and frequently filtered columns are indexed.

### Pagination

All list endpoints support `page` and `pageSize` parameters.

### Caching

- Use React Query's built-in caching
- Consider Redis for analytics aggregations

### Materialized Views

- `nps_analytics` - Recalculated on response submission
- `billing_copq_summary` - Updated daily via cron

---

## 14. Security Requirements

### RLS Policies

All tables have RLS enabled with institution-scoped access.

### Input Validation

All inputs validated with Zod schemas.

### Authentication

All endpoints require authentication via Supabase Auth.

### Authorization

Permission checks via `usePermissions()` hook.

### Audit Trail

All mutations logged to `_audit_log` table.

---

*Specification Version: 1.0*
*Created: 2026-02-01*
*For: Claude Code Autonomous Implementation*
