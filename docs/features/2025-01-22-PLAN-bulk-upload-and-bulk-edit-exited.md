# Implementation Plan: Bulk Upload Profiles & Bulk Edit Exited Learners

**Date**: 2025-01-22
**Module**: Learners Profiles
**Features**: Bulk Upload (Create) + Bulk Edit Exited (Update)

---

## 📋 Overview

### Feature 1: Bulk Upload Profiles ✅
Upload **NEW** learners directly to profiles page with complete data, automatically creating user accounts.

**Purpose:** Onboard new active learners in bulk

### Feature 2: Bulk Edit Exited Learners ✅ CORRECTED
Download **EXISTING** exited learners' data, fill in missing fields, and upload to update them.

**Purpose:** Complete profile data for learners who have already exited

---

## 🎯 Feature Comparison

| Aspect | Bulk Upload Profiles | Bulk Edit Exited |
|--------|---------------------|------------------|
| **Operation** | INSERT (Create new) | UPDATE (Modify existing) |
| **Target** | New learners | Existing exited learners |
| **Status** | Sets to 'active' | Remains 'exited' |
| **Template** | Blank with sample row | Pre-filled with current data |
| **ID Column** | Not required | **Required** (for matching) |
| **User Creation** | ✅ Yes (if profile complete) | ❌ No (they're exited) |
| **Empty Fields** | Error if required | Keep existing value |
| **Use Case** | Onboarding 100 new students | Fixing 50 exited students' missing emails |

---

## 📊 Feature 1: Bulk Upload Profiles

### Requirements

**Functional:**
1. Upload Excel file with NEW learner data
2. Validate all required fields
3. Check for duplicates (email)
4. Bulk insert learners with lifecycle_status = 'active'
5. Auto-detect complete profiles
6. Create user accounts for complete profiles
7. Generate temp passwords
8. Return comprehensive results

**Validation Rules:**
- ✅ First name required
- ✅ College email required (@jkkn.ac.in)
- ✅ Mobile required (10 digits)
- ✅ Institution ID required (must exist)
- ✅ Department ID required (must exist)
- ✅ Program ID required (must exist)
- ✅ Semester ID required (must exist)
- ✅ Section ID required (must exist)
- ✅ No duplicate emails in file
- ✅ No duplicate emails in database

### Template Structure

**Sheet 1: Template**
| Column | Required | Example |
|--------|----------|---------|
| First Name | ✅ | JOHN |
| Last Name | ❌ | DOE |
| Mobile | ✅ | 9876543210 |
| College Email | ✅ | john@jkkn.ac.in |
| Personal Email | ❌ | john@gmail.com |
| Date of Birth | ❌ | 01/01/2005 |
| Gender | ❌ | Male |
| Blood Group | ❌ | O+ |
| Institution ID | ✅ | copy-from-ref |
| Department ID | ✅ | copy-from-ref |
| Program ID | ✅ | copy-from-ref |
| Semester ID | ✅ | copy-from-ref |
| Section ID | ✅ | copy-from-ref |
| Photo URL | ❌ | https://... |

**Sheets 2-6: Reference Data**
- Institutions, Departments, Programs, Semesters, Sections

### API: POST /api/learners/bulk-upload-profiles

**Request:**
```
Content-Type: multipart/form-data
Body: { file: File }
```

**Response:**
```json
{
  "success": true,
  "upload_summary": {
    "total_rows": 100,
    "valid_rows": 95,
    "invalid_rows": 5,
    "learners_created": 95
  },
  "user_creation_summary": {
    "profiles_complete": 90,
    "existing_users": 85,
    "new_users_created": 5
  },
  "created_users": [
    {
      "name": "John Doe",
      "email": "john@jkkn.ac.in",
      "temp_password": "Abc123!@#"
    }
  ],
  "errors": [...]
}
```

---

## 📊 Feature 2: Bulk Edit Exited Learners

### Requirements

**Functional:**
1. Download current exited learners data as Excel
2. User fills in missing/empty fields
3. Upload file to update existing records
4. Validate updated data
5. **Only UPDATE**, never CREATE new records
6. Match records by ID column
7. Update only non-empty cells
8. Return update results

**Validation Rules:**
- ✅ ID must exist in database
- ✅ Learner must have lifecycle_status = 'exited'
- ✅ User must have access to learner (institution check)
- ✅ Email format valid (if provided)
- ✅ Mobile format valid (if provided)
- ✅ Foreign keys exist (if provided)
- ❌ Can't update: id, institution_id, lifecycle_status, created_at

**Update Logic:**
- Empty cell in upload = Keep existing database value
- Non-empty cell = Update database value
- Partial updates allowed (only some fields)

### Template Structure (Pre-filled)

**Sheet 1: Exited Learners**
| Column | Editable | Current Value |
|--------|----------|---------------|
| **ID*** | ❌ No | abc-123-def |
| First Name | ✅ Yes | JOHN |
| Last Name | ✅ Yes | (empty) ← Fill this |
| Mobile | ✅ Yes | (empty) ← Fill this |
| College Email | ✅ Yes | john@jkkn.ac.in |
| Personal Email | ✅ Yes | (empty) |
| Date of Birth | ✅ Yes | (empty) |
| Gender | ✅ Yes | Male |
| Blood Group | ✅ Yes | (empty) |
| Department ID | ✅ Yes | def-456 |
| Program ID | ✅ Yes | ghi-789 |
| Semester ID | ✅ Yes | jkl-012 |
| Section ID | ✅ Yes | mno-345 |
| Photo URL | ✅ Yes | (empty) |

**Note:** Template is pre-filled with current data from database

### API: GET /api/learners/export-exited-for-edit

**Purpose:** Download current exited learners data

**Query Params:**
- `institution_id` (optional) - Filter by institution
- `include_complete` (boolean) - Include complete profiles or only incomplete

**Response:** Excel file with current data

### API: POST /api/learners/bulk-edit-exited

**Purpose:** Update exited learners from uploaded Excel

**Request:**
```
Content-Type: multipart/form-data
Body: { file: File }
```

**Response:**
```json
{
  "success": true,
  "total_rows": 50,
  "updated": 45,
  "skipped": 3,  // No data to update
  "failed": 2,
  "updated_learners": [
    {
      "id": "abc-123",
      "name": "John Doe",
      "fields_updated": ["mobile", "last_name"]
    }
  ],
  "errors": [
    {
      "row": 5,
      "id": "def-456",
      "error": "Invalid email format"
    }
  ]
}
```

### Update Algorithm

```typescript
for each row in uploaded_excel:
  // 1. Validation
  if (!row.id) {
    errors.push("Row {n}: ID is required");
    continue;
  }

  const learner = await findLearnerById(row.id);
  if (!learner) {
    errors.push("Row {n}: Learner not found");
    continue;
  }

  if (learner.lifecycle_status !== 'exited') {
    errors.push("Row {n}: Learner is not exited");
    continue;
  }

  if (!hasAccessToLearner(user, learner)) {
    errors.push("Row {n}: No access to this learner");
    continue;
  }

  // 2. Build partial update object
  const updateData = {};
  if (row.first_name?.trim()) updateData.first_name = row.first_name.trim();
  if (row.last_name?.trim()) updateData.last_name = row.last_name.trim();
  if (row.mobile?.trim()) updateData.mobile = row.mobile.trim();
  // ... only non-empty fields

  if (Object.keys(updateData).length === 0) {
    skipped++;
    continue;
  }

  // 3. Validate field values
  if (updateData.email && !isValidEmail(updateData.email)) {
    errors.push("Row {n}: Invalid email");
    continue;
  }

  // 4. Update database
  await supabase
    .from('learners_profiles')
    .update(updateData)
    .eq('id', row.id)
    .eq('lifecycle_status', 'exited');  // Extra safety

  updated++;
  updated_learners.push({...});
```

---

## 🏗️ Architecture

### File Structure

```
app/
├── api/
│   └── learners/
│       ├── bulk-upload-profiles/
│       │   └── route.ts                    ✅ NEW - Create learners
│       ├── export-exited-for-edit/
│       │   └── route.ts                    ✅ NEW - Download template
│       └── bulk-edit-exited/
│           └── route.ts                    ✅ NEW - Update learners

lib/
├── services/
│   ├── bulk-learner-upload-service.ts      ✅ NEW - Upload logic
│   ├── bulk-learner-edit-service.ts        ✅ NEW - Edit logic
│   └── learner-validation-service.ts       ✅ NEW - Validation
│
└── utils/
    ├── excel-template-generator.ts         ✅ NEW - Generate templates
    └── excel-parser.ts                     ✅ NEW - Parse files

app/(routes)/learners/profiles/_components/
├── bulk-upload-profiles-dialog.tsx         ✅ NEW - Upload UI
└── bulk-edit-exited-dialog.tsx             ✅ NEW - Edit UI
```

---

## 🎨 UI/UX

### Bulk Upload Dialog

```
┌────────────────────────────────────────────┐
│ Bulk Upload New Learners       [X]         │
├────────────────────────────────────────────┤
│ Upload new learners with complete profiles │
│                                             │
│ [📥 Download Template]                     │
│                                             │
│ ┌────────────────────────────────────┐    │
│ │   Drop Excel file here or click    │    │
│ └────────────────────────────────────┘    │
│                                             │
│ ☑ Create user accounts (if complete)      │
│                                             │
│ [Cancel]                    [Upload] ✅   │
└────────────────────────────────────────────┘
```

### Bulk Edit Dialog

```
┌────────────────────────────────────────────┐
│ Bulk Edit Exited Learners      [X]         │
├────────────────────────────────────────────┤
│ Update missing data for exited learners    │
│                                             │
│ Found: 127 exited learners                 │
│ With incomplete profiles: 84               │
│                                             │
│ Step 1: Download Template                  │
│ [📥 Download Current Data]                 │
│                                             │
│ Step 2: Fill Missing Fields & Upload       │
│ ┌────────────────────────────────────┐    │
│ │   Drop edited file here or click   │    │
│ └────────────────────────────────────┘    │
│                                             │
│ [Cancel]                    [Update] ✅   │
└────────────────────────────────────────────┘
```

### Results Display (Bulk Edit)

```
┌────────────────────────────────────────────┐
│ Update Results                  [X]        │
├────────────────────────────────────────────┤
│ ✅ Successfully updated 45 learners       │
│                                             │
│ 📊 Summary:                                │
│ • Total rows: 50                            │
│ • Updated: 45                               │
│ • Skipped: 3 (no changes)                   │
│ • Failed: 2                                 │
│                                             │
│ Updated Learners:                           │
│ • John Doe - Updated: mobile, email        │
│ • Jane Smith - Updated: last_name          │
│ • ...                                       │
│                                             │
│ ⚠️ Errors (2):                            │
│ • Row 5: Invalid email format              │
│ • Row 12: Learner not found                │
│                                             │
│ [Close]                                     │
└────────────────────────────────────────────┘
```

---

## 🔐 Permissions

### Permission Keys

```typescript
// Bulk Upload (Create new)
'learners.profiles.bulk_upload': boolean

// Bulk Edit Exited (Update existing)
'learners.exited.bulk_edit': boolean
// OR
'learners.edit': boolean  // General edit permission
```

### Permission Matrix

| Action | Super Admin | With Permission | Institution Filter |
|--------|-------------|-----------------|-------------------|
| Bulk Upload | ✅ | ✅ | ✅ Own institution only |
| Bulk Edit Exited | ✅ | ✅ | ✅ Own institution only |
| Download Template | ✅ | ✅ | ✅ Own institution only |

---

## 🧪 Testing

### Bulk Upload Tests
1. ✅ Upload 10 valid new learners → All created
2. ✅ Upload with duplicate emails → Rejected
3. ✅ Upload complete profiles → Users created
4. ✅ Upload incomplete profiles → No users
5. ✅ Upload with invalid foreign keys → Validation errors

### Bulk Edit Tests
1. ✅ Update 10 exited learners → All updated
2. ✅ Try to update non-exited learner → Error
3. ✅ Try to update with invalid ID → Error
4. ✅ Update with empty cells → Keeps existing values
5. ✅ Update with invalid email → Validation error
6. ✅ Try to update protected fields → Error
7. ✅ Update learner from different institution (non-admin) → Permission error

---

## 📦 Implementation Phases

### Phase 1: Bulk Upload Feature (Week 1)

**Backend:**
1. Create `/api/learners/bulk-upload-profiles` route
2. Create `bulk-learner-upload-service.ts`
3. Create validation service
4. Template generation with reference sheets

**Frontend:**
1. Create `bulk-upload-profiles-dialog.tsx`
2. Add button to profiles page (Active tab)
3. Permission integration

### Phase 2: Bulk Edit Feature (Week 2)

**Backend:**
1. Create `/api/learners/export-exited-for-edit` route
2. Create `/api/learners/bulk-edit-exited` route
3. Create `bulk-learner-edit-service.ts`
4. Export current data logic

**Frontend:**
1. Create `bulk-edit-exited-dialog.tsx`
2. Add button to profiles page (Exited tab)
3. Permission integration

### Phase 3: Testing & Polish (Week 3)

1. Integration testing
2. Security testing
3. Performance testing
4. Documentation
5. User guides

---

## ✅ Success Criteria

### Bulk Upload
- [ ] Can upload 100 new learners successfully
- [ ] Validation catches all errors
- [ ] Users created for complete profiles
- [ ] Temp passwords displayed and exportable
- [ ] Institution access control works

### Bulk Edit Exited
- [ ] Can download current exited learners data
- [ ] Can update 50 learners successfully
- [ ] Only updates provided fields
- [ ] Rejects updates to protected fields
- [ ] Rejects updates to non-exited learners
- [ ] Institution access control works

---

## 🎯 Key Design Decisions

**Decision 1: Separate Features**
- Bulk Upload = Create new (INSERT)
- Bulk Edit = Update existing (UPDATE)
- Keep them separate for clarity

**Decision 2: Pre-filled Template for Bulk Edit**
- Download template with current data
- User only fills missing fields
- Easier than manual data entry

**Decision 3: No User Creation for Exited**
- Exited learners don't need accounts
- Keeps logic simple
- Can be added later if needed

**Decision 4: Partial Updates**
- Only update non-empty cells
- Prevents accidental data deletion
- More flexible for users

---

**Status**: ⏳ READY FOR IMPLEMENTATION
**Estimated Effort**: 3 weeks
**Priority**: HIGH

**Features Clarified:**
- ✅ Feature 1: Bulk Upload Profiles (Create new active learners + users)
- ✅ Feature 2: Bulk Edit Exited (Update existing exited learners)
