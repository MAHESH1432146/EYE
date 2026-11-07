// I-DT (dispersion-threshold) fixation detection, Salvucci & Goldberg 2000.
// Samples: [{t (ms), x, y}] with x/y normalised to the stimulus (0..1).
// Defaults are tuned for noisy webcam gaze: dispersion = (maxX-minX)+(maxY-minY) <= 0.05, min duration 100 ms.
export const FIXATION_PARAMS = { dispersionThreshold: 0.05, minDurationMs: 100 };

const dispersion = (w) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of w) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return maxX - minX + (maxY - minY);
};

export function detectFixations(rawSamples, { dispersionThreshold, minDurationMs } = FIXATION_PARAMS) {
  const samples = rawSamples
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.x) && Number.isFinite(s.y))
    .sort((a, b) => a.t - b.t);
  const fixations = [];
  let i = 0;

  while (i < samples.length) {
    // Smallest window spanning at least the minimum duration.
    let j = i;
    while (j < samples.length && samples[j].t - samples[i].t < minDurationMs) j++;
    if (j >= samples.length) break;

    if (dispersion(samples.slice(i, j + 1)) <= dispersionThreshold) {
      while (j + 1 < samples.length && dispersion(samples.slice(i, j + 2)) <= dispersionThreshold) j++;
      const w = samples.slice(i, j + 1);
      fixations.push({
        start: w[0].t,
        end: w[w.length - 1].t,
        duration: w[w.length - 1].t - w[0].t,
        x: w.reduce((a, s) => a + s.x, 0) / w.length,
        y: w.reduce((a, s) => a + s.y, 0) / w.length,
        samples: w.length,
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return fixations;
}
