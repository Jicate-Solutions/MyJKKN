# Architectural Decision Record: Fink's Taxonomy over Bloom's for MyJKKN

**Decision Date:** 2026-02-02
**Status:** Accepted
**Deciders:** MyJKKN Architecture Team, Workshop Alignment Task Force
**Related Documents:**
- [FST Analysis: Bloom's vs Fink's Taxonomy](/Users/omm/Vaults/Claude Setup/Capture/FST-Blooms-vs-Finks-Taxonomy.md)
- [Fink's Taxonomy Implementation Guide](./finks-taxonomy-implementation.md)
- [Workshop Alignment Transformation Plan](/Users/omm/.claude-sneakpeek/claudesp/config/plans/transient-Calibrating-lerdorf.md)

---

## Context and Problem Statement

MyJKKN is transitioning from an **input-focused** system (attendance, fees, content delivery) to an **outcome-focused** system (capabilities, employability, lifelong learning).

**The Question:** Which learning taxonomy should guide this transformation?

**The Stakes:**
- This decision affects database schema design for competency catalog
- It determines assessment methodology across all modules
- It shapes how we measure student outcomes and program effectiveness
- It influences facilitator training and parent communication
- **Most critically:** It determines whether our students are prepared to thrive in an AI-dominated world or become obsolete

---

## Decision Drivers

### 1. AI Era Context (2026 Reality)

**What We Know:**
- AI (Claude, ChatGPT, etc.) can perform ALL Bloom's cognitive levels:
  - Remember: Perfect recall
  - Understand: Explains better than most teachers
  - Apply: Transfers knowledge across contexts
  - Analyze: Superhuman pattern recognition
  - Evaluate: Judges quality using vast training data
  - Create: Generates essays, code, art, designs

**Implication:** Traditional Bloom's-based assessments are now AI-fakeable. Students can use AI to ace every cognitive task.

### 2. Workshop Intelligence Report Findings

The Workshop Alignment analysis revealed:
- Current system measures inputs (hours attended) not outcomes (skills gained)
- Employers care about capabilities, not course completion
- Students need adaptability and ethical judgment, not just knowledge recall
- Facilitators need to focus on transformation, not content delivery

### 3. Database Design Requirements

**Competency Catalog Needs:**
- Must define competencies in AI-resistant terms
- Must support evidence-based assessment (not just test scores)
- Must track long-term outcomes (alumni employment, continued learning)
- Must guide course design and facilitator training

### 4. Stakeholder Needs

| Stakeholder | Primary Need | Taxonomy Requirement |
|-------------|--------------|---------------------|
| **Students** | Become employable, adaptable, ethical professionals | Transformation-focused framework |
| **Parents** | See evidence of meaningful learning | Transparent, outcome-based metrics |
| **Employers** | Hire graduates who can think, care, and learn | Skills beyond AI commoditization |
| **Facilitators** | Clear guidance on what and how to teach | Assessment methods that work in AI era |
| **Institution** | Demonstrate program value and ROI | Long-term outcome correlation |

---

## Considered Options

### Option 1: Continue with Bloom's Taxonomy

**Description:** Retain Bloom's as the primary framework for competency design and assessment.

**Pros:**
- ✅ Familiar to all educators (universal language)
- ✅ Clear, concrete, easy to assess
- ✅ Extensive resources and training materials available
- ✅ Well-established in academic standards and accreditation

**Cons:**
- ❌ **AI makes all Bloom's levels commoditized** (students can outsource cognitive tasks to AI)
- ❌ Focuses on WHAT students do, not WHO they become
- ❌ Assessments are AI-fakeable (essays, problem sets, exams)
- ❌ Ignores affective domain (caring, values, ethics)
- ❌ Doesn't measure adaptability or lifelong learning
- ❌ Prepares students to compete with AI (and lose)

**Decision:** ❌ **Rejected** — Insufficient for AI era and outcome-focused transformation

---

### Option 2: Adopt Fink's Taxonomy

**Description:** Use Fink's Taxonomy of Significant Learning as the primary framework, with Bloom's as a supplementary tool for micro-design.

**Pros:**
- ✅ **AI-resistant dimensions** (Human Dimension, Caring, Learning How to Learn can't be faked)
- ✅ Holistic framework (cognitive + affective + metacognitive + social)
- ✅ Transformation-focused (measures WHO students become, not just WHAT they do)
- ✅ Aligns with Workshop goals (outcomes, capabilities, employability)
- ✅ Supports long-term tracking (alumni caring, continued learning)
- ✅ Enables evidence-based assessment (portfolios, reflections, real-world projects)
- ✅ Prepares students to differentiate from AI

**Cons:**
- ⚠️ Less familiar to educators (requires training)
- ⚠️ More complex to assess (caring, metacognition harder to measure than recall)
- ⚠️ Fewer standardized resources available
- ⚠️ Requires more design time and facilitator expertise

**Decision:** ✅ **ACCEPTED** — Despite complexity, this is the only framework that prepares students for the AI era

---

### Option 3: Hybrid Approach (Both Taxonomies)

**Description:** Use Fink's for macro-design (course level, competency catalog) and Bloom's for micro-design (activity level, formative assessment).

**Pros:**
- ✅ Combines precision (Bloom's) with transformation (Fink's)
- ✅ Leverages familiarity of Bloom's while adding Fink's depth
- ✅ Allows granular objectives (Bloom's) within holistic framework (Fink's)

**Cons:**
- ⚠️ Risk of Bloom's dominating due to familiarity (lose Fink's benefits)
- ⚠️ More complex to implement (two frameworks)
- ⚠️ Potential confusion for facilitators

**Decision:** ✅ **ACCEPTED as Implementation Strategy** — Fink's primary, Bloom's supplementary

---

## Decision Outcome

### Chosen Option: **Fink's Taxonomy (Primary) with Bloom's (Supplementary)**

**Rationale:**

1. **AI Era Necessity:** Fink's dimensions (Human Dimension, Caring, Learning How to Learn) are the ONLY aspects of learning that AI cannot replicate. Teaching only Bloom's cognitive levels prepares students to be worse versions of AI.

2. **Workshop Alignment:** Fink's directly supports outcome-focused transformation:
   - **Integration** = Connecting competencies across courses and to real-world contexts
   - **Human Dimension** = Self-awareness as professionals, team collaboration
   - **Caring** = Developing professional ethics and commitment to quality
   - **Learning How to Learn** = Adaptability as industries and AI evolve

3. **Assessment Crisis Solution:** Fink's enables AI-resistant assessments:
   - Portfolios (evidence of personal transformation)
   - Reflective journals (metacognitive process, not just product)
   - Peer teaching (social dimension)
   - Real-world projects with stakeholder feedback (authentic caring)
   - Ethical dilemmas (values, not right answers)

4. **Long-term Outcome Tracking:** Alumni outcomes module can track:
   - Do graduates continue learning? (Learning How to Learn)
   - Do they find their work meaningful? (Caring)
   - Do they integrate knowledge across roles? (Integration)
   - Do they build strong professional relationships? (Human Dimension)

5. **Facilitator Evolution:** Shift from teacher (content delivery) to facilitator (transformation guide):
   - Teach learning strategies, not just content
   - Foster caring and ethical judgment
   - Build self-awareness and collaboration skills
   - Model lifelong learning

---

## Implementation Strategy

### Phase 1: Database Schema (Immediate)

**Competency Catalog Table:**
```sql
CREATE TABLE competency_catalog (
    ...
    finks_dimensions JSONB NOT NULL,
    -- {
    --   "foundational_knowledge": 6,
    --   "application": 9,
    --   "integration": 8,
    --   "human_dimension": 9,
    --   "caring": 7,
    --   "learning_to_learn": 8
    -- }
    ai_resistance_score INTEGER DEFAULT 0,
    -- Computed: (Integration × 15) + (Human_Dimension × 25) + (Caring × 30) +
    --           (Learning_to_Learn × 20) + (Application × 10)
    ...
);
```

**Course-Competency Mapping:**
```sql
CREATE TABLE course_competency_mapping (
    ...
    finks_assessment_methods JSONB,
    -- {
    --   "foundational": "ai_assisted_quiz",
    --   "application": "industry_project",
    --   "integration": "case_study_with_reflection",
    --   "human_dimension": "peer_feedback_360",
    --   "caring": "ethical_dilemma_discussion",
    --   "learning_to_learn": "learning_journal"
    -- }
    ...
);
```

### Phase 2: Assessment Redesign (Months 1-3)

**Old → New Mapping:**

| Old Assessment (Bloom's) | New Assessment (Fink's) | Fink's Dimensions |
|--------------------------|-------------------------|-------------------|
| Take-home essay | Portfolio + live presentation + peer feedback | Integration, Human Dimension, Caring |
| Multiple choice quiz | AI-assisted quiz + "Why this matters" reflection | Foundational, Integration, Learning How to Learn |
| Problem set | Real-world project + decision rationale | Application, Caring, Integration |
| Code assignment | AI-augmented coding + ethical considerations + pair programming | Application, Caring, Human Dimension |

**Guidelines for All Assessments:**
1. ✅ Allow AI use (students MUST learn to work with AI)
2. ✅ Require personal transformation evidence (can't be faked by AI)
3. ✅ Include peer or stakeholder feedback (social dimension)
4. ✅ Demand ethical reasoning (values, not just correctness)
5. ✅ Ask "What did you learn about learning?" (metacognition)

### Phase 3: Facilitator Training (Months 1-6)

**Training Modules:**
1. **Understanding Fink's Taxonomy** (8 hours)
   - What each dimension means
   - Why Fink's matters in AI era
   - How to score competencies on Fink's dimensions

2. **Designing Fink's-Based Assessments** (12 hours)
   - Converting Bloom's assessments to Fink's
   - AI-resistant assessment formats
   - Rubrics for caring, metacognition, integration

3. **Facilitating Transformation (Not Just Teaching)** (16 hours)
   - How to foster caring and values
   - How to build metacognitive skills
   - How to guide integration across courses
   - How to assess personal transformation

4. **Working with AI (Not Against It)** (8 hours)
   - When to let students use AI
   - How to assess AI-augmented work
   - Teaching students to direct AI, not just use it

### Phase 4: Parent Communication (Ongoing)

**Parent Portal Updates:**
- Replace "test scores" with "transformation evidence"
- Show Fink's dimensions in progress reports:
  - "Your child demonstrated caring about code quality"
  - "Evidence of learning how to learn: sought feedback proactively"
  - "Integration: connected database concepts to real-world e-commerce project"
  - "Human dimension: showed leadership in team project"

### Phase 5: Alumni Outcome Tracking (Months 6-12)

**Surveys to Graduates:**
- Do you continue learning in your field? (Learning How to Learn)
- Is your work meaningful to you? (Caring)
- Do you use skills from multiple courses in your role? (Integration)
- How has your professional identity evolved? (Human Dimension)

**Employer Surveys:**
- Does this graduate adapt to new tools/contexts? (Learning How to Learn)
- Do they care about quality and ethics? (Caring)
- Can they connect disparate ideas? (Integration)
- Are they self-aware and collaborative? (Human Dimension)

---

## Consequences

### Positive

1. **Students Prepared for AI Era:** Graduates will have skills AI cannot replicate (caring, ethics, adaptability, relationships)

2. **Assessment Integrity Restored:** Can confidently say "learning happened" because AI can't fake personal transformation

3. **True Outcome-Focus:** Measuring transformation, not just performance

4. **Employer Value Demonstrated:** Alumni tracking will show long-term caring, learning, integration

5. **Facilitator Professionalism:** Shift from content delivery to transformation facilitation elevates teaching role

6. **Competitive Differentiation:** Programs using Fink's will produce AI-proof graduates

### Negative (Risks to Mitigate)

1. **Facilitator Resistance:** Many educators unfamiliar with Fink's
   - **Mitigation:** Comprehensive training, mentorship, gradual rollout

2. **Assessment Complexity:** Harder to measure caring/metacognition than recall
   - **Mitigation:** Develop clear rubrics, exemplars, peer review processes

3. **Parent Confusion:** Fink's language less familiar than test scores
   - **Mitigation:** Clear communication, examples, transparency via portal

4. **Time Investment:** Designing Fink's assessments takes longer
   - **Mitigation:** Build template library, collaborative design sessions

5. **Subjectivity Risk:** Personal transformation harder to score objectively
   - **Mitigation:** Multiple assessors, evidence-based rubrics, longitudinal tracking

---

## Validation and Metrics

### How We'll Know This Was the Right Decision

**Short-term (6 months):**
- [ ] All competencies scored on Fink's dimensions
- [ ] 80%+ courses using multi-dimensional assessments
- [ ] Facilitator training completion rate >90%
- [ ] Parent portal adoption rate >70%
- [ ] Student feedback: "Assessments feel more meaningful"

**Medium-term (1-2 years):**
- [ ] Decreased reliance on traditional exams (AI-fakeable)
- [ ] Increased portfolio/project-based assessment
- [ ] Alumni survey: "I continue learning in my field" >80%
- [ ] Employer survey: "Graduates demonstrate caring and ethics" >75%
- [ ] Industry project completion rate >85%

**Long-term (3-5 years):**
- [ ] Employment outcomes correlated with Fink's scores (not GPA)
- [ ] Alumni career progression linked to metacognitive skills
- [ ] Employer preference for MyJKKN graduates due to "human skills"
- [ ] Industry partnerships increase (graduates integrate well)
- [ ] Graduates report high job satisfaction (caring dimension)

### Success Criteria

**We'll know Fink's was the right choice if:**
1. Graduates are employed in meaningful roles (caring)
2. They continue learning as industries evolve (learning how to learn)
3. They integrate knowledge across contexts (integration)
4. They build strong professional relationships (human dimension)
5. Employers specifically request MyJKKN graduates for these qualities

**We'll know we failed if:**
1. Graduates still just "know facts" but can't apply them
2. They stop learning after graduation
3. Employers say "they're smart but lack judgment/ethics/teamwork"
4. Students game the system (AI-fake reflections, portfolios)

---

## Related Decisions

**Supersedes:**
- Previous competency framework based on Bloom's levels only

**Influences:**
- Attendance module design (engagement quality vs. presence)
- Billing module (outcome-linked discounts)
- Staff development (facilitator training curriculum)
- Alumni outcomes tracking methodology
- Parent portal communication strategy

**Requires:**
- Facilitator training program design
- Assessment rubric library creation
- Parent communication templates
- Database migration for Fink's schema

---

## Notes and References

### Key Insights from FST Analysis

> "In the AI era, Bloom's Taxonomy describes what AI can do. Fink's Taxonomy describes what humans must do."

> "If your entire curriculum is Bloom's-based, you're teaching students to be worse versions of AI. If your curriculum is Fink's-based, you're teaching students to be irreplaceable humans."

### Why We Can't Just "Add Fink's Later"

**This is a foundational decision:**
- Database schema must support Fink's dimensions from day one
- Competency catalog design determines all downstream assessment
- Facilitator training shapes teaching culture
- Assessment methodology affects what students optimize for

**Path dependency:** If we start with Bloom's, we'll struggle to retrofit Fink's later. Culture, systems, and habits will resist.

### The Uncomfortable Truth

**Traditional education is designed for a pre-AI world.**

We've been optimizing for knowledge recall, problem-solving, and content creation—exactly what AI now does better than humans.

**Fink's Taxonomy forces us to confront this:** What CAN'T AI do? That's what we must teach.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-01 | Workshop Alignment analysis completed | Identified need for outcome-focused transformation |
| 2026-02-02 | FST analysis of Bloom's vs Fink's | AI disruption makes Fink's essential |
| 2026-02-02 | **Adopted Fink's Taxonomy (primary)** | Only framework that prepares students for AI era |
| 2026-02-02 | Created implementation plan | Database schema, facilitator training, assessment redesign |

---

## Stakeholder Sign-Off

| Role | Name | Status | Date | Notes |
|------|------|--------|------|-------|
| Product Owner | [Name] | ⏳ Pending | - | Reviewing Fink's implementation guide |
| Academic Lead | [Name] | ⏳ Pending | - | Needs facilitator training plan details |
| Tech Lead | [Name] | ⏳ Pending | - | Database schema approved pending DB review |
| Workshop Analyst | Claude | ✅ Approved | 2026-02-02 | FST analysis complete, docs ready |

---

## Appendices

### Appendix A: Bloom's to Fink's Quick Reference

| When You See (Bloom's) | Think (Fink's Primary) | Add These Dimensions |
|------------------------|------------------------|----------------------|
| Knowledge quiz | Foundational Knowledge | + Learning How to Learn (query strategies) |
| Problem set | Application | + Integration (when to use which approach) |
| Essay analysis | Application | + Integration + Caring (why this matters) |
| Project | Application + Integration | + Human Dimension (teamwork) + Caring (quality) |
| Presentation | Application | + Human Dimension (communication) |

### Appendix B: Sample Fink's Competency

**Competency:** "Web Development"

```json
{
  "competency_code": "WEB-DEV-101",
  "competency_name": "Full Stack Web Development",
  "finks_dimensions": {
    "foundational_knowledge": 7,  // HTML, CSS, JS, frameworks (but AI knows this)
    "application": 9,              // Building functional applications
    "integration": 8,              // Connecting frontend, backend, database, APIs
    "human_dimension": 7,          // Teamwork, user empathy, communication
    "caring": 6,                   // Code quality, accessibility, user experience
    "learning_to_learn": 9         // Frameworks change constantly; adaptation critical
  },
  "ai_resistance_score": 72,  // HIGH—AI codes, but humans choose WHAT to build and WHY
  "evidence_requirements": {
    "foundational": "Can use AI to query technical docs effectively",
    "application": "Working application deployed to production",
    "integration": "Connects 3+ technologies (e.g., React + Node + PostgreSQL + Auth)",
    "human_dimension": "Peer code review feedback, user testing insights",
    "caring": "Accessibility audit passed, performance optimized",
    "learning_to_learn": "Learning journal documenting 3+ new tools/techniques adopted"
  }
}
```

### Appendix C: Migration Example (Full)

**Course:** "Introduction to Programming" (Python)

**OLD Assessment (Bloom's-only):**
```
1. Quiz: Python syntax (Remember, Understand) - 20%
2. Problem sets: 10 coding challenges (Apply) - 40%
3. Final project: Build a calculator app (Create) - 40%
```

**NEW Assessment (Fink's-integrated):**
```
1. AI-Assisted Syntax Quiz + "When would I use this?" reflection (Foundational + Integration) - 10%

2. Real-World Coding Projects with Decision Rationale (Application + Integration + Caring) - 40%
   - Project options: Student chooses what to build based on personal interest
   - Deliverable: Working code + README explaining design choices
   - Peer code review required (Human Dimension)
   - Must justify "Why this approach?" not just "Does it work?" (Caring)

3. Pair Programming + Reflection (Human Dimension + Learning How to Learn) - 20%
   - Rotate partners weekly
   - Learning journal: "What I learned from my partner this week"
   - Self-assessment: "How did my communication improve?"

4. "Teach a Non-Programmer" Video + Reflection (Application + Human Dimension + Learning How to Learn) - 20%
   - Record yourself teaching a programming concept to someone without coding experience
   - Reflect: "What was hard to explain? What does that reveal about my understanding?"

5. Learning Portfolio (All Dimensions) - 10%
   - Evidence of all 6 Fink's dimensions
   - Reflective essay: "How has learning to code changed me?"
```

**What Changed:**
- Still rigorous (same content coverage)
- AI-allowed (students learn to work WITH AI, not against it)
- Transformation-focused (measures WHO they're becoming, not just WHAT they can do)
- Evidence-based (portfolios, reflections, peer feedback)
- AI-resistant (can't fake peer teaching, reflections, personal growth)

---

*Architectural Decision Record completed: 2026-02-02*
*Next Review Date: 2026-08-02 (6 months)*
*Status: Ready for stakeholder approval*
