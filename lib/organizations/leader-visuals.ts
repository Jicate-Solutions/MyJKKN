// Pure helpers for the leader profile cards. No I/O.

/** "Dr. Anitha K" -> "AK". Honorifics are skipped so "Dr" is never the initial. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(dr|mr|mrs|ms|miss|prof|er|rev|sri|smt|thiru|tmt)$/i.test(w));
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Gradient stops chosen so white initials keep contrast on each.
const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-orange-500',
  'from-sky-500 to-blue-600',
  'from-fuchsia-500 to-purple-600',
  'from-amber-500 to-red-500',
  'from-cyan-500 to-teal-600',
  'from-lime-600 to-emerald-600',
] as const;

/** Same person always gets the same colour, so the page does not reshuffle. */
export function avatarGradient(seed: string | null | undefined): string {
  const s = seed ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
