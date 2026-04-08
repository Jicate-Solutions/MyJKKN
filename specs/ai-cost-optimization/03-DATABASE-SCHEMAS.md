# AI Cost Optimization — Database Schemas

## Tables Involved in AI Features

These are the database tables that AI services read from and write to. The migration does NOT change any table schemas — it only changes which AI model processes the data.

---

### 1. `admission_ai_insights`

**Used by**: AI Insights Service → `/api/admission/insights/generate`
**Operation**: AI generates insights → upserted to this table

```sql
CREATE TABLE admission_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  insight_type TEXT NOT NULL,
  -- insight_type values: follow_up_reminder, conversion_opportunity,
  --   engagement_alert, trend_insight, anomaly_detection,
  --   recommendation, performance_insight
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  -- severity values: critical, high, medium, low
  data JSONB DEFAULT '{}',
  -- data stores: action_url, action_data, related_lead_ids,
  --   related_counselor_ids, metric_value, metric_change,
  --   metric_label, metadata
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Migration impact**: None. AI generates the same JSON structure regardless of model.

---

### 2. `wp_pulse_entries`

**Used by**: Work Pulse Translation + Analysis
**Operation**: AI reads entries, translates Tamil fields, analyzes patterns

```sql
CREATE TABLE wp_pulse_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  institution_id UUID REFERENCES institutions(id),
  department_id UUID,
  role TEXT,
  week_of DATE NOT NULL,
  talent_waste_category TEXT,
  talent_waste_description TEXT,
  talent_waste_description_en TEXT,     -- ← AI writes translated text here
  repetition_category TEXT,
  repetition_description TEXT,
  repetition_description_en TEXT,       -- ← AI writes translated text here
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Migration impact**: The `_en` columns will be populated by Google Translate instead of Claude. Same column, different source.

---

### 3. `wp_patterns`

**Used by**: Work Pulse Analysis
**Operation**: AI discovers patterns from pulse entries → upserted here

```sql
CREATE TABLE wp_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  source wp_pattern_source,              -- enum: pulse, activity, interview, manual
  people_affected INTEGER DEFAULT 0,
  roles_affected TEXT[] DEFAULT '{}',
  departments_affected TEXT[] DEFAULT '{}',
  hours_wasted_weekly NUMERIC(10,2) DEFAULT 0,
  feasibility_score NUMERIC(3,2) DEFAULT 0,
  solution_type wp_solution_type,        -- enum: automation, process, tool, training, policy
  impact_score NUMERIC(10,2) DEFAULT 0,
  tier wp_pattern_tier,                  -- enum: S (100+), A (50-99), B (20-49), C (<20)
  status wp_pattern_status,              -- enum: discovered, validating, confirmed, in_progress, resolved, dismissed
  jicate_product_candidate BOOLEAN DEFAULT false,
  first_detected_at TIMESTAMPTZ DEFAULT now(),
  last_analysis_at TIMESTAMPTZ,
  analysis_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Migration impact**: None. The JSON structure AI produces is parsed by the route handler — same structure expected from Gemma 4.

---

### 4. `wp_micro_interviews`

**Used by**: Work Pulse Analysis (contextual follow-up)
**Operation**: READ only — AI reads interview responses as context for analysis

```sql
CREATE TABLE wp_micro_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES wp_patterns(id),
  user_id UUID REFERENCES auth.users(id),
  question_text TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  selected_option TEXT,
  free_text TEXT,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 5. `wp_agent_impact`

**Used by**: Work Pulse post-deployment measurement
**Operation**: READ only — contextual data for AI analysis

```sql
CREATE TABLE wp_agent_impact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES wp_patterns(id),
  agent_name TEXT NOT NULL,
  solution_type wp_solution_type,
  deployed_at TIMESTAMPTZ,
  pre_hours_weekly NUMERIC(10,2),
  post_hours_weekly NUMERIC(10,2),
  hours_saved_weekly NUMERIC(10,2) GENERATED ALWAYS AS (pre_hours_weekly - post_hours_weekly) STORED,
  people_using INTEGER DEFAULT 0,
  is_jicate_product BOOLEAN DEFAULT false,
  last_measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 6. `admission_query_history` (MISSING — needs migration)

**Used by**: Agentic Query Service
**Operation**: WRITE query history, READ for context
**Status**: Referenced in code but table does NOT exist in database

```sql
-- NEEDS TO BE CREATED — migration required before Phase 5
CREATE TABLE admission_query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  institution_id UUID REFERENCES institutions(id),
  query TEXT NOT NULL,
  result JSONB DEFAULT '{}',
  model_used TEXT,                       -- ← NEW: track which model processed this
  tokens_used INTEGER,                   -- ← NEW: track token consumption
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE admission_query_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own query history"
  ON admission_query_history FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own queries"
  ON admission_query_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Migration impact**: This table should be created BEFORE Phase 5. Added `model_used` and `tokens_used` columns to track the cost optimization impact.

---

### 7. `user_activity_logs` (READ only)

**Used by**: Work Pulse Analysis — reads behavioral signals
**Operation**: READ only — no writes from AI services

```
Existing table, no changes needed. AI reads activity data
as context for pattern analysis.
```

---

## Tables NOT Affected

These admission tables are READ by AI services for context but don't store AI output:

- `admission_leads` (78 columns) — lead data fed to AI for analysis
- `admission_counselors` — counselor context for response generation
- `admission_communication_templates` — template context
- `profiles` — user context for AI queries

No schema changes needed for any of these.

---

## New Table for Caching (Phase 6, Optional)

If server-side caching is implemented via database instead of in-memory:

```sql
-- OPTIONAL: Only if in-memory cache is insufficient
CREATE TABLE ai_response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,        -- hash of prompt + model
  response JSONB NOT NULL,
  model_used TEXT NOT NULL,
  tokens_used INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_cache_key ON ai_response_cache(cache_key);
CREATE INDEX idx_ai_cache_expires ON ai_response_cache(expires_at);
```

**Recommendation**: Start with in-memory cache (Map with TTL). Move to DB-backed cache only if the app restarts frequently or runs multiple instances.

---

*Generated: 2026-04-07 | Source: Live codebase analysis*
