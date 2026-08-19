// app/my-courses/layout.tsx
//
// The participant portal's own shell.
//
// EXISTS FOR THE TOASTERS, and that is not cosmetic: /my-courses sits outside
// app/(routes)/, which is where this app mounts them. Without this layout every
// toast the portal raises — "Payment received", "Could not confirm your
// payment", "Your current password is not correct" — was constructed, handed to
// a library with nowhere to render, and silently dropped. A participant whose
// payment failed saw nothing at all.
//
// Both libraries are mounted, mirroring app/(routes)/layout.tsx. The portal's
// own components use sonner, but a shared component pulled in later may well
// use react-hot-toast, and a toast that renders is worth more than a tidy
// dependency list.
//
// Same reasoning as app/(public)/course/[slug]/apply, which carries its own
// Toaster for exactly this reason.

import { Toaster as SonnerToaster } from 'sonner';
import { Toaster as HotToaster } from 'react-hot-toast';

export default function MyCoursesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* top-center on purpose: this is a phone-first screen, and a top-right
          toast on a narrow viewport lands under the thumb reaching for the
          menu. */}
      <SonnerToaster position="top-center" richColors closeButton />
      <HotToaster position="top-center" />
    </>
  );
}
