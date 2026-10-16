// Cow and pig that peek out behind the hero mascot. Their faces follow the user's answer
// for the next lunch: smile when attending, frown when not, flat mouth while unanswered.
// The mouth is one shape flipped / squashed by CSS, so the change animates smoothly.

export type Mood = 'happy' | 'sad' | 'neutral';

const INK = '#2b1f3f';

export function moodFor(attending: boolean | null | undefined): Mood {
  if (attending === true) return 'happy';
  if (attending === false) return 'sad';
  return 'neutral';
}

function Eye({ x, y }: { x: number; y: number }) {
  return (
    <>
      <g className="eye-open">
        <circle cx={x} cy={y} r="4.2" fill={INK} />
        <circle cx={x + 1.4} cy={y - 1.5} r="1.4" fill="#fff" />
      </g>
      <path className="eye-happy" d={`M${x - 5} ${y + 1.5}q5-6.5 10 0`} fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
    </>
  );
}

function Brow({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  return (
    <path
      className="brow"
      d={flip ? `M${x + 5} ${y + 3.5}l-9-3.5` : `M${x - 5} ${y + 3.5}l9-3.5`}
      stroke={INK}
      strokeWidth="3"
      strokeLinecap="round"
    />
  );
}

function Mouth({ x, y, w = 7 }: { x: number; y: number; w?: number }) {
  return (
    <path
      className="mouth"
      d={`M${x - w} ${y - 3}q${w} ${w * 1.3} ${w * 2} 0z`}
      fill="#e8326a"
      stroke={INK}
      strokeWidth="2.6"
      strokeLinejoin="round"
    />
  );
}

export function Cow({ mood, className }: { mood: Mood; className?: string }) {
  return (
    <svg className={`animal is-${mood} ${className ?? ''}`} viewBox="0 0 160 124" aria-hidden>
      <defs>
        <clipPath id="bobo-cow-body">
          <ellipse cx="98" cy="74" rx="44" ry="29" />
        </clipPath>
        <clipPath id="bobo-cow-head">
          <ellipse cx="52" cy="50" rx="32" ry="29" />
        </clipPath>
      </defs>
      <ellipse cx="94" cy="116" rx="58" ry="5.5" fill={INK} opacity="0.13" />
      <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {/* tail */}
        <path d="M138 68c11 4 12 15 9 24" fill="none" />
        <path d="M146 90c5 1 7 7 3 11-4 3-9 0-8-5z" fill={INK} />
        {/* far legs */}
        <rect x="90" y="86" width="14" height="26" rx="6" fill="#ece6f2" />
        <rect x="124" y="86" width="14" height="26" rx="6" fill="#ece6f2" />
        {/* body + spots */}
        <ellipse cx="98" cy="74" rx="44" ry="29" fill="#fff" />
      </g>
      <g clipPath="url(#bobo-cow-body)" fill={INK}>
        <path d="M100 42c10-4 22 2 20 12-2 9-16 10-22 4-5-5-4-13 2-16z" />
        <path d="M118 80c9-5 22-1 22 8s-14 12-22 6c-4-4-4-11 0-14z" />
        <path d="M70 84c6-3 13 1 12 6-1 6-9 7-13 3-2-3-2-7 1-9z" />
      </g>
      <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="98" cy="74" rx="44" ry="29" fill="none" />
        {/* near legs with hooves */}
        <rect x="74" y="88" width="14" height="25" rx="6" fill="#fff" />
        <rect x="110" y="88" width="14" height="25" rx="6" fill="#fff" />
        <path d="M74 105h14v3a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" fill={INK} />
        <path d="M110 105h14v3a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" fill={INK} />
        {/* horns */}
        <path d="M34 30c-5-8-3-17 3-19 3 6 6 11 7 17z" fill="#ffd84f" />
        <path d="M70 30c5-8 3-17-3-19-3 6-6 11-7 17z" fill="#ffd84f" />
        {/* ears */}
        <path d="M24 42c-12-4-21 2-19 9 3 6 13 6 21-1z" fill="#fff" />
        <path d="M80 42c12-4 21 2 19 9-3 6-13 6-21-1z" fill="#fff" />
        {/* head */}
        <ellipse cx="52" cy="50" rx="32" ry="29" fill="#fff" />
      </g>
      <path d="M12 46c4-2 9-1 12 1-3 2-8 3-12-1z" fill="#ff9fb8" />
      <path d="M92 46c-4-2-9-1-12 1 3 2 8 3 12-1z" fill="#ff9fb8" />
      <path clipPath="url(#bobo-cow-head)" d="M18 34c6-14 22-16 28-8 4 7-4 15-14 15-8 0-14-1-14-7z" fill={INK} />
      <ellipse cx="52" cy="50" rx="32" ry="29" fill="none" stroke={INK} strokeWidth="3.5" />
      <ellipse cx="29" cy="60" rx="5" ry="3.4" fill="#ff8fa8" opacity="0.55" />
      <ellipse cx="75" cy="60" rx="5" ry="3.4" fill="#ff8fa8" opacity="0.55" />
      <Eye x={41} y={46} />
      <Eye x={63} y={46} />
      <Brow x={41} y={36} />
      <Brow x={63} y={36} flip />
      {/* muzzle */}
      <ellipse cx="52" cy="68" rx="25" ry="15.5" fill="#ffaac4" stroke={INK} strokeWidth="3.5" />
      <ellipse cx="44" cy="61.5" rx="8" ry="2.8" fill="#fff" opacity="0.55" />
      <ellipse cx="44" cy="66" rx="2.4" ry="3.2" fill={INK} />
      <ellipse cx="60" cy="66" rx="2.4" ry="3.2" fill={INK} />
      <Mouth x={52} y={75} />
    </svg>
  );
}

export function Pig({ mood, className }: { mood: Mood; className?: string }) {
  return (
    <svg className={`animal is-${mood} ${className ?? ''}`} viewBox="0 0 150 124" aria-hidden>
      <ellipse cx="70" cy="116" rx="54" ry="5.5" fill={INK} opacity="0.13" />
      <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {/* curly tail */}
        <path d="M24 72c-12-2-15-16-5-18 8-1 9 10 1 11" fill="none" />
        {/* far legs */}
        <rect x="52" y="88" width="13" height="25" rx="5.5" fill="#f59ab0" />
        <rect x="96" y="88" width="13" height="25" rx="5.5" fill="#f59ab0" />
        {/* body */}
        <ellipse cx="68" cy="76" rx="46" ry="30" fill="#ffc2cf" />
      </g>
      <ellipse cx="56" cy="64" rx="24" ry="9" fill="#fff" opacity="0.35" />
      <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {/* near legs with hooves */}
        <rect x="36" y="90" width="13" height="23" rx="5.5" fill="#ffc2cf" />
        <rect x="78" y="90" width="13" height="23" rx="5.5" fill="#ffc2cf" />
        <path d="M36 106h13v2a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" fill="#d9718c" />
        <path d="M78 106h13v2a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" fill="#d9718c" />
        {/* ears */}
        <path d="M88 42l5-26 21 19z" fill="#ffb0c2" />
        <path d="M112 35l23-15-1 31z" fill="#ffb0c2" />
      </g>
      <path d="M93 34l2.5-12 9 9z" fill="#ff8fa8" />
      <path d="M118 33l12-8v13z" fill="#ff8fa8" />
      {/* head */}
      <ellipse cx="104" cy="58" rx="30" ry="27" fill="#ffc2cf" stroke={INK} strokeWidth="3.5" />
      <ellipse cx="96" cy="44" rx="12" ry="5" fill="#fff" opacity="0.35" />
      <ellipse cx="91" cy="66" rx="5.5" ry="3.8" fill="#ff8fa8" opacity="0.6" />
      <Eye x={106} y={50} />
      <Brow x={106} y={40} />
      {/* snout */}
      <ellipse cx="127" cy="64" rx="12" ry="9.5" fill="#ff9cb3" stroke={INK} strokeWidth="3.5" />
      <ellipse cx="124" cy="59" rx="5" ry="2" fill="#fff" opacity="0.55" />
      <ellipse cx="122.5" cy="65" rx="2" ry="3" fill={INK} />
      <ellipse cx="131.5" cy="65" rx="2" ry="3" fill={INK} />
      <Mouth x={112} y={73} w={7} />
    </svg>
  );
}
