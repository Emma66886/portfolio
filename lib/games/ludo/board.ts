/**
 * Board geometry: where each token's progress puts it on the classic 15x15
 * grid. Positions are [row, col] with fractional values allowed, row 0 at the
 * top. Red's yard is top left. The other colours are red's paths turned a
 * quarter clockwise each, which is also the order turns go round the board.
 */
import { HOME, LAST_LOOP, TRACK, YARD } from "@/lib/games/ludo/engine";

export type Cell = [row: number, col: number];

/** The shared loop, starting on red's start square, in the direction of play. */
export const LOOP: Cell[] = (() => {
  const loop: Cell[] = [];
  const run = (r0: number, c0: number, dr: number, dc: number, n: number) => {
    for (let i = 0; i < n; i++) loop.push([r0 + dr * i, c0 + dc * i]);
  };
  run(6, 1, 0, 1, 5); // left arm, top row, towards the centre
  run(5, 6, -1, 0, 6); // up the top arm
  run(0, 7, 0, 1, 1);
  run(0, 8, 1, 0, 6); // down the top arm
  run(6, 9, 0, 1, 6); // out along the right arm
  run(7, 14, 1, 0, 1);
  run(8, 14, 0, -1, 6);
  run(9, 8, 1, 0, 6); // down the bottom arm
  run(14, 7, 0, -1, 1);
  run(14, 6, -1, 0, 6);
  run(8, 5, 0, -1, 6); // back along the left arm
  run(7, 0, -1, 0, 2); // (7,0), then (6,0) just before red's start
  return loop;
})();

if (LOOP.length !== TRACK) throw new Error("Ludo loop is the wrong length");

/** A quarter turn clockwise about the board's centre. */
const turn = ([r, c]: Cell, times: number): Cell => {
  let cell: Cell = [r, c];
  for (let i = 0; i < times; i++) cell = [cell[1], 14 - cell[0]];
  return cell;
};

/** Red's yard spots, its home column and its finishing spots in the centre triangle. */
const RED_YARD: Cell[] = [
  [1.65, 1.65],
  [1.65, 3.35],
  [3.35, 1.65],
  [3.35, 3.35],
];
const RED_COLUMN: Cell[] = [1, 2, 3, 4, 5].map((c) => [7, c] as Cell);
const RED_HOME: Cell[] = [
  [6.62, 6.12],
  [7.38, 6.12],
  [6.8, 6.5],
  [7.2, 6.5],
];

/** Where a token sits, given its colour, progress and which of the four it is. */
export function cellFor(color: number, progress: number, token: number): Cell {
  if (progress === YARD) return turn(RED_YARD[token], color);
  if (progress <= LAST_LOOP) return LOOP[(color * 13 + progress) % TRACK];
  if (progress < HOME) return turn(RED_COLUMN[progress - LAST_LOOP - 1], color);
  return turn(RED_HOME[token], color);
}

/** The squares a token passes through, one per step, for the hop animation. */
export function pathFor(color: number, from: number, to: number, token: number): Cell[] {
  if (from === YARD) return [cellFor(color, 0, token)];
  const cells: Cell[] = [];
  for (let p = from + 1; p <= to; p++) cells.push(cellFor(color, p, token));
  return cells;
}

export const rotateCell = turn;
