const FREQ_SCORE = { daily: 4, weekly: 3, monthly: 2, rarely: 1, never: 0 };
export const ALL_OS = ['windows', 'macos', 'linux'];

// Paper's ordering principle: least familiar first, most used (primary) last.
export function recommendSequence(profile) {
  const score = (os) =>
    (FREQ_SCORE[profile.usageFrequency?.[os]] ?? 0) * 10 +
    (profile.familiarity?.[os] ?? 0) +
    (profile.primaryOS === os ? 100 : 0);
  return [...ALL_OS].sort((a, b) => score(a) - score(b));
}
