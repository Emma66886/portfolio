/**
 * Hot Lap's car physics and race rules, with no rendering in here: the
 * three.js scene reads this state each frame and draws it.
 *
 * The car is an arcade model. Throttle and brakes act along the direction it
 * faces; steering turns the body, and grip pulls the velocity round after it.
 * Low grip (the handbrake, or grass) lets the velocity lag behind the body,
 * which is a slide.
 */
import { buildTrack, CIRCUIT, locate, pointAt, type Track } from "@/lib/games/hotlap/track";

export const MAX_SPEED = 64;
const ACCEL = 17;
const BRAKE = 30;
const REVERSE_SPEED = 9;
const GRASS_SPEED = 24;
/** Sideways acceleration the tyres can hold on tarmac, m/s². */
const LAT_GRIP = 22;
const COUNTDOWN = 3.6;
/** The car lines up this far behind the start line. */
const GRID = 14;
/** Ghost replays store a pose this many times a second. */
export const GHOST_RATE = 20;
/** Values stored per ghost sample: x, z, heading, distance into the lap. */
const GHOST_STRIDE = 4;
/** Top speed of each gear, for the engine note and the gear readout. */
const GEARS = [0, 15, 25, 35, 45, 55, 65];

export type Controls = { throttle: number; brake: number; steer: number; handbrake: boolean };
export const NO_CONTROLS: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export type Car = {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /** Smoothed steering, -1 (left) to 1 (right). */
  steer: number;
  /** Speed along the direction the car faces; negative when reversing. */
  speed: number;
  /** Sideways speed: how hard the car is sliding. */
  slip: number;
  offTrack: boolean;
  gear: number;
  /** Engine speed, 0 to 1. */
  rpm: number;
  throttle: number;
  braking: boolean;
};

/** One lap as a replay: GHOST_STRIDE values per sample, GHOST_RATE samples a second. */
export type Ghost = { lapTime: number; samples: Float32Array };

export type RaceEvent =
  | { type: "count"; n: number }
  | { type: "go" }
  | { type: "lap"; lap: number; time: number; best: boolean }
  | { type: "hit"; impact: number }
  | { type: "finish" };

export type Race = {
  track: Track;
  laps: number;
  phase: "countdown" | "racing" | "finished";
  /** Seconds left in the countdown. */
  countdown: number;
  /** Seconds since the green light. */
  time: number;
  lapStart: number;
  /** Laps completed. */
  lap: number;
  lapTimes: number[];
  bestLap: number | null;
  /** The fastest lap of this race, as a replay. */
  bestGhost: Ghost | null;
  recording: number[];
  recordClock: number;
  car: Car;
  /** Nearest track sample to the car. */
  index: number;
  /** Distance along the track and sideways offset of the car. */
  s: number;
  d: number;
  /** Distance raced from the start line; negative on the grid. */
  distance: number;
  wrongWay: boolean;
  wrongWayClock: number;
  steps: number;
  hits: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

let cachedTrack: Track | null = null;
export const getTrack = () => (cachedTrack ??= buildTrack(CIRCUIT));

export function createRace(laps: number, track = getTrack()): Race {
  const start = pointAt(track, -GRID);
  const loc = locate(track, start.x, start.z, 0, track.count >> 1);
  return {
    track,
    laps,
    phase: "countdown",
    countdown: COUNTDOWN,
    time: 0,
    lapStart: 0,
    lap: 0,
    lapTimes: [],
    bestLap: null,
    bestGhost: null,
    recording: [],
    recordClock: 0,
    car: {
      x: start.x,
      z: start.z,
      heading: start.heading,
      vx: 0,
      vz: 0,
      steer: 0,
      speed: 0,
      slip: 0,
      offTrack: false,
      gear: 1,
      rpm: 0.15,
      throttle: 0,
      braking: false,
    },
    index: loc.index,
    s: loc.s,
    d: loc.d,
    distance: -GRID,
    wrongWay: false,
    wrongWayClock: 0,
    steps: 0,
    hits: 0,
  };
}

/** Seconds into the current lap. */
export const lapTime = (r: Race) => (r.phase === "racing" ? r.time - r.lapStart : 0);
/** Metres into the current lap. */
export const lapDistance = (r: Race) => r.distance - r.lap * r.track.length;

function drive(r: Race, c: Controls, dt: number, events: RaceEvent[]) {
  const car = r.car;
  const t = r.track;
  car.steer += (c.steer - car.steer) * (1 - Math.exp(-dt * 10));
  car.throttle = c.throttle;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  // Right of the car is (-fz, fx).
  let vf = car.vx * fx + car.vz * fz;
  let vl = car.vx * -fz + car.vz * fx;

  // Along the car: engine, brakes, drag and the grass.
  const top = car.offTrack ? GRASS_SPEED : MAX_SPEED;
  let a = 0;
  if (c.throttle > 0) {
    if (vf > -0.5) a += ACCEL * c.throttle * Math.max(0, 1 - (vf / MAX_SPEED) ** 2);
    else a += BRAKE * c.throttle;
  }
  car.braking = c.brake > 0 && vf > 0.5;
  if (c.brake > 0) {
    if (vf > 0.5) a -= BRAKE * c.brake;
    else if (vf > -REVERSE_SPEED) a -= 7 * c.brake;
  }
  const drag = 0.5 + 0.0009 * vf * vf + (c.throttle ? 0 : 1.2) + (car.offTrack ? 2 + 0.08 * Math.abs(vf) : 0);
  const over = Math.max(0, Math.abs(vf) - top) * 1.5;
  const before = vf;
  vf += a * dt - Math.sign(vf) * (drag + over) * dt;
  // Drag alone never pushes the car backwards.
  if (!c.throttle && !c.brake && Math.sign(vf) !== Math.sign(before)) vf = 0;

  // Sideways: grip bleeds off the slide, and a slide scrubs speed.
  const grip = c.handbrake ? 1.3 : car.offTrack ? 3 : 8;
  vl *= Math.exp(-grip * dt);
  vf -= Math.sign(vf) * Math.min(Math.abs(vf), Math.abs(vl) * 0.35 * dt);
  if (c.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);

  // Velocity back to the world using the heading it was measured in, then
  // turn the body. Next step that turn shows up as sideways speed.
  car.vx = fx * vf - fz * vl;
  car.vz = fz * vf + fx * vl;
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  const speed = Math.abs(vf);
  const latLimit = car.offTrack ? 9 : LAT_GRIP;
  const maxYaw = Math.min(2.1, (latLimit * (c.handbrake ? 1.6 : 1.15)) / Math.max(speed, 1));
  // Steering right turns the heading clockwise, which lowers it.
  car.heading -= car.steer * maxYaw * Math.min(1, speed / 5) * (vf < 0 ? -1 : 1) * dt;

  car.speed = vf;
  car.slip = vl;

  // Where the car is now, and the barrier at the edge of the run-off.
  const loc = locate(t, car.x, car.z, r.index, 25);
  r.steps++;
  // A full search now and then, in case the local one ever loses its place.
  const found = r.steps % 30 === 0 ? locate(t, car.x, car.z, r.index, t.count >> 1) : loc;
  const prevS = r.s;
  r.index = found.index;
  r.s = found.s;
  r.d = found.d;
  car.offTrack = Math.abs(r.d) > t.halfWidth + 0.4;

  const wall = t.halfWidth + t.verge - 1;
  if (Math.abs(r.d) > wall) {
    const side = Math.sign(r.d);
    const nx = -t.tz[r.index] * side;
    const nz = t.tx[r.index] * side;
    const push = Math.abs(r.d) - wall;
    car.x -= nx * push;
    car.z -= nz * push;
    r.d = side * wall;
    const vn = car.vx * nx + car.vz * nz;
    if (vn > 0) {
      car.vx -= 1.3 * vn * nx;
      car.vz -= 1.3 * vn * nz;
      car.vx *= 0.8;
      car.vz *= 0.8;
      if (vn > 2) {
        r.hits++;
        events.push({ type: "hit", impact: vn });
      }
    }
  }

  let ds = r.s - prevS;
  if (ds > t.length / 2) ds -= t.length;
  if (ds < -t.length / 2) ds += t.length;
  r.distance += ds;

  // Wrong way: moving against the track for more than a moment.
  const along = car.vx * t.tx[r.index] + car.vz * t.tz[r.index];
  r.wrongWayClock = along < -3 ? r.wrongWayClock + dt : 0;
  r.wrongWay = r.wrongWayClock > 0.8;

  // Cosmetic gearbox, for the engine note and the readout.
  let gear = 1;
  while (gear < GEARS.length - 1 && speed > GEARS[gear] * 0.96) gear++;
  car.gear = vf < -0.5 ? 0 : gear;
  const low = GEARS[gear - 1];
  car.rpm = clamp(0.3 + (0.7 * (speed - low * 0.85)) / (GEARS[gear] - low * 0.85), 0.15, 1);
}

function record(r: Race, dt: number) {
  r.recordClock -= dt;
  while (r.recordClock <= 0) {
    r.recording.push(r.car.x, r.car.z, r.car.heading, lapDistance(r));
    r.recordClock += 1 / GHOST_RATE;
  }
}

/** Advances the race by `dt` seconds. */
export function stepRace(r: Race, dt: number, c: Controls): RaceEvent[] {
  const events: RaceEvent[] = [];

  if (r.phase === "countdown") {
    const before = Math.ceil(r.countdown);
    r.countdown -= dt;
    const after = Math.ceil(r.countdown);
    if (after !== before && after >= 1 && after <= 3) events.push({ type: "count", n: after });
    // Revving on the grid.
    r.car.rpm += (0.15 + c.throttle * 0.75 - r.car.rpm) * (1 - Math.exp(-dt * 6));
    r.car.throttle = c.throttle;
    if (r.countdown <= 0) {
      r.phase = "racing";
      r.time = 0;
      r.lapStart = 0;
      r.recordClock = 0;
      events.push({ type: "go" });
    }
    return events;
  }

  const prevDistance = r.distance;
  drive(r, c, dt, events);
  if (r.phase !== "racing") return events;

  r.time += dt;
  record(r, dt);

  const L = r.track.length;
  if (r.distance >= (r.lap + 1) * L) {
    // When, within this step, the car actually crossed the line.
    const line = (r.lap + 1) * L;
    const f = (r.distance - line) / Math.max(r.distance - prevDistance, 1e-6);
    const crossed = r.time - f * dt;
    const time = crossed - r.lapStart;
    const best = r.bestLap === null || time < r.bestLap;
    if (best) {
      r.bestLap = time;
      r.bestGhost = { lapTime: time, samples: Float32Array.from(r.recording) };
    }
    r.lapTimes.push(time);
    r.lap++;
    r.lapStart = crossed;
    r.recording = [];
    r.recordClock = 0;
    events.push({ type: "lap", lap: r.lap, time, best });
    if (r.lap >= r.laps) {
      r.phase = "finished";
      events.push({ type: "finish" });
    }
  }
  return events;
}

/** Total race time, the sum of its laps. */
export const raceTime = (r: Race) => r.lapTimes.reduce((a, b) => a + b, 0);

// ---- Ghosts ----

export type Pose = { x: number; z: number; heading: number; distance: number };

/** Where the ghost was `t` seconds into its lap, or null once its lap is over. */
export function ghostPose(g: Ghost, t: number): Pose | null {
  const n = g.samples.length / GHOST_STRIDE;
  const f = t * GHOST_RATE;
  if (f < 0 || f >= n - 1) return null;
  const i = Math.floor(f);
  const k = f - i;
  const a = i * GHOST_STRIDE;
  const b = a + GHOST_STRIDE;
  const s = g.samples;
  let dh = s[b + 2] - s[a + 2];
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  return {
    x: s[a] + (s[b] - s[a]) * k,
    z: s[a + 1] + (s[b + 1] - s[a + 1]) * k,
    heading: s[a + 2] + dh * k,
    distance: s[a + 3] + (s[b + 3] - s[a + 3]) * k,
  };
}

/** How long the ghost took to cover `distance` metres of its lap, for the live gap. */
export function ghostTimeAt(g: Ghost, distance: number): number | null {
  const s = g.samples;
  const n = s.length / GHOST_STRIDE;
  if (n < 2 || distance < s[3] || distance > s[(n - 1) * GHOST_STRIDE + 3]) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid * GHOST_STRIDE + 3] < distance) lo = mid;
    else hi = mid;
  }
  const d0 = s[lo * GHOST_STRIDE + 3];
  const d1 = s[hi * GHOST_STRIDE + 3];
  const k = d1 > d0 ? (distance - d0) / (d1 - d0) : 0;
  return (lo + k) / GHOST_RATE;
}

// ---- Autopilot ----

/**
 * Drives the car the way a tidy human would: brakes for the tightest corner
 * it could still stop for, and steers at a point ahead on a line that hugs
 * the inside of each corner. Runs the menu demo and sets the pace car's lap.
 */
export function autopilot(r: Race, grip = 0.9): Controls {
  const t = r.track;
  const car = r.car;
  const speed = Math.max(car.speed, 0);
  const latA = LAT_GRIP * grip;
  const brake = BRAKE * 0.8;

  let target = MAX_SPEED;
  const reach = (speed * speed) / (2 * brake) + 30;
  for (let k = 0; k * t.spacing < reach; k += 2) {
    const kappa = Math.abs(t.curvature[(r.index + k) % t.count]);
    const corner = kappa > 1e-4 ? Math.sqrt(latA / kappa) : MAX_SPEED;
    target = Math.min(target, Math.sqrt(corner * corner + 2 * brake * k * t.spacing));
  }

  const look = 9 + speed * 0.4;
  const ahead = Math.round((r.s + look) / t.spacing) % t.count;
  let kappa = 0;
  for (let k = -6; k <= 6; k++) kappa += t.curvature[(ahead + k + t.count) % t.count];
  kappa /= 13;
  const inside = clamp(-kappa * 160, -t.halfWidth * 0.6, t.halfWidth * 0.6);
  const p = pointAt(t, r.s + look, inside);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const dx = p.x - car.x;
  const dz = p.z - car.z;
  const angle = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
  // Pull back from the white lines if a corner is carrying it wide.
  const edge = t.halfWidth - 1.2;
  const guard = r.d > edge ? -(r.d - edge) * 0.35 : r.d < -edge ? (-edge - r.d) * 0.35 : 0;

  return {
    throttle: speed < target - 1 ? 1 : speed < target ? 0.4 : 0,
    brake: speed > target + 1.5 ? clamp((speed - target) / 6, 0.2, 1) : 0,
    steer: clamp(angle * 2.4 + guard, -1, 1),
    handbrake: false,
  };
}

/**
 * The pace car's lap: the autopilot's best over two laps, driven headless and
 * a little short of the limit, so it's a target a new player can reach. It's
 * deterministic, so every visitor races the same pace car.
 */
export function paceGhost(): Ghost {
  const r = createRace(2);
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 240 && r.phase !== "finished"; i++) {
    stepRace(r, dt, r.phase === "racing" ? autopilot(r, 0.85) : NO_CONTROLS);
  }
  return r.bestGhost!;
}

/** Back onto the middle of the track where the car left it, stopped and facing the right way. */
export function respawn(r: Race) {
  const p = pointAt(r.track, r.s);
  Object.assign(r.car, { x: p.x, z: p.z, heading: p.heading, vx: 0, vz: 0, speed: 0, slip: 0, steer: 0 });
  r.d = 0;
  r.wrongWay = false;
  r.wrongWayClock = 0;
}
