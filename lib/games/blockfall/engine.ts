/**
 * Blockfall rules, with no rendering in here: the three.js scene reads this
 * state each frame and draws it.
 *
 * The board is 10 wide and 24 tall: 20 visible rows plus 4 above them where
 * pieces spawn. y counts up from the floor, matching the 3D scene. Rotation,
 * wall kicks, the 7-piece bag, lock delay and scoring follow the modern
 * guideline that most players already have in their fingers.
 */

export const COLS = 10;
export const ROWS = 24;
export const VISIBLE = 20;
export const NEXT_SHOWN = 3;

export type PieceType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export const PIECES: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];

/** Seconds before a held direction starts repeating, then between repeats. */
const DAS = 0.15;
const ARR = 0.035;
const SOFT_DROP_INTERVAL = 0.03;
const LOCK_DELAY = 0.5;
/** Moves or turns on the ground that restart the lock delay, per row reached. */
const MAX_LOCK_RESETS = 15;
/** Pause while cleared rows play out before the stack drops. */
export const CLEAR_DELAY = 0.32;

/** Spawn orientation, drawn top row first. */
const SHAPES: Record<PieceType, string[]> = {
  I: ["....", "####", "....", "...."],
  J: ["#..", "###", "..."],
  L: ["..#", "###", "..."],
  O: ["##", "##"],
  S: [".##", "##.", "..."],
  T: [".#.", "###", "..."],
  Z: ["##.", ".##", "..."],
};

/** [column, row down from the top of the piece's box] for each rotation state. */
const STATES: Record<PieceType, [number, number][][]> = Object.fromEntries(
  PIECES.map((type) => {
    const states: string[][] = [SHAPES[type]];
    for (let i = 1; i < 4; i++) {
      const prev = states[i - 1];
      const n = prev.length;
      // Clockwise turn about the centre of the box, which is exactly how the
      // standard rotation system defines each state.
      states.push(prev.map((_, r) => prev.map((__, c) => prev[n - 1 - c][r]).join("")));
    }
    return [
      type,
      states.map((grid) => grid.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === "#" ? [[c, r]] : [])))),
    ];
  })
) as Record<PieceType, [number, number][][]>;

/** Offsets tried in order when a turn is blocked, keyed "from-to", with +y up. */
const KICKS: Record<string, [number, number][]> = {
  "01": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "10": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "12": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "21": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "23": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "32": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "30": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "03": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, [number, number][]> = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "10": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "21": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "32": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "30": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "03": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const LINE_POINTS = [0, 100, 300, 500, 800];
const TSPIN_POINTS = [400, 800, 1200, 1600];
const MINI_POINTS = [100, 200, 400];

export type Piece = { type: PieceType; rot: number; x: number; y: number };
export type Spin = "full" | "mini" | null;
export type Action = "left" | "right" | "down" | "rotateCW" | "rotateCCW" | "hardDrop" | "hold";
/** Keys or gestures currently held down. */
export type Held = { left: boolean; right: boolean; down: boolean };

export type GameEvent =
  | { type: "spawn" }
  | { type: "move" }
  | { type: "rotate"; dir: 1 | -1 }
  | { type: "hold" }
  | { type: "hardDrop"; cells: [number, number][]; distance: number }
  | { type: "lock"; cells: [number, number][] }
  | { type: "clear"; rows: number[]; lines: number; spin: Spin; b2b: boolean; combo: number; points: number }
  | { type: "spinNoLines"; spin: Exclude<Spin, null>; points: number }
  | { type: "collapse"; rows: number[] }
  | { type: "level"; level: number }
  | { type: "over" };

export type Game = {
  /** 0 is empty, otherwise the index into PIECES plus one. */
  board: Uint8Array;
  /** Bumped whenever settled blocks change, so the scene knows to rebuild. */
  boardVersion: number;
  piece: Piece | null;
  hold: PieceType | null;
  canHold: boolean;
  queue: PieceType[];
  bag: PieceType[];
  phase: "playing" | "clearing" | "over";
  clearing: number[];
  timer: number;
  startLevel: number;
  level: number;
  score: number;
  lines: number;
  pieces: number;
  quads: number;
  tSpins: number;
  /** Consecutive clearing locks minus one; -1 when the last lock cleared nothing. */
  combo: number;
  maxCombo: number;
  /** The last line clear was a quad or a T-spin, so the next one earns a bonus. */
  b2b: boolean;
  /** Seconds of play, not counting pauses. */
  time: number;
  gravityClock: number;
  lockClock: number;
  lockResets: number;
  lowestY: number;
  lastAction: "rotate" | "move" | "drop" | null;
  lastKick: number;
  input: { left: boolean; right: boolean; dir: -1 | 0 | 1; das: number; repeats: number };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Seconds per row of fall at a level. Reaches 20 rows a frame by level 20. */
export const gravityInterval = (level: number) => {
  const l = clamp(level, 1, 20);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
};

export const pieceIndex = (type: PieceType) => PIECES.indexOf(type) + 1;

/** Board cells a piece covers, as [x, y]. */
export function cellsOf(p: Piece): [number, number][] {
  return STATES[p.type][p.rot].map(([c, r]) => [p.x + c, p.y - r]);
}

/** A piece's cells in its spawn orientation, centred on the origin, for previews. */
export function previewCells(type: PieceType): [number, number][] {
  const cells = STATES[type][0].map(([c, r]): [number, number] => [c, -r]);
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return cells.map(([x, y]) => [x - cx, y - cy]);
}

/** The point a piece turns about, in board coordinates, for animating rotation. */
export function pivotOf(p: Piece): [number, number] {
  const n = SHAPES[p.type].length;
  return [p.x + (n - 1) / 2, p.y - (n - 1) / 2];
}

function collides(g: Game, p: Piece) {
  for (const [x, y] of cellsOf(p)) {
    if (x < 0 || x >= COLS || y < 0) return true;
    if (y < ROWS && g.board[y * COLS + x]) return true;
  }
  return false;
}

/** Rows the current piece would fall if hard-dropped now. */
export function dropDistance(g: Game) {
  if (!g.piece) return 0;
  let d = 0;
  while (!collides(g, { ...g.piece, y: g.piece.y - d - 1 })) d++;
  return d;
}

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function refill(g: Game) {
  while (g.queue.length < 7) {
    if (!g.bag.length) g.bag = shuffle([...PIECES]);
    g.queue.push(g.bag.pop()!);
  }
}

function takeNext(g: Game) {
  const type = g.queue.shift()!;
  refill(g);
  return type;
}

export function createGame(startLevel = 1): Game {
  const g: Game = {
    board: new Uint8Array(ROWS * COLS),
    boardVersion: 0,
    piece: null,
    hold: null,
    canHold: true,
    queue: [],
    bag: [],
    phase: "playing",
    clearing: [],
    timer: 0,
    startLevel,
    level: startLevel,
    score: 0,
    lines: 0,
    pieces: 0,
    quads: 0,
    tSpins: 0,
    combo: -1,
    maxCombo: 0,
    b2b: false,
    time: 0,
    gravityClock: 0,
    lockClock: 0,
    lockResets: 0,
    lowestY: ROWS,
    lastAction: null,
    lastKick: 0,
    input: { left: false, right: false, dir: 0, das: 0, repeats: 0 },
  };
  refill(g);
  spawn(g, takeNext(g), []);
  return g;
}

function spawn(g: Game, type: PieceType, events: GameEvent[]) {
  const piece: Piece = { type, rot: 0, x: type === "O" ? 4 : 3, y: 21 };
  if (collides(g, piece)) {
    g.piece = null;
    g.phase = "over";
    events.push({ type: "over" });
    return;
  }
  // Drop straight into the top visible row when there is room.
  if (!collides(g, { ...piece, y: 20 })) piece.y = 20;
  g.piece = piece;
  g.gravityClock = 0;
  g.lockClock = 0;
  g.lockResets = 0;
  g.lowestY = piece.y;
  g.lastAction = null;
  events.push({ type: "spawn" });
}

function grounded(g: Game) {
  return !!g.piece && collides(g, { ...g.piece, y: g.piece.y - 1 });
}

/** After any successful move or turn: restart the lock delay, within limits. */
function moved(g: Game) {
  const p = g.piece!;
  if (p.y < g.lowestY) {
    g.lowestY = p.y;
    g.lockResets = 0;
  }
  if (g.lockClock > 0 && g.lockResets < MAX_LOCK_RESETS) {
    g.lockClock = 0;
    g.lockResets++;
  }
}

function shift(g: Game, dx: number, events: GameEvent[]) {
  const p = g.piece;
  if (!p) return false;
  const next = { ...p, x: p.x + dx };
  if (collides(g, next)) return false;
  g.piece = next;
  g.lastAction = "move";
  moved(g);
  events.push({ type: "move" });
  return true;
}

function fall(g: Game) {
  const p = g.piece;
  if (!p) return false;
  const next = { ...p, y: p.y - 1 };
  if (collides(g, next)) return false;
  g.piece = next;
  g.lastAction = "drop";
  moved(g);
  return true;
}

function rotate(g: Game, dir: 1 | -1, events: GameEvent[]) {
  const p = g.piece;
  if (!p || p.type === "O") return false;
  const to = (p.rot + dir + 4) % 4;
  const kicks = (p.type === "I" ? KICKS_I : KICKS)[`${p.rot}${to}`];
  for (let i = 0; i < kicks.length; i++) {
    const test = { ...p, rot: to, x: p.x + kicks[i][0], y: p.y + kicks[i][1] };
    if (!collides(g, test)) {
      g.piece = test;
      g.lastAction = "rotate";
      g.lastKick = i;
      moved(g);
      events.push({ type: "rotate", dir });
      return true;
    }
  }
  return false;
}

/**
 * Three-corner rule: a T that turned into place with three of the four
 * squares diagonal to its centre filled. It's a full T-spin when both corners
 * it points toward are filled, or it got there with the last-resort kick.
 */
function detectSpin(g: Game, p: Piece): Spin {
  if (p.type !== "T" || g.lastAction !== "rotate") return null;
  const cx = p.x + 1;
  const cy = p.y - 1;
  const filled = ([dx, dy]: number[]) => {
    const x = cx + dx;
    const y = cy + dy;
    return x < 0 || x >= COLS || y < 0 || (y < ROWS && g.board[y * COLS + x] !== 0);
  };
  // Top-left, top-right, bottom-right, bottom-left.
  const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(filled);
  if (corners.filter(Boolean).length < 3) return null;
  const [a, b] = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
  return (corners[a] && corners[b]) || g.lastKick === 4 ? "full" : "mini";
}

function lock(g: Game, events: GameEvent[]) {
  const p = g.piece!;
  const spin = detectSpin(g, p);
  const cells = cellsOf(p);
  for (const [x, y] of cells) g.board[y * COLS + x] = pieceIndex(p.type);
  g.boardVersion++;
  g.piece = null;
  g.pieces++;
  events.push({ type: "lock", cells });

  // Locked entirely out of sight: the stack has topped out.
  if (cells.every(([, y]) => y >= VISIBLE)) {
    g.phase = "over";
    events.push({ type: "over" });
    return;
  }

  const rows = [...new Set(cells.map(([, y]) => y))]
    .filter((y) => g.board.subarray(y * COLS, y * COLS + COLS).every(Boolean))
    .sort((a, b) => a - b);
  const lines = rows.length;

  if (!lines) {
    g.combo = -1;
    if (spin) {
      const points = (spin === "full" ? TSPIN_POINTS[0] : MINI_POINTS[0]) * g.level;
      g.score += points;
      g.tSpins++;
      events.push({ type: "spinNoLines", spin, points });
    }
    spawnNext(g, events);
    return;
  }

  const base = spin === "full" ? TSPIN_POINTS[lines] : spin === "mini" ? MINI_POINTS[lines] ?? 0 : LINE_POINTS[lines];
  const difficult = lines === 4 || spin !== null;
  const b2b = difficult && g.b2b;
  g.b2b = difficult;
  g.combo++;
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  const points = Math.round(base * g.level * (b2b ? 1.5 : 1)) + 50 * g.combo * g.level;
  g.score += points;
  g.lines += lines;
  if (lines === 4) g.quads++;
  if (spin) g.tSpins++;
  events.push({ type: "clear", rows, lines, spin, b2b, combo: g.combo, points });

  const level = g.startLevel + Math.floor(g.lines / 10);
  if (level > g.level) {
    g.level = level;
    events.push({ type: "level", level });
  }

  g.phase = "clearing";
  g.clearing = rows;
  g.timer = CLEAR_DELAY;
}

function collapse(g: Game, events: GameEvent[]) {
  const rows = g.clearing;
  let write = 0;
  for (let y = 0; y < ROWS; y++) {
    if (rows.includes(y)) continue;
    if (write !== y) g.board.copyWithin(write * COLS, y * COLS, y * COLS + COLS);
    write++;
  }
  g.board.fill(0, write * COLS);
  g.boardVersion++;
  g.clearing = [];
  events.push({ type: "collapse", rows });
}

function spawnNext(g: Game, events: GameEvent[]) {
  g.canHold = true;
  g.phase = "playing";
  spawn(g, takeNext(g), events);
}

function hold(g: Game, events: GameEvent[]) {
  if (!g.canHold || !g.piece) return;
  const current = g.piece.type;
  const next = g.hold ?? takeNext(g);
  g.hold = current;
  g.canHold = false;
  events.push({ type: "hold" });
  spawn(g, next, events);
}

function hardDrop(g: Game, events: GameEvent[]) {
  const distance = dropDistance(g);
  g.piece!.y -= distance;
  if (distance > 0) g.lastAction = "drop";
  g.score += distance * 2;
  events.push({ type: "hardDrop", cells: cellsOf(g.piece!), distance });
  lock(g, events);
}

/** Tracks held left/right with auto-repeat: one step at once, then a repeat after DAS. */
function autoShift(g: Game, held: Held, dt: number, events: GameEvent[]) {
  const input = g.input;
  let pressed = false;
  if (held.left && !input.left) {
    input.dir = -1;
    pressed = true;
  }
  if (held.right && !input.right) {
    input.dir = 1;
    pressed = true;
  }
  // Letting go of one direction hands over to the other if it's still held.
  if (!held.left && input.dir === -1) {
    input.dir = held.right ? 1 : 0;
    pressed = input.dir !== 0;
  }
  if (!held.right && input.dir === 1) {
    input.dir = held.left ? -1 : 0;
    pressed = input.dir !== 0;
  }
  input.left = held.left;
  input.right = held.right;

  if (!input.dir) return;
  if (pressed) {
    shift(g, input.dir, events);
    input.das = 0;
    input.repeats = 0;
    return;
  }
  input.das += dt;
  if (input.das < DAS) return;
  const due = 1 + Math.floor((input.das - DAS) / ARR);
  while (input.repeats < due) {
    input.repeats++;
    if (!shift(g, input.dir, events)) {
      input.repeats = due;
      break;
    }
  }
}

/** Advances the game by `dt` seconds, applying one-off actions first. */
export function step(g: Game, dt: number, held: Held, actions: Action[]): GameEvent[] {
  const events: GameEvent[] = [];
  if (g.phase === "over") return events;
  g.time += dt;

  if (g.phase === "clearing") {
    // Keep tracking held keys, so a direction held through the pause still repeats after it.
    g.input.left = held.left;
    g.input.right = held.right;
    g.timer -= dt;
    if (g.timer <= 0) {
      collapse(g, events);
      spawnNext(g, events);
    }
    return events;
  }

  for (const action of actions) {
    if (!g.piece) break;
    if (action === "left") shift(g, -1, events);
    else if (action === "right") shift(g, 1, events);
    else if (action === "rotateCW") rotate(g, 1, events);
    else if (action === "rotateCCW") rotate(g, -1, events);
    else if (action === "hold") hold(g, events);
    else if (action === "hardDrop") hardDrop(g, events);
    else if (action === "down" && fall(g)) {
      g.score += 1;
      g.gravityClock = 0;
    }
  }
  if (!g.piece) return events;

  autoShift(g, held, dt, events);

  // Gravity, sped up while soft-dropping, which also scores a point a row.
  const interval = held.down ? Math.min(gravityInterval(g.level), SOFT_DROP_INTERVAL) : gravityInterval(g.level);
  g.gravityClock += dt;
  while (g.gravityClock >= interval) {
    g.gravityClock -= interval;
    if (!fall(g)) {
      g.gravityClock = 0;
      break;
    }
    if (held.down) g.score += 1;
  }

  if (grounded(g)) {
    g.lockClock += dt;
    if (g.lockClock >= LOCK_DELAY || g.lockResets >= MAX_LOCK_RESETS) lock(g, events);
  } else {
    g.lockClock = 0;
  }
  return events;
}

// ---- Autoplay ----

/**
 * Picks where to put the current piece by scoring every rotation and column
 * on the stack it would leave: total height, holes, bumpiness and lines
 * cleared. Weights from Yiyuan Lee's well-known tuning; plenty for a demo.
 */
export function bestPlacement(g: Game): { rot: number; x: number } | null {
  const p = g.piece;
  if (!p) return null;
  let best: { rot: number; x: number } | null = null;
  let bestScore = -Infinity;
  const board = new Uint8Array(g.board.length);
  const rotations = p.type === "O" ? 1 : 4;

  for (let rot = 0; rot < rotations; rot++) {
    for (let x = -2; x < COLS; x++) {
      let test: Piece = { ...p, rot, x, y: 21 };
      if (collides(g, test)) continue;
      while (!collides(g, { ...test, y: test.y - 1 })) test = { ...test, y: test.y - 1 };

      board.set(g.board);
      for (const [cx, cy] of cellsOf(test)) board[cy * COLS + cx] = 1;
      let lines = 0;
      const heights = new Array(COLS).fill(0);
      let holes = 0;
      const full: boolean[] = [];
      for (let y = 0; y < ROWS; y++) {
        full[y] = board.subarray(y * COLS, y * COLS + COLS).every(Boolean);
        if (full[y]) lines++;
      }
      // Measured as if the full rows had already gone.
      for (let cx = 0; cx < COLS; cx++) {
        let row = 0;
        let covered = false;
        for (let y = 0; y < ROWS; y++) {
          if (full[y]) continue;
          row++;
          if (board[y * COLS + cx]) heights[cx] = row;
        }
        for (let y = ROWS - 1; y >= 0; y--) {
          if (full[y]) continue;
          if (board[y * COLS + cx]) covered = true;
          else if (covered) holes++;
        }
      }
      let bump = 0;
      for (let cx = 0; cx < COLS - 1; cx++) bump += Math.abs(heights[cx] - heights[cx + 1]);
      const total = heights.reduce((a, b) => a + b, 0);
      const score = -0.510066 * total + 0.760666 * lines - 0.35663 * holes - 0.184483 * bump;
      if (score > bestScore) {
        bestScore = score;
        best = { rot, x };
      }
    }
  }
  return best;
}

/**
 * Plays the demo game behind the menu: turns, then slides, then drops, one
 * input at a time at a human pace, so it looks like someone playing.
 */
export function createAutoplayer() {
  let plannedFor = -1;
  let target: { rot: number; x: number } | null = null;
  let wait = 0;
  return (g: Game, dt: number): Action[] => {
    if (!g.piece) return [];
    if (plannedFor !== g.pieces) {
      plannedFor = g.pieces;
      target = bestPlacement(g);
      wait = 0.25;
    }
    wait -= dt;
    if (wait > 0 || !target) return [];
    wait = 0.075;
    const p = g.piece;
    if (p.rot !== target.rot) return ["rotateCW"];
    if (p.x < target.x) return ["right"];
    if (p.x > target.x) return ["left"];
    wait = 0.35;
    return ["hardDrop"];
  };
}
