# Implementation Plan: Bulk Upload Profiles & Bulk Exit Features

**Date**: 2025-01-22
**Module**: Learners Profiles
**Features**: Bulk Upload with Auto User Creation + Bulk Exit

---

## 📋 Overview

### Feature 1: Bulk Upload Profiles
Upload learners directly to profiles page with complete data, automatically creating user accounts for complete profiles.

**Key Differences from Enquiries Bulk Upload:**
| Enquiries Bulk Upload | Profiles Bulk Upload |
|----------------------|---------------------|
| Status: 'enquiry' | Status: 'active' |
| Incomplete data OK | Complete data required |
| No user creation | **Auto user creation** ✅ |
| Simple upload | Upload + Validation + User creation |

### Feature 2: Bulk Exit
Select multiple learners and mark them as exited, automatically deactivating their user accounts.

---

## 🎯 Requirements Analysis

### Bulk Upload Requirements

**Functional:**
1. Upload Excel file with complete learner data
2. Validate all required fields
3. Check for duplicates (email)
4. Bulk insert learners with lifecycle_status = 'active'
5. Auto-detect complete profiles (is_profile_complete = true)
6. Create user accounts for complete profiles without existing accounts
7. Generate temp passwords
8. Return comprehensive results

**Non-Functional:**
- Handle up to 1000 learners per upload
- Complete within 60 seconds
- Provide clear error messages
- Export temp passwords to Excel

### Bulk Exit Requirements

**Functional:**
1. Select multiple learners from data table
2. Show confirmation dialog
3. Update learners to lifecycle_status = 'exited'
4. Deactivate user profiles (is_active = false)
5. Return success/failure counts

**Non-Functional:**
- Handle up to 500 learners per batch
- Confirm if >50 learners selected
- Complete within 30 seconds

---

## 🏗️ Architecture

### System Flow Diagrams

#### Bulk Upload Flow
```
┌─────────────────────────────────────────────────────────────┐
│ USER: Click "Bulk Upload" Button                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND: Open Dialog → Download Template or Upload File    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ API: POST /api/learners/bulk-upload-profiles                │
│                                                              │
│ 1. Authenticate & check permissions                         │
│ 2. Parse Excel file (XLSX)                                  │
│ 3. Validate each row:                                       │
│    - Required fields present?                               │
│    - Valid email format?                                    │
│    - Foreign keys exist?                                    │
│    - Duplicate check                                        │
│ 4. Bulk insert valid learners                               │
│ 5. Get newly created learner IDs                            │
│ 6. Check which profiles are complete                        │
│ 7. Call get_learners_missing_profiles(new_ids)              │
│ 8. Create user accounts:                                    │
│    - Generate temp password                                 │
│    - Create Supabase Auth user                              │
│    - Create profiles record                                 │
│ 9. Return results                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND: Display Results                                   │
│ - Learners created: X                                       │
│ - Complete profiles: Y                                      │
│ - User accounts created: Z                                  │
│ - Temp passwords table (exportable)                         │
│ - Validation errors                                         │
└─────────────────────────────────────────────────────────────┘
```

#### Bulk Exit Flow
```
┌─────────────────────────────────────────────────────────────┐
│ USER: Select learners → Click "Bulk Exit"                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND: Show Confirmation Dialog                          │
│ - X learners selected                                       │
│ - List of names                                             │
│ - Warning about account deactivation                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ API: POST /api/learners/bulk-exit                           │
│                                                              │
│ 1. Authenticate & check permissions                         │
│ 2. Validate learner IDs                                     │
│ 3. Check institution access                                 │
│ 4. Update learners:                                         │
│    UPDATE learners_profiles                                 │
│    SET lifecycle_status = 'exited'                          │
│    WHERE id IN (...)                                        │
│ 5. For each learner with college_email:                     │
│    UPDATE profiles                                          │
│    SET is_active = false                                    │
│    WHERE email = college_email                              │
│ 6. Return results                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND: Display Results & Refresh Table                   │
│ - Learners updated: X                                       │
│ - Profiles deactivated: Y                                   │
│ - Errors: Z                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

### Backend Files to Create

```
app/
├── api/
│   └── learners/
│       ├── bulk-upload-profiles/
│       │   └── route.ts              ✅ NEW - Bulk upload endpoint
│       └── bulk-exit/
│           └── route.ts                  ✅ NEW - Bulk exit endpoint

lib/
├── services/
│   ├── bulk-learner-upload-service.ts    ✅ NEW - Upload logic
│   ├── learner-validation-service.ts     ✅ NEW - Validation logic
│   └── bulk-exit-service.ts              ✅ NEW - Exit logic
│
└── utils/
    ├── excel-template-generator.ts       ✅ NEW - Generate templates
    └── excel-parser.ts                   ✅ NEW - Parse uploaded files
```

### Frontend Files to Create

```
app/(routes)/learners/profiles/
└── _components/
    ├── bulk-upload-profiles-dialog.tsx   ✅ NEW - Upload UI
    ├── bulk-exit-dialog.tsx              ✅ NEW - Exit UI
    ├── profiles-data-table.tsx           🔄 UPDATE - Add row selection
    └── profiles-toolbar.tsx              ✅ NEW - Toolbar with bulk actions
```

---

## 📊 Database Schema

### Learners Profiles Table (Existing)
```sql
learners_profiles
├── id (UUID, PK)
├── first_name (TEXT, required)
├── last_name (TEXT)
├── mobile (TEXT)
├── college_email (TEXT, unique)
├── personal_email (TEXT)
├── date_of_birth (DATE)
├── gender (TEXT)
├── blood_group (TEXT)
├── institution_id (UUID, FK, required)
├── department_id (UUID, FK, required)
├── program_id (UUID, FK, required)
├── semester_id (UUID, FK, required)
├── section_id (UUID, FK, required)
├── lifecycle_status (ENUM: enquiry, pending, approved, active, inactive, exited, graduated)
├── is_profile_complete (BOOLEAN)
├── photo_url (TEXT)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Profile Completeness Rules
```sql
is_profile_complete = true WHEN:
  first_name IS NOT NULL
  AND college_email IS NOT NULL
  AND mobile IS NOT NULL
  AND institution_id IS NOT NULL
  AND department_id IS NOT NULL
  AND program_id IS NOT NULL
  AND semester_id IS NOT NULL
  AND section_id IS NOT NULL
```

---

## 🎨 Excel Template Structure

### Sheet 1: Template (Main Data)

| Column | Required | Example | Validation |
|--------|----------|---------|------------|
| First Name | ✅ | JOHN | Not empty |
| Last Name | ❌ | DOE | - |
| Mobile | ✅ | 9876543210 | 10 digits |
| College Email | ✅ | john.doe@jkkn.ac.in | Valid email, @jkkn.ac.in domain |
| Personal Email | ❌ | john@gmail.com | Valid email |
| Date of Birth | ❌ | 01/01/2005 | DD/MM/YYYY |
| Gender | ❌ | Male | Male/Female/Other |
| Blood Group | ❌ | O+ | Valid blood group |
| Institution ID | ✅ | abc-123-def | Copy from ref sheet |
| Department ID | ✅ | def-456-ghi | Copy from ref sheet |
| Program ID | ✅ | ghi-789-jkl | Copy from ref sheet |
| Semester ID | ✅ | jkl-012-mno | Copy from ref sheet |
| Section ID | ✅ | mno-345-pqr | Copy from ref sheet |
| Photo URL | ❌ | https://... | Valid URL |

### Sheet 2-6: Reference Data
- **Institutions**: id, name, code
- **Departments**: id, name, institution_id, institution_name
- **Programs**: id, name, department_id, degree_type
- **Semesters**: id, semester_name, semester_number
- **Sections**: id, section_name, section_code

---

## 🔐 Permissions

### New Permissions Needed

```typescript
// Bulk Upload Permission
'learners.profiles.bulk_upload': boolean

// Bulk Exit Permission
'learners.profiles.bulk_exit': boolean
```

### Permission Matrix

| Action | Super Admin | Custom Role | Institution User |
|--------|-------------|-------------|------------------|
| Bulk Upload | ✅ Always | If permission granted | If permission granted + same institution |
| Bulk Exit | ✅ Always | If permission granted | If permission granted + same institution |
| View Temp Passwords | ✅ Always | ✅ If uploaded | ✅ If uploaded |

---

## 🔍 Validation Logic

### Row Validation Rules

```typescript
interface ValidationRule {
  field: string;
  required: boolean;
  validator: (value: any) => boolean;
  errorMessage: string;
}

const validationRules: ValidationRule[] = [
  {
    field: 'first_name',
    required: true,
    validator: (v) => v && v.trim().length > 0,
    errorMessage: 'First name is required'
  },
  {
    field: 'college_email',
    required: true,
    validator: (v) => /^[^\s@]+@jkkn\.ac\.in$/.test(v),
    errorMessage: 'Valid college email (@jkkn.ac.in) is required'
  },
  {
    field: 'mobile',
    required: true,
    validator: (v) => /^\d{10}$/.test(v),
    errorMessage: 'Valid 10-digit mobile number is required'
  },
  {
    field: 'institution_id',
    required: true,
    validator: async (v) => await checkInstitutionExists(v),
    errorMessage: 'Institution ID does not exist'
  },
  // ... more rules
];
```

### Duplicate Detection

```typescript
// Within file
const emails = rows.map(r => r.college_email);
const duplicates = emails.filter((e, i) => emails.indexOf(e) !== i);

// In database
const existing = await supabase
  .from('learners_profiles')
  .select('college_email')
  .in('college_email', emails);
```

---

## 🚀 API Specifications

### POST /api/learners/bulk-upload-profiles

**Request:**
```typescript
Content-Type: multipart/form-data

{
  file: File (Excel .xlsx)
}
```

**Response (Success):**
```typescript
{
  success: true,
  upload_summary: {
    total_rows: 100,
    valid_rows: 95,
    invalid_rows: 5,
    learners_created: 95
  },
  user_creation_summary: {
    profiles_complete: 90,
    existing_users: 85,
    new_users_created: 5,
    failed_users: 0
  },
  created_users: [
    {
      learner_id: "uuid",
      name: "John Doe",
      email: "john@jkkn.ac.in",
      temp_password: "Abc123!@#"
    }
  ],
  validation_errors: [
    {
      row: 5,
      errors: ["Invalid email format", "Department not found"]
    }
  ]
}
```

**Response (Error):**
```typescript
{
  success: false,
  error: "Unauthorized" | "Invalid file format" | "File too large",
  status: 401 | 400 | 413
}
```

### POST /api/learners/bulk-exit

**Request:**
```typescript
{
  learner_ids: string[] // UUIDs
}
```

**Response:**
```typescript
{
  success: true,
  total_selected: 10,
  learners_updated: 10,
  profiles_deactivated: 8,
  failed_count: 0,
  failed_learners: []
}
```

---

## 🎨 UI/UX Specifications

### Bulk Upload Dialog

**Structure:**
```
┌─────────────────────────────────────────────────┐
│  Bulk Upload Learners             [X]           │
├─────────────────────────────────────────────────┤
│  Upload complete learner profiles and           │
│  automatically create user accounts             │
│                                                  │
│  ┌────────────────────────────────────────┐   │
│  │ 📥 Download Template                   │   │
│  └────────────────────────────────────────┘   │
│                                                  │
│  ┌────────────────────────────────────────┐   │
│  │                                        │   │
│  │   Drag and drop Excel file here       │   │
│  │   or click to browse                   │   │
│  │                                        │   │
│  └────────────────────────────────────────┘   │
│                                                  │
│  [ ] Create user accounts for complete profiles│
│                                                  │
│  [Cancel]                     [Upload] ✅     │
└─────────────────────────────────────────────────┘
```

**Results Screen:**
```
┌─────────────────────────────────────────────────┐
│  Upload Results                      [X]        │
├─────────────────────────────────────────────────┤
│  ✅ Successfully uploaded 95 learners          │
│  ✅ Created 5 new user accounts                │
│                                                 │
│  📊 Summary:                                    │
│  • Total rows: 100                              │
│  • Valid: 95                                    │
│  • Invalid: 5                                   │
│  • Complete profiles: 90                        │
│  • New users: 5                                 │
│                                                 │
│  🔑 Created User Accounts:                     │
│  ┌──────────────────────────────────────────┐ │
│  │ Name       Email         Temp Password   │ │
│  │ John Doe   john@jkkn...  Abc123!@#      │ │
│  │ Jane Smith jane@jkkn...  Def456$%^      │ │
│  └──────────────────────────────────────────┘ │
│  [Export to Excel] 📥                          │
│                                                 │
│  ⚠️ Validation Errors (5):                    │
│  • Row 3: Invalid email format                 │
│  • Row 7: Department not found                 │
│                                                 │
│  [Close]                                        │
└─────────────────────────────────────────────────┘
```

### Bulk Exit Dialog

**Confirmation:**
```
┌─────────────────────────────────────────────────┐
│  Confirm Bulk Exit                   [X]        │
├─────────────────────────────────────────────────┤
│  ⚠️ You are about to exit 10 learners         │
│                                                 │
│  This will:                                     │
│  • Mark them as "Exited"                       │
│  • Deactivate their user accounts              │
│  • They won't be able to login                 │
│                                                 │
│  Selected learners:                             │
│  • John Doe (john@jkkn.ac.in)                  │
│  • Jane Smith (jane@jkkn.ac.in)                │
│  • ... and 8 more                               │
│                                                 │
│  [Cancel]              [Confirm Exit] ⚠️      │
└─────────────────────────────────────────────────┘
```

---

## 🧪 Testing Plan

### Unit Tests

**Validation Service:**
- ✅ Valid data passes all rules
- ✅ Invalid email rejected
- ✅ Missing required fields rejected
- ✅ Invalid foreign keys rejected

**Upload Service:**
- ✅ Valid file parsed correctly
- ✅ Invalid rows filtered out
- ✅ Duplicates detected
- ✅ Profile completeness checked

**Exit Service:**
- ✅ Learners updated correctly
- ✅ Profiles deactivated correctly
- ✅ Non-existent learners handled

### Integration Tests

**Bulk Upload:**
1. Upload 10 valid learners → All created
2. Upload 10 with 3 invalid → 7 created, 3 errors
3. Upload with duplicate emails → Rejected
4. Upload complete profiles → Users created
5. Upload incomplete profiles → No users created
6. Upload with existing users → No duplicates

**Bulk Exit:**
1. Exit 5 active learners → All exited, profiles deactivated
2. Exit learner without profile → Learner exited only
3. Exit from different institution (non-super-admin) → Permission error

---

## 📦 Implementation Phases

### Phase 1: Backend Infrastructure (Week 1)
**Priority: HIGH**

1. ✅ Create validation service
   - Email validation
   - Required fields check
   - Foreign key validation
   - Duplicate detection

2. ✅ Create bulk upload service
   - Excel parsing
   - Bulk insert logic
   - User creation logic
   - Results compilation

3. ✅ Create bulk exit service
   - Batch update learners
   - Profile deactivation
   - Error handling

4. ✅ Create API routes
   - `/api/learners/bulk-upload-profiles`
   - `/api/learners/bulk-exit`

**Deliverables:**
- Working APIs
- Unit tests
- API documentation

### Phase 2: Frontend Components (Week 2)
**Priority: HIGH**

1. ✅ Create bulk upload dialog
   - Template download
   - File upload
   - Progress indicators
   - Results display

2. ✅ Create bulk exit dialog
   - Confirmation screen
   - Progress indicators
   - Results display

3. ✅ Update data table
   - Add row selection
   - Add toolbar
   - Integrate dialogs

**Deliverables:**
- Working UI components
- Integration with APIs
- UX testing

### Phase 3: Excel Templates (Week 2)
**Priority: MEDIUM**

1. ✅ Create template generator
   - Multi-sheet structure
   - Reference data population
   - Sample rows

2. ✅ Create template parser
   - Read Excel data
   - Type conversions
   - Error handling

**Deliverables:**
- Template generation working
- Parser working
- Template documentation

### Phase 4: Testing & Polish (Week 3)
**Priority: MEDIUM**

1. ✅ Integration testing
2. ✅ Performance testing
3. ✅ Security testing
4. ✅ Documentation
5. ✅ User training materials

**Deliverables:**
- Test reports
- Performance benchmarks
- User guide

---

## 🔒 Security Considerations

### Authentication & Authorization
- ✅ Validate user session
- ✅ Check bulk upload permission
- ✅ Check bulk exit permission
- ✅ Verify institution access

### Data Validation
- ✅ Sanitize all inputs
- ✅ Validate file format
- ✅ Check file size limits
- ✅ Prevent SQL injection

### User Creation Security
- ✅ Generate strong random passwords
- ✅ Hash passwords before storage
- ✅ Secure temp password transmission
- ✅ Email temp passwords (future)

---

## 📊 Success Metrics

| Metric | Target |
|--------|--------|
| Upload success rate | >95% |
| Validation accuracy | 100% |
| User creation success | >98% |
| Exit operation success | >99% |
| API response time | <10s for 100 learners |
| Template download time | <2s |

---

## 🎯 Key Design Decisions

### Decision 1: Auto User Creation
**Choice:** Automatically create users for complete profiles
**Rationale:** Reduces manual work, ensures consistency
**Trade-off:** Requires secure temp password management

### Decision 2: Validation Before Insert
**Choice:** Validate all rows before inserting any
**Rationale:** Prevents partial uploads, clearer error reporting
**Trade-off:** Slightly slower for large files

### Decision 3: Partial Success Allowed for User Creation
**Choice:** If learner creation succeeds but some user creations fail, still report success
**Rationale:** Learners are in database, users can be created later via sync
**Trade-off:** Need to clearly communicate partial success

### Decision 4: Database Functions for Duplicate Check
**Choice:** Reuse get_learners_missing_profiles() function
**Rationale:** Consistent logic, handles case-insensitivity, no pagination issues
**Trade-off:** None - this is the correct approach

---

## ✅ Definition of Done

**Bulk Upload Feature:**
- [ ] User can download template
- [ ] User can upload Excel file
- [ ] Validation works for all rules
- [ ] Learners created in database
- [ ] User accounts created for complete profiles
- [ ] Temp passwords displayed and exportable
- [ ] Errors clearly communicated
- [ ] Institution access control works
- [ ] Permissions checked
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Documentation complete

**Bulk Exit Feature:**
- [ ] User can select multiple learners
- [ ] Bulk exit button appears
- [ ] Confirmation dialog works
- [ ] Learners updated to exited status
- [ ] User profiles deactivated
- [ ] Results clearly communicated
- [ ] Institution access control works
- [ ] Permissions checked
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Documentation complete

---

## 📝 Notes

- Both features respect existing profile sync logic
- Reuse database functions for consistency
- Follow existing code patterns from enquiries module
- Ensure comprehensive error handling
- Provide clear user feedback at every step

---

**Status**: ⏳ READY FOR IMPLEMENTATION
**Estimated Effort**: 3 weeks
**Priority**: HIGH
