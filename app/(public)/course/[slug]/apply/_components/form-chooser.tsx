// Shown when a course has SEVERAL enabled forms and the link named none of
// them. Picking one automatically would decide for the applicant which route
// they are applying by — a scholarship form and a general form are not
// interchangeable — so ask instead.

import Link from 'next/link';
import type { PublicCourseSummary } from '@/types/courses';

export function FormChooser({ course }: { course: PublicCourseSummary }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="h-1.5 w-full bg-primary" />
      <main className="mx-auto w-full max-w-xl px-5 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          JKKN Institutions
        </p>
        <h1 className="mt-2 text-2xl font-bold">{course.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There is more than one way to apply for this course. Choose the one that fits you.
        </p>

        <div className="mt-6 space-y-3">
          {course.forms.map((f) => (
            <Link
              key={f.slug}
              href={`/course/${course.slug}/apply?form=${f.slug}`}
              className="block rounded-lg border p-4 transition-colors hover:border-primary hover:bg-muted/40"
            >
              <p className="font-medium">{f.name}</p>
              {f.description && (
                <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
              )}
            </Link>
          ))}
        </div>

        <Link
          href={`/course/${course.slug}`}
          className="mt-6 inline-block text-sm text-muted-foreground underline"
        >
          Back to the course
        </Link>
      </main>
    </div>
  );
}
