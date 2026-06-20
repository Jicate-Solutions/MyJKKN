'use client';

/**
 * Parent Portal — attendance donut. Three proportional arcs (Present / Absent /
 * Not Updated days) with the present % in the centre. Pure SVG, no chart lib.
 */
const COLORS = {
  present: '#0b6d41',
  absent: '#dc2626',
  track: 'rgba(0,0,0,0.06)',
};

export function AttendanceRing({
  present,
  absent,
  percentage,
}: {
  present: number;
  absent: number;
  percentage: number;
}) {
  const total = present + absent;
  const r = 52;
  const c = 2 * Math.PI * r;
  const seg = (value: number) => (total > 0 ? (value / total) * c : 0);

  const arcs = [
    { len: seg(present), color: COLORS.present },
    { len: seg(absent), color: COLORS.absent },
  ];

  let offset = 0;
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke={COLORS.track} strokeWidth="12" />
        {total > 0 &&
          arcs.map((a, i) => {
            const dash = `${a.len} ${c - a.len}`;
            const el = (
              <circle
                key={i}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += a.len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[#0b6d41]">{percentage}%</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Present</span>
      </div>
    </div>
  );
}
