import { useEffect, useMemo, useState } from 'react';

/** Emoji falling over the whole screen for a few seconds, then it calls `onDone`. Skipped when the user prefers reduced motion. */
export function Rain({ emojis, count = 20, onDone }: { emojis: string[]; count?: number; onDone: () => void }) {
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        emoji: emojis[i % emojis.length],
        left: Math.random() * 96,
        delay: Math.random() * 1.4,
        dur: 2.6 + Math.random() * 1.8,
        size: 24 + Math.random() * 20,
        spin: Math.round((Math.random() - 0.5) * 720),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(onDone, reduced ? 0 : 6500);
    return () => window.clearTimeout(t);
  }, [onDone, reduced]);

  if (reduced) return null;
  return (
    <div className="rain" aria-hidden>
      {items.map((it) => (
        <span
          key={it.id}
          style={{ left: `${it.left}%`, fontSize: it.size, animationDelay: `${it.delay}s`, animationDuration: `${it.dur}s`, ['--spin' as string]: `${it.spin}deg` }}
        >
          {it.emoji}
        </span>
      ))}
    </div>
  );
}
