export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const median = (a) => quantile([...a].sort((x, y) => x - y), 0.5);

// Sample standard deviation (n-1); null when fewer than two observations.
export function sd(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

export function describe(values) {
  const a = values.filter((v) => Number.isFinite(v));
  const s = [...a].sort((x, y) => x - y);
  return {
    n: a.length,
    mean: mean(a),
    median: quantile(s, 0.5),
    sd: sd(a),
    min: s[0] ?? null,
    max: s[s.length - 1] ?? null,
    q1: quantile(s, 0.25),
    q3: quantile(s, 0.75),
  };
}
