// Roast chicken used as the sliding thumb of the Ano / Ne switch (components.tsx).
const INK = '#2b1f3f';
const BONE = '#fff4dc';

function Drumstick({ x, y, angle }: { x: number; y: number; angle: number }) {
  // Drawn pointing up from its base (x, y), then rotated into place.
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d="M0 -17v-9" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
      <path d="M0 -17v-9" stroke={BONE} strokeWidth="3" strokeLinecap="round" />
      <circle cx="-2.6" cy="-28" r="2.9" fill={BONE} stroke={INK} strokeWidth="1.8" />
      <circle cx="2.6" cy="-28" r="2.9" fill={BONE} stroke={INK} strokeWidth="1.8" />
      <path d="M0 2c-8-1-10-11-6-17 2-3 10-3 12 0 4 6 2 16-6 17z" fill="#d9772c" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="-2.5" cy="-8" rx="1.8" ry="4.5" fill="#fff" opacity="0.35" />
    </g>
  );
}

export function Chicken({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-2 -10 68 62" aria-hidden>
      <ellipse cx="32" cy="48.5" rx="24" ry="2.8" fill={INK} opacity="0.16" />
      <Drumstick x={40} y={20} angle={30} />
      {/* tail tips */}
      <path d="M10 30c-5-1-8-6-6-11 4 1 7 4 8 8z" fill="#e8913a" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 24c-3-3-3-8 0-11 3 3 4 7 3 11z" fill="#e8913a" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      {/* body */}
      <path d="M7 32c0-12 11-19 25-19s25 7 25 19-11 15-25 15S7 44 7 32z" fill="#e8913a" stroke={INK} strokeWidth="2.6" />
      <path d="M12 40c6 4 14 6 22 5" fill="none" stroke="#c46a24" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="22" cy="21" rx="9" ry="3.2" fill="#fff" opacity="0.4" transform="rotate(-12 22 21)" />
      {/* wing */}
      <path d="M24 35c4-7 15-8 19-2-3 6-13 8-19 2z" fill="#d9772c" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <g fill="#b85c1c" opacity="0.55">
        <circle cx="16" cy="30" r="0.9" />
        <circle cx="30" cy="24" r="0.9" />
        <circle cx="38" cy="29" r="0.9" />
        <circle cx="47" cy="38" r="0.9" />
        <circle cx="21" cy="38" r="0.9" />
      </g>
      <Drumstick x={50} y={27} angle={40} />
    </svg>
  );
}
