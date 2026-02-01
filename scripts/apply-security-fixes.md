# Security Fixes Implementation Guide

## Quick Reference for Applying Security Fixes

### 1. Apply Error Boundaries to All Pages

**Pattern to use:**
```typescript
import { ErrorBoundary } from '@/components/error-boundary';

export default function YourPage() {
  return (
    <ErrorBoundary>
      <ContentLayout title="Your Page">
        {/* Your content */}
      </ContentLayout>
    </ErrorBoundary>
  );
}
```

**Apply to:**
- [ ] app/(routes)/billing/copq/page.tsx
- [ ] app/(routes)/grievance/page.tsx
- [ ] app/(routes)/grievance/dashboard/page.tsx
- [ ] app/(routes)/grievance/tickets/new/page.tsx
- [ ] app/(routes)/grievance/tickets/[id]/page.tsx
- [ ] app/(routes)/maturity-assessment/page.tsx
- [ ] app/(routes)/maturity-assessment/new/page.tsx
- [ ] app/(routes)/maturity-assessment/[id]/page.tsx
- [ ] app/(routes)/maturity-assessment/[id]/edit/page.tsx
- [ ] app/(routes)/parent-portal/page.tsx
- [ ] app/(routes)/process-excellence/page.tsx
- [ ] app/(routes)/stakeholder-nps/page.tsx
- [ ] app/(routes)/stakeholder-nps/respond/page.tsx
- [ ] app/(routes)/okr/abcd/page.tsx

---

### 2. Sanitize User Input Display

**For plain text:**
```typescript
import { sanitizeText } from '@/lib/utils/sanitize';

// Before
<p>{user.input}</p>

// After
<p>{sanitizeText(user.input)}</p>
```

**For rich text (HTML):**
```typescript
import { sanitizeHtml } from '@/lib/utils/sanitize';

// Before
<div>{user.description}</div>

// After
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(user.description) }} />
```

**Apply to components:**
- [ ] TicketForm - sanitize subject, description
- [ ] TicketDetail - sanitize ticket content, comments
- [ ] AssessmentForm - sanitize evidence, improvement plan
- [ ] NPSSurveyModal - sanitize feedback
- [ ] CommunicationList - sanitize message content
- [ ] COPQ forms - sanitize incident descriptions

---

### 3. Add Input Validation

**Email validation:**
```typescript
import { isValidEmail } from '@/lib/utils/sanitize';

const handleSubmit = (data) => {
  if (!isValidEmail(data.email)) {
    toast.error('Please enter a valid email address');
    return;
  }
  // Proceed with submission
};
```

**Phone validation:**
```typescript
import { isValidPhone } from '@/lib/utils/sanitize';

if (!isValidPhone(data.phone)) {
  toast.error('Please enter a valid phone number');
  return;
}
```

**Apply to:**
- [ ] Grievance ticket form (email, phone)
- [ ] Parent portal registration
- [ ] NPS response form
- [ ] Communication forms

---

### 4. Add Toast Notifications

**Install (already done):**
```bash
# react-hot-toast is already installed
```

**Usage pattern:**
```typescript
import { toast } from 'react-hot-toast';

// Success
onSuccess: () => {
  toast.success('Action completed successfully!');
  router.push('/target-page');
}

// Error
onError: (error) => {
  toast.error(error.message || 'Something went wrong');
}
```

**Add to:**
- [ ] Grievance ticket creation/update
- [ ] Maturity assessment creation/update
- [ ] NPS survey submission
- [ ] COPQ incident logging
- [ ] Process excellence forms
- [ ] All delete operations
- [ ] All update operations

---

### 5. Add Accessibility Attributes

**Icon-only buttons:**
```typescript
// Before
<Button>
  <X className="h-4 w-4" />
</Button>

// After
<Button aria-label="Close dialog">
  <X className="h-4 w-4" />
</Button>
```

**Form inputs:**
```typescript
// Before
<Input name="email" />

// After
<Label htmlFor="email">Email Address</Label>
<Input id="email" name="email" aria-required="true" aria-invalid={!!errors.email} />
{errors.email && <span role="alert">{errors.email.message}</span>}
```

**Apply to all:**
- [ ] Icon buttons throughout app
- [ ] Form inputs
- [ ] Modal close buttons
- [ ] Navigation elements

---

### 6. Add Loading States

**Pattern:**
```typescript
import { Skeleton } from '@/components/ui/skeleton';

{isLoading ? (
  <div className="space-y-4">
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-8 w-32" />
  </div>
) : (
  <YourContent />
)}
```

**Apply to:**
- [ ] All data fetching hooks
- [ ] All async operations
- [ ] Form submissions (button loading state)

---

### 7. Add Error States

**Pattern:**
```typescript
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

{error && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Error Loading Data</AlertTitle>
    <AlertDescription>
      {error.message || 'Failed to load data. Please try again.'}
    </AlertDescription>
    <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-2">
      Try Again
    </Button>
  </Alert>
)}
```

**Apply to:**
- [ ] All data fetching operations
- [ ] Form submission errors
- [ ] API call failures

---

### 8. Fix Mobile Responsiveness

**Table overflow:**
```typescript
// Before
<Table>...</Table>

// After
<div className="overflow-x-auto">
  <Table className="min-w-[600px]">...</Table>
</div>
```

**Responsive grids:**
```typescript
// Before
<div className="grid grid-cols-4">

// After
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
```

**Button groups:**
```typescript
// Before
<div className="flex gap-2">

// After
<div className="flex flex-col sm:flex-row gap-2">
```

---

### 9. Add Confirmation Dialogs

**For destructive actions:**
```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete the item.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Apply to:**
- [ ] Ticket deletion
- [ ] Assessment deletion
- [ ] Survey deletion
- [ ] All destructive operations

---

### 10. Validate Inputs on Forms

**Using Zod schemas (already in place):**
```typescript
import { z } from 'zod';
import { sanitizeText, isValidEmail } from '@/lib/utils/sanitize';

const schema = z.object({
  email: z.string()
    .email('Invalid email format')
    .transform(sanitizeText),
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description too long')
    .transform(sanitizeText),
  phone: z.string()
    .optional()
    .refine((val) => !val || isValidPhone(val), 'Invalid phone number'),
});
```

---

## Automated Fix Script

Run this to find all files that need attention:

```bash
#!/bin/bash

echo "Finding components that need security fixes..."

# Find user input display without sanitization
echo "\n1. Potential XSS vulnerabilities (displaying user input):"
grep -r "ticket\\.description\|user\\." app/ --include="*.tsx" | grep -v "sanitize"

# Find forms without toast notifications
echo "\n2. Forms without toast notifications:"
grep -r "onSuccess" app/ --include="*.tsx" | grep -v "toast"

# Find buttons without aria-labels
echo "\n3. Icon-only buttons without aria-labels:"
grep -r "<Button" app/ --include="*.tsx" | grep -v "aria-label" | grep "Icon\|className=\"h-4 w-4\""

# Find inputs without labels
echo "\n4. Inputs without proper labels:"
grep -r "<Input" app/ --include="*.tsx" | grep -v "Label"

# Find missing error boundaries
echo "\n5. Pages without error boundaries:"
grep -r "export default" app/\(routes\) --include="*.tsx" | while read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  if ! grep -q "ErrorBoundary" "$file"; then
    echo "$file"
  fi
done

echo "\n✅ Scan complete!"
```

---

## Testing After Fixes

### Security Testing
```bash
# 1. Test XSS protection
# Input: <script>alert('XSS')</script>
# Expected: Should be escaped/sanitized

# 2. Test email validation
# Input: invalid@email
# Expected: Should show validation error

# 3. Test phone validation
# Input: abc123
# Expected: Should show validation error
```

### UX Testing
```bash
# 1. Test mobile responsive (DevTools)
# - Resize to 320px width
# - All content should be visible/scrollable

# 2. Test keyboard navigation
# - Tab through all focusable elements
# - Enter should submit forms
# - Esc should close dialogs

# 3. Test loading states
# - Throttle network to 3G
# - Should see skeleton loaders

# 4. Test error states
# - Disconnect network
# - Should see error message with retry
```

---

## Checklist

Use this to track progress:

### Security
- [✅] Error boundaries created
- [✅] Sanitization utilities created
- [✅] Parent portal localStorage fixed
- [ ] Apply sanitization to all user inputs
- [ ] Add input validation to all forms
- [ ] Add confirmation dialogs for destructive actions

### UX
- [ ] Add toast notifications to all forms
- [ ] Add loading states to all async operations
- [ ] Add error states to all API calls
- [ ] Add accessibility attributes
- [ ] Fix mobile responsiveness issues
- [ ] Add keyboard navigation support

### Testing
- [ ] Manual XSS testing
- [ ] Mobile responsive testing
- [ ] Accessibility testing with screen reader
- [ ] Keyboard navigation testing
- [ ] Error state testing

---

*This guide covers the most critical security and UX fixes needed before production deployment.*
