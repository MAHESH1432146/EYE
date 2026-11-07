export const SUS_STATEMENTS = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];

export const SUS_REFERENCE = 68;

// Odd items (index 0,2,..) contribute r-1; even items contribute 5-r; sum x 2.5 gives 0..100.
export function susScore(responses) {
  if (!Array.isArray(responses) || responses.length !== 10 || !responses.every((r) => Number.isInteger(r) && r >= 1 && r <= 5)) {
    throw new Error('SUS requires 10 integer responses between 1 and 5');
  }
  const sum = responses.reduce((acc, r, i) => acc + (i % 2 === 0 ? r - 1 : 5 - r), 0);
  return sum * 2.5;
}
