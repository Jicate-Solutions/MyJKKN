# TQM Test Data - Sample Records Preview

This document shows example records from each module to help understand the data structure and variety.

---

## F001: Stakeholder NPS - Sample Records

### NPS Survey Example
```json
{
  "id": "...",
  "title": "Student Experience Survey - Q1 2025",
  "description": "Quarterly survey to measure student satisfaction with academic programs and facilities",
  "stakeholder_type": "learner",
  "status": "active",
  "start_date": "2025-01-22T00:00:00Z",
  "end_date": "2025-02-12T00:00:00Z",
  "questions": [
    {
      "id": "q1",
      "text": "How likely are you to recommend this institution to a friend?",
      "type": "nps"
    },
    {
      "id": "q2",
      "text": "What do you like most about the institution?",
      "type": "text"
    },
    {
      "id": "q3",
      "text": "What areas need improvement?",
      "type": "text"
    }
  ]
}
```

### NPS Response Examples

**Promoter (Score: 10)**
```json
{
  "nps_score": 10,
  "nps_category": "promoter",
  "additional_feedback": "Excellent faculty and great infrastructure. Love the practical labs!",
  "question_responses": {
    "q2": "Teaching quality",
    "q3": "Nothing major"
  }
}
```

**Passive (Score: 7)**
```json
{
  "nps_score": 7,
  "nps_category": "passive",
  "additional_feedback": "Decent experience. Some processes are slow.",
  "question_responses": {
    "q2": "Course content",
    "q3": "Administrative speed"
  }
}
```

**Detractor (Score: 4)**
```json
{
  "nps_score": 4,
  "nps_category": "detractor",
  "additional_feedback": "Poor administrative support. Takes forever to get certificates.",
  "question_responses": {
    "q2": "Some teachers",
    "q3": "Admin office efficiency"
  }
}
```

---

## F002: Process Excellence - Sample Records

### Process Definition Example
```json
{
  "name": "Student Admission Process",
  "category": "admission",
  "target_cycle_time_hours": 56,
  "target_value_add_ratio": 0.15,
  "sla_hours": 72,
  "stages": [
    {
      "name": "Application Received",
      "expected_duration_hours": 1,
      "is_value_add": true
    },
    {
      "name": "Document Verification",
      "expected_duration_hours": 4,
      "is_value_add": true
    },
    {
      "name": "Waiting for Payment",
      "expected_duration_hours": 48,
      "is_value_add": false
    },
    {
      "name": "Fee Processing",
      "expected_duration_hours": 2,
      "is_value_add": true
    },
    {
      "name": "Enrollment Confirmation",
      "expected_duration_hours": 1,
      "is_value_add": true
    }
  ]
}
```

### Waste Incident Examples

**Transportation Waste**
```json
{
  "waste_category": "T",
  "description": "Student had to physically visit campus 3 times for document submission",
  "estimated_time_lost_hours": 6,
  "estimated_cost_impact": 1200,
  "root_cause": "No online document upload",
  "corrective_action": "Implement digital document submission portal",
  "status": "investigating"
}
```

**Waiting Waste**
```json
{
  "waste_category": "W",
  "description": "Applications waiting 48 hours for HOD approval",
  "estimated_time_lost_hours": 48,
  "estimated_cost_impact": 0,
  "root_cause": "HOD only reviews once every 2 days",
  "corrective_action": "Implement SLA alerts and daily review schedule",
  "status": "open"
}
```

**Defects Waste**
```json
{
  "waste_category": "D",
  "description": "Invoice had wrong student name, had to cancel and regenerate",
  "estimated_time_lost_hours": 3,
  "estimated_cost_impact": 500,
  "root_cause": "Manual data entry error",
  "corrective_action": "Add validation checks before invoice generation",
  "status": "resolved"
}
```

### Process Audit Example
```json
{
  "process": "Student Admission Process",
  "audit_period": "2025-01-01 to 2025-01-31",
  "total_instances": 45,
  "avg_cycle_hours": 58.5,
  "avg_value_add_ratio": 0.14,
  "sla_compliance_rate": 78.5,
  "waste_breakdown": {
    "T": 4,  // Transportation
    "I": 3,  // Inventory
    "M": 2,  // Motion
    "W": 5,  // Waiting
    "O1": 2, // Over-production
    "O2": 1, // Over-processing
    "D": 3,  // Defects
    "TU": 1  // Talent Under-utilization
  },
  "abcd_rating": "C",
  "analysis": "Good process but bad results - investigate bottlenecks"
}
```

---

## F003: Parent Portal - Sample Records

### Parent Profile Example
```json
{
  "name": "Rajesh Kumar",
  "phone": "+919876543210",
  "email": "rajesh.kumar@test.com",
  "relationship": "father",
  "verified_at": "2025-01-06T00:00:00Z"
}
```

### Parent-Learner Link Example
```json
{
  "parent_id": "...",
  "learner_id": "...",
  "relationship": "father",
  "is_primary": true,
  "verified_at": "2025-01-06T00:00:00Z",
  "learner": {
    "name": "Arun Kumar",
    "roll_number": "21CS001",
    "program": "B.Tech Computer Science"
  }
}
```

### Communication Examples

**Alert - Fee Due**
```json
{
  "type": "alert",
  "subject": "Fee Payment Due",
  "content": "Your ward has pending fee payment of ₹25,000. Last date for payment: February 15, 2025",
  "priority": "urgent",
  "read_at": null,
  "created_at": "2025-02-03T10:00:00Z"
}
```

**Message - Performance Update**
```json
{
  "type": "message",
  "subject": "Academic Performance Update",
  "content": "Your ward has shown excellent performance in recent internal assessments. Scored 92% average across all subjects.",
  "priority": "normal",
  "read_at": "2025-01-31T14:30:00Z",
  "created_at": "2025-01-31T08:00:00Z"
}
```

**Announcement - Exam Schedule**
```json
{
  "type": "announcement",
  "subject": "Mid-term Exam Schedule Released",
  "content": "Dear Parent, The mid-term examination schedule has been released. Please check the student portal for detailed dates. Exams begin on March 1, 2025.",
  "priority": "high",
  "read_at": "2025-02-03T09:15:00Z",
  "created_at": "2025-02-03T08:00:00Z"
}
```

---

## F004: Grievance - Sample Records

### Grievance Ticket Examples

**Open Ticket - On Track**
```json
{
  "ticket_number": "GRV-20250205-0001",
  "category": "Academic",
  "subject": "Exam marks not updated in portal",
  "description": "My marks for Database Management Systems mid-term exam are not showing in the student portal. Exam was conducted on January 25, 2025.",
  "priority": "high",
  "status": "open",
  "raised_by_type": "learner",
  "raised_by_name": "Arun Kumar",
  "raised_by_email": "arun.kumar@student.test.com",
  "sla_hours": 48,
  "sla_deadline": "2025-02-07T06:00:00Z",
  "sla_status": "on_track",
  "created_at": "2025-02-05T00:00:00Z"
}
```

**Urgent Ticket - Breached SLA**
```json
{
  "ticket_number": "GRV-20250204-0002",
  "category": "Facility",
  "subject": "WiFi not working in hostel",
  "description": "WiFi connection in hostel block B has been down for 3 days. Unable to attend online classes and complete assignments.",
  "priority": "urgent",
  "status": "open",
  "sla_hours": 24,
  "sla_deadline": "2025-02-03T06:00:00Z",
  "sla_status": "breached",
  "created_at": "2025-02-02T06:00:00Z"
}
```

**Resolved Ticket with Rating**
```json
{
  "ticket_number": "GRV-20250128-0007",
  "category": "Academic",
  "subject": "Faculty not taking classes regularly",
  "description": "Prof. XYZ has cancelled 6 out of 10 classes in January without any makeup classes scheduled.",
  "priority": "urgent",
  "status": "resolved",
  "resolution": "Makeup classes scheduled for Feb 10-15. Alternate faculty arranged for future absences. HOD to monitor attendance.",
  "resolved_at": "2025-01-30T10:00:00Z",
  "satisfaction_rating": 5,
  "satisfaction_feedback": "Excellent response. Thank you for addressing this seriously.",
  "sla_status": "on_track"
}
```

**Reopened Ticket**
```json
{
  "ticket_number": "GRV-20250120-0010",
  "category": "Administrative",
  "subject": "Transport bus timing not suitable",
  "description": "Morning bus arrives too late (9:30 AM) causing students to miss first period (9:00 AM).",
  "priority": "medium",
  "status": "reopened",
  "satisfaction_rating": 2,
  "satisfaction_feedback": "Bus timing changed to 9:15 AM which still makes us late. Need 8:45 AM bus.",
  "sla_status": "breached"
}
```

### Grievance Comment Example
```json
{
  "ticket_id": "...",
  "author_name": "Dr. Rajesh (HOD)",
  "author_type": "staff",
  "content": "Marks will be updated by end of day today. There was a delay in evaluation.",
  "is_internal": false,
  "created_at": "2025-02-05T04:00:00Z"
}
```

---

## F005: Maturity Assessment - Sample Records

### Maturity Framework
```json
{
  "name": "Excellence Journey Framework",
  "dimensions": [
    {
      "name": "Leadership",
      "stage_1_criteria": "Crisis management, reactive decisions",
      "stage_2_criteria": "Some planning, department-level goals",
      "stage_3_criteria": "Strategic vision, institution-wide goals",
      "stage_4_criteria": "Excellence culture, continuous improvement mindset"
    },
    {
      "name": "Strategy",
      "stage_1_criteria": "No formal strategy, survival mode",
      "stage_2_criteria": "Annual plans exist",
      "stage_3_criteria": "3-5 year roadmap with KPIs",
      "stage_4_criteria": "Data-driven strategy with regular reviews"
    }
    // ... 3 more dimensions
  ]
}
```

### Maturity Assessment Examples

**Stage 1: Crisis**
```json
{
  "assessment_date": "2024-06-15",
  "dimension_scores": {
    "Leadership": 1,
    "Strategy": 1,
    "Process": 2,
    "People": 1,
    "Stakeholders": 1
  },
  "overall_stage": 1,
  "evidence": "Department operating in reactive mode. No formal strategic planning. Manual processes causing delays. High stakeholder complaints.",
  "improvement_plan": "Establish department goals, implement basic process documentation, start regular team meetings",
  "target_stage": 2,
  "target_date": "2024-12-31",
  "status": "approved"
}
```

**Stage 3: Stability**
```json
{
  "assessment_date": "2025-01-15",
  "dimension_scores": {
    "Leadership": 3,
    "Strategy": 3,
    "Process": 2,
    "People": 3,
    "Stakeholders": 3
  },
  "overall_stage": 3,
  "evidence": "Institution has clear strategic vision. Most processes are standardized. Regular training programs in place. NPS tracking active with score of 45.",
  "improvement_plan": "Automate key processes, implement lean methodologies, move from training to continuous learning culture",
  "target_stage": 4,
  "target_date": "2025-12-31",
  "status": "draft"
}
```

### Progress Item Examples
```json
[
  {
    "action_item": "Document all admission processes",
    "dimension": "Process",
    "target_stage": 2,
    "status": "completed",
    "due_date": "2024-08-31",
    "completed_at": "2024-08-20",
    "notes": "All admission workflows documented in Confluence"
  },
  {
    "action_item": "Develop 3-year strategic plan",
    "dimension": "Strategy",
    "target_stage": 3,
    "status": "in_progress",
    "due_date": "2025-03-31",
    "notes": "50% complete - draft prepared, under review"
  },
  {
    "action_item": "Launch structured faculty development program",
    "dimension": "People",
    "target_stage": 3,
    "status": "pending",
    "due_date": "2025-05-31",
    "notes": "Program design phase"
  }
]
```

---

## F006: OKR ABCD Matrix - Sample Records

### Category A: Good Process + Good Result ✅
```json
{
  "title": "Increase NPS Score",
  "description": "Achieve NPS score of 50 or higher",
  "target_value": 50,
  "current_value": 45,
  "progress": 75,
  "process_rating": 5,
  "process_notes": "Excellent process - regular surveys, automated analysis, quick action on feedback",
  "abcd_category": "A",
  "analysis": "Good Process + Good Result - Replicate"
}
```

### Category B: Bad Process + Bad Result ❌
```json
{
  "title": "Reduce Fee Refund Time",
  "description": "Process refunds within 15 days",
  "target_value": 15,
  "current_value": 45,
  "progress": 25,
  "process_rating": 2,
  "process_notes": "Manual process, no automation, multiple approval layers causing delays",
  "abcd_category": "B",
  "analysis": "Bad Process + Bad Result - Improve"
}
```

### Category C: Good Process + Bad Result ⚠️
```json
{
  "title": "Increase Library Digital Access",
  "description": "Digital resource access by 80% students",
  "target_value": 80,
  "current_value": 42,
  "progress": 52,
  "process_rating": 4,
  "process_notes": "Good promotion process, tracking in place, but adoption slower than expected",
  "abcd_category": "C",
  "analysis": "Good Process + Bad Result - Investigate"
}
```

### Category D: Bad Process + Good Result 🚨 FALSE SECURITY
```json
{
  "title": "Increase Placement Rate",
  "description": "Achieve 90% placement rate",
  "target_value": 90,
  "current_value": 78,
  "progress": 87,
  "process_rating": 3,
  "process_notes": "WARNING: High results but chaotic process - individual faculty efforts, no systematic tracking",
  "abcd_category": "D",
  "analysis": "Bad Process + Good Result - WARNING: False Security"
}
```

---

## F007: Billing COPQ - Sample Records

### COPQ Incidents Examples

**Refund Processing - High Visible Cost**
```json
{
  "category": "refund_processing",
  "description": "Duplicate refund issued due to manual entry error",
  "visible_cost": 25000,
  "hidden_cost_estimate": 5000,
  "time_spent_hours": 12,
  "affected_stakeholders": 2,
  "root_cause": "Manual data entry without validation checks",
  "preventive_action": "Add duplicate detection in refund processing system",
  "status": "investigating"
}
```

**Late Payment Follow-up - High Hidden Cost**
```json
{
  "category": "late_payment_followup",
  "description": "Staff time spent calling 50+ parents for late payment reminders",
  "visible_cost": 0,
  "hidden_cost_estimate": 8000,
  "time_spent_hours": 20,
  "affected_stakeholders": 50,
  "root_cause": "No automated reminder system for due dates",
  "preventive_action": "Implement automated SMS/email reminders before due date",
  "status": "logged"
}
```

**Bad Debt - Massive Visible Cost**
```json
{
  "category": "bad_debt",
  "description": "Student dropped out with pending fee of ₹75,000 - amount written off",
  "incident_date": "2024-12-15",
  "visible_cost": 75000,
  "hidden_cost_estimate": 10000,
  "time_spent_hours": 15,
  "affected_stakeholders": 1,
  "root_cause": "No advance payment or security deposit policy",
  "preventive_action": "Implement semester advance payment policy",
  "status": "written_off",
  "resolved_at": "2024-12-21T00:00:00Z"
}
```

**Reputation Impact - High Hidden Cost**
```json
{
  "category": "reputation_impact",
  "description": "Parent complained on social media about hidden fee charges",
  "visible_cost": 0,
  "hidden_cost_estimate": 25000,
  "time_spent_hours": 10,
  "affected_stakeholders": 1,
  "root_cause": "Fee structure not clearly communicated upfront",
  "preventive_action": "Publish transparent fee structure with all components before admission",
  "status": "resolved"
}
```

### COPQ Summary by Category
```json
{
  "refund_processing": {
    "incident_count": 2,
    "total_visible": 40000,
    "total_hidden": 8000,
    "total_copq": 48000
  },
  "late_payment_followup": {
    "incident_count": 2,
    "total_visible": 2000,
    "total_hidden": 12000,
    "total_copq": 14000
  },
  "bad_debt": {
    "incident_count": 1,
    "total_visible": 75000,
    "total_hidden": 10000,
    "total_copq": 85000
  },
  "reputation_impact": {
    "incident_count": 2,
    "total_visible": 0,
    "total_hidden": 40000,
    "total_copq": 40000
  }
  // ... more categories
}
```

---

## Key Insights from Test Data

### NPS Insights
- **Student NPS:** -6.67 (more detractors than promoters)
- **Parent NPS:** 0 (balanced promoters and detractors)
- **Main complaints:** Infrastructure, admin efficiency, hostel, WiFi
- **Strengths:** Teaching quality, faculty support, placement

### Process Excellence Insights
- **Most common waste:** Waiting (5 incidents)
- **Highest cost waste:** Inventory (paper backlog - ₹5,000)
- **Critical finding:** Billing process has D-rating (false security)
- **SLA compliance:** Admission 78.5%, Billing 65%

### Grievance Insights
- **SLA breach rate:** 50% (5 out of 10 tickets)
- **Most urgent category:** Facility (24-hour SLA)
- **Satisfaction:** High for resolved tickets (4-5 rating)
- **Reopened rate:** 10% (1 out of 10)

### Maturity Assessment Insights
- **Current stage:** Stability (Stage 3)
- **Progress:** Crisis → Survival → Stability over 7 months
- **Weak dimension:** Process (still at Stage 2)
- **Target:** Excellence (Stage 4) by Dec 2025

### OKR ABCD Insights
- **False security alerts:** 3 key results in D category
- **Improvement needed:** 6 key results in B/C categories
- **Replicate success:** 3 key results in A category
- **Warning:** Placement, assessments, fee defaults need process fixes

### COPQ Insights
- **Total cost of poor quality:** ₹240,300
- **Visible vs Hidden:** 57% visible, 43% hidden
- **Biggest single cost:** Bad debt (₹85,000)
- **Most incidents:** Late payment follow-up (hidden cost)
- **Prevention potential:** ~70% of incidents preventable through automation

---

**Note:** All values and examples are from the actual test data created by the SQL script.
