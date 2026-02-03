# JKKN Assistant - Full Specification

> **Status:** Ready for Implementation
> **Interview Date:** 2026-02-02
> **Target Users:** 40 Management Users
> **Timeline:** ASAP (Production)

---

## 1. Executive Summary

JKKN Assistant is an agentic AI system for JKKN institution management that provides:
- **Multi-step analysis** with root cause investigation
- **Daily morning briefings** with predictions
- **Cross-entity comparisons** with rankings
- **One-click actions** from insights
- **Conversation memory** with permanent history

### Key Differentiator
This is NOT a simple Q&A bot. It's a **strategic intelligence system** that:
1. Analyzes before answering
2. Predicts before problems occur
3. Acts on insights with one click
4. Learns from feedback

---

## 2. Users & Access Model

### 2.1 User Tiers

| Tier | Roles | Count | Data Scope |
|------|-------|-------|------------|
| **Tier 1** | Director, Chairman | 2-3 | All institutions, all data |
| **Tier 2** | Principals | 6-8 | Own college only |
| **Tier 3** | VPs, Department Heads, Finance, Admission, HR | ~30 | Own department/function |

### 2.2 Existing Infrastructure
- Roles and institution assignments **already exist** in MyJKKN
- Leverage existing `institution_id` and role-based filtering
- AI inherits user's permission scope automatically

### 2.3 Privacy Model
- Director can view **all** user conversations
- Conversations are private to user otherwise
- Full audit trail on all AI interactions

---

## 3. Core Capabilities

### 3.1 Multi-Step Agentic Analysis

**Example Query:** "Why is Engineering attendance dropping?"

**Agent Workflow:**
```
Step 1: Checking attendance data for Engineering...
Step 2: Analyzing trends over past 30 days...
Step 3: Comparing with other colleges...
Step 4: Identifying affected sections...
Step 5: Cross-referencing with faculty/subject...
Step 6: Checking for external factors (holidays, events)...
Step 7: Generating root cause hypothesis...
Step 8: Preparing recommendations...
```

**Output:**
- Executive summary (2-3 sentences)
- Data visualization (trend chart)
- Root cause hypothesis with evidence
- Recommended actions with one-click buttons

### 3.2 Conversation Memory

| Feature | Specification |
|---------|---------------|
| Storage | Permanent history (never deleted) |
| Context | Show context used in follow-up queries |
| Search | Full-text search across conversation history |
| Export | Exportable for audit purposes |

### 3.3 Cross-Entity Comparison

**Example:** "Compare all colleges on fee collection"

**Output:**
- Ranked table of all colleges
- Performance vs target for each
- Performance vs same period last year
- Performance vs peer average
- Anomalies highlighted
- Drill-down available per college

### 3.4 Predictive Concerns

| Prediction Type | Trigger |
|-----------------|---------|
| Attendance trajectory | "Section X will fall below 75% by [date]" |
| Fee collection risk | "₹X lakhs may be uncollected by deadline" |
| Admission shortfall | "Program Y on track to miss target by 15%" |
| Staff burnout | "Faculty Z has 30% above average workload" |

### 3.5 One-Click Actions

| Action | Description |
|--------|-------------|
| **Send notifications** | In-app notification to relevant staff/faculty |
| **Generate reports** | PDF report from analysis for sharing |
| **Schedule meetings** | Create calendar invite with relevant people |
| **Create follow-up tasks** | Add items to someone's task list |

---

## 4. Daily Morning Briefing

### 4.1 Delivery
- **Time:** 6:00 AM daily
- **Channel:** In-app notification
- **Scope:** Role-specific (Tier 1/2/3 see different content)

### 4.2 Content Structure

```markdown
## Good Morning, [Name]

### Today's Snapshot (Yesterday's Metrics)
- Overall attendance: 84.2% (↑2% from last week)
- Fee collection: ₹X lakhs (Y% of monthly target)
- New admissions: Z enquiries, W conversions

### Performance vs Targets
| Metric | Actual | Target | Status |
|--------|--------|--------|--------|
| Attendance | 84.2% | 85% | ⚠️ Slightly below |
| Collection | 72% | 80% | 🔴 Needs attention |
| Admissions | 45 | 50 | ✅ On track |

### Anomalies Detected
- 🔴 B.Tech CS Sem 4 attendance dropped to 62% (was 78% last week)
- ⚠️ 3 sections have > 10% increase in absenteeism

### Predicted Concerns
- If current trend continues, Nursing Sem 2 will fall below 75% by Feb 15
- ₹8.4L at risk of non-collection based on payment patterns

### Recommended Actions
[View Details] [Dismiss] [Remind Tomorrow]
```

### 4.3 Briefing Generation
- Run at 4:00-5:00 AM (background job)
- Ready for delivery by 6:00 AM
- Retry on failure, alert admin if briefing cannot be generated

---

## 5. Technical Architecture

### 5.1 Model Strategy (Hybrid)

| Query Type | Model | Latency | Cost |
|------------|-------|---------|------|
| Simple data lookup | No AI (direct DB) | <1s | $0 |
| Summarization | Kimi K2.5 / Gemini Flash | 2-5s | $0.001 |
| Complex analysis | Claude Sonnet | 10-30s | $0.02 |
| Deep investigation | Claude Opus | 1-5min | $0.10 |

### 5.2 Response Time Requirements

| Query Complexity | Max Time | UX |
|------------------|----------|-----|
| Simple | 5 seconds | Inline response |
| Medium | 30 seconds | Progress indicator |
| Complex | 5 minutes | Async with notification |

### 5.3 Progress Updates

For queries > 10 seconds, show step-by-step updates:
```
🔄 Checking attendance data...
🔄 Analyzing trends over 30 days...
🔄 Comparing with peer colleges...
✓ Analysis complete. Generating insights...
```

### 5.4 Uncertainty Handling

When data is incomplete or uncertain:
```
"I found attendance data but fee data is incomplete for Nursing college.
Should I proceed with partial data, or would you like me to flag this
for admin to investigate?"

[Proceed with available data] [Flag for admin] [Skip this analysis]
```

---

## 6. Data & Benchmarking

### 6.1 Data Sources

| Module | Data Available | Historical Depth |
|--------|----------------|------------------|
| Attendance | Daily records, period-wise | 1+ years |
| Billing/Fees | Bills, payments, collections | 1+ years |
| Admissions | Pipeline, conversions | 1+ years |
| Academic | Grades, assessments | 1+ years |
| Staff | Workload, assignments | Varies |

### 6.2 Triple Benchmark System

Every metric compared against:
1. **Target** — Management-set goals
2. **Historical** — Same period last year
3. **Peer** — Average of similar entities

### 6.3 Alert Thresholds (Configurable)

| Metric | Default Threshold | Configurable By |
|--------|-------------------|-----------------|
| Attendance minimum | 75% | Admin only |
| Collection target % | 80% by mid-month | Admin only |
| Admission pipeline health | 20% conversion | Admin only |
| Workload deviation | ±20% from average | Admin only |

---

## 7. User Interface

### 7.1 Placement
- Existing AI Assistant section (enhance, don't replace)
- Both desktop and mobile optimized

### 7.2 Suggested Prompts (Onboarding)

| Category | Suggested Prompts |
|----------|-------------------|
| Overview | "How is [my college/the institution] performing this week?" |
| Attendance | "Which sections have attendance concerns?" |
| Fees | "What's the fee collection status vs target?" |
| Comparison | "Compare all colleges on attendance" |
| Investigation | "Why is [X] happening?" |
| Prediction | "What issues should I watch for this month?" |

### 7.3 Response Elements

Each AI response includes:
- Answer (text + visualizations)
- [Show Sources] button (reveals data accessed)
- [👍] [👎] feedback buttons
- Action buttons (if applicable)
- "Ask follow-up" prompt

### 7.4 Fallback

When AI unavailable:
```
"JKKN Assistant is temporarily unavailable.
[View Dashboards] for current data."
```

---

## 8. Audit & Compliance

### 8.1 Full Audit Trail

Every interaction logs:
- Timestamp
- User ID and role
- Query text
- Data tables accessed
- Reasoning steps taken
- Response generated
- User feedback (if any)
- Actions triggered (if any)

### 8.2 Retention
- All logs retained permanently
- Exportable for compliance audits

---

## 9. Feedback & Learning

### 9.1 User Feedback

Each response shows:
- 👍 👎 (thumbs up/down)
- ⭐ (star rating 1-5)
- 🚩 (flag as wrong)
- 💬 (add comment)

### 9.2 Learning Loop

1. User flags response as wrong
2. Admin receives notification
3. Admin reviews and categorizes error
4. System prompt/tool improved
5. Weekly review of feedback patterns

---

## 10. Cost Management

### 10.1 Tracking

| Metric | Tracked | Visible To |
|--------|---------|------------|
| Total API cost | Per day/week/month | Admin, Director |
| Cost per user | Per user breakdown | Admin |
| Cost per query type | Simple/Medium/Complex | Admin |
| Budget alerts | When threshold exceeded | Admin |

### 10.2 Expected Costs (40 users)

| Scenario | Monthly Queries | Estimated Cost |
|----------|-----------------|----------------|
| Conservative | 1,200 | $50-80 |
| Moderate | 2,000 | $80-120 |
| Heavy | 4,000 | $150-200 |

---

## 11. Naming & Branding

- **Name:** JKKN Assistant
- **Personality:** Professional, concise, data-driven
- **Tone:** Formal English (responds in user's language if asked differently)
- **Terminology:** JKKN standards (learners, learning facilitators, etc.)

---

## 12. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Adoption** | 80% of 40 users active weekly | Usage logs |
| **Time saved** | Reports that took hours → minutes | User survey |
| **Better outcomes** | Improvement in flagged metrics | Before/after comparison |
| **Satisfaction** | >4/5 average rating | Feedback ratings |

---

## 13. Risk Mitigation

### 13.1 Primary Risk: Wrong Information

**Mitigations:**
1. Show sources on request
2. Automatic context checking (holidays, events, data freshness)
3. Ask for clarification when uncertain
4. User feedback loop to flag errors
5. Admin review queue for flagged responses
6. Weekly error pattern analysis

### 13.2 High Tolerance Policy
- Occasional false alarms acceptable
- System will be tuned over time based on feedback
- Users understand this is a learning system

---

## 14. Implementation Phases

### Phase 1: Core Agentic Upgrade (Week 1)
- Add planning loop to existing AI Query API
- Add conversation persistence
- Add step-by-step progress updates
- Add management system prompts

### Phase 2: Daily Briefing (Week 2)
- Build briefing generation job
- Add role-scoped content
- Add in-app notification system
- Add prediction algorithms

### Phase 3: Actions & Feedback (Week 3)
- Add one-click action buttons
- Add feedback UI (thumbs, stars, flag, comment)
- Add cost tracking dashboard
- Add audit log viewer

### Phase 4: Polish & Scale (Week 4)
- Mobile optimization
- Suggested prompts UI
- Admin configuration panel
- User testing and iteration

---

## 15. Dependencies

| Dependency | Status |
|------------|--------|
| Existing AI Query API | ✅ Exists |
| 30+ Supabase tools | ✅ Exists |
| Claude API integration | ✅ Exists |
| User roles & scopes | ✅ Exists |
| In-app notification system | ⚠️ May need enhancement |
| PDF report generation | ⚠️ May need addition |
| Meeting scheduling | ⚠️ May need addition |
| Task creation | ⚠️ May need addition |

---

## 16. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Model choice | Hybrid (Claude for complex, cheaper for simple) |
| Alert channel | In-app notification |
| Privacy model | Director sees all, others see own |
| Benchmarks | Triple: target + historical + peer |
| Error tolerance | High (tune over time) |
| Language | User's choice (multilingual) |

---

*Specification complete. Ready for implementation.*
