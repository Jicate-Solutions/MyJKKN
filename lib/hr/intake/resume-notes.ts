// Card reasons when a resume could not be paired safely (one file, one person).
// Plain strings, safe for client components (the card reads them to say the
// resume was held back rather than "not found").
export const AMBIGUOUS_RESUME_NOTE = 'Two uploaded files share this name — upload them with distinct names';
export const SHARED_RESUME_NOTE =
  'Another candidate in this export names the same resume file — upload each person’s resume with a distinct name';
