'use client';

import { PageBreadcrumb } from './Breadcrumbs';

/**
 * Example usage of PageBreadcrumb component
 * This is just for demonstration - you would typically use this in your actual page components
 */
export function BreadcrumbExample() {
  // Example for a user details page
  return (
    <>
      <h3 className='text-lg font-medium mb-4'>Basic Breadcrumb Example</h3>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Users', href: '/users' },
          { label: 'User Details' } // Current page (last item without href)
        ]}
      />

      <h3 className='text-lg font-medium mt-8 mb-4'>Using isCurrent prop</h3>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Users', href: '/users' },
          { label: 'John Doe', href: '/users/john-doe' },
          { label: 'Settings', isCurrent: true } // Current page (with isCurrent)
        ]}
      />

      <h3 className='text-lg font-medium mt-8 mb-4'>
        Role Management Breadcrumb
      </h3>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Users', href: '/users' },
          { label: 'Role Management' } // Current page
        ]}
      />
    </>
  );
}
