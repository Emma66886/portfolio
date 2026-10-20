/**
 * Ludo as pure rules, no rendering. Positions are counted per token as
 * progress from its own start square, which keeps the rules free of board
 * geometry: lib/games/ludo/board.ts turns progress into squares on the grid.
 *
 * Classic rules, one die:
 *  - A six brings a token out of the yard, and every six rolls again.
 *    Three sixes in a row forfeits the turn.
 *  - Landing on another colour's token sends it home to its yard, unless the
 *    square is safe (each start square and the four stars). A capture, or a
 *    token reaching home, also earns another roll.
 *  - Home takes an exact roll. First player with all four tokens home wins.
 */
import { random, type Seeded } from "@/lib/games/rng";
import type { Level, Rules } from "@/lib/games/table";

export const COLORS = [
  { key: "red", name: "Red" },
  { key: "green", name: "Green" },
  { key: "yellow", name: "Yellow" },
  { key: "blue", name: "Blue" },
] as const;

/** Squares on the shared loop. */
export const TRACK = 52;
/** A token waiting in its yard. */
export const YARD = -1;
/** The last square on the shared loop before a token turns up its home column. */
export const LAST_LOOP = 50;
/** Progress at home: 51 loop squares, five home-column squares, then home. */
export const HOME = 56;
export const TOKENS = 4;
export const PLAYER_COUNTS = [2, 3, 4] as const;

/** Square on the shared loop for a colour's progress. Colours start 13 squares apart. */
export const loopSquare = (color: number, progress: number) => (color * 13 + progress) % TRACK;
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const isSafe = (square: number) => SAFE.has(square);

/**
 * Seat to colour. Seat 0 gets the colour it asked for and the rest follow
 * round the board; two players sit opposite each other.
 */
export const seatColors = (players: number, first = 0) =>
  (players === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, players)).map((c) => (c + first) % 4);

/** `color`: the colour seat 0 plays, as an index into COLORS. */
export type LudoConfig = { players: number; color: number };

export type LudoState = Seeded & {
  /** Seat to colour index. */
  colors: number[];
  /** Per seat, each token's progress: YARD, 0 to 55 on the board, or HOME. */
  tokens: number[][];
  turn: number;
  phase: "roll" | "move" | "over";
  roll: number | null;
  /** Sixes rolled in a row this turn. */
  sixes: number;
  winner: number | null;
  turns: number;
  stats: { rolls: number; sixes: number; captures: number; lost: number }[];
};

export type LudoAction = { type: "roll" } | { type: "move"; token: number };

export type LudoEvent =
  | { type: "roll"; seat: number; value: number }
  | { type: "move"; seat: number; token: number; from: number; to: number }
  | { type: "capture"; seat: number; victim: number; token: number; from: number }
  | { type: "home"; seat: number; token: number }
  | { type: "bonus"; seat: number; why: "six" | "capture" | "home" }
  /** Rolled, but no token can move. */
  | { type: "stuck"; seat: number }
  /** A third six in a row. */
  | { type: "forfeit"; seat: number }
  | { type: "turn"; seat: number }
  | { type: "over"; winner: number };

export type LudoView = {
  you: number;
  colors: number[];
  tokens: number[][];
  turn: number;
  phase: LudoState["phase"];
  roll: number | null;
  /** Tokens the player on turn can move with this roll. */
  legal: number[];
  winner: number | null;
};

export function createLudo({ players, color }: LudoConfig, seed: number, first = 0) {
  const state: LudoState = {
    seed,
    colors: seatColors(players, color),
    tokens: Array.from({ length: players }, () => Array(TOKENS).fill(YARD)),
    turn: first % players,
    phase: "roll",
    roll: null,
    sixes: 0,
    winner: null,
    turns: 0,
    stats: Array.from({ length: players }, () => ({ rolls: 0, sixes: 0, captures: 0, lost: 0 })),
  };
  return { state, events: [{ type: "turn", seat: state.turn }] as LudoEvent[] };
}

/** Where a token would land with this roll, or null if it can't move. */
export function target(progress: number, roll: number) {
  if (progress === HOME) return null;
  if (progress === YARD) return roll === 6 ? 0 : null;
  return progress + roll <= HOME ? progress + roll : null;
}

export function legalTokens(s: Pick<LudoState, "tokens" | "turn" | "phase" | "roll">) {
  if (s.phase !== "move" || s.roll === null) return [];
  const roll = s.roll;
  return s.tokens[s.turn].flatMap((p, i) => (target(p, roll) === null ? [] : [i]));
}

function endTurn(s: LudoState, events: LudoEvent[]) {
  s.turn = (s.turn + 1) % s.tokens.length;
  s.phase = "roll";
  s.roll = null;
  s.sixes = 0;
  s.turns++;
  events.push({ type: "turn", seat: s.turn });
}

function rollAgain(s: LudoState, why: "six" | "capture" | "home", events: LudoEvent[]) {
  s.phase = "roll";
  s.roll = null;
  events.push({ type: "bonus", seat: s.turn, why });
}

export function applyLudo(s: LudoState, seat: number, action: LudoAction): LudoEvent[] | null {
  if (s.winner !== null || seat !== s.turn) return null;
  const events: LudoEvent[] = [];

  if (action.type === "roll") {
    if (s.phase !== "roll") return null;
    const value = 1 + Math.floor(random(s) * 6);
    s.stats[seat].rolls++;
    s.sixes = value === 6 ? s.sixes + 1 : 0;
    if (value === 6) s.stats[seat].sixes++;
    s.roll = value;
    events.push({ type: "roll", seat, value });
    if (s.sixes === 3) {
      events.push({ type: "forfeit", seat });
      endTurn(s, events);
      return events;
    }
    s.phase = "move";
    if (!legalTokens(s).length) {
      events.push({ type: "stuck", seat });
      if (value === 6) rollAgain(s, "six", events);
      else endTurn(s, events);
    }
    return events;
  }

  if (s.phase !== "move" || !legalTokens(s).includes(action.token)) return null;
  const roll = s.roll!;
  const from = s.tokens[seat][action.token];
  const to = target(from, roll)!;
  s.tokens[seat][action.token] = to;
  events.push({ type: "move", seat, token: action.token, from, to });

  let captured = false;
  if (to <= LAST_LOOP) {
    const square = loopSquare(s.colors[seat], to);
    if (!isSafe(square)) {
      s.tokens.forEach((tokens, other) => {
        if (other === seat) return;
        tokens.forEach((p, token) => {
          if (p < 0 || p > LAST_LOOP || loopSquare(s.colors[other], p) !== square) return;
          tokens[token] = YARD;
          captured = true;
          s.stats[seat].captures++;
          s.stats[other].lost++;
          events.push({ type: "capture", seat, victim: other, token, from: p });
        });
      });
    }
  }

  if (to === HOME) {
    events.push({ type: "home", seat, token: action.token });
    if (s.tokens[seat].every((p) => p === HOME)) {
      s.winner = seat;
      s.phase = "over";
      s.roll = null;
      events.push({ type: "over", winner: seat });
      return events;
    }
  }

  if (roll === 6) rollAgain(s, "six", events);
  else if (captured) rollAgain(s, "capture", events);
  else if (to === HOME) rollAgain(s, "home", events);
  else endTurn(s, events);
  return events;
}

export function viewLudo(s: LudoState, seat: number): LudoView {
  return {
    you: seat,
    colors: [...s.colors],
    tokens: s.tokens.map((t) => [...t]),
    turn: s.turn,
    phase: s.phase,
    roll: s.roll,
    legal: legalTokens(s),
    winner: s.winner,
  };
}

/** When every legal move ends in the same place (say, any token out of the yard), there's nothing to choose. */
export function forcedLudo(s: LudoState): LudoAction | null {
  if (s.winner !== null || s.phase !== "move") return null;
  const legal = legalTokens(s);
  const starts = new Set(legal.map((t) => s.tokens[s.turn][t]));
  return starts.size === 1 ? { type: "move", token: legal[0] } : null;
}

export const PACE = {
  roll: 850,
  step: 150,
  leaveYard: 420,
  capture: 650,
  home: 380,
  stuck: 650,
  forfeit: 900,
};

export function paceLudo(events: LudoEvent[]) {
  let ms = 0;
  for (const e of events) {
    if (e.type === "roll") ms += PACE.roll;
    else if (e.type === "move") ms += e.from === YARD ? PACE.leaveYard : (e.to - e.from) * PACE.step + 120;
    else if (e.type === "capture") ms += PACE.capture;
    else if (e.type === "home") ms += PACE.home;
    else if (e.type === "stuck") ms += PACE.stuck;
    else if (e.type === "forfeit") ms += PACE.forfeit;
  }
  return ms;
}

// ---- CPU ----

/** Chances (out of 6 per token) that another colour's token could land on this loop square next turn. */
function threat(s: LudoState, seat: number, square: number) {
  if (isSafe(square)) return 0;
  let n = 0;
  s.tokens.forEach((tokens, other) => {
    if (other === seat) return;
    for (const p of tokens) {
      if (p < 0 || p > LAST_LOOP) continue;
      const gap = (square - loopSquare(s.colors[other], p) + TRACK) % TRACK;
      if (gap >= 1 && gap <= 6 && p + gap <= LAST_LOOP) n++;
    }
  });
  return n;
}

export function cpuLudo(s: LudoState, seat: number, level: Level): LudoAction {
  if (s.phase === "roll") return { type: "roll" };
  const legal = legalTokens(s);
  if (level === "easy" && Math.random() < 0.6) return { type: "move", token: legal[Math.floor(Math.random() * legal.length)] };

  const color = s.colors[seat];
  const roll = s.roll!;
  let best = legal[0];
  let bestScore = -Infinity;
  for (const token of legal) {
    const from = s.tokens[seat][token];
    const to = target(from, roll)!;
    let score = (to - Math.max(from, 0)) * 0.6 + Math.max(from, 0) * 0.04;
    if (from === YARD) score += 38;
    if (to === HOME) score += 45;
    else if (to > LAST_LOOP && from <= LAST_LOOP) score += 22;
    if (to <= LAST_LOOP) {
      const square = loopSquare(color, to);
      const victims = s.tokens.reduce(
        (sum, tokens, other) =>
          other === seat || isSafe(square)
            ? sum
            : sum + tokens.filter((p) => p >= 0 && p <= LAST_LOOP && loopSquare(s.colors[other], p) === square).reduce((v, p) => v + 55 + p * 0.6, 0),
        0
      );
      score += victims;
      if (isSafe(square)) score += 10;
      score -= threat(s, seat, square) * (level === "hard" ? 16 : 7) * (1 + to / 60);
    }
    if (from >= 0 && from <= LAST_LOOP) score += threat(s, seat, loopSquare(color, from)) * (level === "hard" ? 14 : 5) * (1 + from / 60);
    score += Math.random() * (level === "hard" ? 0.5 : 3);
    if (score > bestScore) {
      bestScore = score;
      best = token;
    }
  }
  return { type: "move", token: best };
}

export function parseLudoAction(raw: unknown): LudoAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (a.type === "roll") return { type: "roll" };
  if (a.type === "move" && Number.isInteger(a.token) && (a.token as number) >= 0 && (a.token as number) < TOKENS) {
    return { type: "move", token: a.token as number };
  }
  return null;
}

export const ludoRules: Rules<LudoState, LudoAction, LudoView, LudoEvent> = {
  apply: applyLudo,
  view: viewLudo,
  redact: (e) => e,
  turn: (s) => (s.winner === null ? s.turn : null),
  cpu: cpuLudo,
  forced: forcedLudo,
  pace: paceLudo,
  parse: parseLudoAction,
};
