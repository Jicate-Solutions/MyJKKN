// Shared "this is not here" state for the public course pages.
//
// An explicit page, never a redirect: somebody who followed a stale link needs
// to be told the link is stale. Bouncing them to a login screen — which is what
// would happen if proxy.ts did not allow-list '/course/' — tells them nothing
// and looks like the institution is hiding something.
//
// A server component with no client JS: it renders one message and nothing here
// is interactive.

export function CourseNotAvailable({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="h-1.5 w-full bg-primary" />
      <div className="mx-auto flex min-h-[calc(100vh-0.375rem)] w-full max-w-md flex-col items-center justify-center px-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          JKKN Institutions
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
