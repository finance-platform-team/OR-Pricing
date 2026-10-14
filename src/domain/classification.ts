/** Procedure classification (orpx_classtype global choice). */

/** Lowest → highest. The highest-ranked selected procedure becomes the primary one. */
export const CLASS_ORDER = ['Minor', 'Moderate', 'Major', 'Special Skills', 'Special Nature', 'Advanced'] as const;
export type ClassType = (typeof CLASS_ORDER)[number];

export const CLASS_TYPE_MAP: Record<number, ClassType> = {
  129990000: 'Minor',
  129990001: 'Moderate',
  129990002: 'Major',
  129990003: 'Special Skills',
  129990004: 'Special Nature',
  129990005: 'Advanced',
};

/** Label for a classtype choice value, or "" when unknown. */
export function getClassLabel(value: number | null | undefined): string {
  return (value != null && CLASS_TYPE_MAP[value]) || '';
}

type BadgeColors = { bg: string; color: string };

/** Badge colours on the dark-accent surfaces (procedure cards, cost table, list). */
export const CLASS_COLORS: Record<string, BadgeColors> = {
  'Minor': { bg: 'rgba(100,116,139,.18)', color: '#94A3B8' },
  'Moderate': { bg: 'rgba(52,211,153,.14)', color: '#34D399' },
  'Major': { bg: 'rgba(251,191,36,.14)', color: '#FBBF24' },
  'Special Skills': { bg: 'rgba(96,165,250,.14)', color: '#60A5FA' },
  'Special Nature': { bg: 'rgba(167,139,250,.14)', color: '#A78BFA' },
  'Advanced': { bg: 'rgba(248,113,113,.14)', color: '#F87171' },
};

/** Badge colours in the Billing Review procedure table. */
export const CLASS_COLORS_LIGHT: Record<string, BadgeColors> = {
  'Minor': { bg: '#EFF6FF', color: '#1D4ED8' },
  'Moderate': { bg: '#ECFDF5', color: '#065F46' },
  'Major': { bg: '#FFF7ED', color: '#9A3412' },
  'Special Skills': { bg: '#F5F3FF', color: '#4C1D95' },
  'Special Nature': { bg: '#FDF4FF', color: '#701A75' },
  'Advanced': { bg: '#FFF1F2', color: '#881337' },
};

/** Rank in CLASS_ORDER; unknown classes rank -1 (lowest). */
export function classRank(classType: string): number {
  return (CLASS_ORDER as readonly string[]).indexOf(classType);
}

/**
 * Index of the primary procedure: the first one with the highest class rank.
 * Chosen by position, not id, so the same procedure picked in two slots
 * doesn't make both primary. Returns -1 for an empty list.
 */
export function primaryIndex(classTypes: string[]): number {
  if (!classTypes.length) return -1;
  const ranks = classTypes.map(classRank);
  return ranks.indexOf(Math.max(...ranks));
}
