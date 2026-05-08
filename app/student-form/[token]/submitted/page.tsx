// app/student-form/[token]/submitted/page.tsx
//
// Success landing after the student finalizes their form. Shown once;
// the token has been consumed and any subsequent visit to the wizard
// route redirects to /expired. Bilingual confirmation only — no PII.

export const dynamic = 'force-static';

export default function SubmittedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-emerald-50">
      <div className="max-w-md text-center space-y-4">
        <div className="text-5xl">✔️</div>
        <h1 className="text-2xl font-semibold text-emerald-700">
          Form submitted!
        </h1>
        <p className="text-base text-emerald-700">
          படிவம் சமர்ப்பிக்கப்பட்டது!
        </p>
        <p className="text-sm text-muted-foreground">
          Please return your phone to the admission desk.<br/>
          உங்கள் கைபேசியை அலுவலகத்தில் ஒப்படைக்கவும்.
        </p>
      </div>
    </div>
  );
}
