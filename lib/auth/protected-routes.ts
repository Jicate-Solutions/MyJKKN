import { SYSTEM_ROLES } from '@/types/auth';

export const PROTECTED_ROUTES = {
  ADMIN_ONLY: {
    paths: ['/system', '/organizations/', '/staff/', '/academic/', '/users/'],
    roles: [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.SUPER_ADMIN]
  },
  USER_ONLY: {
    paths: ['/profile'],
    roles: [
      SYSTEM_ROLES.STUDENT,
      SYSTEM_ROLES.FACULTY,
      SYSTEM_ROLES.STAFF,
      SYSTEM_ROLES.ADMINISTRATOR,
      SYSTEM_ROLES.SUPER_ADMIN
    ]
  },
  SUPER_ADMIN_ONLY: {
    paths: ['/users/roles', '/users/role-management'],
    roles: [SYSTEM_ROLES.SUPER_ADMIN]
  }
  //   STAFF_ONLY: {
  //     paths: ['/reports', '/analytics'],
  //     roles: [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.STAFF]
  //   },
  //   FACULTY_ONLY: {
  //     paths: ['/academic', '/courses'],
  //     roles: [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.FACULTY]
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
