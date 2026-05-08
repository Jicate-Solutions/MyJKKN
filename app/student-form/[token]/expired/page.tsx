// app/student-form/[token]/expired/page.tsx
//
// Bilingual lockdown page shown when a token is invalid, expired,
// superseded, or the underlying learner has already submitted.
// Deliberately leaks NO data about the learner — generic message only.

export const dynamic = 'force-static';

export default function ExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="max-w-md text-center space-y-3">
        <div className="text-3xl">⚠️</div>
        <h1 className="text-xl font-semibold">
          This QR is no longer valid
        </h1>
        <p className="text-base text-muted-foreground">
          இந்த QR செல்லாது
        </p>
        <p className="text-sm text-muted-foreground">
          Please ask the admission desk to scan a new QR for you.<br/>
          மீண்டும் ஒரு புதிய QR கேட்கவும்.
        </p>
      </div>
    </div>
  );
}
