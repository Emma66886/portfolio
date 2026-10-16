/**
 * The circuit as data: a closed curve through a handful of points, sampled
 * every couple of metres with the direction and curvature at each sample.
 * Plain maths, no three.js, so the physics can use it without loading WebGL.
 *
 * Coordinates are metres on the ground plane (x, z). Headings follow the car:
 * 0 points along +z, and a heading h faces (sin h, cos h). A car's right-hand
 * side is (-cos h, sin h).
 */

export type TrackDef = {
  name: string;
  /** Points the centre line passes through, in driving order. The line is closed. */
  points: [number, number][];
  /** Half the width of the tarmac. */
  halfWidth: number;
  /** Run-off between the tarmac edge and the barrier. */
  verge: number;
};

/**
 * A long start straight into a fast right-hander, a hairpin at the top, a
 * run of esses through the middle and a sweeping final corner.
 */
export const CIRCUIT: TrackDef = {
  name: "Dusk Circuit",
  halfWidth: 7,
  verge: 11,
  points: [
    [-60, 0],
    [150, 0],
    [235, 55],
    [255, 150],
    [205, 235],
    [125, 215],
    [65, 160],
    [10, 168],
    [-50, 138],
    [-125, 182],
    [-220, 185],
    [-270, 105],
    [-235, 30],
    [-160, 2],
  ],
};

export type Track = {
  def: TrackDef;
  count: number;
  /** Distance between samples, in metres. */
  spacing: number;
  length: number;
  x: Float32Array;
  z: Float32Array;
  /** Unit direction of travel. */
  tx: Float32Array;
  tz: Float32Array;
  /** Signed curvature, 1 / radius: positive turns left. */
  curvature: Float32Array;
  halfWidth: number;
  verge: number;
};

type P = [number, number];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Centripetal Catmull-Rom between p1 and p2, which avoids loops and cusps on uneven spacing. */
function catmullRom(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const t0 = 0;
  const t1 = t0 + Math.sqrt(dist(p0, p1));
  const t2 = t1 + Math.sqrt(dist(p1, p2));
  const t3 = t2 + Math.sqrt(dist(p2, p3));
  const u = t1 + (t2 - t1) * t;
  const mix = (a: P, b: P, ta: number, tb: number): P => {
    const k = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function buildTrack(def: TrackDef, spacing = 2): Track {
  const pts = def.points;
  const n = pts.length;

  // Dense polyline first, then resample it at even distances.
  const dense: P[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let k = 0; k < 60; k++) dense.push(catmullRom(p0, p1, p2, p3, k / 60));
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + dist(dense[i - 1], dense[i % dense.length]));
  const length = cum[dense.length];
  const count = Math.round(length / spacing);
  const step = length / count;

  const x = new Float32Array(count);
  const z = new Float32Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const k = (s - cum[j]) / (cum[j + 1] - cum[j]);
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    x[i] = a[0] + (b[0] - a[0]) * k;
    z[i] = a[1] + (b[1] - a[1]) * k;
  }

  const tx = new Float32Array(count);
  const tz = new Float32Array(count);
  const heading = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const nx = x[(i + 1) % count] - x[(i - 1 + count) % count];
    const nz = z[(i + 1) % count] - z[(i - 1 + count) % count];
    const len = Math.hypot(nx, nz) || 1;
    tx[i] = nx / len;
    tz[i] = nz / len;
    heading[i] = Math.atan2(tx[i], tz[i]);
  }

  // Curvature from the change in heading, smoothed over a few samples.
  const raw = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    raw[i] = wrapAngle(heading[(i + 1) % count] - heading[(i - 1 + count) % count]) / (2 * step);
  }
  const curvature = new Float32Array(count);
  const W = 4;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = -W; k <= W; k++) sum += raw[(i + k + count) % count];
    curvature[i] = sum / (2 * W + 1);
  }

  return { def, count, spacing: step, length, x, z, tx, tz, curvature, halfWidth: def.halfWidth, verge: def.verge };
}

export type Location = {
  index: number;
  /** Distance along the centre line from the start line. */
  s: number;
  /** Signed distance from the centre line: positive is to the right of the direction of travel. */
  d: number;
};

/**
 * Where a point sits relative to the track, searching around `hint` (the last
 * known sample) so it stays cheap. A window of `count / 2` searches everything.
 */
export function locate(t: Track, px: number, pz: number, hint: number, window = 30): Location {
  let best = hint;
  let bestD = Infinity;
  for (let k = -window; k <= window; k++) {
    const i = (((hint + k) % t.count) + t.count) % t.count;
    const dx = px - t.x[i];
    const dz = pz - t.z[i];
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  const dx = px - t.x[best];
  const dz = pz - t.z[best];
  // Project onto the direction of travel for a distance finer than the sample spacing.
  const along = dx * t.tx[best] + dz * t.tz[best];
  const s = (best * t.spacing + along + t.length) % t.length;
  // The right of travel along (tx, tz) is (-tz, tx).
  const d = -dx * t.tz[best] + dz * t.tx[best];
  return { index: best, s, d };
}

/** The point at distance s along the track, offset sideways by d (positive to the right). */
export function pointAt(t: Track, s: number, d = 0): { x: number; z: number; heading: number } {
  const f = (((s % t.length) + t.length) % t.length) / t.spacing;
  const i = Math.floor(f) % t.count;
  const j = (i + 1) % t.count;
  const k = f - Math.floor(f);
  const dirx = t.tx[i] + (t.tx[j] - t.tx[i]) * k;
  const dirz = t.tz[i] + (t.tz[j] - t.tz[i]) * k;
  const len = Math.hypot(dirx, dirz) || 1;
  return {
    x: t.x[i] + (t.x[j] - t.x[i]) * k - (dirz / len) * d,
    z: t.z[i] + (t.z[j] - t.z[i]) * k + (dirx / len) * d,
    heading: Math.atan2(dirx, dirz),
  };
}
