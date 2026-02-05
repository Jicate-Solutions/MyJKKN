# Mobile Responsiveness - Quick Fix Reference

**Priority Files to Fix:**

## 🔴 Critical (P0) - Fix Immediately

### 1. Fixed Width Modals (4 files)

```bash
# Files to fix:
app/(routes)/grievance/layout.tsx                       # w-[600px]
app/(routes)/okr/department/page.tsx                    # w-[600px]
app/(routes)/okr/manage/page.tsx                        # w-[400px]
app/(routes)/billing/copq/_components/copq-dashboard.tsx # w-[300px]
```

**Find & Replace Pattern:**
```tsx
# BEFORE
className="w-[600px]"
className="w-[400px]"

# AFTER
className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md lg:max-w-lg"
```

---

### 2. Tables Without Overflow (1 file + multiple others)

```bash
# Confirmed issue:
app/(routes)/billing/_components/invoice-details-server.tsx

# Likely issues (check these):
app/(routes)/stakeholder-nps/_components/*table*.tsx
app/(routes)/process-excellence/_components/*table*.tsx
app/(routes)/grievance/_components/*table*.tsx
app/(routes)/okr/_components/*table*.tsx
```

**Fix Pattern:**
```tsx
# BEFORE
<Table>
  <TableHeader>...</TableHeader>
  <TableBody>...</TableBody>
</Table>

# AFTER
<div className="overflow-x-auto">
  <Table>
    <TableHeader>...</TableHeader>
    <TableBody>...</TableBody>
  </Table>
</div>
```

---

### 3. Fixed Width Filters (40+ files)

**Most Critical Files:**

```bash
# F001 - Stakeholder NPS
app/(routes)/stakeholder-nps/responses/page.tsx          # w-[250px], w-[300px]
app/(routes)/stakeholder-nps/surveys/page.tsx            # w-[200px], w-[250px]
app/(routes)/stakeholder-nps/analytics/page.tsx          # w-[180px], w-[200px]
app/(routes)/stakeholder-nps/_components/survey-filters.tsx

# F004 - Grievance (Worst offender)
app/(routes)/grievance/_components/tickets-filters.tsx   # w-[130px], w-[150px], w-[200px]
app/(routes)/grievance/_components/tickets-table.tsx     # w-[50px]-[300px] range

# F006 - OKR ABCD
app/(routes)/okr/team/page.tsx                          # Multiple fixed widths
app/(routes)/okr/_components/metric-picker.tsx          # w-[500px]
```

**Find & Replace Pattern:**
```tsx
# BEFORE
<Select className="w-[200px]">

# AFTER
<Select className="w-full sm:w-[200px]">
```

---

## ⚠️ High Priority (P1) - Fix This Week

### 4. Small Touch Targets

**Pattern to Find:**
```bash
grep -r "w-\[50px\]" app/(routes)/{stakeholder-nps,process-excellence,parent-portal,grievance,maturity-assessment,okr,billing}
```

**Fix:**
```tsx
# BEFORE
<Button size="icon" className="w-[50px]">

# AFTER
<Button size="icon" className="min-w-[44px] min-h-[44px]">
```

---

### 5. Add Missing Responsive Breakpoints

**F003 - Parent Portal (Priority file)**
```bash
app/(routes)/parent-portal/_components/parent-portal-client.tsx
```

Add responsive classes to:
- Header section
- Dashboard grid
- Communication filters

---

## Automated Fix Script

```bash
#!/bin/bash
# mobile-quick-fix.sh - Run this to auto-fix common issues

PROJECT_ROOT="/Users/omm/PROJECTS/MyJKKN"

echo "🔧 Auto-fixing mobile responsiveness issues..."

# Fix 1: Dialog widths
find "$PROJECT_ROOT/app/(routes)" -name "*.tsx" -type f -exec sed -i '' \
  's/className="w-\[600px\]"/className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md lg:max-w-lg"/g' {} +

find "$PROJECT_ROOT/app/(routes)" -name "*.tsx" -type f -exec sed -i '' \
  's/className="w-\[400px\]"/className="w-full max-w-sm sm:max-w-md"/g' {} +

echo "✅ Fixed dialog widths"

# Fix 2: Select/Input widths (conservative - only obvious filters)
find "$PROJECT_ROOT/app/(routes)" -name "*filters*.tsx" -type f -exec sed -i '' \
  's/<Select className="w-\[\([0-9]*\)px\]"/<Select className="w-full sm:w-[\1px]"/g' {} +

echo "✅ Fixed filter widths"

# Fix 3: Add overflow to tables (requires manual check)
echo "⚠️  Manual check needed: Add overflow-x-auto to tables"
grep -r "<Table" "$PROJECT_ROOT/app/(routes)" --include="*.tsx" -l | \
  xargs -I {} sh -c 'if ! grep -q "overflow-x-auto" {}; then echo "  - {}"; fi'

echo ""
echo "✅ Auto-fixes complete!"
echo "📋 Review changes with: git diff"
```

---

## Manual Fix Priority List

### Week 1 (Critical Path)
- [ ] Fix grievance modal (w-[600px])
- [ ] Fix OKR department/manage dialogs
- [ ] Add overflow-x-auto to all tables
- [ ] Fix stakeholder-nps filter widths
- [ ] Fix grievance filter widths

### Week 2 (High Priority)
- [ ] Fix OKR table columns
- [ ] Add touch target minimums
- [ ] Fix billing COPQ dashboard
- [ ] Test parent portal on mobile
- [ ] Add responsive breakpoints to grievance

### Week 3 (Polish)
- [ ] Convert complex tables to card view on mobile
- [ ] Test all charts at 375px
- [ ] Fix text truncation
- [ ] Add "Read more" to long content
- [ ] Performance optimization

---

## Testing Command

After fixes, test with:

```bash
# Start dev server
npm run dev

# Test each module
open http://localhost:3000/stakeholder-nps
open http://localhost:3000/process-excellence
open http://localhost:3000/parent-portal
open http://localhost:3000/grievance
open http://localhost:3000/maturity-assessment
open http://localhost:3000/okr/abcd
open http://localhost:3000/billing/copq

# In Chrome DevTools: Device Mode → iPhone SE → Test interactions
```

---

## Validation Checklist

After applying fixes, verify:

- [ ] No horizontal scroll on 375px viewport
- [ ] All dropdowns full-width on mobile
- [ ] Tables have horizontal scroll
- [ ] Modals fit viewport
- [ ] Touch targets ≥44x44px
- [ ] No fixed widths >100% viewport
- [ ] Charts render properly
- [ ] Forms stack vertically

---

**Last Updated:** 2026-02-05
**Priority:** Complete Week 1 fixes before deployment
