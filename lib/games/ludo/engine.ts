/**
 * Ludo as pure rules, no rendering. Positions are counted per token as
 * progress from its own house's start square, which keeps the rules free of
 * board geometry: lib/games/ludo/board.ts turns progress into squares.
 *
 * Naija rules, two dice:
 *  - Each turn rolls two dice. Each die is played on its own, on any of your
 *    tokens (both on the same token is fine). A die showing six can bring a
 *    token out of the house onto its start square.
 *  - Land on another player's token and it goes back to its house, and your
 *    token goes home: it counts as finished. Start squares and stars are safe.
 *  - Getting home takes the exact number. A die nothing can use is lost.
 *  - Double six rolls again, once both sixes are played.
 *  - One against one, each player plays the two houses on their side of the
 *    board, eight tokens. With three or four players it's one house each.
 *    First to bring every token home wins.
 */
import { random, type Seeded } from "@/lib/games/rng";
import type { Level, Rules } from "@/lib/games/table";

/** Houses, clockwise from the top left of the board. */
export const COLORS = [
  { key: "red", name: "Red" },
  { key: "green", name: "Green" },
  { key: "yellow", name: "Yellow" },
  { key: "blue", name: "Blue" },
] as const;

/** Squares on the shared loop. */
export const TRACK = 52;
/** A token waiting in its house. */
export const YARD = -1;
/** The last square on the shared loop before a token turns up its home column. */
export const LAST_LOOP = 50;
/** Progress at home: 51 loop squares, five home-column squares, then home. */
export const HOME = 56;
export const TOKENS = 4;
export const PLAYER_COUNTS = [2, 3, 4] as const;

/** Square on the shared loop for a house's progress. Houses start 13 squares apart. */
export const loopSquare = (color: number, progress: number) => (color * 13 + progress) % TRACK;
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const isSafe = (square: number) => SAFE.has(square);

/**
 * The houses each seat plays. Seat 0 gets the house it asked for. One against
 * one, each player also takes the house beside theirs, so each side of the
 * board belongs to one player; otherwise it's a house each, going round.
 * A seat's houses are listed left to right as that player sees them, since
 * the board turns to put a player's first house at their bottom left.
 */
export function seatHouses(players: number, first = 0): number[][] {
  const house = (k: number) => (first + k) % 4;
  if (players === 2) return [[house(0), house(3)], [house(2), house(1)]];
  return Array.from({ length: players }, (_, i) => [house(i)]);
}

export const houseNames = (houses: number[]) => houses.map((c) => COLORS[c].name).join(" & ");

/** `color`: the house seat 0 plays, as an index into COLORS. */
export type LudoConfig = { players: number; color: number };

export type LudoState = Seeded & {
  /** Seat to the houses (colour indexes) it plays. */
  houses: number[][];
  /** House to each of its four tokens' progress: YARD, 0 to 55 on the board, or HOME. Houses nobody plays stay put. */
  tokens: number[][];
  turn: number;
  phase: "roll" | "move" | "over";
  /** The last roll, kept on show. */
  dice: [number, number] | null;
  /** Dice values from this roll still to be played. */
  left: number[];
  /** A double six: roll again once both are played. */
  again: boolean;
  winner: number | null;
  turns: number;
  stats: { rolls: number; sixes: number; captures: number; lost: number }[];
};

export type LudoMove = { color: number; token: number; die: number; from: number; to: number };

export type LudoAction = { type: "roll" } | { type: "move"; color: number; token: number; die: number };

export type LudoEvent =
  | { type: "roll"; seat: number; dice: [number, number] }
  | { type: "move"; seat: number; color: number; token: number; die: number; from: number; to: number }
  /** `color`/`token` is the token sent back to its house. */
  | { type: "capture"; seat: number; color: number; token: number; from: number }
  /** A token home, by running the course or by capturing. */
  | { type: "home"; seat: number; color: number; token: number; by: "run" | "capture" }
  /** Dice values nothing could use. */
  | { type: "lost"; seat: number; values: number[] }
  | { type: "again"; seat: number }
  | { type: "turn"; seat: number }
  | { type: "over"; winner: number };

export type LudoView = {
  you: number;
  houses: number[][];
  tokens: number[][];
  turn: number;
  phase: LudoState["phase"];
  dice: [number, number] | null;
  left: number[];
  again: boolean;
  /** Every move the player on turn can make with the dice left. */
  legal: LudoMove[];
  winner: number | null;
};

export const ownerOf = (s: Pick<LudoState, "houses">, color: number) => s.houses.findIndex((h) => h.includes(color));

export function createLudo({ players, color }: LudoConfig, seed: number, first = 0) {
  const state: LudoState = {
    seed,
    houses: seatHouses(players, color),
    tokens: Array.from({ length: 4 }, () => Array(TOKENS).fill(YARD)),
    turn: first % players,
    phase: "roll",
    dice: null,
    left: [],
    again: false,
    winner: null,
    turns: 0,
    stats: Array.from({ length: players }, () => ({ rolls: 0, sixes: 0, captures: 0, lost: 0 })),
  };
  return { state, events: [{ type: "turn", seat: state.turn }] as LudoEvent[] };
}

/** Where a token would land with one die, or null if it can't move. */
export function target(progress: number, die: number) {
  if (progress === HOME) return null;
  if (progress === YARD) return die === 6 ? 0 : null;
  return progress + die <= HOME ? progress + die : null;
}

export function legalMoves(s: Pick<LudoState, "houses" | "tokens" | "turn" | "phase" | "left">): LudoMove[] {
  if (s.phase !== "move") return [];
  const moves: LudoMove[] = [];
  for (const die of new Set(s.left)) {
    for (const color of s.houses[s.turn]) {
      s.tokens[color].forEach((from, token) => {
        const to = target(from, die);
        if (to !== null) moves.push({ color, token, die, from, to });
      });
    }
  }
  return moves;
}

function endTurn(s: LudoState, events: LudoEvent[]) {
  s.left = [];
  s.phase = "roll";
  if (s.again) {
    s.again = false;
    events.push({ type: "again", seat: s.turn });
    return;
  }
  s.turn = (s.turn + 1) % s.houses.length;
  s.turns++;
  events.push({ type: "turn", seat: s.turn });
}

/** Ends the turn when no die left can be used. */
function settle(s: LudoState, events: LudoEvent[]) {
  if (s.left.length && legalMoves(s).length) return;
  if (s.left.length) events.push({ type: "lost", seat: s.turn, values: [...s.left] });
  endTurn(s, events);
}

export function applyLudo(s: LudoState, seat: number, action: LudoAction): LudoEvent[] | null {
  if (s.winner !== null || seat !== s.turn) return null;
  const events: LudoEvent[] = [];

  if (action.type === "roll") {
    if (s.phase !== "roll") return null;
    const dice: [number, number] = [1 + Math.floor(random(s) * 6), 1 + Math.floor(random(s) * 6)];
    s.stats[seat].rolls++;
    s.stats[seat].sixes += dice.filter((d) => d === 6).length;
    s.dice = dice;
    s.left = [...dice];
    s.again = dice[0] === 6 && dice[1] === 6;
    s.phase = "move";
    events.push({ type: "roll", seat, dice });
    settle(s, events);
    return events;
  }

  const move = legalMoves(s).find((m) => m.color === action.color && m.token === action.token && m.die === action.die);
  if (!move) return null;
  s.tokens[move.color][move.token] = move.to;
  s.left.splice(s.left.indexOf(move.die), 1);
  events.push({ type: "move", seat, ...move });

  let captured = false;
  if (move.to <= LAST_LOOP) {
    const square = loopSquare(move.color, move.to);
    if (!isSafe(square)) {
      s.tokens.forEach((tokens, color) => {
        const owner = ownerOf(s, color);
        if (owner < 0 || owner === seat) return;
        tokens.forEach((p, token) => {
          if (p < 0 || p > LAST_LOOP || loopSquare(color, p) !== square) return;
          tokens[token] = YARD;
          captured = true;
          s.stats[seat].captures++;
          s.stats[owner].lost++;
          events.push({ type: "capture", seat, color, token, from: p });
        });
      });
    }
  }
  if (captured) {
    s.tokens[move.color][move.token] = HOME;
    events.push({ type: "home", seat, color: move.color, token: move.token, by: "capture" });
  } else if (move.to === HOME) {
    events.push({ type: "home", seat, color: move.color, token: move.token, by: "run" });
  }

  if (s.houses[seat].every((c) => s.tokens[c].every((p) => p === HOME))) {
    s.winner = seat;
    s.phase = "over";
    s.left = [];
    events.push({ type: "over", winner: seat });
    return events;
  }
  settle(s, events);
  return events;
}

export function viewLudo(s: LudoState, seat: number): LudoView {
  return {
    you: seat,
    houses: s.houses.map((h) => [...h]),
    tokens: s.tokens.map((t) => [...t]),
    turn: s.turn,
    phase: s.phase,
    dice: s.dice && [...s.dice],
    left: [...s.left],
    again: s.again,
    legal: legalMoves(s),
    winner: s.winner,
  };
}

/** Moves that end the same way, like any of several tokens out of one house, count as one. */
export const moveKey = (m: Pick<LudoMove, "color" | "from" | "die">) => `${m.die}:${m.color}:${m.from}`;

/** When there's only one real choice (say, a six to come out and nothing else), it's played for you. */
export function forcedLudo(s: Pick<LudoState, "houses" | "tokens" | "turn" | "phase" | "left" | "winner">): LudoAction | null {
  if (s.winner !== null || s.phase !== "move") return null;
  const moves = legalMoves(s);
  if (!moves.length || new Set(moves.map(moveKey)).size > 1) return null;
  const { color, token, die } = moves[0];
  return { type: "move", color, token, die };
}

export const PACE = {
  roll: 900,
  step: 140,
  leaveHouse: 420,
  capture: 650,
  home: 420,
  lost: 600,
};

export function paceLudo(events: LudoEvent[]) {
  let ms = 0;
  for (const e of events) {
    if (e.type === "roll") ms += PACE.roll;
    else if (e.type === "move") ms += e.from === YARD ? PACE.leaveHouse : (e.to - e.from) * PACE.step + 120;
    else if (e.type === "capture") ms += PACE.capture;
    else if (e.type === "home") ms += e.by === "capture" ? PACE.home + 200 : PACE.home;
    else if (e.type === "lost") ms += PACE.lost;
  }
  return ms;
}

// ---- CPU ----

/** How likely, roughly, another player could land on this loop square next roll. Two dice reach up to 12. */
function threat(s: LudoState, seat: number, square: number) {
  if (isSafe(square)) return 0;
  let risk = 0;
  s.tokens.forEach((tokens, color) => {
    const owner = ownerOf(s, color);
    if (owner < 0 || owner === seat) return;
    for (const p of tokens) {
      if (p < 0 || p > LAST_LOOP) continue;
      const gap = (square - loopSquare(color, p) + TRACK) % TRACK;
      if (gap >= 1 && gap <= 12 && p + gap <= LAST_LOOP) risk += gap <= 6 ? 1 : 0.35;
    }
  });
  return risk;
}

/** How good a position is for a seat: its tokens' progress and safety, less everyone else's progress. */
function evaluate(s: LudoState, seat: number, level: Level) {
  if (s.winner === seat) return 1e6;
  const caution = level === "hard" ? 9 : 4;
  let score = 0;
  s.tokens.forEach((tokens, color) => {
    const owner = ownerOf(s, color);
    if (owner < 0) return;
    for (const p of tokens) {
      let value = p === YARD ? 0 : p === HOME ? 80 : 12 + p + (p > LAST_LOOP ? 14 : 0);
      if (owner === seat) {
        if (p >= 0 && p <= LAST_LOOP) value -= threat(s, seat, loopSquare(color, p)) * caution * (1 + p / 40);
        score += value;
      } else score -= value * 0.55;
    }
  });
  return score;
}

/** The same measure without the danger reckoning: cheap enough to judge every reply an opponent could make. */
function progressValue(s: LudoState, seat: number) {
  if (s.winner === seat) return 1e6;
  let score = 0;
  s.tokens.forEach((tokens, color) => {
    const owner = ownerOf(s, color);
    if (owner < 0) return;
    for (const p of tokens) {
      const value = p === YARD ? 0 : p === HOME ? 80 : 12 + p + (p > LAST_LOOP ? 14 : 0);
      score += owner === seat ? value : -value * 0.55;
    }
  });
  return score;
}

const copyState = (s: LudoState): LudoState => ({
  ...s,
  houses: s.houses.map((h) => [...h]),
  tokens: s.tokens.map((t) => [...t]),
  left: [...s.left],
  stats: s.stats.map((x) => ({ ...x })),
});

const asAction = (m: LudoMove): LudoAction => ({ type: "move", color: m.color, token: m.token, die: m.die });

/** Plays out the rest of a roll for `seat` every possible way, and keeps the finish `judge` likes best. */
function bestFinish(s: LudoState, seat: number, judge: (end: LudoState) => number): { end: LudoState; score: number } {
  if (s.turn !== seat || s.phase !== "move") return { end: s, score: judge(s) };
  let best = { end: s, score: -Infinity };
  for (const m of legalMoves(s)) {
    const next = copyState(s);
    applyLudo(next, seat, asAction(m));
    const finish = bestFinish(next, seat, judge);
    if (finish.score > best.score) best = finish;
  }
  return best;
}

/** The 21 different rolls of two dice, with how often each comes up out of 36. */
const ROLLS: [number, number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

/**
 * How a position holds up over the next player's roll: for each roll they
 * could get, they make what looks best to them, and this averages how that
 * leaves us.
 */
function afterReply(s: LudoState, seat: number) {
  if (s.winner !== null || s.turn === seat) return evaluate(s, seat, "hard");
  const them = s.turn;
  let total = 0;
  for (const [a, b, weight] of ROLLS) {
    const rolled = copyState(s);
    Object.assign(rolled, { phase: "move", dice: [a, b], left: [a, b], again: false });
    const { end } = bestFinish(rolled, them, (e) => progressValue(e, them));
    total += evaluate(end, seat, "hard") * weight;
  }
  return total / 36;
}

/**
 * The CPU plans both dice together, trying every way to play the roll. Hard
 * also looks at its best few plans from the next player's side.
 */
export function cpuLudo(s: LudoState, seat: number, level: Level): LudoAction {
  if (s.phase === "roll") return { type: "roll" };
  const moves = legalMoves(s);
  if (level === "easy" && Math.random() < 0.55) return asAction(moves[Math.floor(Math.random() * moves.length)]);

  const plans = moves.map((first) => {
    const after = copyState(s);
    applyLudo(after, seat, asAction(first));
    const { end, score } = bestFinish(after, seat, (e) => evaluate(e, seat, level));
    return { first, end, score: score + Math.random() * (level === "hard" ? 0.5 : 4) };
  });
  plans.sort((a, b) => b.score - a.score);
  if (level !== "hard" || plans.length < 2) return asAction(plans[0].first);
  // Best first, so if a slow device runs out of time the plans already weighed are the likeliest.
  const started = Date.now();
  const weighed: { first: LudoMove; score: number }[] = [];
  for (const plan of plans.slice(0, 5)) {
    if (weighed.length >= 2 && Date.now() - started > 40) break;
    weighed.push({ first: plan.first, score: afterReply(plan.end, seat) });
  }
  return asAction(weighed.reduce((a, b) => (b.score > a.score ? b : a)).first);
}

export function parseLudoAction(raw: unknown): LudoAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (a.type === "roll") return { type: "roll" };
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (a.type === "move" && int(a.color, 0, 3) && int(a.token, 0, TOKENS - 1) && int(a.die, 1, 6)) {
    return { type: "move", color: a.color as number, token: a.token as number, die: a.die as number };
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
