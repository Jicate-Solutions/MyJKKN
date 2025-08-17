# Child App Integration - Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites

- Next.js 13+ with App Router
- Node.js 16+
- Your app registered with MyJKKN admin

### Step 1: Install Dependencies

```bash
npm install axios js-cookie
npm install @types/js-cookie --save-dev
```

### Step 2: Set Environment Variables

```env
# .env.local
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_CHILD_APP_ID=your-app-id
NEXT_PUBLIC_CHILD_APP_API_KEY=your-api-key
CHILD_APP_JWT_SECRET=your-jwt-secret
```

### Step 3: Copy Authentication Files

Copy these files from MyJKKN parent app to your child app:

```
lib/auth/
├── parent-auth-service.ts
├── auth-context.tsx
├── protected-route.tsx
├── session-manager.ts
└── index.ts
```

### Step 4: Wrap Your App

```typescript
// app/layout.tsx
import { AuthProvider } from '@/lib/auth';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider autoValidate autoRefresh>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### Step 5: Create Login Page

```typescript
// app/login/page.tsx
'use client';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <button onClick={() => login()}>
      Login with MyJKKN
    </button>
  );
}
```

### Step 6: Protect Routes

```typescript
// app/dashboard/page.tsx
import { RequireAuth } from '@/lib/auth';

export default function Dashboard() {
  return (
    <RequireAuth>
      <YourDashboardContent />
    </RequireAuth>
  );
}
```

## 📝 Complete Example

```typescript
// app/page.tsx
'use client';

import { useAuth, useCurrentUser } from '@/lib/auth';

export default function HomePage() {
  const { login, logout, isAuthenticated } = useAuth();
  const user = useCurrentUser();

  if (!isAuthenticated) {
    return (
      <div>
        <h1>Welcome</h1>
        <button onClick={() => login()}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Hello, {user?.full_name}!</h1>
      <p>Email: {user?.email}</p>
      <p>Role: {user?.role}</p>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}
```

## 🔒 Security Checklist

- [ ] Use HTTPS in production
- [ ] Store API keys in environment variables
- [ ] Never expose JWT secret
- [ ] Implement proper error handling
- [ ] Set up CORS properly

## 🆘 Need Help?

- Check `/application-hub/api-guidelines` for detailed documentation
- Contact MyJKKN admin for app registration
- Email: support@myjkkn.ac.in

---

_Last updated: 2025-01-17_
