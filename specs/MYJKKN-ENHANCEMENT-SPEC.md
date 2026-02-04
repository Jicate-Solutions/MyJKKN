# MyJKKN Enhancement Specification

> **Status:** Ready for Implementation
> **Created:** 2026-02-04
> **Based On:** Deep Research (Enrollify Gap Analysis), TQM Specs, AI Assistant Specs, Solutions Hub Merger
> **Total Effort Estimate:** 12-16 weeks

---

## Executive Summary

This specification consolidates findings from:
1. **Enrollify Gap Analysis** - CRM features for admission module
2. **TQM Excellence Specs** - NPS, Process Excellence, Grievance, Maturity Assessment
3. **JKKN Assistant Specs** - Agentic AI upgrade with daily briefings
4. **Solutions Hub Merger** - Complete integration of consulting/training

### Key Finding

**MyJKKN is 90%+ complete at the data layer for CRM features.** The gaps are:
- UI for existing configuration tables
- Background job execution for campaigns
- AI-powered features (scoring, response generation, chatbot)
- TQM modules (new functionality)

---

## Territory Analysis

### T1: True Goal

**Problem:** JKKN needs a unified platform that:
1. Converts more admission leads with less manual effort
2. Enables data-driven institutional management
3. Provides AI-powered insights for decision-making
4. Consolidates scattered systems (Solutions Hub, Enrollify concept) into one ERP

**Why This Matters:**
- Admission counselors spend 60%+ time on manual follow-up
- Management lacks real-time visibility into enrollment health
- No predictive analytics to anticipate problems
- Multiple systems require duplicate data entry

**Success Vision (6 months):**
- 20% improvement in lead conversion rate
- Real-time enrollment dashboards for all 9 institutions
- AI assistant answering 80% of management queries
- Single source of truth for all institutional data

---

### T2: Who & When

**Primary Users:**

| Role | Count | Usage Frequency | Primary Need |
|------|-------|-----------------|--------------|
| Admission Counselors | ~50 | Daily, 8+ hours | Lead management, follow-up automation |
| Admission Managers | ~9 | Daily, 4+ hours | Team performance, funnel analytics |
| Principals | 6-8 | Daily, 1-2 hours | Institution metrics, AI insights |
| Director/Chairman | 2-3 | Daily, 30 min | Cross-institution dashboard |
| Department HODs | ~30 | Weekly | Department-specific metrics |
| Builders/Talent | ~100 | As assigned | Portal for assignments, earnings |
| External Clients | ~20 | Monthly | Project status, deliverables |

**Usage Triggers:**
- Morning: Check daily briefing, priority lead queue
- Throughout day: Follow-up with leads, log activities
- End of day: Update progress, review AI recommendations
- Weekly: Team performance review, pipeline health check
- Monthly: Enrollment reports, management reviews

---

### T3: Current State

**Existing Infrastructure (What Works):**
- ✅ Multi-tenant architecture (9 institutions)
- ✅ Comprehensive RBAC with 15+ roles
- ✅ Supabase database with 180+ tables
- ✅ 368 pages across 20+ modules
- ✅ WhatsApp/SMS infrastructure (stubs ready)
- ✅ HDFC payment gateway (production)
- ✅ Basic AI query service (Claude API)
- ✅ Admission CRM tables (90% complete)

**What's Missing/Broken:**
- ❌ No UI for scoring rules, assignment rules, templates, workflows
- ❌ No drip campaign execution engine
- ❌ No predictive lead scoring
- ❌ No AI response generation
- ❌ No daily briefing system
- ❌ Solutions Hub portals incomplete
- ❌ TQM modules not started

**Current Workarounds:**
- Manual lead assignment (no auto-rules)
- Manual follow-up scheduling
- Spreadsheets for campaign tracking
- WhatsApp manual messaging

---

### T4: Happy Path

**Admission Counselor Daily Flow:**
```
1. Login → See personalized dashboard with:
   - AI-prioritized lead queue (highest conversion probability first)
   - Today's follow-up tasks
   - AI insights ("5 leads need urgent contact")

2. For each lead:
   - Click → See unified profile with activity timeline
   - AI suggests response → Review, edit, send via WhatsApp
   - Log outcome → System auto-updates score
   - Move to next lead

3. End of day:
   - Review completion metrics
   - Check tomorrow's scheduled campaigns
   - AI summary of day's performance
```

**Admission Manager Daily Flow:**
```
1. Morning → Receive AI daily briefing:
   - Yesterday's metrics vs target
   - Funnel anomalies ("Document stage drop-off up 40%")
   - Predicted concerns ("MBA track will miss target by 15%")

2. Throughout day:
   - Monitor team dashboard
   - Reassign leads as needed
   - Review AI recommendations

3. Weekly:
   - Counselor performance leaderboard
   - Source ROI analysis
   - Campaign effectiveness review
```

**Director Daily Flow:**
```
1. Morning → AI daily briefing (cross-institution):
   - All colleges enrollment status
   - Anomalies requiring attention
   - Predictions and recommendations

2. Ask AI questions:
   - "Why is Engineering attendance dropping?"
   - "Compare all colleges on fee collection"
   - "What issues should I watch this week?"

3. One-click actions from insights:
   - Send notification to relevant staff
   - Generate report for review
   - Schedule meeting
```

---

### T5: Sad Path

**Failure Scenarios & Handling:**

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Lead assigned to wrong counselor | Poor conversion | Manual reassignment + audit log |
| Campaign sends to wrong segment | Bad communication | Require approval for bulk sends |
| AI generates wrong response | Unprofessional message | Human review before send |
| AI score inaccurate | Wasted effort on low-value leads | Confidence display + feedback loop |
| WhatsApp API unavailable | Follow-up delayed | SMS fallback + queue retry |
| Campaign step fails | Incomplete sequence | Retry logic + manual trigger option |

**Error Recovery:**
- All AI responses require human approval before send
- Campaign steps can be manually triggered if automation fails
- Lead assignments can be overridden by managers
- All actions have audit trail for reversal

---

### T6: Recovery

**Undo Capabilities:**

| Action | Recovery Method |
|--------|-----------------|
| Wrong lead status | Edit → Select correct status |
| Wrong assignment | Manager reassigns |
| Bad campaign sent | Cannot unsend (log for tracking) |
| AI mistake | Human corrects, feedback improves model |
| Wrong document approved | Re-verify with admin override |

**Escalation Path:**
1. Counselor → Manager (for lead issues)
2. Manager → Principal (for policy issues)
3. Principal → Director (for cross-institution issues)
4. Technical issues → Admin dashboard → Bug reporter

---

### T7: Edge Cases

**Unusual But Valid Scenarios:**

| Scenario | Handling |
|----------|----------|
| Same lead from 3 channels | Deduplication with merge |
| Lead interested in multiple programs | Track all interests, separate applications |
| Counselor leaves mid-semester | Bulk reassignment tool |
| Lead from competitor institution | Normal processing (no special rules) |
| 500 walk-ins on open day | Bulk capture mode |
| Lead reapplies after rejection | New lead with history link |
| Timezone differences (international leads) | UTC storage, local display |
| Holiday campaigns | Schedule with date checks |

**Bulk Operations:**
- Bulk lead import (CSV)
- Bulk assignment change
- Bulk campaign enrollment
- Bulk status update

---

### T8: Who Can Do What

**Permission Matrix:**

| Action | Counselor | Manager | Principal | Director | Admin |
|--------|-----------|---------|-----------|----------|-------|
| View own leads | ✅ | ✅ | ✅ | ✅ | ✅ |
| View team leads | ❌ | ✅ | ✅ | ✅ | ✅ |
| View all leads | ❌ | ❌ | ✅ | ✅ | ✅ |
| Assign leads | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create campaigns | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve campaigns | ❌ | ✅ | ✅ | ✅ | ✅ |
| Configure scoring rules | ❌ | ❌ | ❌ | ✅ | ✅ |
| Configure assignment rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| View AI conversations | Own | Team | Institution | All | All |
| Access group dashboard | ❌ | ❌ | ❌ | ✅ | ✅ |

**Approval Workflows:**
- Campaign activation: Manager approval required
- Bulk operations: Manager approval required
- Template changes: Admin approval required
- Scoring rule changes: Director approval required

---

### T9: What They See

**Counselor Dashboard:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Good Morning, [Name]                         [AI Score: 85%]   │
├─────────────────────────────────────────────────────────────────┤
│  Today's Priority Leads (AI-sorted)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔴 Priya S. (92%) - B.Tech CS - Last contact: 3 days   │   │
│  │ 🟡 Rahul K. (78%) - MBA - Documents pending            │   │
│  │ 🟢 Anita M. (65%) - Nursing - New inquiry              │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  AI Insights                                                     │
│  ⚠️ 5 leads haven't been contacted in 5+ days                  │
│  💡 Best time to contact Chennai leads: 11 AM                   │
├─────────────────────────────────────────────────────────────────┤
│  My Performance                                                  │
│  Leads: 45  |  Converted: 12 (27%)  |  Response Time: 2.5 hrs   │
└─────────────────────────────────────────────────────────────────┘
```

**Manager Dashboard:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Team Performance - [Institution]                               │
├─────────────────────────────────────────────────────────────────┤
│  Funnel Health                                                   │
│  New → Contacted → Interested → Applied → Enrolled              │
│  [====100====] [===75===] [==50==] [=30=] [15]                  │
├─────────────────────────────────────────────────────────────────┤
│  Team Leaderboard                                               │
│  1. Counselor A - 28% conversion                                │
│  2. Counselor B - 24% conversion                                │
│  3. Counselor C - 21% conversion                                │
├─────────────────────────────────────────────────────────────────┤
│  AI Alerts                                                       │
│  🔴 Document stage drop-off increased 40% this week             │
│  ⚠️ MBA track may miss target by 15%                            │
└─────────────────────────────────────────────────────────────────┘
```

**Director Dashboard:**
```
┌─────────────────────────────────────────────────────────────────┐
│  JKKN Group - Real-Time Enrollment                              │
├─────────────────────────────────────────────────────────────────┤
│  Institution          | Target | Actual | %    | Trend         │
│  Engineering          | 1200   | 890    | 74%  | ↑ On track    │
│  Arts & Science       | 800    | 620    | 78%  | ↑ Ahead       │
│  Nursing              | 400    | 280    | 70%  | ↓ Needs attn  │
│  Pharmacy             | 300    | 245    | 82%  | ↑ Ahead       │
├─────────────────────────────────────────────────────────────────┤
│  AI Daily Briefing                                              │
│  ✅ Overall enrollment on track (75% of target)                 │
│  ⚠️ Nursing college needs attention (70%, down from 76%)        │
│  💡 Recommendation: Add counselor capacity to Nursing           │
├─────────────────────────────────────────────────────────────────┤
│  [Ask AI] "Why is Nursing enrollment lagging?"                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### T10: Connections

**Internal Integrations:**

| System | Integration Type | Purpose |
|--------|------------------|---------|
| MyJKKN Learners | Write | Lead → Learner on enrollment |
| MyJKKN Billing | Read | Check payment status |
| MyJKKN Documents | Read/Write | Document verification |
| MyJKKN Staff | Read | Counselor assignments |
| MyJKKN Attendance | Read | For AI insights |

**External Integrations:**

| System | Integration Type | Status |
|--------|------------------|--------|
| WhatsApp Business API | Read/Write | Infrastructure ready |
| MSG91/SMS | Write | Infrastructure ready |
| HDFC Payment Gateway | Read/Write | Production |
| Claude API | Read/Write | Production |
| Google Calendar | Write | For meeting scheduling |

**Event Propagation:**
- Lead status change → Update AI score
- Lead enrolled → Create Learner in MyJKKN
- Payment received → Update lead payment status
- Campaign step executed → Log activity

---

### T11: Success

**Success Metrics:**

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Lead response time | 24+ hours | <2 hours | Activity timestamp |
| Conversion rate | ~15% | 20%+ | Enrolled/Total leads |
| Counselor productivity | 20 leads/day | 40 leads/day | Actions logged |
| AI adoption | 0% | 80% using daily | Login + query logs |
| Campaign automation | 0% | 70% automated | Auto vs manual sends |
| Management visibility | Delayed | Real-time | Dashboard usage |

**Verification Criteria:**

| Feature | Verification |
|---------|--------------|
| Scoring rules work | Score updates when rule triggers |
| Assignment rules work | New lead auto-assigned correctly |
| Campaigns execute | Steps fire on schedule |
| AI scoring accurate | 70%+ match actual conversion |
| Daily briefing sends | Received by 6 AM daily |
| Dashboards load | <2 seconds |

---

## Feature Categories

### Category A: Admission CRM Activation (Priority 0)

**Already exists in database, needs UI:**

| Feature | Table Exists | UI Status | Effort |
|---------|--------------|-----------|--------|
| Lead Scoring Rules | `admission_scoring_rules` | Missing | 1 week |
| Assignment Rules | `admission_assignment_rules` | Missing | 1 week |
| Communication Templates | `admission_communication_templates` | Missing | 1 week |
| Workflow Configuration | `admission_workflows` | Missing | 1 week |
| Activity Timeline | `admission_lead_activities` | Partial | 3 days |

### Category B: Campaign Execution Engine (Priority 1)

**Schema exists, execution missing:**

| Feature | Status | Effort |
|---------|--------|--------|
| Background job processor | Not implemented | 1 week |
| Drip sequence executor | Not implemented | 1 week |
| WhatsApp message integration | Stub exists | 3 days |
| SMS integration | Stub exists | 2 days |
| Retry logic | Not implemented | 2 days |

### Category C: AI Features (Priority 1)

| Feature | Status | Effort |
|---------|--------|--------|
| AI lead scoring (rule-based) | Not implemented | 1 week |
| AI lead scoring (ML) | Not implemented | 3-4 weeks |
| AI response generation | Not implemented | 2 weeks |
| Daily briefing generation | Not implemented | 2 weeks |
| Agentic query processing | Basic exists | 2 weeks |

### Category D: Solutions Hub Completion (Priority 1)

| Feature | Status | Effort |
|---------|--------|--------|
| Builder portal | Partial | 1 week |
| Cohort portal | Partial | 1 week |
| Production portal | Partial | 1 week |
| Client portal | Partial | 1 week |
| Earnings dashboard | Missing | 1 week |

### Category E: TQM Modules (Priority 2)

| Feature | Status | Effort |
|---------|--------|--------|
| Stakeholder NPS | Not started | 2 weeks |
| Process Excellence | Not started | 2 weeks |
| Grievance Management | Not started | 2 weeks |
| Maturity Assessment | Not started | 2 weeks |
| OKR Extension | Partial | 1 week |
| COPQ Tracking | Not started | 1 week |

---

## Implementation Roadmap

### Phase 1: CRM Activation (Weeks 1-2)

```
Week 1:
├── Day 1-2: /admission/crm/scoring-rules page
│   ├── List scoring rules with enable/disable
│   ├── Create/edit rule form
│   └── Test score calculation
├── Day 3-4: /admission/crm/assignment-rules page
│   ├── List assignment rules with priority
│   ├── Create/edit rule form
│   └── Test auto-assignment
└── Day 5: Integration testing

Week 2:
├── Day 1-2: /admission/crm/templates page
│   ├── List templates by channel (WhatsApp/SMS/Email)
│   ├── Template editor with merge fields
│   └── Preview functionality
├── Day 3-4: /admission/crm/workflows page
│   ├── Workflow builder UI
│   ├── Step configuration
│   └── Test workflow creation
└── Day 5: End-to-end testing
```

**Deliverables:**
- 4 new config pages under `/admission/crm/`
- All existing tables accessible via UI
- Rules can be created and tested

### Phase 2: Campaign Execution (Weeks 3-4)

```
Week 3:
├── Day 1-3: Supabase Edge Function for job processing
│   ├── Workflow step processor
│   ├── Delay handling (cron-based)
│   └── Execution logging
├── Day 4-5: WhatsApp/SMS integration
│   ├── Connect to existing infrastructure
│   └── Template-based sending

Week 4:
├── Day 1-2: Campaign enrollment/exit logic
├── Day 3-4: Campaign monitoring dashboard
└── Day 5: Full campaign flow testing
```

**Deliverables:**
- Drip campaigns execute automatically
- Campaign progress visible in UI
- WhatsApp/SMS messages send on schedule

### Phase 3: AI Features (Weeks 5-8)

```
Week 5:
├── Day 1-3: Rule-based lead scoring
│   ├── Score calculation on lead events
│   ├── Factor breakdown display
│   └── Score badge on lead cards
├── Day 4-5: AI insights dashboard

Week 6:
├── Day 1-3: AI response generation
│   ├── Claude API integration
│   ├── Context building (lead history)
│   └── Response suggestion UI
├── Day 4-5: Counselor feedback loop

Week 7:
├── Day 1-3: Daily briefing generation
│   ├── Briefing template system
│   ├── Role-based content
│   └── Scheduled generation (4-5 AM)
├── Day 4-5: Briefing delivery via notifications

Week 8:
├── Day 1-3: Agentic query upgrade
│   ├── Multi-step planning loop
│   ├── Progress display
│   └── One-click actions from insights
├── Day 4-5: End-to-end AI testing
```

**Deliverables:**
- Lead scores visible on all lead views
- AI response suggestions for counselors
- Daily briefing at 6 AM
- Enhanced AI assistant with agentic capabilities

### Phase 4: Solutions Hub Completion (Weeks 9-10)

```
Week 9:
├── Day 1-2: Complete /talent/builder portal
├── Day 3-4: Complete /talent/cohort portal
└── Day 5: Complete /talent/production portal

Week 10:
├── Day 1-2: Complete /portal/client portal
├── Day 3-4: Earnings & payments dashboards
└── Day 5: Portal testing across all roles
```

**Deliverables:**
- All 4 portals fully functional
- Role-appropriate access enforced
- Earnings visible to all talent types

### Phase 5: TQM Modules (Weeks 11-16)

```
Week 11-12: Stakeholder NPS
├── Survey configuration
├── Automated distribution
├── NPS calculation & trends
└── Action planning from feedback

Week 13-14: Process Excellence + Grievance
├── Process documentation
├── Improvement tracking
├── Grievance submission & resolution
└── Escalation workflows

Week 15-16: Maturity Assessment + OKR
├── Assessment questionnaires
├── Maturity scoring
├── OKR A/B/C/D matrix
└── COPQ tracking
```

**Deliverables:**
- Full TQM suite as per specs
- Integration with existing OKR module
- Stakeholder feedback loop complete

---

## Database Changes Required

### Schema Additions

```sql
-- AI scoring enhancement
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS ai_score NUMERIC(5,2);
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS ai_score_factors JSONB DEFAULT '{}';
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS ai_score_updated_at TIMESTAMPTZ;
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS preferred_contact_time TEXT;
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT;

-- Campaign execution tracking
CREATE TABLE IF NOT EXISTS admission_workflow_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES admission_workflow_executions(id),
  step_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'failed', 'skipped')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily briefing storage
CREATE TABLE IF NOT EXISTS ai_daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  UNIQUE(user_id, briefing_date)
);

-- AI conversation persistence
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Success Criteria

### Phase 1 Success (CRM Activation)
- [ ] Scoring rules configurable via UI
- [ ] Assignment rules auto-assign new leads
- [ ] Templates editable with preview
- [ ] Workflows configurable with visual builder

### Phase 2 Success (Campaign Execution)
- [ ] Campaign completion rate > 80%
- [ ] Message delivery rate > 95%
- [ ] Retry logic handles failures
- [ ] Campaign progress visible in dashboard

### Phase 3 Success (AI Features)
- [ ] AI score accuracy > 70% vs actual conversion
- [ ] Response adoption rate > 50%
- [ ] Daily briefing delivered by 6 AM
- [ ] AI queries show step-by-step progress

### Phase 4 Success (Solutions Hub)
- [ ] All 4 portals accessible by respective roles
- [ ] Earnings visible and accurate
- [ ] Client portal shows only their data

### Phase 5 Success (TQM)
- [ ] NPS surveys distributed automatically
- [ ] Grievances trackable through resolution
- [ ] Maturity assessment completed for all institutions

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI model inaccuracy | Medium | Medium | Start with rule-based, iterate |
| Campaign delivery failures | Medium | High | Queue + retry + fallback |
| Performance impact | Low | Medium | Edge functions for heavy lifting |
| User adoption resistance | Medium | High | Training + gradual rollout |
| Integration complexity | Medium | Medium | Feature flags for staged release |

---

## References

| Document | Location |
|----------|----------|
| Enrollify SPECS.md | `/Users/omm/PROJECTS/enrollify/SPECS.md` |
| TQM Excellence SPECS.md | `/Users/omm/PROJECTS/MyJKKN/docs/MyJKKN-TQM-Specs/SPECS.md` |
| JKKN Assistant SPECS.md | `/Users/omm/PROJECTS/MyJKKN/docs/ai-assistant/SPECS.md` |
| Solutions Hub Merger | `/Users/omm/PROJECTS/MyJKKN/specs/SOLUTIONS-HUB-MERGER-SPEC.md` |
| Gap Analysis Reports | `~/.claude/skills/deep-research/reports/enrollify-myjkkn-gap/20260204-100308/` |

---

*Specification Version: 1.0*
*Created: 2026-02-04*
*Based on: Deep Research + Existing Specs Synthesis*
