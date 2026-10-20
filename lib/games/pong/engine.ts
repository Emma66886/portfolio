/**
 * Ping pong rules and ball flight, with no rendering in here: the three.js
 * scene reads this state each frame and draws it. Units are metres on a
 * regulation table, with the table top at y = 0, the player at +z and the
 * CPU at -z. In a two-player match the "cpu" side is the second player.
 *
 * The ball moves in a straight line across the table (x, z). Its height is
 * derived from z along a planned flight: from the paddle, down to a bounce on
 * the far half, and back up to the receiving paddle. Planning the bounce first
 * is what guarantees every shot clears the net and lands on the table.
 */

export type Side = "player" | "cpu";
export type Difficulty = "easy" | "normal" | "hard";
export type Phase = "serve" | "rally" | "point" | "over";

export const TABLE = { halfLength: 1.37, halfWidth: 0.7625, netHeight: 0.1525, height: 0.76 };
export const BALL_RADIUS = 0.034;
/** Bigger than a real blade, so the paddle reads clearly from the camera. */
export const PADDLE_RADIUS = 0.12;
/** Height of every paddle contact above the table. */
export const PADDLE_Y = 0.17;
export const PLAYER_Z = TABLE.halfLength + 0.14;
export const CPU_Z = -PLAYER_Z;
/** How far either paddle can travel from the centre line. */
export const PADDLE_RANGE = TABLE.halfWidth + 0.32;
/** Lateral distance from the paddle centre at which the ball still connects. */
const REACH = PADDLE_RADIUS + BALL_RADIUS + 0.02;
const FLOOR_Y = -TABLE.height + BALL_RADIUS;

const BASE_SPEED = 3;
const MAX_SPEED = 6.4;
/** Each return comes back this much faster, up to MAX_SPEED. */
const SPEED_UP = 1.07;
/** Time the ball keeps flying after a miss before the next serve. */
const POINT_PAUSE = 1.15;

export const DIFFICULTIES: Record<
  Difficulty,
  {
    label: string;
    /** CPU paddle speed, m/s. */
    speed: number;
    /** Seconds after your hit before the CPU starts moving. */
    reaction: number;
    /** Largest misjudgement of where the ball will arrive, in metres. */
    error: number;
    /** Chance the CPU misreads a shot badly enough to miss it outright. */
    whiff: number;
    /** Chance the CPU aims away from your paddle rather than anywhere. */
    aim: number;
    /** Multiplier on ball speed. */
    pace: number;
  }
> = {
  easy: { label: "Easy", speed: 1.45, reaction: 0.3, error: 0.12, whiff: 0.12, aim: 0.3, pace: 0.88 },
  normal: { label: "Normal", speed: 1.85, reaction: 0.2, error: 0.08, whiff: 0.07, aim: 0.6, pace: 1 },
  hard: { label: "Hard", speed: 2.4, reaction: 0.15, error: 0.06, whiff: 0.05, aim: 0.85, pace: 1.1 },
};

type Flight = {
  /** Contact, bounce(s), then the receiver's contact, in the order the ball meets them. */
  nodes: { z: number; y: number }[];
  /** Extra height at the middle of each segment between nodes. */
  arcs: number[];
  /** Index of the next node the ball has yet to reach. */
  next: number;
};

type Paddle = { x: number; vx: number };

export type Match = {
  difficulty: Difficulty;
  /** Two people on one device: the far paddle takes input instead of thinking for itself. */
  versus: boolean;
  /** Points needed to win, by a margin of two. */
  target: number;
  phase: Phase;
  score: Record<Side, number>;
  firstServer: Side;
  server: Side;
  winner: Side | null;
  player: Paddle;
  cpu: Paddle;
  ball: { x: number; y: number; z: number; vx: number; vz: number; speed: number };
  flight: Flight;
  /** Shots played in the current point, serve included. */
  rally: number;
  longestRally: number;
  /** Seconds of play, not counting pauses. */
  time: number;
  /** Counts down the serve delay or the pause after a point. */
  timer: number;
  /** Seconds since the last paddle contact. */
  sinceHit: number;
  /** Where the CPU thinks the current shot will arrive, relative to the truth. */
  cpuError: number;
};

export type PongEvent =
  | { type: "serve"; side: Side }
  | { type: "hit"; side: Side; x: number; y: number; z: number; power: number }
  | { type: "bounce"; x: number; z: number }
  | { type: "point"; winner: Side }
  /** The next point is set up and waiting on `server`. */
  | { type: "ready"; server: Side }
  | { type: "over"; winner: Side };

export type PongInput = {
  /** Where the player wants their paddle, in table x. */
  x: number;
  /** True on the frame the player asks to serve. */
  serve: boolean;
  /** The second player's paddle and serve, in a two-player match. */
  x2?: number;
  serve2?: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const other = (side: Side): Side => (side === "player" ? "cpu" : "player");
const paddleZ = (side: Side) => (side === "player" ? PLAYER_Z : CPU_Z);

export function createMatch(difficulty: Difficulty, target: number, versus = false): Match {
  const m: Match = {
    difficulty,
    versus,
    target,
    phase: "serve",
    score: { player: 0, cpu: 0 },
    firstServer: "player",
    server: "player",
    winner: null,
    player: { x: 0, vx: 0 },
    cpu: { x: 0, vx: 0 },
    ball: { x: 0, y: PADDLE_Y, z: PLAYER_Z, vx: 0, vz: 0, speed: 0 },
    flight: { nodes: [], arcs: [], next: 0 },
    rally: 0,
    longestRally: 0,
    time: 0,
    timer: 0.4,
    sinceHit: 0,
    cpuError: 0,
  };
  holdBall(m);
  return m;
}

/**
 * Who serves after `played` points. Service changes every two points, and
 * every point once both players reach one short of the target (deuce). An
 * unfinished game past 2 * (target - 1) points can only be at deuce.
 */
function serverAfter(m: Match, played: number): Side {
  const deuceFrom = 2 * (m.target - 1);
  const turns = played < deuceFrom ? Math.floor(played / 2) : m.target - 1 + (played - deuceFrom);
  return turns % 2 === 0 ? m.firstServer : other(m.firstServer);
}

/** Height of the ball at depth z along its planned flight. */
function heightAt(flight: Flight, z: number) {
  const { nodes, arcs } = flight;
  const last = nodes.length - 1;
  const dir = Math.sign(nodes[last].z - nodes[0].z);
  let i = 0;
  while (i < last - 1 && (z - nodes[i + 1].z) * dir > 0) i++;
  const a = nodes[i];
  const b = nodes[i + 1];
  // Past the receiver the last segment simply carries on, which makes a
  // missed ball keep falling along the same arc.
  const s = (z - a.z) / (b.z - a.z);
  const y = a.y + (b.y - a.y) * s + arcs[i] * 4 * s * (1 - s);
  return Math.max(y, FLOOR_Y);
}

/** Ball resting above the server's paddle, waiting to be served. */
function holdBall(m: Match) {
  const paddle = m[m.server];
  const z = paddleZ(m.server);
  m.ball.x = paddle.x;
  m.ball.z = z - Math.sign(z) * 0.06;
  m.ball.y = PADDLE_Y + 0.13 + Math.sin(m.time * 4) * 0.025;
  m.ball.vx = 0;
  m.ball.vz = 0;
}

/** Plans a shot from `from` that lands at `targetX` on the far half. */
function launch(m: Match, from: Side, targetX: number, speed: number, serve: boolean) {
  const z0 = paddleZ(from);
  const dir = from === "player" ? -1 : 1;
  const landZ = dir * rand(0.42, 0.82) * TABLE.halfLength;

  m.flight.nodes = serve
    ? [
        { z: z0, y: PADDLE_Y },
        { z: -dir * rand(0.5, 0.7) * TABLE.halfLength, y: 0 },
        { z: landZ, y: 0 },
        { z: -z0, y: PADDLE_Y },
      ]
    : [
        { z: z0, y: PADDLE_Y },
        { z: landZ, y: 0 },
        { z: -z0, y: PADDLE_Y },
      ];
  m.flight.arcs = serve ? [0.05, 0.24, 0.15] : [0.22, 0.15];
  m.flight.next = 1;

  const ball = m.ball;
  ball.z = z0;
  ball.speed = speed;
  ball.vz = dir * speed;
  ball.vx = ((targetX - ball.x) / Math.abs(landZ - z0)) * speed;
  ball.y = PADDLE_Y;

  m.rally++;
  m.sinceHit = 0;

  // The CPU commits to a read of each shot coming its way. Usually close,
  // occasionally far enough off that it misses, and more often on fast shots
  // that drag it away from where it is standing.
  if (from === "player" && !m.versus) {
    const ai = DIFFICULTIES[m.difficulty];
    const pressure = speed / MAX_SPEED;
    const arriveX = ball.x + ball.vx * ((2 * Math.abs(z0)) / speed);
    const stretch = Math.min(Math.abs(arriveX - m.cpu.x) / TABLE.halfWidth, 1.5);
    m.cpuError =
      Math.random() < ai.whiff * (0.4 + pressure + stretch * 0.8)
        ? Math.sign(Math.random() - 0.5) * (REACH + rand(0.04, 0.12))
        : rand(-1, 1) * ai.error * (0.5 + pressure);
  }
}

function serve(m: Match, events: PongEvent[]) {
  const ai = DIFFICULTIES[m.difficulty];
  const speed = BASE_SPEED * ai.pace * 0.85;
  const hw = TABLE.halfWidth;
  // People aim a serve by moving as they hit it.
  const targetX =
    m.server === "player" || m.versus
      ? clamp(m[m.server].vx * 0.15 + rand(-0.25, 0.25), -hw * 0.8, hw * 0.8)
      : rand(-0.6, 0.6) * hw;
  m.ball.x = m[m.server].x;
  m.rally = 0;
  launch(m, m.server, targetX, speed, true);
  m.phase = "rally";
  events.push({ type: "serve", side: m.server });
}

function returnShot(m: Match, side: Side, contactX: number, events: PongEvent[]) {
  const ai = DIFFICULTIES[m.difficulty];
  const hw = TABLE.halfWidth;
  const paddle = m[side];
  let targetX: number;
  let boost = 0;

  if (side === "player" || m.versus) {
    // Where the ball meets the blade sets the angle, and a moving paddle
    // adds a flick and some pace on top.
    const offset = clamp((contactX - paddle.x) / REACH, -1, 1);
    const flick = clamp(paddle.vx * 0.09, -0.35, 0.35);
    targetX = clamp(offset * hw * 0.85 + flick, -hw * 0.92, hw * 0.92);
    boost = Math.min(Math.abs(paddle.vx), 4) * 0.07;
  } else {
    const away = m.player.x >= 0 ? -1 : 1;
    targetX = Math.random() < ai.aim ? away * hw * rand(0.3, 0.85) : rand(-0.65, 0.65) * hw;
  }

  const speed = Math.min(m.ball.speed * SPEED_UP + boost, MAX_SPEED * ai.pace);
  m.ball.x = contactX;
  launch(m, side, targetX, speed, false);
  events.push({
    type: "hit",
    side,
    x: contactX,
    y: PADDLE_Y,
    z: paddleZ(side),
    power: speed / (MAX_SPEED * ai.pace),
  });
}

function awardPoint(m: Match, winner: Side, events: PongEvent[]) {
  m.score[winner]++;
  m.longestRally = Math.max(m.longestRally, m.rally);
  m.phase = "point";
  m.timer = POINT_PAUSE;
  events.push({ type: "point", winner });

  const { player, cpu } = m.score;
  if ((player >= m.target || cpu >= m.target) && Math.abs(player - cpu) >= 2) {
    m.winner = player > cpu ? "player" : "cpu";
  }
}

function moveCpu(m: Match, dt: number) {
  const ai = DIFFICULTIES[m.difficulty];
  const ball = m.ball;
  let target: number;

  if (m.phase === "rally" && ball.vz < 0) {
    if (m.sinceHit < ai.reaction) {
      target = m.cpu.x;
    } else {
      const t = (CPU_Z - ball.z) / ball.vz;
      target = t > 0 ? ball.x + ball.vx * t + m.cpuError : m.cpu.x;
    }
  } else if (m.phase === "rally") {
    // Recover toward the middle while the ball is heading away.
    target = ball.x * 0.3;
  } else if (m.phase === "serve" && m.server === "cpu") {
    target = m.cpu.x;
  } else {
    target = 0;
  }

  const prev = m.cpu.x;
  const maxStep = ai.speed * dt;
  m.cpu.x = clamp(prev + clamp(target - prev, -maxStep, maxStep), -PADDLE_RANGE, PADDLE_RANGE);
  m.cpu.vx = (m.cpu.x - prev) / dt;
}

/**
 * A person's paddle: a short ease toward where they want it rather than a
 * hard follow, so it never teleports through the ball when a pointer jumps.
 */
function follow(paddle: Paddle, x: number, dt: number) {
  const prev = paddle.x;
  const want = clamp(x, -PADDLE_RANGE, PADDLE_RANGE);
  paddle.x += (want - prev) * (1 - Math.exp(-dt * 28));
  const vx = (paddle.x - prev) / dt;
  paddle.vx += (vx - paddle.vx) * (1 - Math.exp(-dt * 20));
}

/** Advances the match by `dt` seconds and reports what happened. */
export function step(m: Match, dt: number, input: PongInput): PongEvent[] {
  const events: PongEvent[] = [];
  if (m.phase === "over") return events;

  m.time += dt;
  m.sinceHit += dt;

  follow(m.player, input.x, dt);
  if (m.versus) follow(m.cpu, input.x2 ?? 0, dt);
  else moveCpu(m, dt);

  if (m.phase === "serve") {
    holdBall(m);
    m.timer -= dt;
    const asked = m.server === "player" ? input.serve : !m.versus || !!input.serve2;
    if (m.timer <= 0 && asked) serve(m, events);
    return events;
  }

  // Rally, or the ball still flying after a point was decided.
  const ball = m.ball;
  const prevZ = ball.z;
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  ball.y = heightAt(m.flight, ball.z);

  const { nodes } = m.flight;
  const dir = Math.sign(ball.vz);
  while (m.flight.next < nodes.length - 1 && (ball.z - nodes[m.flight.next].z) * dir >= 0) {
    if (m.phase === "rally") events.push({ type: "bounce", x: ball.x, z: nodes[m.flight.next].z });
    m.flight.next++;
  }

  if (m.phase === "rally") {
    const receiver: Side = ball.vz < 0 ? "cpu" : "player";
    const planeZ = paddleZ(receiver);
    if ((prevZ - planeZ) * (ball.z - planeZ) <= 0) {
      // Where the ball actually crossed the paddle's plane this step.
      const contactX = ball.x - ball.vx * ((ball.z - planeZ) / ball.vz);
      if (Math.abs(contactX - m[receiver].x) <= REACH) {
        returnShot(m, receiver, contactX, events);
      } else {
        awardPoint(m, other(receiver), events);
      }
    }
    return events;
  }

  // m.phase === "point"
  m.timer -= dt;
  if (m.timer <= 0) {
    if (m.winner) {
      m.phase = "over";
      events.push({ type: "over", winner: m.winner });
    } else {
      m.server = serverAfter(m, m.score.player + m.score.cpu);
      m.phase = "serve";
      m.timer = m.server === "cpu" && !m.versus ? 0.9 : 0.25;
      holdBall(m);
      events.push({ type: "ready", server: m.server });
    }
  }
  return events;
}

/**
 * Plays the player's side, for the demo rally that runs behind the menu. It
 * reads every shot perfectly but moves at a human pace and aims a little off
 * centre, so the rallies look like real ones.
 */
export function createAutopilot() {
  let x = 0;
  let aim = 0;
  let lastVz = 0;
  return (m: Match, dt: number): PongInput => {
    const ball = m.ball;
    if (ball.vz > 0 && lastVz <= 0) aim = (Math.random() * 2 - 1) * 0.13;
    lastVz = ball.vz;

    let want = x;
    if (m.phase === "rally" && ball.vz > 0) {
      want = ball.x + ball.vx * ((PLAYER_Z - ball.z) / ball.vz) + aim;
    } else if (m.phase === "rally") {
      want = ball.x * 0.3;
    }
    const maxStep = 4 * dt;
    x += clamp(want - x, -maxStep, maxStep);
    return { x, serve: m.phase === "serve" };
  };
}
