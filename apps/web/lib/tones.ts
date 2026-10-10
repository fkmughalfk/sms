/**
 * Accent colours for tiles, cards and headings. Colour sits on chips, bars and glows;
 * numbers and labels stay in text ink so they read the same in every tone.
 */
export const TONES = {
  indigo: {
    gradient: 'from-indigo-500 to-violet-500',
    glow: 'bg-indigo-500',
    edge: 'border-l-indigo-500',
  },
  emerald: {
    gradient: 'from-emerald-500 to-teal-500',
    glow: 'bg-emerald-500',
    edge: 'border-l-emerald-500',
  },
  amber: {
    gradient: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-500',
    edge: 'border-l-amber-500',
  },
  sky: { gradient: 'from-sky-500 to-blue-600', glow: 'bg-sky-500', edge: 'border-l-sky-500' },
  rose: { gradient: 'from-rose-500 to-pink-500', glow: 'bg-rose-500', edge: 'border-l-rose-500' },
  fuchsia: {
    gradient: 'from-fuchsia-500 to-purple-600',
    glow: 'bg-fuchsia-500',
    edge: 'border-l-fuchsia-500',
  },
} as const;

export type Tone = keyof typeof TONES;
