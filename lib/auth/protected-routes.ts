export const PROTECTED_ROUTES = {
  ADMIN_ONLY: {
    paths: ['/system', '/organizations/', '/staff/', '/academic/', '/users/'],
    roles: ['administrator', 'super_admin']
  },
  USER_ONLY: {
    paths: ['/profile'],
    roles: ['student', 'faculty', 'staff', 'administrator', 'super_admin']
  },
  SUPER_ADMIN_ONLY: {
    paths: ['/users/roles'],
    roles: ['super_admin']
  }
  //   STAFF_ONLY: {
  //     paths: ['/reports', '/analytics'],
  //     roles: ['administrator', 'super_admin', 'staff']
  //   },
  //   FACULTY_ONLY: {
  //     paths: ['/academic', '/courses'],
  //     roles: ['administrator', 'super_admin', 'faculty']
  //   }
} as const;

// Example
// export const PROTECTED_ROUTES = {
//   ADMIN_ONLY: {
//       paths: ['/system', '/settings', '/management'], // Add new path here
//       roles: ['administrator', 'super_admin']
//     },
//     // ... other configurations
//   } as const;

//   // middleware.ts
//   export const config = {
//     matcher: [
//       // ... existing patterns
//       '/management/:path*', // Add new pattern here
//       '/((?!api|_next/static|_next/image|favicon.ico|auth).*)'
//     ]
//   };
