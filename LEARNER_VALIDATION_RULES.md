# Learner Profile Validation Rules

**Document Version:** 1.0  
**Last Updated:** 2026-05-06  
**Author:** JKKN Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Core Validation Rules](#core-validation-rules)
3. [Status-Based Requirements](#status-based-requirements)
4. [Business Logic Validations](#business-logic-validations)
5. [Bulk Edit - Active Learners](#bulk-edit---active-learners)
6. [Fee Item Validation](#fee-item-validation)
7. [Academic Assignment Validation](#academic-assignment-validation)
8. [Contact Information Validation](#contact-information-validation)
9. [Address Validation](#address-validation)
10. [Education History Validation](#education-history-validation)
11. [Error Messages & User Feedback](#error-messages--user-feedback)

---

## Overview

The learner profile validation system enforces data integrity across the complete learner lifecycle: **admitted → pending → approved → account → active → graduated → alumni**.

### Key Principles

- **Status-Aware Validation:** Required fields vary by lifecycle status
- **Progressive Enrichment:** Data collected incrementally as learners progress through stages
- **Referential Integrity:** All foreign keys (institution, degree, program, etc.) must exist
- **Format Validation:** Email, phone, PIN codes follow established patterns
- **Business Rules:** Prevent invalid status transitions and flag inconsistent data

---

## Core Validation Rules

### Personal Information

| Field | Validation Rule | Status Required |
|-------|-----------------|-----------------|
| `first_name` | Min 2 characters, max 100 characters | All statuses |
| `last_name` | Optional, max 100 characters | All statuses |
| `date_of_birth` | Valid ISO 8601 date (YYYY-MM-DD), learner age ≥ 16 | `pending` and above |
| `gender` | Required, one of: Male, Female, Other, Prefer Not to Say | `pending` and above |
| `religion` | Required field, max 50 characters | `pending` and above |
| `community` | Required field, max 50 characters | `pending` and above |
| `caste` | Optional field, max 50 characters | All statuses |
| `blood_group` | Optional, one of valid blood groups (A+, A-, B+, B-, O+, O-, AB+, AB-) | All statuses |
| `aadhar_number` | Optional, valid 12-digit Aadhar format (no spaces) | All statuses |
| `learner_type` | Optional, one of: `regular`, `irregular`, `intern` | All statuses |

### Contact Information

| Field | Validation Rule | Status Required |
|-------|-----------------|-----------------|
| `student_mobile` | Exactly 10 digits, no letters or special chars | `admitted` and above |
| `student_email` | Valid email format (RFC 5322 compliant) | `admitted` and above |
| `college_email` | Valid email with @jkkn.ac.in domain (generated post-enrollment) | `active` status |

### Parent/Guardian Information

| Field | Validation Rule | Status Required |
|-------|-----------------|-----------------|
| `father_name` | Min 2 characters, max 100 characters | `pending` and above |
| `father_mobile` | Exactly 10 digits, optional | `pending` and above |
| `father_occupation` | Optional field, max 100 characters | All statuses |
| `mother_name` | Min 2 characters, max 100 characters | `pending` and above |
| `mother_mobile` | Exactly 10 digits, optional | `pending` and above |
| `mother_occupation` | Optional field, max 100 characters | All statuses |
| `annual_income` | Optional, non-negative number or string representation | All statuses |

### Aadhar & Identification

| Field | Validation Rule | Status Required |
|-------|-----------------|-----------------|
| `aadhar_number` | 12 digits only, no spaces/hyphens, globally unique across system | Optional |
| Duplicate check | Warn if same Aadhar already exists in system | Before saving |

---

## Status-Based Requirements

The system enforces **required fields per lifecycle status**. Learners cannot transition to the next status unless all required fields are complete.

### Status: `admitted`

**Minimum data for initial inquiry/registration**

**Required Fields:**
- `first_name`
- `student_mobile` (10 digits)
- `student_email` (valid format)
- `entry_type`

**Allowed Transitions:**
- → `pending` (submit full application)
- → `rejected` (reject inquiry)
- → `account` (fast-track to billing if applicable)

### Status: `pending`

**Application under review**

**Required Fields:**
- All fields from `admitted` status, plus:
- `father_name`, `father_mobile`
- `mother_name`, `mother_mobile`
- `date_of_birth` (calculated age must be ≥ 16)
- `gender`, `religion`, `community`
- `last_school`, `board_of_study`
- `tenth_marks` (max, obtained, percentage)
- `twelfth_marks` (group, max, obtained, percentage, subjects)
- `permanent_address_street`, `permanent_address_district`, `permanent_address_pin_code`, `permanent_address_state`
- `accommodation_type`

**Validation Rules:**
- Must have complete 10th & 12th mark details
- If counseling applied, must have `counseling_number`
- Address must be complete (no partial entries)

**Allowed Transitions:**
- → `approved` (application accepted)
- → `rejected` (application declined)
- → `waitlisted` (hold for review)
- → `account` (move to billing)

### Status: `approved`

**Application approved, academic assignment required**

**Additional Required Fields:**
- `institution_id` (valid institution)
- `degree_id` (valid degree in selected institution)
- `department_id` (valid department in institution)
- `program_id` (valid program in department)

**Validation Rules:**
- Must match institution → degree → department → program hierarchy
- Regulation ID (if provided) must belong to the selected degree
- Cannot mark as approved without academic assignment

**Allowed Transitions:**
- → `account` (move to billing)
- → `active` (bypass billing if allowed)
- → `rejected` (revert decision)

### Status: `account`

**Assigned to accounts department for billing**

**Additional Required Fields:**
- All fields from `approved` status, plus:
- At least ONE of: `fee_structure_type`, `tuition_fee`, or `fee_items` array

**Fee Validation:**
- `fee_structure_type` must match one of: `tuition_hostel`, `tuition_uniform_hospital`, `tuition_instruments_hospital`, `tuition_instruments`, `tuition_only`
- If `fee_items` array provided, each item must have:
  - Valid UUID `category_id`
  - Non-empty `category_name`
  - Non-negative integer `amount`
- Total of all `fee_items[].amount` must be non-negative

**Allowed Transitions:**
- → `active` (payment complete, enrollment)
- → `approved` (revert to approval)
- → `rejected` (reject at billing)

### Status: `active`

**Enrolled and currently studying**

**Additional Required Fields:**
- All fields from `account` status, plus:
- `semester_id` (valid semester in selected program)
- `section_id` (valid section in semester)
- `academic_year_id` (valid academic year, must be active)
- `college_email` (generated in format: firstnamelastname@jkkn.ac.in)
- `roll_number` (optional but recommended, must be unique within section)
- `register_number` (optional)

**Validation Rules:**
- Semester must belong to the enrolled program
- Section must belong to the semester
- Academic year must be active for enrollment
- Roll number must be unique within the section
- College email must use @jkkn.ac.in domain
- Cannot have duplicate emails in same semester

**Allowed Transitions:**
- → `inactive` (temporary suspension/leave)
- → `exited` (dropout/transfer)
- → `graduated` (complete program)

### Status: `inactive`

**Temporarily inactive (leave, suspension, medical)**

**Required Fields:**
- All fields from `active` status (maintained)
- Reason for inactivity (captured in notes/audit trail)

**Allowed Transitions:**
- → `active` (resume studies)
- → `exited` (formal dropout)

### Status: `exited`

**Left institution (dropout, transfer, etc.)**

**Required Fields:**
- All academic fields maintained for records
- Exit reason in audit trail

**Allowed Transitions:**
- None (terminal state, requires manual admin intervention to revert)

### Status: `graduated`

**Successfully completed program**

**Required Fields:**
- All fields from `active` status, maintained
- Graduation date captured
- Final grades recorded

**Allowed Transitions:**
- → `alumni` (post-graduation status)

### Status: `alumni`

**Post-graduation**

**Terminal State:** No transitions allowed

---

## Business Logic Validations

### 1. Age Validation

```
Rule: Learner must be at least 16 years old at enrollment
Calculation: current_date - date_of_birth ≥ 16 years
Trigger: When transitioning to `pending` status
Error: "Learner must be at least 16 years old"
```

### 2. Hierarchy Validation (Institution → Degree → Department → Program)

```
Rule: All academic assignments must follow valid hierarchy:
  institution → degree (in institution) 
  → department (in institution) 
  → program (in department)
  
Trigger: Before saving any approved/account/active learner
Error: "Program {id} does not belong to Department {id}"
```

### 3. Regulatory Assignment Validation

```
Rule: If regulation_id provided, must belong to selected degree
Query: SELECT regulations WHERE degree_id = learner.degree_id AND id = learner.regulation_id
Trigger: On save to `approved` status or above
Error: "Regulation {id} is not available for Degree {id}"
```

### 4. Semester & Section Hierarchy

```
Rule: Section must belong to selected semester
Rule: Semester must belong to selected program
Trigger: Before saving to `active` status
Error: "Section {id} does not belong to Semester {id}"
```

### 5. Admission Year Validation

```
Rule: admission_year_id must exist in admission_years table
Rule: admission_year must match learner's institution
Trigger: On enrollment to `active` status
Validation: SELECT admission_years WHERE id = learner.admission_year_id
Error: "Invalid admission year for selected institution"
```

### 6. Email Uniqueness

```
Rule: Across active learners in same semester, college_email must be unique
Rule: Across all learners (admitted onwards), student_email must be unique
Trigger: Before save
Error: "Email already in use by another learner"
```

### 7. Roll Number Uniqueness

```
Rule: Within a section + academic_year, roll_number must be unique
Exception: Can be NULL/empty for certain programs (e.g., part-time)
Trigger: Before save to `active` status
Error: "Roll number {value} already assigned in this section"
```

### 8. Mobile Number Format

```
Rule: Must be exactly 10 digits, no spaces/hyphens/special chars
Rule: Must be numeric only (0-9)
Trigger: Validate student_mobile, father_mobile, mother_mobile
Error: "Mobile number must be 10 digits"
```

### 9. PIN Code Format

```
Rule: Must be exactly 6 digits
Rule: Must be numeric only (0-9)
Geographic Validation: Optional - validate against India Post database
Trigger: On save of any learner with permanent_address_pin_code
Error: "PIN code must be 6 digits"
```

### 10. Status Transition Validation

```
Rule: Only allowed transitions per STATUS_TRANSITIONS map
Mapping: {
  admitted: [pending, account, rejected],
  pending: [approved, rejected, waitlisted, account],
  approved: [account, active, rejected],
  account: [active, approved],
  active: [inactive, exited, graduated],
  inactive: [active, exited],
  exited: [],  // No transitions
  graduated: [alumni],
  alumni: [],  // No transitions
}
Trigger: Before status update
Error: "Cannot transition from {current} to {requested} status"
```

### 11. Profile Completion Check

```
Rule: is_profile_complete = true only if all applicable required fields are filled
Applicable fields determined by: lifecycle_status + user role + permissions
Trigger: Automatic calculation on every save
Recalculation: When status changes
```

### 12. Aadhar Uniqueness (Optional)

```
Rule: If aadhar_number provided, must be unique system-wide
Exception: Can be NULL (optional field)
Trigger: Before save if aadhar_number is provided
Error: "Aadhar number already registered in system"
Database Check: SELECT learners_profiles WHERE aadhar_number = ? AND id != current_learner_id
```

### 13. Academic Year Activation

```
Rule: Cannot enroll learner in inactive academic_year
Trigger: Before save to `active` status
Query: SELECT academic_years WHERE id = learner.academic_year_id AND is_active = true
Error: "Selected academic year is not active for enrollment"
```

---

## Bulk Edit - Active Learners

### Bulk Edit Capabilities

**Allowed Fields for Bulk Edit:**

```
✓ lifecycle_status (with full transition validation)
✓ semester_id (must be valid for enrolled program)
✓ section_id (must belong to selected semester)
✓ academic_year_id (must be active)
✓ accommodation_type
✓ hostel_type
✓ food_type
✓ scholarship_type
✓ quota
✓ category
✓ student_mobile (revalidation required)
✓ fee_items (array of LearnerFeeItem)
✓ fee_structure_type
✓ tuition_fee (and other legacy fee fields)
```

**NOT Allowed for Bulk Edit:**

```
✗ first_name, last_name (identity must be edited individually)
✗ date_of_birth (security/identity)
✗ student_email (email change must be verified)
✗ aadhar_number (identity verification required)
✗ college_email (auto-generated, read-only)
✗ roll_number (must be unique, edited individually)
✗ register_number (identity-related)
✗ is_profile_complete (calculated, read-only)
✗ created_by, updated_by (audit fields, system-managed)
```

### Bulk Edit Workflow

#### Step 1: Selection

```
User Interface:
- Filter active learners by: semester, section, institution, department, program
- Display: Roll number, Name, Email, Current Status
- Checkbox selection for target learners
- Show count of selected learners (e.g., "50 learners selected")
```

#### Step 2: Choose Field(s) to Update

```
User selects one or more fields from "Allowed Fields" list
Example scenarios:
1. Change semester + section (progression to next semester)
2. Update accommodation/hostel for hostel fee calculation
3. Assign scholarship/quota codes
4. Update mobile number in bulk
5. Change fee_items for new fee structure
```

#### Step 3: Pre-Validation

```
For each learner being updated:

If changing lifecycle_status:
  - Check STATUS_TRANSITIONS mapping
  - Validate all required fields for new status
  - Ensure no data conflicts
  - Report validation errors before proceeding

If changing semester_id:
  - Verify semester belongs to same program
  - Check section availability in new semester
  - Update section_id automatically if needed

If changing academic_year_id:
  - Confirm new academic_year is active
  - Verify no enrollment gaps

If changing accommodation_type:
  - Trigger fee recalculation if applicable
  - Check hostel availability
```

#### Step 4: Batch Processing

```
Transaction: All-or-nothing per learner
On Success:
  - Update learner record
  - Log audit trail: updated_by, updated_at, field changes
  - Trigger dependent calculations (profile_completion, fee recalculation)
  
On Failure (per learner):
  - Rollback individual record
  - Collect error message
  - Continue with next learner
  - Report summary at end
```

#### Step 5: Confirmation & Reporting

```
Display Results:
✓ Successfully updated: 48 learners
⚠ Validation errors: 2 learners
  - Learner A: Cannot transition from inactive to approved
  - Learner B: Selected section does not exist
  
Allow user to:
- Download error report (CSV)
- Retry failed learners
- Export updated list
```

### Bulk Edit Validation Rules

| Scenario | Validation | Action |
|----------|-----------|--------|
| **Change Status** | Validate new status is allowed from current status | Block if invalid transition |
| **Change Semester** | Section must exist in new semester for same program | Auto-clear section if not applicable |
| **Change Section** | Must belong to current/selected semester | Block if mismatch |
| **Update Mobile** | Must pass mobile number format validation (10 digits) | Show error for invalid numbers |
| **Update Fees** | fee_items must have valid category_id & non-negative amounts | Block invalid fee structures |
| **Enrollment Rules** | Cannot bulk-enroll to inactive academic year | Block and suggest active years |

### Bulk Edit API Endpoint

```typescript
POST /api/learners/bulk-update

Request Body:
{
  learner_ids: string[],          // Selected learner IDs
  updates: {
    lifecycle_status?: LifecycleStatus,
    semester_id?: string,
    section_id?: string,
    academic_year_id?: string,
    accommodation_type?: string,
    hostel_type?: string,
    food_type?: string,
    scholarship_type?: string,
    quota?: string,
    category?: string,
    student_mobile?: string,
    fee_items?: LearnerFeeItem[],
    fee_structure_type?: string,
    tuition_fee?: number,
    [key: string]: any
  },
  reason?: string                 // Audit reason
}

Response:
{
  success: true,
  summary: {
    total_requested: 50,
    successful: 48,
    failed: 2,
    skipped: 0
  },
  results: [
    {
      learner_id: string,
      status: 'success' | 'error',
      message: string
    }
  ],
  errors: [...],                  // Detailed error logs
  audit_id: string                // For tracking
}
```

---

## Fee Item Validation

### Structure

```typescript
interface LearnerFeeItem {
  category_id: string;           // UUID, foreign key to billing_categories
  category_name: string;         // Display name
  amount: number;                // Non-negative integer (no decimals)
}
```

### Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `category_id` | Valid UUID format | "Invalid category ID format" |
| `category_id` | Must exist in `billing_categories` | "Category does not exist" |
| `category_name` | Min 1 character | "Category name is required" |
| `amount` | Must be integer (no decimals) | "Amount must be a whole number" |
| `amount` | Must be ≥ 0 | "Amount cannot be negative" |
| Array | Cannot have duplicate category_ids | "Duplicate category in fee items" |
| Array | Total amount must not exceed system limits | "Total fees exceed maximum allowed" |

### Fee Item Validation Code Example

```typescript
const learnerFeeItemSchema = z.object({
  category_id: z.string().uuid('Invalid category id'),
  category_name: z.string().min(1, 'Category name is required'),
  amount: z.coerce
    .number()
    .int('Amount must be a whole number (no decimals)')
    .min(0, 'Amount must be non-negative'),
});

// Array-level validation
const feeItemsSchema = z
  .array(learnerFeeItemSchema)
  .refine(
    (items) => new Set(items.map(i => i.category_id)).size === items.length,
    "Duplicate categories in fee items"
  );
```

---

## Academic Assignment Validation

### Hierarchy Constraint

```
Institution → Degree → Department → Program → Semester → Section
         ↓         ↓            ↓         ↓         ↓
     (stores in  (stores in   (stores   (stores   (stores
      learner)    learner)    in        in        in
                             learner)  learner)  learner)
```

### Validation Query Example

```sql
-- Validate degree belongs to institution
SELECT id FROM degrees 
WHERE id = :degree_id AND institution_id = :institution_id;

-- Validate department belongs to institution
SELECT id FROM departments 
WHERE id = :department_id AND institution_id = :institution_id;

-- Validate program belongs to department
SELECT id FROM programs 
WHERE id = :program_id AND department_id = :department_id;

-- Validate semester belongs to program
SELECT id FROM semesters 
WHERE id = :semester_id AND program_id = :program_id;

-- Validate section belongs to semester
SELECT id FROM sections 
WHERE id = :section_id AND semester_id = :semester_id;

-- Validate regulation belongs to degree
SELECT id FROM regulations 
WHERE id = :regulation_id AND degree_id = :degree_id AND is_active = true;
```

---

## Contact Information Validation

### Email Validation

```
Pattern: RFC 5322 simplified
  - Must contain exactly one @ symbol
  - Minimum length: 5 characters (e.g., a@b.c)
  - Maximum length: 254 characters
  - Local part: alphanumeric + . _ - +
  - Domain: valid domain format

For College Email:
  - Must end with @jkkn.ac.in
  - Format: <firstname><lastname>@jkkn.ac.in (auto-generated)
  - Example: johndoe@jkkn.ac.in
```

### Phone Number Validation

```
Pattern: India (+91)
  - Exactly 10 digits (without country code)
  - No spaces, hyphens, or special characters
  - Valid mobile prefixes: 6, 7, 8, 9 (as of 2026)
  
Examples:
  ✓ 9876543210
  ✓ 8765432109
  ✗ 98765 43210 (spaces)
  ✗ 9876543210 (11 digits)
  ✗ 5876543210 (invalid prefix)
```

---

## Address Validation

### Permanent Address Fields

| Field | Requirement | Example |
|-------|-------------|---------|
| `permanent_address_street` | Required, min 5 chars | "123 Main Street, Apt 4B" |
| `permanent_address_taluk` | Optional | "Bangalore South" |
| `permanent_address_district` | Required, min 3 chars | "Bangalore" |
| `permanent_address_pin_code` | Required, exactly 6 digits | "560001" |
| `permanent_address_state` | Required, min 3 chars | "Karnataka" |

### PIN Code Validation

```
Format: Exactly 6 digits
Pattern: [0-9]{6}
Trigger: Validate on save
Error: "PIN code must be 6 digits"

Optional Enhancement: Validate against India Post database
  - Verify PIN belongs to stated district/state
  - Warn if mismatch detected
```

---

## Education History Validation

### 10th Standard Marks

```
Required for: pending status and above
Structure:
{
  max_marks: string,        // e.g., "600"
  obtained_marks: string,   // e.g., "480"
  percentage: string        // e.g., "80.00"
}

Validation:
  - All three fields required
  - obtained_marks ≤ max_marks
  - percentage = (obtained_marks / max_marks) * 100
  - Optional: Warn if percentage doesn't match calculation
```

### 12th Standard Marks

```
Required for: pending status and above
Structure:
{
  group: string,            // e.g., "PCM", "PCB", "Commerce"
  max_marks: string,
  obtained_marks: string,
  percentage: string,
  subjects: Record<string, string>  // e.g., { Physics: "95", Chemistry: "90" }
}

Validation:
  - All fields required
  - Group must be valid (configurable per institution)
  - obtained_marks ≤ max_marks
  - Percentage calculation check
  - Subjects object should match selected group
```

### Entrance Exam Scores (Optional)

```
NEET (for medical/paramedical):
  - neet_roll_number: Valid format (state + roll)
  - neet_score: Numeric, 0-720 (as of 2026)

JEE (for engineering):
  - engineering_cutoff_marks: Numeric score

Validation:
  - If applicable, must provide score
  - Score must be within valid range for exam year
  - Roll number format must match exam board standards
```

---

## Error Messages & User Feedback

### Validation Error Message Format

```
{
  field: string,                    // Form field path (e.g., "student_email")
  code: string,                     // Machine-readable error code
  message: string,                  // User-friendly message
  suggestion?: string,              // Optional fix suggestion
  severity: 'error' | 'warning'     // Whether to block save
}
```

### Common Error Messages

| Code | Message | Suggestion |
|------|---------|-----------|
| `INVALID_EMAIL` | "Please enter a valid email address" | "Email should be in format: name@domain.com" |
| `INVALID_PHONE` | "Mobile number must be exactly 10 digits" | "Remove spaces and special characters" |
| `AGE_INSUFFICIENT` | "Learner must be at least 16 years old" | "Check date of birth" |
| `STATUS_INVALID_TRANSITION` | "Cannot move from {current} to {requested} status" | "Review allowed status transitions" |
| `HIERARCHY_MISMATCH` | "Department does not belong to selected Institution" | "Select correct institution first" |
| `REQUIRED_FIELD_MISSING` | "Field '{fieldName}' is required for {status} status" | "Complete all required fields before progressing" |
| `DUPLICATE_EMAIL` | "Email already in use by another learner" | "Use a different email address" |
| `DUPLICATE_ROLL_NUMBER` | "Roll number already assigned in this section" | "Use a unique roll number" |
| `INVALID_PIN_CODE` | "PIN code must be 6 digits" | "Example: 560001" |
| `INVALID_AADHAR` | "Aadhar number must be 12 digits" | "Remove spaces or hyphens" |
| `AADHAR_DUPLICATE` | "This Aadhar number is already registered" | "Contact administrator if this is an error" |
| `INVALID_CATEGORY_ID` | "Selected fee category does not exist" | "Choose from available categories" |
| `NEGATIVE_FEE` | "Amount cannot be negative" | "Enter a positive amount" |
| `INACTIVE_ACADEMIC_YEAR` | "Selected academic year is not active" | "Select an active academic year" |

### Bulk Edit Error Reporting

```
Format: CSV download for failed records

Columns:
  - Roll Number
  - Student Name
  - Field Being Updated
  - Error Code
  - Error Message
  - Suggestion
  - Severity

Example:
  Roll,Name,Field,Code,Message
  21KQ001,Arun Kumar,section_id,HIERARCHY_MISMATCH,"Section does not belong to semester","Verify semester is active"
```

---

## Implementation Checklist

- [ ] Implement all validation rules in API endpoint
- [ ] Add pre-validation checks in UI forms
- [ ] Create database constraints for referential integrity
- [ ] Implement status transition guards
- [ ] Add email/phone uniqueness checks
- [ ] Create bulk edit endpoint with transaction handling
- [ ] Add audit logging for all updates
- [ ] Create validation error response middleware
- [ ] Implement fee calculation triggers
- [ ] Add automated profile completion calculation
- [ ] Create CSV import validation with error reporting
- [ ] Set up monitoring for validation failures

---

## Related Files

- [`types/learner-profile.ts`](types/learner-profile.ts) — Type definitions and Zod schemas
- [`lib/services/learner/`](lib/services/learner/) — Business logic services
- [`app/api/learners/`](app/api/learners/) — API endpoints
- Database migrations — Schema with constraints and triggers

---

**Last Review Date:** 2026-05-06  
**Next Review Date:** 2026-08-06
