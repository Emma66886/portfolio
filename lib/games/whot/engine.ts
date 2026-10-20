/**
 * Whot, the Nigerian shedding game, as pure rules with no rendering. The
 * whole state is plain data, so the host's browser can save it, and the
 * table (lib/games/table.ts) can send each player only their own view.
 *
 * House rules, as most people in Nigeria play them:
 *  - Follow the top card's shape or number. A Whot (20) goes on anything and
 *    calls the shape the next player has to follow.
 *  - 1 Hold on: play again. 8 Suspension: the next player misses a turn.
 *  - 2 Pick two, 5 Pick three: the next player picks, unless they pass it
 *    on with a card of the same number, which adds to the pick.
 *  - 14 General market: everyone else picks one, and you play again.
 *  - Going to market (drawing) ends your turn. First to empty their hand wins.
 *    If the market and pile both run dry, hands are counted and the lowest wins.
 */
import { shuffle, type Seeded } from "@/lib/games/rng";
import type { Level, Rules } from "@/lib/games/table";

export const SHAPES = ["circle", "triangle", "cross", "square", "star"] as const;
export type Shape = (typeof SHAPES)[number];
export type Suit = Shape | "whot";
export type Card = { id: number; suit: Suit; n: number };

const NUMBERS: Record<Shape, number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
};

/** The 54-card Nigerian deck. A card's id is its index here. */
export const DECK: Card[] = [
  ...SHAPES.flatMap((suit) => NUMBERS[suit].map((n) => ({ suit, n }))),
  ...Array.from({ length: 5 }, () => ({ suit: "whot" as const, n: 20 })),
].map((card, id) => ({ id, ...card }));

export const SHAPE_NAMES: Record<Suit, { one: string; many: string }> = {
  circle: { one: "circle", many: "circles" },
  triangle: { one: "triangle", many: "triangles" },
  cross: { one: "cross", many: "crosses" },
  square: { one: "square", many: "squares" },
  star: { one: "star", many: "stars" },
  whot: { one: "Whot", many: "Whots" },
};

/** What each special card does, for the screen and the rules card. */
export const SPECIALS: Record<number, { name: string; does: string }> = {
  1: { name: "Hold on", does: "Play again" },
  2: { name: "Pick two", does: "Next player picks two" },
  5: { name: "Pick three", does: "Next player picks three" },
  8: { name: "Suspension", does: "Next player misses a turn" },
  14: { name: "General market", does: "Everyone else picks one" },
  20: { name: "Whot", does: "Call the next shape" },
};

export const DEALS = [5, 7] as const;

export type WhotConfig = { players: number; deal: number };

export type WhotState = Seeded & {
  players: number;
  hands: number[][];
  /** Face down, drawn from the end. */
  market: number[];
  /** Face up, top card last. */
  pile: number[];
  turn: number;
  /** The shape called with the Whot on top of the pile. */
  call: Shape | null;
  /** Cards the player on turn picks up unless they pass the pick on. */
  pick: { count: number; n: number } | null;
  winner: number | null;
  /** "out": someone played their last card. "count": the cards ran out and hands were counted. */
  ending: "out" | "count" | null;
  /** Hand totals, when the game ended on a count. */
  totals: number[] | null;
  /**
   * Public knowledge: the shape each player last went to market on instead
   * of following. Anyone watching the table could note it, so the CPU may too.
   */
  lacks: (Suit | null)[];
  turns: number;
  stats: { played: number; picked: number; specials: number }[];
};

export type WhotAction = { type: "play"; card: number; call?: Shape } | { type: "draw" };

export type WhotEvent =
  /** `hands` holds null for every hand the viewer can't see. */
  | { type: "deal"; hands: (number[] | null)[]; counts: number[]; top: number; market: number; first: number }
  | { type: "play"; seat: number; card: number; from: number; call: Shape | null }
  /** `cards` holds null for each card the viewer doesn't get to see. */
  | { type: "draw"; seat: number; cards: (number | null)[]; why: "market" | "pick" | "general" }
  | { type: "refill"; count: number }
  | { type: "hold" | "suspend" | "general"; seat: number }
  | { type: "pick"; seat: number; count: number }
  | { type: "last"; seat: number }
  | { type: "turn"; seat: number }
  | { type: "over"; winner: number; ending: "out" | "count"; totals: number[] | null };

export type WhotView = {
  /** The seat this view is for, or -1 for a view with every hand hidden. */
  you: number;
  hand: number[];
  counts: number[];
  pile: number[];
  market: number;
  turn: number;
  call: Shape | null;
  pick: { count: number; n: number } | null;
  /** Cards in your hand you could play right now. */
  playable: number[];
  winner: number | null;
  ending: "out" | "count" | null;
  totals: number[] | null;
};

/** Points a card counts for when hands are counted: its number, doubled for stars. */
export const cardValue = (c: Card) => (c.suit === "star" ? c.n * 2 : c.n);
export const isSpecial = (c: Card) => c.n in SPECIALS;

const next = (s: WhotState, from: number, skip = 0) => (from + 1 + skip) % s.players;
const top = (s: WhotState) => DECK[s.pile[s.pile.length - 1]];

/** Whether a card can go on the pile right now. */
export function canPlay(s: { pile: number[]; call: Shape | null; pick: WhotState["pick"] }, card: Card) {
  if (s.pick) return card.n === s.pick.n;
  if (card.suit === "whot") return true;
  if (s.call) return card.suit === s.call;
  const t = DECK[s.pile[s.pile.length - 1]];
  return card.suit === t.suit || card.n === t.n;
}

export function createWhot({ players, deal }: WhotConfig, seed: number, first = 0) {
  const s: WhotState = {
    seed,
    players,
    hands: Array.from({ length: players }, () => []),
    market: [],
    pile: [],
    turn: first % players,
    call: null,
    pick: null,
    winner: null,
    ending: null,
    totals: null,
    lacks: Array(players).fill(null),
    turns: 0,
    stats: Array.from({ length: players }, () => ({ played: 0, picked: 0, specials: 0 })),
  };
  s.market = shuffle(s, DECK.map((c) => c.id));
  for (let i = 0; i < deal; i++) for (const hand of s.hands) hand.push(s.market.pop()!);
  // The game opens on a plain card. Specials turned up go back under the market.
  while (isSpecial(DECK[s.market[s.market.length - 1]])) s.market.unshift(s.market.pop()!);
  s.pile.push(s.market.pop()!);

  const events: WhotEvent[] = [
    {
      type: "deal",
      hands: s.hands.map((h) => [...h]),
      counts: s.hands.map((h) => h.length),
      top: s.pile[0],
      market: s.market.length,
      first: s.turn,
    },
    { type: "turn", seat: s.turn },
  ];
  return { state: s, events };
}

/** The pile under the top card, shuffled back into the market. */
function refill(s: WhotState, events: WhotEvent[]) {
  if (s.pile.length < 2) return false;
  const under = s.pile.splice(0, s.pile.length - 1);
  s.market = shuffle(s, under).concat(s.market);
  events.push({ type: "refill", count: under.length });
  return true;
}

function take(s: WhotState, seat: number, count: number, why: "market" | "pick" | "general", events: WhotEvent[]) {
  const cards: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!s.market.length && !refill(s, events)) break;
    cards.push(s.market.pop()!);
  }
  s.hands[seat].push(...cards);
  s.stats[seat].picked += cards.length;
  if (cards.length) events.push({ type: "draw", seat, cards, why });
  return cards.length;
}

function finish(s: WhotState, winner: number, ending: "out" | "count", events: WhotEvent[]) {
  s.winner = winner;
  s.ending = ending;
  events.push({ type: "over", winner, ending, totals: s.totals });
}

/** No cards left anywhere to draw: count the hands, lowest total wins, fewest cards breaks a tie. */
function countOut(s: WhotState, events: WhotEvent[]) {
  s.totals = s.hands.map((h) => h.reduce((sum, id) => sum + cardValue(DECK[id]), 0));
  let best = 0;
  for (let i = 1; i < s.players; i++) {
    const [a, b] = [s.totals[i], s.totals[best]];
    if (a < b || (a === b && s.hands[i].length < s.hands[best].length)) best = i;
  }
  finish(s, best, "count", events);
}

function pass(s: WhotState, to: number, events: WhotEvent[]) {
  s.turn = to;
  s.turns++;
  events.push({ type: "turn", seat: to });
}

export function applyWhot(s: WhotState, seat: number, action: WhotAction): WhotEvent[] | null {
  if (s.winner !== null || seat !== s.turn) return null;
  const events: WhotEvent[] = [];

  if (action.type === "draw") {
    const pick = s.pick;
    if (!pick) s.lacks[seat] = s.call ?? top(s).suit;
    s.pick = null;
    const got = take(s, seat, pick ? pick.count : 1, pick ? "pick" : "market", events);
    if (!got && !pick) {
      // Nothing left to draw, and nothing this player can play.
      countOut(s, events);
      return events;
    }
    pass(s, next(s, seat), events);
    return events;
  }

  const hand = s.hands[seat];
  const from = hand.indexOf(action.card);
  if (from < 0) return null;
  const card = DECK[action.card];
  if (!canPlay(s, card)) return null;
  if (card.suit === "whot" && !SHAPES.includes(action.call as Shape)) return null;

  hand.splice(from, 1);
  s.pile.push(card.id);
  s.stats[seat].played++;
  if (isSpecial(card)) s.stats[seat].specials++;
  s.call = card.suit === "whot" ? action.call! : null;
  if (s.lacks[seat] === card.suit) s.lacks[seat] = null;
  events.push({ type: "play", seat, card: card.id, from, call: s.call });

  if (!hand.length) {
    finish(s, seat, "out", events);
    return events;
  }
  if (hand.length === 1) events.push({ type: "last", seat });

  switch (card.n) {
    case 1:
      events.push({ type: "hold", seat });
      pass(s, seat, events);
      break;
    case 2:
    case 5: {
      const count = (s.pick?.count ?? 0) + (card.n === 2 ? 2 : 3);
      s.pick = { count, n: card.n };
      const victim = next(s, seat);
      events.push({ type: "pick", seat: victim, count });
      pass(s, victim, events);
      break;
    }
    case 8:
      events.push({ type: "suspend", seat: next(s, seat) });
      pass(s, next(s, seat, 1), events);
      break;
    case 14:
      events.push({ type: "general", seat });
      for (let i = 1; i < s.players; i++) take(s, (seat + i) % s.players, 1, "general", events);
      pass(s, seat, events);
      break;
    default:
      pass(s, next(s, seat), events);
  }
  return events;
}

export function viewWhot(s: WhotState, seat: number): WhotView {
  const hand = seat >= 0 ? [...s.hands[seat]] : [];
  return {
    you: seat,
    hand,
    counts: s.hands.map((h) => h.length),
    pile: [...s.pile],
    market: s.market.length,
    turn: s.turn,
    call: s.call,
    pick: s.pick && { ...s.pick },
    playable: s.winner === null && seat === s.turn ? hand.filter((id) => canPlay(s, DECK[id])) : [],
    winner: s.winner,
    ending: s.ending,
    totals: s.totals && [...s.totals],
  };
}

export function redactWhot(e: WhotEvent, seat: number): WhotEvent {
  if (e.type === "deal") return { ...e, hands: e.hands.map((h, i) => (i === seat ? h : null)) };
  if (e.type === "draw" && e.seat !== seat) return { ...e, cards: e.cards.map(() => null) };
  return e;
}

/** How long the screen spends on each event, in milliseconds. The scene uses the same numbers. */
export const PACE = {
  dealCard: 70,
  dealSettle: 450,
  play: 520,
  drawCard: 230,
  refill: 650,
  flash: 650,
};

export function paceWhot(events: WhotEvent[]) {
  let ms = 0;
  for (const e of events) {
    if (e.type === "deal") ms += e.counts.reduce((a, b) => a + b, 0) * PACE.dealCard + PACE.dealSettle;
    else if (e.type === "play") ms += PACE.play;
    else if (e.type === "draw") ms += e.cards.length * PACE.drawCard + 120;
    else if (e.type === "refill") ms += PACE.refill;
    else if (e.type === "hold" || e.type === "suspend" || e.type === "general" || e.type === "pick") ms += PACE.flash;
  }
  return ms;
}

// ---- CPU ----

const followers = (cards: Card[], card: Card) =>
  cards.filter((c) => c.suit === "whot" || c.suit === card.suit || c.n === card.n).length;

/** The shape to call with a Whot: the one this hand holds most of. */
function bestCall(rest: Card[], level: Level): Shape {
  const counts = new Map<Shape, number>(SHAPES.map((sh) => [sh, 0]));
  for (const c of rest) if (c.suit !== "whot") counts.set(c.suit, counts.get(c.suit)! + 1 + c.n / 100);
  let best: Shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  if (level === "easy" && Math.random() < 0.5) return best;
  for (const [shape, n] of counts) if (n > counts.get(best)!) best = shape;
  return best;
}

const copy = (s: WhotState): WhotState => ({
  ...s,
  hands: s.hands.map((h) => [...h]),
  market: [...s.market],
  pile: [...s.pile],
  pick: s.pick && { ...s.pick },
  lacks: [...s.lacks],
  stats: s.stats.map((st) => ({ ...st })),
});

/** Milliseconds a hard CPU spends thinking, and the fewest games it plays out per move. */
const HARD_BUDGET = 28;
const HARD_MIN_DEALS = 6;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * The hard CPU looks ahead: it deals the cards it can't see at random
 * (everything not in its hand or on the pile), plays each option out to the
 * end with the normal CPU at every seat, and picks the one that wins most
 * often. It never looks at the real hidden hands, so it plays fair.
 */
function cpuLookahead(s: WhotState, seat: number, legal: Card[]): WhotAction {
  const rest = (card: Card) => s.hands[seat].filter((id) => id !== card.id).map((id) => DECK[id]);
  const options: WhotAction[] = [];
  for (const card of legal) {
    if (card.suit !== "whot") options.push({ type: "play", card: card.id });
    else if (!options.some((o) => o.type === "play" && DECK[o.card].suit === "whot")) {
      // Every Whot is the same card, so only the call differs. Try the calls this hand could follow.
      const held = new Set(rest(card).flatMap((c) => (c.suit === "whot" ? [] : [c.suit])));
      const calls = SHAPES.filter((sh) => held.has(sh));
      for (const call of calls.length ? calls : [bestCall(rest(card), "normal")]) options.push({ type: "play", card: card.id, call });
    }
  }
  if (options.length === 1) return options[0];

  const seen = new Set([...s.hands[seat], ...s.pile]);
  const unseen = DECK.flatMap((c) => (seen.has(c.id) ? [] : [c.id]));
  const rng = { seed: (Math.random() * 2 ** 32) | 0 };
  const wins = options.map(() => 0);
  const start = now();
  for (let deals = 0; ; deals++) {
    const spent = now() - start;
    // A slow phone stops at four times the budget, even short of the minimum.
    if ((deals >= HARD_MIN_DEALS && spent > HARD_BUDGET) || spent > HARD_BUDGET * 4) break;
    const pool = shuffle(rng, [...unseen]);
    const base = copy(s);
    for (let i = 0; i < s.players; i++) {
      if (i === seat) continue;
      // Someone who just went to market rather than follow a shape probably has none of it.
      const fits = pool.filter((id) => DECK[id].suit !== s.lacks[i]);
      const hand = fits.slice(0, s.hands[i].length);
      if (hand.length < s.hands[i].length) hand.push(...pool.filter((id) => !hand.includes(id)).slice(0, s.hands[i].length - hand.length));
      base.hands[i] = hand;
      for (const id of hand) pool.splice(pool.indexOf(id), 1);
    }
    base.market = pool;
    base.seed = rng.seed;
    options.forEach((option, i) => {
      const sim = copy(base);
      applyWhot(sim, seat, option);
      for (let guard = 0; sim.winner === null && guard < 160; guard++) applyWhot(sim, sim.turn, cpuWhot(sim, sim.turn, "normal"));
      if (sim.winner === seat) wins[i]++;
    });
  }
  return options[wins.indexOf(Math.max(...wins))];
}

export function cpuWhot(s: WhotState, seat: number, level: Level): WhotAction {
  const hand = s.hands[seat].map((id) => DECK[id]);
  const legal = hand.filter((c) => canPlay(s, c));
  if (!legal.length) return { type: "draw" };
  if (level === "hard" && !s.pick) return cpuLookahead(s, seat, legal);

  // Facing a pick: pass it on if possible. An easy CPU sometimes forgets it can.
  if (s.pick) return level === "easy" && Math.random() < 0.35 ? { type: "draw" } : { type: "play", card: legal[0].id };

  if (level === "easy") {
    const card = legal[Math.floor(Math.random() * legal.length)];
    const rest = hand.filter((c) => c !== card);
    return { type: "play", card: card.id, call: card.suit === "whot" ? bestCall(rest, level) : undefined };
  }

  // Normal: a fixed sense of what each card is worth. It's also how every
  // seat plays in the hard CPU's look-ahead games.
  const nearest = Math.min(...s.hands.map((h, i) => (i === seat ? Infinity : h.length)));
  let choice = legal[0];
  let bestScore = -Infinity;
  for (const card of legal) {
    const rest = hand.filter((c) => c !== card);
    let score = card.n * 0.04;
    if (!rest.length) score += 100;
    // Cards that keep the turn are only worth it with something to follow them.
    const again = card.n === 1 || card.n === 14 || (card.n === 8 && s.players === 2);
    if (again) {
      const follow = followers(rest, card);
      score += follow ? 5 : 0.5;
      if (rest.length === 1 && follow) score += 60;
    }
    if (card.n === 14) score += nearest <= 2 ? 4 : 1.5;
    if (card.n === 8 && s.players > 2) score += nearest <= 2 ? 4 : 1.5;
    if (card.n === 2 || card.n === 5) score += 2.5 + (nearest <= 2 ? 5 : 0) + (card.n === 5 ? 0.6 : 0);
    if (card.suit === "whot") score += rest.length <= 1 ? 8 : -6;
    // Stay in a shape you hold plenty of, so the next turn is easy too.
    if (card.suit !== "whot") score += 0.7 * rest.filter((c) => c.suit === card.suit).length;
    score += (Math.random() - 0.5) * 2.2;
    if (score > bestScore) {
      bestScore = score;
      choice = card;
    }
  }
  const rest = hand.filter((c) => c !== choice);
  return {
    type: "play",
    card: choice.id,
    call: choice.suit === "whot" ? bestCall(rest, level) : undefined,
  };
}

export function parseWhotAction(raw: unknown): WhotAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (a.type === "draw") return { type: "draw" };
  if (a.type !== "play" || !Number.isInteger(a.card) || (a.card as number) < 0 || (a.card as number) >= DECK.length) return null;
  if (a.call !== undefined && !SHAPES.includes(a.call as Shape)) return null;
  return { type: "play", card: a.card as number, call: a.call as Shape | undefined };
}

export const whotRules: Rules<WhotState, WhotAction, WhotView, WhotEvent> = {
  apply: applyWhot,
  view: viewWhot,
  redact: redactWhot,
  turn: (s) => (s.winner === null ? s.turn : null),
  cpu: cpuWhot,
  forced: () => null,
  pace: paceWhot,
  parse: parseWhotAction,
};
