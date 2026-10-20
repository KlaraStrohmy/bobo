/** What falls when the dog barks. The theme changes every Monday and is the same for everybody. */
export interface RainTheme {
  key: string;
  name: string;
  emojis: string[];
}

export const RAIN_THEMES: readonly RainTheme[] = [
  { key: 'paws', name: 'tlapky', emojis: ['🐾'] },
  { key: 'bones', name: 'kosti', emojis: ['🦴'] },
  { key: 'snouts', name: 'prasečí rypáčky', emojis: ['🐽'] },
  { key: 'cows', name: 'kravské hlavy', emojis: ['🐮'] },
  { key: 'shrimp', name: 'krevety', emojis: ['🦐'] },
  { key: 'apples', name: 'jablka', emojis: ['🍎'] },
  // from the dishes people vote for
  { key: 'lemons', name: 'citrony', emojis: ['🍋'] },
  { key: 'carrots', name: 'mrkve', emojis: ['🥕'] },
  { key: 'tomatoes', name: 'rajčata', emojis: ['🍅'] },
  { key: 'chillies', name: 'papričky', emojis: ['🌶️'] },
  { key: 'mango', name: 'manga', emojis: ['🥭'] },
  { key: 'peanuts', name: 'arašídy', emojis: ['🥜'] },
];

/** Monday of the week the rain went live: that week is paws, the next bones, and so on; 12 themes, then the loop starts again. */
const FIRST_MONDAY = Date.UTC(2026, 9, 19);
const DAY_MS = 86_400_000;

/** `today` is `YYYY-MM-DD` in Prague time. */
export function rainThemeFor(today: string): RainTheme {
  const [y, m, d] = today.split('-').map(Number);
  const days = Math.floor((Date.UTC(y, m - 1, d) - FIRST_MONDAY) / DAY_MS);
  const week = Math.floor(days / 7);
  const n = RAIN_THEMES.length;
  return RAIN_THEMES[((week % n) + n) % n];
}

/** `?rain=bones` in the address previews a theme on any day. */
export function rainThemeFromUrl(search: string): RainTheme | null {
  const key = new URLSearchParams(search).get('rain');
  return RAIN_THEMES.find((t) => t.key === key) ?? null;
}
