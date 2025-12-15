# Code Examples

> Practical examples for MyJKKN integration

---

## Setup

### Initialize Supabase Client

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
```

### API Helper

```typescript
// lib/api.ts
export async function api<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}
```

---

## Authentication Examples

### Login

```typescript
async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error('Login failed:', error.message);
    throw error;
  }

  console.log('Logged in as:', data.user?.email);
  return data;
}

// Usage
try {
  const { session, user } = await login('faculty@jkkn.ac.in', 'password123');
  console.log('Access token:', session?.access_token);
} catch (error) {
  console.error('Login error:', error);
}
```

### Logout

```typescript
async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Logout failed:', error.message);
    throw error;
  }

  // Redirect to login page
  window.location.href = '/login';
}
```

### Check Session

```typescript
async function checkSession() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    console.log('No active session');
    return null;
  }

  console.log('Session expires:', new Date(session.expires_at! * 1000));
  return session;
}
```

---

## Student Examples

### List Students

```typescript
interface StudentListParams {
  institutionId: string;
  page?: number;
  limit?: number;
  search?: string;
  semesterId?: string;
  sectionId?: string;
}

async function getStudents(params: StudentListParams) {
  const queryParams = new URLSearchParams({
    institution_id: params.institutionId,
    page: String(params.page || 1),
    limit: String(params.limit || 10)
  });

  if (params.search) queryParams.append('search', params.search);
  if (params.semesterId) queryParams.append('semester_id', params.semesterId);
  if (params.sectionId) queryParams.append('section_id', params.sectionId);

  const response = await api<StudentListResponse>(
    `/api/api-management/students/list?${queryParams}`
  );

  return response;
}

// Usage
const { data: students, metadata } = await getStudents({
  institutionId: 'inst-uuid',
  page: 1,
  limit: 20,
  search: 'Rahul'
});

console.log(`Found ${metadata.total} students`);
students.forEach(student => {
  console.log(`${student.first_name} ${student.last_name} - ${student.roll_number}`);
});
```

### Get Single Student

```typescript
async function getStudent(studentId: string) {
  const response = await api<{ data: Student }>(
    `/api/api-management/students/list/${studentId}`
  );

  return response.data;
}

// Usage
const student = await getStudent('student-uuid');
console.log(`Student: ${student.first_name} ${student.last_name}`);
console.log(`Section: ${student.section?.section_name}`);
console.log(`Status: ${student.status}`);
```

### Create Student

```typescript
async function createStudent(studentData: CreateStudentDto) {
  const response = await api<{ data: Student }>(
    '/api/students/list',
    {
      method: 'POST',
      body: JSON.stringify(studentData)
    }
  );

  return response.data;
}

// Usage
const newStudent = await createStudent({
  institution_id: 'inst-uuid',
  first_name: 'Rahul',
  last_name: 'Kumar',
  gender: 'male',
  date_of_birth: '2002-05-15',
  student_mobile: '9876543210',
  college_email: 'rahul.kumar@jkkn.ac.in',
  degree_id: 'degree-uuid',
  department_id: 'dept-uuid',
  program_id: 'prog-uuid',
  semester_id: 'sem-uuid',
  section_id: 'sec-uuid',
  entry_type: 'regular',
  status: 'active'
});

console.log(`Created student: ${newStudent.id}`);
```

---

## Billing Examples

### Get Student Outstanding Bills

```typescript
async function getStudentBills(studentId: string, status?: string) {
  const queryParams = new URLSearchParams({
    student_id: studentId
  });

  if (status) queryParams.append('status', status);

  const response = await api<StudentBillListResponse>(
    `/api/api-management/billing/bills?${queryParams}`
  );

  return response;
}

// Usage - Get unpaid bills
const { data: unpaidBills } = await getStudentBills('student-uuid', 'unpaid');

const totalOutstanding = unpaidBills.reduce(
  (sum, bill) => sum + bill.balance_amount,
  0
);

console.log(`Outstanding: ₹${totalOutstanding}`);
```

### Create Payment Receipt

```typescript
interface CreatePaymentParams {
  studentId: string;
  institutionId: string;
  paymentMode: 'cash' | 'online' | 'bank_transfer';
  paymentAmount: number;
  payerName: string;
  bills: { billId: string; amountPaid: number }[];
}

async function createPayment(params: CreatePaymentParams) {
  const response = await api<{ data: BillingReceipt }>(
    '/api/billing/receipts',
    {
      method: 'POST',
      body: JSON.stringify({
        student_id: params.studentId,
        institution_id: params.institutionId,
        payment_mode: params.paymentMode,
        payment_amount: params.paymentAmount,
        payment_paid_date: new Date().toISOString().split('T')[0],
        payer_name: params.payerName,
        receipt_items: params.bills.map(b => ({
          bill_id: b.billId,
          amount_paid: b.amountPaid
        }))
      })
    }
  );

  return response.data;
}

// Usage
const receipt = await createPayment({
  studentId: 'student-uuid',
  institutionId: 'inst-uuid',
  paymentMode: 'cash',
  paymentAmount: 50000,
  payerName: 'Ramesh Kumar (Father)',
  bills: [
    { billId: 'bill-1', amountPaid: 45000 },
    { billId: 'bill-2', amountPaid: 5000 }
  ]
});

console.log(`Receipt: ${receipt.receipt_number}`);
```

---

## Attendance Examples

### Get Today's Attendance

```typescript
async function getTodayAttendance(timetableId: string) {
  const today = new Date().toISOString().split('T')[0];

  const response = await api<{ data: ConsolidatedStudentAttendance }>(
    `/api/academic/attendance/by-date?timetable_id=${timetableId}&date=${today}`
  );

  return response.data;
}

// Usage
const attendance = await getTodayAttendance('timetable-uuid');

// Count present students for Period 1
const period1 = Object.values(attendance.attendance_data).find(
  slot => slot.period_name === 'Period 1'
);

const presentCount = period1?.students.filter(s => s.status === 'Present').length || 0;
const totalCount = period1?.students.length || 0;

console.log(`Period 1: ${presentCount}/${totalCount} present`);
```

### Mark Attendance

```typescript
interface MarkAttendanceParams {
  timetableId: string;
  sectionId: string;
  date: string;
  slotId: string;
  periodId: string;
  periodName: string;
  courseId: string;
  courseName: string;
  students: { studentId: string; status: 'Present' | 'Absent' }[];
  markedBy: string;
  institutionId: string;
}

async function markAttendance(params: MarkAttendanceParams) {
  const now = new Date().toISOString();

  const response = await api<{ data: ConsolidatedStudentAttendance }>(
    '/api/academic/attendance',
    {
      method: 'POST',
      body: JSON.stringify({
        timetable_id: params.timetableId,
        section_id: params.sectionId,
        attendance_date: params.date,
        marked_by: params.markedBy,
        institution_id: params.institutionId,
        attendance_data: {
          [params.slotId]: {
            period_id: params.periodId,
            period_name: params.periodName,
            course_id: params.courseId,
            course_name: params.courseName,
            students: params.students.map(s => ({
              student_id: s.studentId,
              section_id: params.sectionId,
              status: s.status,
              marked_at: now
            }))
          }
        }
      })
    }
  );

  return response.data;
}
```

---

## Academic Hierarchy Examples

### Get Full Hierarchy

```typescript
async function getAcademicHierarchy(institutionId: string) {
  // Fetch in parallel
  const [degrees, departments, programs, semesters, sections] = await Promise.all([
    api(`/api/api-management/organization/degrees?institution_id=${institutionId}`),
    api(`/api/api-management/organization/departments?institution_id=${institutionId}`),
    api(`/api/api-management/organization/programs?institution_id=${institutionId}`),
    api(`/api/api-management/organization/semesters?institution_id=${institutionId}`),
    api(`/api/api-management/organization/sections?institution_id=${institutionId}`)
  ]);

  return { degrees, departments, programs, semesters, sections };
}
```

### Cascading Dropdown Selection

```typescript
// React component example
function AcademicSelector({ institutionId }: { institutionId: string }) {
  const [degreeId, setDegreeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [sectionId, setSectionId] = useState('');

  // Fetch degrees when institution changes
  const { data: degrees } = useQuery({
    queryKey: ['degrees', institutionId],
    queryFn: () => api(`/api/api-management/organization/degrees?institution_id=${institutionId}`)
  });

  // Fetch departments when degree changes
  const { data: departments } = useQuery({
    queryKey: ['departments', degreeId],
    queryFn: () => api(`/api/api-management/organization/departments?degree_id=${degreeId}`),
    enabled: !!degreeId
  });

  // Fetch programs when department changes
  const { data: programs } = useQuery({
    queryKey: ['programs', departmentId],
    queryFn: () => api(`/api/api-management/organization/programs?department_id=${departmentId}`),
    enabled: !!departmentId
  });

  // Fetch semesters when program changes
  const { data: semesters } = useQuery({
    queryKey: ['semesters', programId],
    queryFn: () => api(`/api/api-management/organization/semesters?program_id=${programId}`),
    enabled: !!programId
  });

  // Fetch sections when semester changes
  const { data: sections } = useQuery({
    queryKey: ['sections', semesterId],
    queryFn: () => api(`/api/api-management/organization/sections?semester_id=${semesterId}`),
    enabled: !!semesterId
  });

  // ... render dropdowns
}
```

---

## Error Handling

### Comprehensive Error Handler

```typescript
interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

async function handleApiCall<T>(
  apiCall: () => Promise<T>,
  options?: {
    onError?: (error: ApiError) => void;
    redirectOnUnauth?: boolean;
  }
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error: any) {
    const apiError: ApiError = {
      error: error.name || 'Error',
      message: error.message || 'An unexpected error occurred',
      statusCode: error.status || 500
    };

    if (apiError.statusCode === 401) {
      if (options?.redirectOnUnauth) {
        window.location.href = '/login';
      }
    }

    if (options?.onError) {
      options.onError(apiError);
    } else {
      console.error('API Error:', apiError);
    }

    return null;
  }
}

// Usage
const students = await handleApiCall(
  () => getStudents({ institutionId: 'inst-uuid' }),
  {
    onError: (error) => {
      toast.error(error.message);
    },
    redirectOnUnauth: true
  }
);
```

---

## React Query Integration

### Custom Hook Example

```typescript
// hooks/use-students.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useStudents(filters: StudentListParams) {
  return useQuery({
    queryKey: ['students', filters],
    queryFn: () => getStudents(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    }
  });
}

// Usage in component
function StudentList() {
  const { data, isLoading, error } = useStudents({
    institutionId: 'inst-uuid',
    page: 1,
    limit: 20
  });

  const createMutation = useCreateStudent();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data?.data.map(student => (
        <div key={student.id}>{student.first_name}</div>
      ))}
    </div>
  );
}
```

---

## Pagination Helper

```typescript
interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function usePagination(initialLimit = 10) {
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: initialLimit,
    total: 0,
    totalPages: 0
  });

  const updateFromMetadata = (metadata: { total: number; totalPages: number }) => {
    setPagination(prev => ({
      ...prev,
      total: metadata.total,
      totalPages: metadata.totalPages
    }));
  };

  const nextPage = () => {
    if (pagination.page < pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: prev.page + 1 }));
    }
  };

  const prevPage = () => {
    if (pagination.page > 1) {
      setPagination(prev => ({ ...prev, page: prev.page - 1 }));
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  return {
    ...pagination,
    nextPage,
    prevPage,
    goToPage,
    updateFromMetadata
  };
}
```

---

*Last Updated: December 2024*
