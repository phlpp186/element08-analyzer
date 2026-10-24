/**
 * Vertical-speed derivation + smoothing for the dive speed-profile charts.
 *
 * Two deliberate choices here drive how "crisp" per-stroke detail looks:
 *
 *  1. Speed is ALWAYS recomputed from raw depth (Δd/Δt), never read from the
 *     watch's own `ProfilePoint.v`. Garmin's reported speed is pre-conditioned,
 *     so trusting it (then smoothing again) double-rounds the signal and smears
 *     the per-stroke oscillations a freediver wants to count. Deriving from
 *     depth also behaves identically across devices (some apnea records carry
 *     no speed field at all).
 *
 *  2. Smoothing uses a Savitzky-Golay filter (local least-squares polynomial)
 *     rather than a boxcar moving average. A moving average is the worst filter
 *     for keeping peak HEIGHT — it smears exactly the stroke spikes we care
 *     about. Savitzky-Golay removes noise while preserving peak shape, so the
 *     speeds you read off stay truthful per stroke.
 *
 * Pure. Ported unchanged from the app (src/lib/algorithms/speedProfile.ts) so
 * the analyzer's speed-by-depth view matches the phone's.
 */
import type { ProfilePoint } from './diveProfile';

export type SpeedSmoothing = 'raw' | 'light' | 'medium' | 'heavy';

/** Sliding-window size (in samples) per level. `raw` = 1 = no smoothing. */
export const SMOOTHING_WINDOWS: Record<SpeedSmoothing, number> = {
  raw: 1,
  light: 5,
  medium: 9,
  heavy: 15,
};

/** Polynomial degree for the Savitzky-Golay fit. 2 (quadratic) is the classic
 *  peak-preserving choice and is numerically stable for these window sizes. */
export const SAVGOL_ORDER = 2;

/**
 * Signed vertical speed (m/s) per sample, derived from raw depth.
 * Positive = descending (depth increasing), negative = ascending — matching the
 * speed-vs-depth chart's convention. First sample and any non-advancing
 * timestamp yield 0.
 */
export function signedVerticalSpeed(profile: ProfilePoint[]): number[] {
  return profile.map((p, i) => {
    if (i === 0) return 0;
    const prev = profile[i - 1];
    const dt = p.t - prev.t;
    if (dt <= 0) return 0;
    return (p.d - prev.d) / dt;
  });
}

/**
 * Value of a degree-`order` least-squares polynomial fit, evaluated at the
 * window centre (x = 0). `xs` are sample offsets relative to the centre. This
 * is the per-point core of the Savitzky-Golay filter; solving for the constant
 * term c0 of the fit is exactly the smoothed centre value.
 */
function polyFitCentre(xs: number[], ys: number[], order: number): number {
  const n = xs.length;
  if (n === 1) return ys[0];
  const effOrder = Math.min(order, n - 1);
  const cols = effOrder + 1;

  // Normal equations: sum of powers S[p] = Σ x^p, moments T[p] = Σ x^p·y.
  const S = new Array(2 * effOrder + 1).fill(0);
  const T = new Array(effOrder + 1).fill(0);
  for (let k = 0; k < n; k++) {
    const x = xs[k];
    let xp = 1;
    for (let p = 0; p <= 2 * effOrder; p++) {
      S[p] += xp;
      if (p <= effOrder) T[p] += xp * ys[k];
      xp *= x;
    }
  }

  // Augmented matrix M·c = T, reduced to diagonal via Gaussian elimination.
  const M: number[][] = [];
  for (let a = 0; a < cols; a++) {
    M[a] = [];
    for (let b = 0; b < cols; b++) M[a][b] = S[a + b];
    M[a].push(T[a]);
  }
  for (let i = 0; i < cols; i++) {
    let piv = i;
    for (let r = i + 1; r < cols; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    }
    if (piv !== i) {
      const tmp = M[i];
      M[i] = M[piv];
      M[piv] = tmp;
    }
    const d = M[i][i];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < cols; r++) {
      if (r === i) continue;
      const f = M[r][i] / d;
      for (let c = i; c <= cols; c++) M[r][c] -= f * M[i][c];
    }
  }

  if (Math.abs(M[0][0]) < 1e-12) return ys[Math.floor(n / 2)];
  return M[0][cols] / M[0][0];
}

/**
 * Savitzky-Golay smoothing over a sliding window. Window <= 1 (or too few
 * samples) returns the input unchanged. Windows are clamped at the edges, where
 * the fit order is reduced to the points available.
 */
export function savgol(values: number[], window: number, order: number): number[] {
  if (window <= 1 || values.length < 3) return values.slice();
  const half = Math.floor(window / 2);
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let j = start; j < end; j++) {
      xs.push(j - i);
      ys.push(values[j]);
    }
    out[i] = polyFitCentre(xs, ys, order);
  }
  return out;
}

/**
 * Convenience: signed vertical speed for a dive profile, smoothed at the given
 * level. Positive = descending. Take Math.abs() of the result for a "how fast"
 * (speed-vs-time) view.
 */
export function smoothSpeed(profile: ProfilePoint[], smoothing: SpeedSmoothing): number[] {
  return savgol(signedVerticalSpeed(profile), SMOOTHING_WINDOWS[smoothing], SAVGOL_ORDER);
}
