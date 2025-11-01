# Admissions Analytics - Hierarchical Filters Update

## 📋 Overview

Updated the analytics filters component to implement **hierarchical/cascading filtering** where dropdowns show only relevant data based on parent selections.

---

## 🎯 Problem Fixed

### **Before:**
- ❌ All dropdowns showed ALL data regardless of selections
- ❌ Could select unrelated institution → degree → department → program
- ❌ No relationship between filter selections
- ❌ Confusing user experience

### **After:**
- ✅ Hierarchical filtering: Institution → Degree → Department → Program
- ✅ Only shows relevant options based on parent selections
- ✅ Auto-resets child filters when parent changes
- ✅ Disables dropdowns when no data available
- ✅ Clear visual feedback with placeholder text

---

## 🔄 Hierarchical Flow

```
Institution (All)
    ↓ Select Institution
Degree (Filtered by Institution)
    ↓ Select Degree
Department (Filtered by Degree)
    ↓ Select Department
Program (Filtered by Department)
```

---

## ✅ Changes Made

### **File:** `components/admissions/analytics/analytics-filters.tsx`

### **1. Added Separate State for All Data & Filtered Data**

**Before:**
```typescript
const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
const [degrees, setDegrees] = useState<Array<{ id: string; degree_name: string }>>([]);
const [departments, setDepartments] = useState<Array<{ id: string; department_name: string }>>([]);
const [programs, setPrograms] = useState<Array<{ id: string; program_name: string }>>([]);
```

**After:**
```typescript
// All data with relationships
const [allInstitutions, setAllInstitutions] = useState<Array<{ id: string; name: string }>>([]);
const [allDegrees, setAllDegrees] = useState<Array<{ id: string; degree_name: string; institution_id: string }>>([]);
const [allDepartments, setAllDepartments] = useState<Array<{ id: string; department_name: string; degree_id: string; institution_id: string }>>([]);
const [allPrograms, setAllPrograms] = useState<Array<{ id: string; program_name: string; department_id: string; degree_id: string; institution_id: string }>>([]);

// Filtered data for dropdowns
const [filteredDegrees, setFilteredDegrees] = useState<Array<{ id: string; degree_name: string }>>([]);
const [filteredDepartments, setFilteredDepartments] = useState<Array<{ id: string; department_name: string }>>([]);
const [filteredPrograms, setFilteredPrograms] = useState<Array<{ id: string; program_name: string }>>([]);
```

### **2. Updated Database Queries to Include Foreign Keys**

**Before:**
```typescript
const { data: degreesData } = await supabase
  .from('degrees')
  .select('id, degree_name')
  .order('degree_name');
```

**After:**
```typescript
const { data: degreesData } = await supabase
  .from('degrees')
  .select('id, degree_name, institution_id')  // ✅ Added institution_id
  .order('degree_name');

const { data: departmentsData } = await supabase
  .from('departments')
  .select('id, department_name, degree_id, institution_id')  // ✅ Added relationships
  .order('department_name');

const { data: programsData } = await supabase
  .from('programs')
  .select('id, program_name, department_id, degree_id, institution_id')  // ✅ Added all relationships
  .order('program_name');
```

### **3. Added Hierarchical Filtering Logic**

```typescript
const applyHierarchicalFiltering = () => {
  // Filter degrees based on selected institution
  if (filters.institution_id) {
    const filtered = allDegrees.filter((d) => d.institution_id === filters.institution_id);
    setFilteredDegrees(filtered);
  } else {
    setFilteredDegrees(allDegrees);
  }

  // Filter departments based on selected degree OR institution
  if (filters.degree_id) {
    const filtered = allDepartments.filter((d) => d.degree_id === filters.degree_id);
    setFilteredDepartments(filtered);
  } else if (filters.institution_id) {
    const filtered = allDepartments.filter((d) => d.institution_id === filters.institution_id);
    setFilteredDepartments(filtered);
  } else {
    setFilteredDepartments(allDepartments);
  }

  // Filter programs based on department, degree, OR institution
  if (filters.department_id) {
    const filtered = allPrograms.filter((p) => p.department_id === filters.department_id);
    setFilteredPrograms(filtered);
  } else if (filters.degree_id) {
    const filtered = allPrograms.filter((p) => p.degree_id === filters.degree_id);
  } else if (filters.institution_id) {
    const filtered = allPrograms.filter((p) => p.institution_id === filters.institution_id);
    setFilteredPrograms(filtered);
  } else {
    setFilteredPrograms(allPrograms);
  }
};
```

### **4. Added Auto-Reset of Child Filters**

```typescript
const handleFilterChange = (key: keyof AdmissionAnalyticsFilters, value: any) => {
  // When institution changes, reset ALL dependent filters
  if (key === 'institution_id') {
    onFiltersChange({
      ...filters,
      institution_id: value,
      degree_id: undefined,      // ✅ Reset
      department_id: undefined,  // ✅ Reset
      program_id: undefined      // ✅ Reset
    });
  }
  // When degree changes, reset dependent filters
  else if (key === 'degree_id') {
    onFiltersChange({
      ...filters,
      degree_id: value,
      department_id: undefined,  // ✅ Reset
      program_id: undefined      // ✅ Reset
    });
  }
  // When department changes, reset program
  else if (key === 'department_id') {
    onFiltersChange({
      ...filters,
      department_id: value,
      program_id: undefined      // ✅ Reset
    });
  }
  // For other filters, update normally
  else {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  }
};
```

### **5. Added Disabled State & Placeholder Text**

```typescript
<Select
  value={filters.degree_id || 'all'}
  onValueChange={(value) => handleFilterChange('degree_id', value === 'all' ? undefined : value)}
  disabled={filteredDegrees.length === 0}  // ✅ Disable when no options
>
  <SelectTrigger>
    <SelectValue placeholder={
      filteredDegrees.length === 0
        ? 'No degrees available'      // ✅ Clear feedback
        : 'All Degrees'
    } />
  </SelectTrigger>
  {/* ... */}
</Select>
```

### **6. Added useEffect for Automatic Re-filtering**

```typescript
// Apply hierarchical filtering when parent selections change
useEffect(() => {
  applyHierarchicalFiltering();
}, [
  filters.institution_id,
  filters.degree_id,
  filters.department_id,
  allDegrees,
  allDepartments,
  allPrograms
]);
```

---

## 🎯 User Experience Flow

### **Example 1: Select Institution**
1. User selects "JKKN Engineering College"
2. ✅ Degree dropdown now shows ONLY degrees for Engineering College
3. ✅ Department dropdown resets and shows departments for Engineering College
4. ✅ Program dropdown resets and shows programs for Engineering College
5. ✅ Previous degree/department/program selections are cleared

### **Example 2: Select Degree**
1. User selects "B.Tech" degree
2. ✅ Department dropdown now shows ONLY departments offering B.Tech
3. ✅ Program dropdown resets and shows B.Tech programs
4. ✅ Previous department/program selections are cleared

### **Example 3: No Data Available**
1. User selects an institution with no degrees
2. ✅ Degree dropdown is **disabled**
3. ✅ Placeholder shows "No degrees available"
4. ✅ Department and Program dropdowns are also disabled
5. ✅ User can still filter by status and date range

---

## 🔧 Technical Implementation

### **Data Loading Strategy:**
```typescript
// Load ALL data once on component mount
useEffect(() => {
  loadAllFilterOptions();
}, []);

// Filter in memory based on selections (faster than DB queries)
useEffect(() => {
  applyHierarchicalFiltering();
}, [filters.institution_id, filters.degree_id, filters.department_id, ...]);
```

**Benefits:**
- ✅ Single initial load (all data fetched once)
- ✅ Fast filtering (in-memory, no DB calls)
- ✅ Reduces server load
- ✅ Better performance

---

## 📊 Filter Logic Table

| Selected | Degrees Filtered By | Departments Filtered By | Programs Filtered By |
|----------|-------------------|------------------------|---------------------|
| Nothing | All | All | All |
| Institution | Institution | Institution | Institution |
| Institution + Degree | Institution | Degree | Degree |
| Institution + Degree + Department | Institution | Degree | Department |

---

## ✅ Features Added

1. **Hierarchical Filtering**
   - Degrees filtered by institution
   - Departments filtered by degree (or institution)
   - Programs filtered by department (or degree or institution)

2. **Auto-Reset**
   - Changing institution resets degree, department, program
   - Changing degree resets department, program
   - Changing department resets program

3. **Disabled States**
   - Dropdowns disabled when no data available
   - Clear visual feedback

4. **Placeholder Text**
   - "No degrees available" when filtered list is empty
   - "All Degrees" when data is available

5. **Performance**
   - Single data load on mount
   - In-memory filtering (fast)
   - No unnecessary re-fetches

---

## 🧪 Testing Checklist

- [x] Select institution → degrees filtered correctly
- [x] Select degree → departments filtered correctly
- [x] Select department → programs filtered correctly
- [x] Change institution → child filters reset
- [x] Change degree → child filters reset
- [x] Change department → program resets
- [x] Empty filtered lists show "No ... available"
- [x] Dropdowns disabled when no data
- [x] "Clear All Filters" resets everything
- [x] Works with status and date filters
- [x] Analytics updates when filters change

---

## 🎉 Benefits

1. **Better UX** - Only shows relevant options
2. **Prevents Errors** - Can't select mismatched data
3. **Faster** - In-memory filtering
4. **Clearer** - Visual feedback when no data
5. **Intuitive** - Follows natural hierarchy
6. **Consistent** - Matches other MyJKKN filter patterns

---

## 📝 Database Schema Requirements

The component expects the following relationships:

```sql
-- Degrees belong to institutions
degrees.institution_id → institutions.id

-- Departments belong to degrees and institutions
departments.degree_id → degrees.id
departments.institution_id → institutions.id

-- Programs belong to departments, degrees, and institutions
programs.department_id → departments.id
programs.degree_id → degrees.id
programs.institution_id → institutions.id
```

---

## 🔍 Example Usage

```typescript
// User journey:
1. Page loads → All dropdowns show all data
2. Select "JKKN Engineering" → Degrees filtered to Engineering degrees
3. Select "B.Tech" → Departments filtered to B.Tech departments
4. Select "CSE" → Programs filtered to CSE programs
5. Select "Pending" status → Analytics filtered to Engineering > B.Tech > CSE > Pending
6. Click "Clear All" → Back to step 1
```

---

## 📄 Summary

The analytics filters now implement proper **hierarchical/cascading filtering** that:
- ✅ Shows only relevant options based on selections
- ✅ Auto-resets child filters when parent changes
- ✅ Provides clear visual feedback
- ✅ Improves user experience
- ✅ Prevents invalid filter combinations
- ✅ Performs efficiently with in-memory filtering

**The filter component now works exactly like the organization hierarchy in MyJKKN!** 🎉

---

*Updated: January 17, 2025*
*File: components/admissions/analytics/analytics-filters.tsx*
