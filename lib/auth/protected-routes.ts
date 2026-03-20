import { SYSTEM_ROLES } from '@/types/auth';

interface RouteConfig {
  paths: string[];
  roles: string[];
}

export const PROTECTED_ROUTES: Record<string, RouteConfig> = {
  ADMIN_ONLY: {
    paths: ['/system'],
    roles: [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.SUPER_ADMIN]
  },
  USER_ONLY: {
    paths: ['/profile'],
    roles: [
      SYSTEM_ROLES.STUDENT,
      SYSTEM_ROLES.FACULTY,
      SYSTEM_ROLES.STAFF,
      SYSTEM_ROLES.ADMINISTRATOR,
      SYSTEM_ROLES.SUPER_ADMIN,
      SYSTEM_ROLES.HOD,
      SYSTEM_ROLES.PRINCIPAL,
      SYSTEM_ROLES.PARENT
    ]
  },
  SUPER_ADMIN_ONLY: {
    paths: ['/users/roles', '/users/role-management'],
    roles: [SYSTEM_ROLES.SUPER_ADMIN]
  },
  GUEST_ONLY: {
    paths: ['/guest'],
    roles: [SYSTEM_ROLES.GUEST]
  },
  DRIVER_ONLY: {
    paths: ['/driver'],
    roles: [SYSTEM_ROLES.DRIVER]
  }
  //   STAFF_ONLY: {
  //     paths: ['/reports', '/analytics'],
  //     roles: [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.STAFF]
  //   },
  //   FACULTY_ONLY: {
  //     paths: ['/academic', '/courses'],
  //     roles: [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.FACULTY]
  //   }
};

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
