# Enquiry Form - Missing Features Analysis

## Created: 2025-01-18
## Purpose: Document all missing features from admission form that need to be added to enquiry form

---

## 1. MISSING FIELDS

### Basic Details Section
- [x] `enquiryDate` - Auto-populated with today's date
- [ ] `aadharNumber` - Aadhar number field (currently removed but exists in DB)

### Course Selection Section
- [ ] `collegeEmail` - Email with @jkkn.ac.in validation
- [ ] `registerNumber` - Student register number
- [ ] `regulationId` - Academic regulation ID
- [ ] `batchId` - Batch ID

---

## 2. MISSING AUTO-CALCULATION LOGIC

### A. Percentage Calculation (10th & 12th Marks)

**Location**: `academic-information.tsx` lines 180-207

```typescript
// 10th Marks Auto-Calculation
useEffect(() => {
  if (tenthObtainedMarks && tenthMaxMarks && Number(tenthMaxMarks) > 0) {
    const percentage = ((Number(tenthObtainedMarks) / Number(tenthMaxMarks)) * 100).toFixed(2);
    form.setValue('tenthMarks.percentage', percentage);
  } else {
    form.setValue('tenthMarks.percentage', '');
  }
}, [tenthObtainedMarks, tenthMaxMarks, form]);

// 12th Marks Auto-Calculation
useEffect(() => {
  if (twelfthObtainedMarks && twelfthMaxMarks && Number(twelfthMaxMarks) > 0) {
    const percentage = ((Number(twelfthObtainedMarks) / Number(twelfthMaxMarks)) * 100).toFixed(2);
    form.setValue('twelfthMarks.percentage', percentage);
  } else {
    form.setValue('twelfthMarks.percentage', '');
  }
}, [twelfthObtainedMarks, twelfthMaxMarks, form]);
```

### B. Cutoff Marks Calculation

**Location**: `academic-information.tsx` lines 219-290

**Engineering Cutoff Formula**:
```
((Physics + Chemistry) / 2) + Mathematics
```

**Medical Cutoff Formula 1** (when Biology is selected):
```
((Physics + Chemistry) / 2) + Biology
```

**Medical Cutoff Formula 2** (when Botany+Zoology selected):
```
((Physics + Chemistry) / 2) + Botany + (Zoology / 2)
```

```typescript
useEffect(() => {
  // Engineering cutoff
  if (physicsMarks && chemistryMarks && mathsMarks) {
    const engineeringCutoff = (
      (Number(physicsMarks) + Number(chemistryMarks)) / 2 +
      Number(mathsMarks)
    ).toFixed(2);
    form.setValue('engineeringCutoffMarks', engineeringCutoff);
  }

  // Medical cutoff (Biology)
  if (physicsMarks && chemistryMarks && biologyMarks) {
    const medicalCutoff = (
      (Number(physicsMarks) + Number(chemistryMarks)) / 2 +
      Number(biologyMarks)
    ).toFixed(2);
    form.setValue('medicalCutoffMarks', medicalCutoff);
  }

  // Medical cutoff (Botany + Zoology)
  else if (physicsMarks && chemistryMarks && botanyMarks && zoologyMarks) {
    const medicalCutoff = (
      (Number(physicsMarks) + Number(chemistryMarks)) / 2 +
      Number(botanyMarks) +
      Number(zoologyMarks) / 2
    ).toFixed(2);
    form.setValue('medicalCutoffMarks', medicalCutoff);
  }
}, [physicsMarks, chemistryMarks, mathsMarks, biologyMarks, botanyMarks, zoologyMarks, form]);
```

---

## 3. DYNAMIC SUBJECT FIELDS BASED ON 12TH GROUP

**Location**: `academic-information.tsx` lines 293-900+

**Groups and their subjects**:

1. **PCBM** - Physics, Chemistry, Biology, Mathematics
2. **PCCS** - Physics, Chemistry, Computer Science, Mathematics
3. **PCBZ** - Physics, Chemistry, Botany, Zoology
4. **PCBC** - Physics, Chemistry, Biology, Computer Science
5. **PCBN** - Physics, Chemistry, Biology, Nursing
6. **PCMH** - Physics, Chemistry, Mathematics, Home Science
7. **CSECA** - Computer Science, Economics, Commerce, Accountancy
8. **HECA** - History, Economics, Commerce, Accountancy
9. **SECA** - Statistics, Economics, Commerce, Accountancy
10. **AA** - Accountancy & Auditing
11. **Others** - Other Groups (no specific fields)

**Implementation**: Use conditional rendering based on `twelfthMarks.group` selection

---

## 4. NAVIGATION & BUTTON LOGIC

**Location**: `admission-form.tsx` lines 1015-1068

### A. Previous Button
- Disabled on first tab
- Moves to previous tab
- Scrolls to top

### B. Next Button (without saving)
- Just validates format and moves to next tab
- No data saved

### C. Save & Next Button
- **Saves current section as draft** (status='draft')
- Creates new draft OR updates existing draft
- Shows success toast
- Moves to next tab
- **Key feature**: Allows incomplete forms to be saved

### D. Submit Button
- **Only visible on last tab**
- Validates ALL required fields
- Changes status from 'draft' to 'pending'
- Creates final admission record

### E. Cancel Button
- Shows confirmation dialog
- Deletes draft if exists
- Redirects to list page

**Code Pattern**:
```typescript
const [isSavingSection, setIsSavingSection] = useState(false);
const [savedAdmissionId, setSavedAdmissionId] = useState(null);

const handleSaveAndNext = async () => {
  const formData = form.getValues();
  const formattedData = formatFormDataForAPI(formData, true); // true = draft mode

  if (savedAdmissionId) {
    // Update existing draft
    await updateDraftAdmission.mutateAsync({ id: savedAdmissionId, data: formattedData });
  } else {
    // Create new draft
    const result = await saveDraftAdmission.mutateAsync(formattedData);
    setSavedAdmissionId(result.id);
  }

  goToNextTab();
};
```

---

## 5. SCROLL TO TOP ON TAB CHANGE

**Location**: `admission-form.tsx` lines 197-199, 423-424, 433-435

```typescript
// Auto-scroll when tab changes
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}, [activeTab]);

// Manual scroll in navigation functions
const goToNextTab = () => {
  setActiveTab(formTabs[currentIndex + 1].id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
```

---

## 6. DRAFT MANAGEMENT

**Location**: `admission-form.tsx` lines 179, 518-543

### Save Draft Logic:
1. Get current form values
2. Format data for API (partial data OK)
3. Set status = 'draft'
4. If savedAdmissionId exists → UPDATE
5. If no savedAdmissionId → CREATE new draft and save ID
6. Show success toast
7. Continue to next tab

### Cancel Draft Logic:
```typescript
const handleConfirmCancel = async () => {
  if (savedAdmissionId) {
    await supabase
      .from('admissions')
      .delete()
      .eq('id', savedAdmissionId)
      .eq('status', 'draft'); // Only delete drafts!

    toast.success('Draft admission cancelled successfully');
  }

  router.push('/admissions');
};
```

---

## 7. DATA FORMATTING HELPERS

**Location**: `admission-form.tsx` lines 606-727

### A. String Formatting
```typescript
function formatStringValue(str: string, isEmail: boolean = false): string {
  if (!str) return '';
  return isEmail ? str.trim().toLowerCase() : str.trim().toUpperCase();
}
```

### B. Accommodation Type Formatting
```typescript
function formatAccommodationType(type: string): string {
  if (!type) return '';
  return type.replace(/_/g, ' ').toUpperCase(); // "day_scholar" → "DAY SCHOLAR"
}
```

### C. UUID Validation
```typescript
const isValidUUID = (str: string | undefined): boolean => {
  if (!str) return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(str);
};
```

### D. Location Name Conversion
```typescript
const getLocationNameById = (
  id: string | undefined,
  type: 'state' | 'district' | 'taluk',
  stateId?: string,
  districtId?: string
): string | undefined => {
  // Converts location IDs to display names
  // Used in permanent address fields
};
```

---

## 8. FORM INITIALIZATION & DATA CONVERSION

**Location**: `admission-form.tsx` lines 236-308

### Handle Database to Form Format:
```typescript
const ensureNestedDefaults = (data: any) => {
  // Convert tenth_marks (DB) → tenthMarks (Form)
  let tenthMarks = {};
  if (data.tenth_marks) {
    const dbMarks = typeof data.tenth_marks === 'string'
      ? JSON.parse(data.tenth_marks)
      : data.tenth_marks;

    tenthMarks = {
      maxMarks: dbMarks.maxMarks || dbMarks.max_marks || '',
      obtainedMarks: dbMarks.obtainedMarks || dbMarks.obtained_marks || '',
      percentage: dbMarks.percentage || ''
    };
  }

  // Same for twelfthMarks...

  return {
    ...data,
    tenthMarks: {
      maxMarks: tenthMarks.maxMarks || '',
      obtainedMarks: tenthMarks.obtainedMarks || '',
      percentage: tenthMarks.percentage || ''
    },
    twelfthMarks: { /* similar */ }
  };
};
```

---

## 9. VALIDATION & ERROR HANDLING

**Location**: `admission-form.tsx` lines 739-803

### Find First Tab with Errors:
```typescript
const onSubmit = async (data) => {
  const isValid = await form.trigger();

  if (!isValid) {
    const errors = form.formState.errors;

    // Find first tab with errors
    for (const tab of formTabs) {
      const fieldsToValidate = getFieldsForTab(tab.id);
      const hasError = fieldsToValidate.some(field => /* check errors */);

      if (hasError) {
        setActiveTab(tab.id); // Switch to error tab
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast(`Please correct errors in the "${tab.label}" section`);
        break;
      }
    }
    return;
  }

  // Validate required fields for final submission
  if (!data.semesterId || !isValidUUID(data.semesterId)) {
    toast.error('Semester is required for admission submission');
    setActiveTab('course-selection');
    return;
  }

  // ... continue submission
};
```

---

## 10. CANCEL CONFIRMATION DIALOG

**Location**: `admission-form.tsx` lines 1072-1099

```typescript
<Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Cancel Admission</DialogTitle>
      <DialogDescription>
        {savedAdmissionId
          ? 'All saved data will be permanently deleted'
          : 'Any unsaved changes will be lost'}
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
        Keep Editing
      </Button>
      <Button variant="destructive" onClick={handleConfirmCancel}>
        {savedAdmissionId ? 'Delete & Cancel' : 'Cancel'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## IMPLEMENTATION PRIORITY

1. **HIGH PRIORITY** (Core functionality):
   - [ ] Auto-percentage calculation
   - [ ] Save & Next button
   - [ ] Previous/Next/Cancel buttons
   - [ ] Draft save/update logic

2. **MEDIUM PRIORITY** (Enhanced features):
   - [ ] Auto-cutoff calculation
   - [ ] Dynamic subject fields by group
   - [ ] Cancel confirmation dialog
   - [ ] Scroll to top on tab change

3. **LOW PRIORITY** (Nice to have):
   - [ ] Missing fields (enquiryDate, aadharNumber, collegeEmail, etc.)
   - [ ] Data formatting helpers
   - [ ] Location name conversion
   - [ ] Error tab switching

---

## NEXT STEPS

1. Update `enquiry-form.tsx` main form component with navigation logic
2. Update `academic-information.tsx` section with auto-calculations
3. Update `course-selection.tsx` with missing fields
4. Update `basic-details.tsx` with missing fields
5. Test all auto-calculations thoroughly
6. Test draft save/update flow
7. Test cancel with draft deletion

---

## NOTES

- All fields should remain OPTIONAL for draft mode
- Only validate required fields on final submission (last tab)
- Marks calculation should update in real-time as user types
- Subject fields should appear/disappear based on group selection
- Draft should save even with incomplete data
